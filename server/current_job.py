"""Current-job sources, explicit provenance, read-only tracking and optional downloader."""
from collections import OrderedDict
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from urllib.parse import parse_qs

from ffadv4manager import config, profiles
from ffadv4manager.core.job_file import executable_gcode, MAX_JOB_BYTES
from .job_tracking import cached_toolpath, LayerTracker

LOCK = threading.RLock()
TRACKERS = OrderedDict()


def connection(bridge):
    values = dict(config.load_config())
    with bridge.STATE_LOCK:
        selection = dict(bridge.SELECTED)
    if selection['profile']:
        values.update(profiles.get_profile(selection['profile']))
    elif selection['host'] or bridge.HOST:
        values['host'] = selection['host'] or bridge.HOST
    scope = hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()
    return scope, values


def archive_root(bridge):
    return bridge.DATA_DIR / 'print-sources'


def _index(bridge):
    try:
        value = json.loads((archive_root(bridge) / 'index.json').read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def remember(bridge, scope, remote, payload, name, kind='server_upload'):
    executable_gcode(payload, name)
    digest = hashlib.sha256(payload).hexdigest()
    root = archive_root(bridge)
    with LOCK:
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        destination = root / digest
        temporary = root / (digest + '.tmp')
        temporary.write_bytes(payload)
        os.replace(temporary, destination)
        index = {k: v for k, v in _index(bridge).items()
                 if isinstance(v, dict) and isinstance(v.get('sha256'), str)
                 and len(v['sha256']) == 64 and (root / v['sha256']).is_file()}
        key = scope + ':' + remote.rsplit('/', 1)[-1]
        index.pop(key, None)
        index[key] = {'sha256': digest, 'name': name, 'kind': kind,
                      'remote_verified': kind == 'printer_download', 'remote_file': remote}
        # Bound retention to 20 mappings / 512 MiB. Never serve arbitrary host paths.
        while len(index) > 20 or sum((root / d).stat().st_size for d in {r['sha256'] for r in index.values()}) > 512 * 1024 * 1024:
            index.pop(next(iter(index)))
        used = {r['sha256'] for r in index.values()}
        for path in root.iterdir():
            if len(path.name) == 64 and path.name not in used and path.is_file() and not path.is_symlink():
                path.unlink()
        temporary = root / 'index.tmp'
        temporary.write_text(json.dumps(index))
        os.replace(temporary, root / 'index.json')
        TRACKERS.pop(scope, None)
    return index.get(key)


def _read(bridge, argv, *args):
    started = time.monotonic()
    result = subprocess.run([*argv, *args], capture_output=True, text=True, timeout=20, check=False)
    bridge.trace_event(bridge.DATA_DIR, 'printer.command.completed', command=list(args),
                       return_code=result.returncode,
                       duration_ms=round((time.monotonic() - started) * 1000, 1),
                       stdout=result.stdout[-2000:], stderr=result.stderr[-1000:])
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout or 'Printer query failed')[-1000:])
    return json.loads(result.stdout)


def download_command():
    raw = os.environ.get('AD4_JOB_DOWNLOAD_ARGV', '')
    if not raw:
        return None
    try:
        argv = json.loads(raw)
    except ValueError as exc:
        raise ValueError('AD4_JOB_DOWNLOAD_ARGV must be a JSON argv array') from exc
    if (not isinstance(argv, list) or not argv or len(argv) > 30
            or not all(isinstance(a, str) and len(a) < 2048 for a in argv)
            or not any('{output}' in a for a in argv)):
        raise ValueError('Downloader must use an output-file placeholder')
    return argv


def snapshot(bridge, *, fresh=False, include_position=True):
    # Display reads never wait behind a transfer. Validation callers already
    # own the write lock; its RLock remains reentrant for those fresh reads.
    with bridge.read_slot(bridge.PRINTER_WRITE_LOCK):
        argv = bridge.cli_argv()
        scope, values = connection(bridge)
        status = (_read(bridge, argv, 'status', '--json') if fresh else
                  bridge.cached_status(argv, reader=lambda: _read(bridge, argv, 'status', '--json')))
        if not fresh:
            # The live monitoring endpoint shares this status with the dashboard.
            # Decorate locally, without a second printer read.
            status = bridge.with_estimated_print_times(status)
        try:
            active = status.get('status_available') is not False and status.get('machine_status') in ('PRINTING', 'BUILDING', 'BUILDING_FROM_SD', 'PAUSED')
            position = _read(bridge, argv, 'position', '--json') if include_position and active and not fresh and not status.get('refreshing') else {}
        except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired):
            position = {}
    if not isinstance(position, dict):
        position = {}
    position = {k: v for k, v in position.items()
                if k.upper() in ('X', 'Y', 'Z') and isinstance(v, (int, float)) and math.isfinite(v)}
    name = status.get('current_file') or ''
    machine = str(status.get('machine_status', '')).upper()
    active = status.get('status_available') is not False and machine in ('PRINTING', 'BUILDING', 'BUILDING_FROM_SD', 'PAUSED')
    source = _index(bridge).get(scope + ':' + name.rsplit('/', 1)[-1]) if name else None
    result = {'status': status, 'position': position, 'active': active, 'source': source,
              'job_token': None, 'layer_current': None, 'layer_total': None,
              'layer_estimated': True, 'geometry_available': False, 'download_supported': False,
              'warning': 'Z-based estimate; Z-hop, parking and polling can differ from the executed layer.'}
    try:
        result['download_supported'] = download_command() is not None
    except ValueError as error:
        result['download_error'] = str(error)
    if not source:
        result['source_error'] = 'No G-code source is available for this current file. Associate the exact file or configure a verified downloader.'
        return result
    token = hashlib.sha256((scope + ':' + name + ':' + source['sha256']).encode()).hexdigest()
    result['job_token'] = token
    try:
        toolpath = cached_toolpath(archive_root(bridge) / source['sha256'], source['sha256'], source['name'])
        result['geometry_available'] = True
        result['layer_total'] = toolpath['layer_total']
        with LOCK:
            if scope not in TRACKERS:
                TRACKERS[scope] = LayerTracker()
            tracker = TRACKERS[scope]
            result['layer_current'] = tracker.update(token, toolpath['layers'], position, active=active,
                                                     printing=machine != 'PAUSED',
                                                     progress=status.get('progress_percent'))
            TRACKERS.move_to_end(scope)
            while len(TRACKERS) > 8:
                TRACKERS.popitem(last=False)
    except (OSError, ValueError) as error:
        result['source_error'] = str(error)
    return result


def known_layer_heights(bridge):
    state = snapshot(bridge, include_position=False)
    if not state['geometry_available']:
        return None
    source = state['source']
    path = cached_toolpath(archive_root(bridge) / source['sha256'], source['sha256'], source['name'])
    return [layer['z'] for layer in path['layers']]


def get(handler, path, url, bridge):
    state = snapshot(bridge, include_position=not path.endswith('/toolpath'))
    if path.endswith('/toolpath'):
        token = parse_qs(url.query).get('token', [''])[0]
        if not token or token != state['job_token']:
            return handler.json(409, {'error': 'Current print changed; refresh before loading geometry'})
        if not state['geometry_available']:
            return handler.json(422, {'error': state.get('source_error', 'No toolpath available')})
        source = state['source']
        data = cached_toolpath(archive_root(bridge) / source['sha256'], source['sha256'], source['name'])
        return handler.json(200, {**data, 'job_token': token, 'source': source})
    return handler.json(200, state)


def post(handler, path, url, bridge):
    with bridge.PRINTER_WRITE_LOCK:
        before = _read(bridge, bridge.cli_argv(), 'status', '--json')
        remote = before.get('current_file')
        active = before.get('status_available') is not False and before.get('machine_status') in ('PRINTING', 'BUILDING', 'BUILDING_FROM_SD', 'PAUSED')
        if not remote or not active:
            raise ValueError('No active printer job is reported')
        scope, values = connection(bridge)
        if path.endswith('/associate'):
            query = parse_qs(url.query)
            if query.get('current_file', [''])[0] != remote:
                raise ValueError('Current print changed before association')
            name = bridge.safe_filename(query.get('name', [''])[0])
            size = int(handler.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_JOB_BYTES:
                raise ValueError('Invalid print source size')
            if not handler.headers.get('Content-Type', '').startswith('application/octet-stream'):
                raise ValueError('Binary print file required')
            payload = handler.rfile.read(size)
            if len(payload) != size:
                raise ValueError('Incomplete source file')
            kind = 'user_association'
        elif path.endswith('/fetch'):
            body = handler.data()
            if not isinstance(body, dict) or body.get('current_file') != remote:
                raise ValueError('Current print changed before download')
            command = download_command()
            if command is None:
                return handler.json(501, {'error': 'No verified AD4 file-download transport is configured. M661 lists files; M662 reads thumbnails.'})
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'downloaded.job'
                substitutions = {'host': str(values.get('host', '')), 'port': str(values.get('port', 8899)),
                                 'remote_file': remote, 'output': str(target)}
                argv = [a.format_map(substitutions) for a in command]
                completed = subprocess.run(argv, capture_output=True, timeout=60, check=False)
                if completed.returncode or not target.is_file() or target.is_symlink() or target.stat().st_size > MAX_JOB_BYTES:
                    raise ValueError('Printer downloader failed or returned an invalid file')
                payload = target.read_bytes()
            name, kind = remote.rsplit('/', 1)[-1], 'printer_download'
        else:
            return handler.json(404, {'error': 'Unknown current-job action'})
        executable_gcode(payload, name)
        after = _read(bridge, bridge.cli_argv(), 'status', '--json')
        if after.get('current_file') != remote:
            raise ValueError('Printer changed jobs while obtaining its source')
        source = remember(bridge, scope, remote, payload, name, kind=kind)
        return handler.json(200, {'source': source})
