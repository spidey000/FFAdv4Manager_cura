"""Bounded CLI integrations behind the existing authenticated printer bridge."""
import atexit
import json
import math
from pathlib import Path
import subprocess
import tempfile
import threading
from urllib.parse import parse_qs

LOCK = threading.RLock()
MONITOR = None
WAITER = None
WAIT_RESULT = None
MAX_RECORDS = 720  # One hour at the minimum five-second sampling interval.


def reply_bytes(handler, payload, mime, filename=None):
    handler.send_response(200)
    handler.send_header('Content-Type', mime)
    handler.send_header('Content-Length', str(len(payload)))
    handler.send_header('Cache-Control', 'private, no-store')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    if filename:
        handler.send_header('Content-Disposition', 'attachment; filename="' + filename + '"')
    handler.end_headers()
    handler.wfile.write(payload)


def connection_values(body, bridge):
    if not isinstance(body, dict) or set(body) - {'host', 'port', 'timeout', 'camera_port', 'camera_path'}:
        raise ValueError('Unknown connection fields')
    host = body.get('host')
    if not isinstance(host, str) or not bridge.private_ip(host):
        raise ValueError('A private IPv4 printer address is required')
    values = {'host': host, 'port': body.get('port', 8899), 'timeout': body.get('timeout', 8),
              'camera_port': body.get('camera_port', 8080),
              'camera_path': body.get('camera_path', '/?action=stream')}
    for key in ('port', 'camera_port'):
        value = values[key]
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 65535:
            raise ValueError('Invalid ' + key)
    value = values['timeout']
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 < value <= 30:
        raise ValueError('Timeout must be between 0 and 30 seconds')
    path = values['camera_path']
    if (not isinstance(path, str) or not path.startswith('/') or len(path) > 512
            or any(ord(c) < 32 for c in path) or '#' in path
            or any(p in ('.', '..') for p in path.split('?', 1)[0].split('/'))):
        raise ValueError('Invalid camera path')
    return values


def connection_args(values):
    return [part for key, value in values.items() for part in ('--' + key.replace('_', '-'), str(value))]


def profile_name(value, bridge):
    if not isinstance(value, str) or not bridge.PROFILE_NAME.fullmatch(value) or value in ('.', '..'):
        raise ValueError('Invalid profile name')
    return value


def monitor_path(bridge):
    return bridge.DATA_DIR / 'monitor.jsonl'


def telemetry_state(bridge):
    global WAIT_RESULT
    with LOCK:
        records = []
        path = monitor_path(bridge)
        if path.is_file() and not path.is_symlink():
            with path.open('rb') as stream:
                stream.seek(max(0, path.stat().st_size - 256 * 1024))
                lines = stream.read().splitlines()[-100:]
            for line in lines:
                try:
                    records.append(json.loads(line))
                except (ValueError, UnicodeDecodeError):
                    continue
        if WAITER is not None and WAITER.poll() is not None and WAIT_RESULT is None:
            stdout, stderr = WAITER.communicate(timeout=1)
            try:
                result = json.loads(stdout)
            except ValueError:
                result = {'matched': False, 'error': (stderr or stdout or 'Wait stopped')[-1000:]}
            WAIT_RESULT = result
        return {'monitoring': MONITOR is not None and MONITOR.poll() is None,
                'records': records, 'waiting': WAITER is not None and WAITER.poll() is None,
                'wait_result': WAIT_RESULT}


def shutdown():
    with LOCK:
        for worker in (MONITOR, WAITER):
            if worker is not None and worker.poll() is None:
                worker.terminate()
                try:
                    worker.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    worker.kill()
                    worker.wait(timeout=3)


atexit.register(shutdown)


def get(handler, action, url, bridge):
    query = parse_qs(url.query)
    if action == 'config':
        return handler.json(200, {'values': json.loads(bridge.command('config', 'show', selected=False)),
                                  'path': bridge.command('config', 'path', selected=False).strip()})
    if action == 'profile':
        name = profile_name(query.get('name', [''])[0], bridge)
        return handler.json(200, json.loads(bridge.command('profiles', 'show', name, selected=False)))
    if action == 'raw':
        return handler.json(200, {'output': bridge.command('files-raw')})
    if action == 'telemetry':
        return handler.json(200, telemetry_state(bridge))
    if action == 'log':
        path = monitor_path(bridge)
        if not path.is_file() or path.is_symlink():
            raise ValueError('Start monitoring first')
        if path.stat().st_size > 10 * 1024 * 1024:
            raise ValueError('Log exceeds download limit')
        return reply_bytes(handler, path.read_bytes(), 'application/x-ndjson', 'printer-monitor.jsonl')
    if action == 'preview':
        name = query.get('file', [''])[0]
        if name not in json.loads(bridge.command('files', '--json')):
            raise ValueError('File is not in the current printer listing')
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'preview.bmp'
            bridge.command('files', 'preview', name, '--output', str(output))
            return reply_bytes(handler, output.read_bytes(), 'image/bmp')
    return handler.json(404, {'error': 'Unknown printer tool'})


def post(handler, action, url, bridge):
    global MONITOR, WAITER, WAIT_RESULT
    if action in ('inspect', 'convert'):
        size = int(handler.headers.get('Content-Length', '0'))
        if not 0 < size <= bridge.MAX_GCODE:
            raise ValueError('Empty file or file larger than 100 MB')
        if not handler.headers.get('Content-Type', '').startswith('application/octet-stream'):
            raise ValueError('Binary file upload required')
        name = bridge.safe_filename(parse_qs(url.query).get('name', [''])[0])
        payload = handler.rfile.read(size)
        if len(payload) != size:
            raise ValueError('Incomplete file')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / name
            source.write_bytes(payload)
            if action == 'inspect':
                return handler.json(200, json.loads(bridge.command('inspect', str(source), selected=False)))
            bridge.require_safe_artillery_heating(payload, name)
            output = Path(directory) / 'converted.gx'
            bridge.command('convert', str(source), '--output', str(output), selected=False)
            return reply_bytes(handler, output.read_bytes(), 'application/octet-stream', Path(name).stem + '.gx')
    body = handler.data()
    if not isinstance(body, dict):
        raise ValueError('JSON object required')
    if action == 'profile':
        name = profile_name(body.get('name'), bridge)
        operation = body.get('action')
        if operation not in ('add', 'update'):
            raise ValueError('Invalid profile operation')
        values = connection_values(body.get('values'), bridge)
        bridge.command('profiles', operation, name, *connection_args(values), selected=False)
        return handler.json(200, {'name': name, 'values': values})
    if action == 'config':
        operation = body.get('action')
        if operation == 'reset':
            bridge.command('config', 'unset', 'host', 'port', 'timeout', 'camera_port', 'camera_path', selected=False)
        elif operation == 'save':
            values = connection_values(body.get('values'), bridge)
            bridge.command('config', 'set', *connection_args(values), selected=False)
        else:
            raise ValueError('Invalid config operation')
        return handler.json(200, {'saved': True})
    if action == 'rename':
        name = body.get('name')
        if not isinstance(name, str) or not bridge.PROFILE_NAME.fullmatch(name):
            raise ValueError('Invalid printer name')
        return handler.json(200, {'detail': bridge.command('printer', 'rename', name)})
    if action == 'monitor':
        with LOCK:
            if body.get('action') == 'stop':
                if MONITOR is not None and MONITOR.poll() is None:
                    MONITOR.terminate()
                    MONITOR.wait(timeout=5)
            elif body.get('action') == 'start':
                if MONITOR is None or MONITOR.poll() is not None:
                    bridge.DATA_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
                    monitor_path(bridge).write_text('')
                    MONITOR = subprocess.Popen(bridge.cli_argv('monitor', '--output', str(monitor_path(bridge)),
                        '--interval', '5', '--count', str(MAX_RECORDS)), stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                raise ValueError('Invalid monitor operation')
        return handler.json(200, telemetry_state(bridge))
    if action == 'wait':
        with LOCK:
            if body.get('action') == 'stop':
                if WAITER is not None and WAITER.poll() is None:
                    WAITER.terminate()
                    WAITER.wait(timeout=5)
            elif body.get('action') == 'start':
                if WAITER is not None and WAITER.poll() is None:
                    raise ValueError('A wait is already active')
                condition = body.get('condition', 'bed_below')
                value = body.get('value')
                if condition == 'bed_below':
                    if isinstance(value, bool) or not isinstance(value, (float, int)) or not 0 <= value <= 65:
                        raise ValueError('Bed threshold must be 0–65 °C')
                    args = ['--bed-below', str(value)]
                elif condition == 'state' and value in ('READY', 'PAUSED', 'PRINTING', 'BUILDING_FROM_SD', 'BUILDING_COMPLETED'):
                    args = ['--state', value]
                else:
                    raise ValueError('Invalid wait condition')
                WAIT_RESULT = None
                WAITER = subprocess.Popen(bridge.cli_argv('wait', *args, '--timeout', '3600'),
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            else:
                raise ValueError('Invalid wait operation')
        return handler.json(200, telemetry_state(bridge))
    return handler.json(404, {'error': 'Unknown printer tool'})
