"""Same-origin, loopback-only FFAD4Manager bridge for ThreeSlicer.

The GitHub Pages demo has no printer API. Protected remote access must use
Cloudflare Access JWT verification at this loopback-only origin.
"""
import atexit
from datetime import datetime, timezone
import http.client
import struct
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unicodedata
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

if __package__:
    from .timelapse_service import TimelapseService
    from .gcode_safety import require_safe_artillery_heating
    from .cloudflare_access import load_access_config, verify_access_jwt, _jwks_client
else:
    from timelapse_service import TimelapseService
    from gcode_safety import require_safe_artillery_heating
    from cloudflare_access import load_access_config, verify_access_jwt, _jwks_client

ACCESS_CONFIG = load_access_config(os.environ)

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'frontend' / 'dist'
BASE = '/'
CLI = os.environ.get('AD4_CLI', 'ffadv4manager')
HOST = os.environ.get('AD4_HOST')
MAX_GCODE = 100 * 1024 * 1024
FILE_NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,119}\Z')
PROFILE_NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,63}\Z')
STATE_LOCK = threading.RLock()
PRINTER_WRITE_LOCK = threading.RLock()
SELECTED = {'host': None, 'profile': None}
DISCOVERED = {}
WORKERS = {'notifications': None}
DATA_DIR = Path(os.environ.get('AD4_DATA_DIR', Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'ffadv4manager-cura'))
TIMELAPSE_ROOT = DATA_DIR / 'timelapses'
FILE_METADATA_PATH = DATA_DIR / 'uploaded-files.json'
TIMELAPSES = TimelapseService(TIMELAPSE_ROOT)


def private_ip(value):
    try:
        ip = ipaddress.ip_address(value)
        return (ip.version == 4 and ip.is_private and not ip.is_loopback
                and not ip.is_link_local and not ip.is_multicast)
    except ValueError:
        return False


def cli_argv(*args, selected=True):
    argv = [CLI]
    if selected:
        with STATE_LOCK:
            profile, host = SELECTED['profile'], SELECTED['host']
        if profile:
            argv += ['--profile', profile]
        elif host or HOST:
            argv += ['--host', host or HOST]
    argv.extend(args)
    return argv


def command(*args, timeout=30, selected=True, accepted_codes=(0,)):
    result = subprocess.run(cli_argv(*args, selected=selected), capture_output=True,
                            text=True, timeout=timeout, check=False)
    if result.returncode not in accepted_codes:
        raise RuntimeError((result.stderr or result.stdout).strip()[:1000]
                           or 'CLI exit ' + str(result.returncode))
    return result.stdout


def safe_filename(name):
    # Do not turn path traversal into a harmless-looking filename. Check the
    # original first, then transliterate common accented model names into ASCII
    # compatible with the FlashForge M28 command grammar.
    if (not isinstance(name, str) or len(name) > 120 or
            any(ch in name for ch in ('/', '\\\\', ':')) or
            any(ord(ch) < 32 or ord(ch) == 127 for ch in name)):
        raise ValueError('Nombre de archivo no válido')
    normalized = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    normalized = re.sub(r'[^A-Za-z0-9_. -]', '_', normalized)
    if not FILE_NAME.fullmatch(normalized) or normalized in ('.', '..'):
        raise ValueError('Nombre de archivo no válido')
    if Path(normalized).suffix.lower() not in ('.gx', '.gcode', '.gco', '.g'):
        raise ValueError('Solo se admiten archivos .gx, .gcode, .gco y .g')
    return normalized


def worker_running(name):
    with STATE_LOCK:
        worker = WORKERS[name]
    return bool(worker and worker.poll() is None)


def timelapse_state():
    return TIMELAPSES.state()


def selected_status_reader(argv):
    """Pin a session to its initial printer, even if the UI selection changes."""
    def get_status():
        result = subprocess.run([*argv, 'status', '--json'], capture_output=True, text=True,
                                timeout=15, check=False)
        if result.returncode:
            raise RuntimeError('Printer status unavailable')
        return json.loads(result.stdout)
    return get_status


def start_print_timelapse(mode='interval', layer_height=0.2):
    argv = cli_argv()
    return TIMELAPSES.start(argv, selected_status_reader(argv), auto=True,
                            mode=mode, layer_height=layer_height)


def estimated_layer_height(payload):
    """Read explicit layer-height metadata; use a documented default otherwise."""
    if not isinstance(payload, (bytes, bytearray)):
        return 0.2
    match = re.search(rb'(?im)^;\s*layer_height\s*[:=]\s*(0\.\d{1,3})\s*$',
                      payload[:1024 * 1024])
    if match:
        value = float(match.group(1))
        if 0.06 <= value <= 0.4:
            return value
    return 0.2


def _metadata_scope():
    with STATE_LOCK:
        profile, host = SELECTED['profile'], SELECTED['host']
    return ('profile:' + profile) if profile else ('host:' + (host or HOST or 'default'))


def _read_file_metadata():
    try:
        content = json.loads(FILE_METADATA_PATH.read_text(encoding='utf-8'))
        return content if isinstance(content, dict) else {}
    except (OSError, ValueError):
        return {}


def _print_seconds(value):
    value = value.strip().lower()
    if value.isdecimal():
        return int(value)
    parts = re.findall(r'(\d+)\s*([hms])\b', value)
    if not parts:
        return None
    units = {'h': 3600, 'm': 60, 's': 1}
    return sum(int(amount) * units[unit] for amount, unit in parts)


def inspect_upload_metadata(file):
    """Read recognized source-file metadata, never claim the printer reported it."""
    with file.open('rb') as handle:
        prefix = handle.read(1024 * 1024)
    metadata = {'estimated_seconds': None, 'hotend': None, 'bed': None}
    if prefix.startswith(b'xgcode 1.0\n\0') and len(prefix) >= 58:
        seconds = struct.unpack_from('<i', prefix, 28)[0]
        gx_values = struct.unpack_from('<8h', prefix, 42)
        if 1 < seconds < 30 * 86400:
            metadata['estimated_seconds'] = seconds
        if 0 < gx_values[5] <= 350:
            metadata['hotend'] = gx_values[5]
        if 0 < gx_values[4] <= 150:
            metadata['bed'] = gx_values[4]
        return metadata
    if b'\0' in prefix:
        return metadata
    body = prefix.decode('utf-8', errors='replace')
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith(';'):
            comment = stripped[1:].strip()
            for pattern in (r'estimated printing time \(normal mode\)\s*=\s*(.+)',
                            r'(?:print time|estimated_print_time)\s*=\s*(.+)',
                            r'TIME\s*:\s*(\d+)'):
                match = re.fullmatch(pattern, comment, flags=re.I)
                if match:
                    seconds = _print_seconds(match.group(1))
                    if seconds and 1 < seconds < 30 * 86400:
                        metadata['estimated_seconds'] = seconds
            for key, pattern in (('hotend', r'(?:nozzle_temperature|first_layer_temperature)\s*=\s*(\d+)'),
                                 ('bed', r'(?:bed_temperature|first_layer_bed_temperature)\s*=\s*(\d+)')):
                match = re.fullmatch(pattern, comment, flags=re.I)
                if match and metadata[key] is None:
                    value = int(match.group(1))
                    if 0 < value <= (350 if key == 'hotend' else 150):
                        metadata[key] = value
        else:
            match = re.match(r'^M(?:104|109|140|190)\b.*?\bS(\d+(?:\.\d+)?)', stripped, flags=re.I)
            if match:
                key = 'hotend' if stripped.upper().startswith(('M104', 'M109')) else 'bed'
                if metadata[key] is None:
                    value = round(float(match.group(1)))
                    if 0 < value <= (350 if key == 'hotend' else 150):
                        metadata[key] = value
        if all(metadata.values()):
            break
    return metadata


def save_upload_metadata(filename, metadata):
    scope = _metadata_scope()
    with STATE_LOCK:
        values = _read_file_metadata()
        values.setdefault(scope, {})[filename] = {
            **metadata, 'uploaded_at': datetime.now(timezone.utc).isoformat()
        }
        DATA_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = FILE_METADATA_PATH.with_suffix('.tmp')
        temporary.write_text(json.dumps(values, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, FILE_METADATA_PATH)


def printer_file_details():
    names = json.loads(command('files', '--json'))
    if not isinstance(names, list):
        raise ValueError('Invalid printer file listing')
    metadata = _read_file_metadata().get(_metadata_scope(), {})
    result = []
    for name in names:
        if not isinstance(name, str):
            continue
        fields = metadata.get(name.rsplit('/', 1)[-1], {})
        result.append({'path': name, 'name': name.rsplit('/', 1)[-1],
                       'estimated_seconds': fields.get('estimated_seconds'),
                       'hotend': fields.get('hotend'), 'bed': fields.get('bed'),
                       'uploaded_at': fields.get('uploaded_at')})
    return result


def timelapse_folder(value):
    return TIMELAPSES.folder_for(value)


def timelapse_frames(folder):
    from_timelapse = folder.glob('frame-*.jpg')
    return sorted(f for f in from_timelapse if f.is_file() and not f.is_symlink())


def list_timelapses():
    return TIMELAPSES.list()


def cleanup():
    TIMELAPSES.shutdown()
    worker = WORKERS.get('notifications')
    if worker and worker.poll() is None:
        worker.terminate()


atexit.register(cleanup)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def json(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def picture(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'image/jpeg')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def send_video(self, folder, download=False):
        """Authenticated MP4 response with seek support for HTML5 <video>."""
        video = folder / 'timelapse.mp4'
        if not video.is_file() or video.is_symlink():
            raise ValueError('MP4 not ready; recording/encoding may still be in progress')
        size = video.stat().st_size
        start, end = 0, size - 1
        range_header = self.headers.get('Range')
        if range_header:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header.strip())
            if not match or (not match.group(1) and not match.group(2)):
                self.send_error(416)
                return
            if not match.group(1):
                suffix = int(match.group(2))
                start = max(0, size - suffix)
            else:
                start = int(match.group(1))
                if match.group(2):
                    end = min(size - 1, int(match.group(2)))
            if start >= size or start > end:
                self.send_response(416)
                self.send_header('Content-Range', 'bytes */' + str(size))
                self.end_headers()
                return
        self.send_response(206 if range_header else 200)
        self.send_header('Content-Type', 'video/mp4')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        if range_header:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        if download:
            self.send_header('Content-Disposition', 'attachment; filename="timelapse-' + folder.name + '.mp4"')
        self.send_header('Cache-Control', 'private, no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        with video.open('rb') as stream:
            stream.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                block = stream.read(min(64 * 1024, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)

    def camera_live(self):
        # Resolve camera on the protected bridge; never expose its private URL to the browser.
        camera_url = command('camera', 'url', timeout=10).strip()
        target = urlsplit(camera_url)
        if (target.scheme != 'http' or not private_ip(target.hostname)
                or target.username or target.password or not target.port
                or target.fragment or len(camera_url) > 2048):
            raise ValueError('Camera URL must point to a private IPv4 HTTP camera')
        connection = http.client.HTTPConnection(target.hostname, target.port, timeout=15)
        try:
            connection.request('GET', target.path + ('?' + target.query if target.query else ''),
                               headers={'Accept': 'multipart/x-mixed-replace'})
            stream = connection.getresponse()
            mime = stream.getheader('Content-Type', '')
            if stream.status != 200 or not re.fullmatch(
                    r'multipart/x-mixed-replace\s*;\s*boundary="?[-\w]+"?', mime, re.I):
                raise ValueError('The printer camera did not return an MJPEG stream')
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Cache-Control', 'no-store, no-transform')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            while chunk := stream.read(16 * 1024):
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass  # Browser closed the feed.
        finally:
            connection.close()

    def request_authorized(self, write=False):
        host = self.headers.get('Host', '').lower()
        origin = self.headers.get('Origin')
        if ACCESS_CONFIG:
            # Access enabled: no loopback authentication bypass. Public requests
            # need the exact Host and a valid signed Access JWT for this user.
            if host != ACCESS_CONFIG['public_host']:
                return False
            if origin and origin != ACCESS_CONFIG['public_origin']:
                return False
            if write and origin != ACCESS_CONFIG['public_origin']:
                return False
            return verify_access_jwt(
                self.headers.get('Cf-Access-Jwt-Assertion'), ACCESS_CONFIG)
        # Development / local-only mode, never accessible from another host.
        if not re.fullmatch(r'(?:localhost|127\.0\.0\.1):\d{1,5}', host):
            return False
        if not write or not origin:
            return True
        return origin in ('http://' + host, 'http://localhost:5173',
                          'http://127.0.0.1:5173')

    def data(self, limit=4096):
        size = int(self.headers.get('Content-Length', '0'))
        if not 0 < size <= limit:
            raise ValueError('Tamaño de petición no válido')
        if 'application/json' not in self.headers.get('Content-Type', ''):
            raise ValueError('Se requiere JSON')
        return json.loads(self.rfile.read(size))

    def do_HEAD(self):
        # Do not leak static file metadata through an unauthenticated inherited handler.
        self.send_error(405, 'HEAD not supported')

    def do_GET(self):
        if not self.request_authorized():
            return self.json(401 if ACCESS_CONFIG else 403, {'error': 'Unauthorized request'})
        url = urlsplit(self.path)
        path = url.path
        try:
            if path.startswith('/api/printer/tools/'):
                from server import manager_tools
                return manager_tools.get(self, path.rsplit('/', 1)[-1], url, sys.modules[__name__])
            if path == '/api/printer/session':
                with STATE_LOCK:
                    selection = dict(SELECTED)
                return self.json(200, {**selection, 'notifying': worker_running('notifications')})
            if path == '/api/printer/status':
                return self.json(200, json.loads(command('status', '--json')))
            if path == '/api/printer/discover':
                devices = json.loads(command('discover', '--json', timeout=12, selected=False))
                if not isinstance(devices, list):
                    raise ValueError('Respuesta de descubrimiento inválida')
                with STATE_LOCK:
                    DISCOVERED.clear()
                    DISCOVERED.update({d['ip']: d.get('port', 8899) for d in devices
                                       if isinstance(d, dict) and private_ip(d.get('ip'))})
                return self.json(200, devices)
            if path == '/api/printer/files':
                if parse_qs(url.query).get('details') == ['1']:
                    return self.json(200, printer_file_details())
                return self.json(200, json.loads(command('files', '--json')))
            if path == '/api/printer/profiles':
                return self.json(200, json.loads(command('profiles', 'list', selected=False)))
            if path == '/api/printer/diagnostics':
                kind = parse_qs(url.query).get('kind', ['doctor'])[0]
                if kind not in ('doctor', 'info', 'position'):
                    raise ValueError('Diagnóstico no compatible')
                output = command(kind, *(['--json'] if kind in ('info', 'position') else []),
                                 timeout=45, accepted_codes=(0, 1) if kind == 'doctor' else (0,))
                return self.json(200, {'output': json.loads(output)})
            if path == '/api/printer/timelapse':
                return self.json(200, timelapse_state())
            if path == '/api/printer/timelapses':
                return self.json(200, list_timelapses())
            if path == '/api/printer/timelapses/frame':
                query = parse_qs(url.query)
                folder = timelapse_folder(query.get('id', [''])[0])
                index = int(query.get('index', ['0'])[0])
                frames = timelapse_frames(folder)
                if not 0 <= index < len(frames):
                    raise ValueError('Invalid frame index')
                return self.picture(frames[index].read_bytes())
            if path in ('/api/printer/timelapses/video', '/api/printer/timelapses/download'):
                query = parse_qs(url.query)
                return self.send_video(timelapse_folder(query.get('id', [''])[0]),
                                       download=path.endswith('/download'))
            if path == '/api/printer/camera/live':
                return self.camera_live()

            if path == '/api/printer/camera':
                with tempfile.TemporaryDirectory() as directory:
                    frame = Path(directory) / 'frame.jpg'
                    command('camera', 'snapshot', str(frame), timeout=25)
                    data = frame.read_bytes()
                return self.picture(data)
        except (OSError, RuntimeError, ValueError, TypeError, subprocess.TimeoutExpired,
                json.JSONDecodeError) as error:
            return self.json(502, {'error': str(error)})
        # Integrated frontend is served at /, and API routes never expose static files.
        if path.startswith('/api/'):
            return self.json(404, {'error': 'Unknown API route'})
        return super().do_GET()

    def do_POST(self):
        url = urlsplit(self.path)
        path = url.path
        if path.startswith('/api/printer/tools/'):
            if not self.request_authorized(write=True):
                return self.json(401 if ACCESS_CONFIG else 403, {'error': 'Unauthorized request'})
            from server import manager_tools
            with PRINTER_WRITE_LOCK:
                try:
                    return manager_tools.post(self, path.rsplit('/', 1)[-1], url, sys.modules[__name__])
                except (OSError, ValueError, RuntimeError, TypeError, subprocess.TimeoutExpired) as error:
                    return self.json(422, {'error': str(error)})
        if path not in ('/api/printer/jobs', '/api/printer/upload', '/api/printer/actions',
                        '/api/printer/selection', '/api/printer/profiles',
                        '/api/printer/profiles/delete', '/api/printer/timelapse',
                        '/api/printer/timelapses/delete',
                        '/api/printer/notifications'):
            return self.send_error(404)
        if not self.request_authorized(write=True):
            return self.json(401 if ACCESS_CONFIG else 403, {'error': 'Unauthorized request'})
        # Pin the connection and serialize writes through the whole transaction.
        with PRINTER_WRITE_LOCK:
            return self.printer_post(path, url)

    def printer_post(self, path, url):
        try:
            if path in ('/api/printer/jobs', '/api/printer/upload'):
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= MAX_GCODE:
                    return self.json(413, {'error': 'Archivo vacío o superior a 100 MB'})
                legacy = path.endswith('/jobs')
                expected_type = 'text/plain' if legacy else 'application/octet-stream'
                if not self.headers.get('Content-Type', '').startswith(expected_type):
                    return self.json(415, {'error': 'Tipo de archivo no admitido'})
                data = self.rfile.read(size)
                if len(data) != size or not data.strip(b'\x00\r\n\t '):
                    raise ValueError('Archivo vacío o incompleto')
                # Preserve the real source name supplied by the slicer or file picker.
                # Never silently replace an uploaded model with a generic filename.
                try:
                    name = safe_filename(parse_qs(url.query).get('name', [''])[0])
                except ValueError as exc:
                    return self.json(400, {'error': str(exc)})
                # The server independently verifies the single supported Artillery PLA
                # temperature envelope; POSTs cannot bypass the browser preflight.
                try:
                    require_safe_artillery_heating(data, name)
                except ValueError as exc:
                    return self.json(422, {'error': str(exc)})
                query = parse_qs(url.query)
                start = query.get('start', ['false'])[0] == 'true'
                auto_timelapse = start and query.get('timelapse', ['false'])[0] == 'true'
                capture_mode = query.get('timelapse_mode', ['interval'])[0]
                if capture_mode not in ('interval', 'layer'):
                    raise ValueError('Invalid capture mode')
                if auto_timelapse:
                    TIMELAPSES.require_encoder()
                    if TIMELAPSES.state()['id'] or TIMELAPSES.state()['encoding']:
                        raise ValueError('A timelapse session is already active')
                with tempfile.TemporaryDirectory() as directory:
                    filename = Path(directory) / name
                    filename.write_bytes(data)
                    output = command('upload', str(filename), *(['--start'] if start else []), timeout=3600)
                    metadata = inspect_upload_metadata(filename)
                # The CLI chooses the printer filename using GX header metadata;
                # report the actual destination returned by the CLI, not the
                # temporary name used to pass the file to the converter.
                match = re.search(r'Uploaded and listed:\s*([^\r\n]+)', output)
                if not match:
                    raise RuntimeError('The CLI did not report a confirmed remote upload')
                remote_path = match.group(1).strip()
                save_upload_metadata(remote_path.rsplit('/', 1)[-1], metadata)
                timelapse_capture = None
                timelapse_error = None
                if auto_timelapse:
                    try:
                        timelapse_capture = start_print_timelapse(mode=capture_mode,
                            layer_height=estimated_layer_height(data))
                    except (OSError, ValueError, RuntimeError) as exc:
                        # The physical print already started; report capture failure honestly.
                        timelapse_error = str(exc)
                return self.json(200, {'remote_name': remote_path.rsplit('/', 1)[-1],
                                       'remote_path': remote_path, 'started': start,
                                       'timelapse': timelapse_capture,
                                       'timelapse_error': timelapse_error,
                                       'detail': output[-1000:]})
            body = self.data()
            if not isinstance(body, dict):
                raise ValueError('Formato JSON no válido')
            if path == '/api/printer/actions':
                action = body.get('action')
                simple = {'pause': ('pause',), 'resume': ('resume',), 'cancel': ('cancel',),
                          'fan_on': ('fan', 'on'), 'fan_off': ('fan', 'off')}
                if action == 'print':
                    auto_timelapse = body.get('timelapse') is True
                    capture_mode = body.get('timelapse_mode', 'interval')
                    if capture_mode not in ('interval', 'layer'):
                        raise ValueError('Invalid capture mode')
                    if auto_timelapse:
                        TIMELAPSES.require_encoder()
                        if TIMELAPSES.state()['id'] or TIMELAPSES.state()['encoding']:
                            raise ValueError('A timelapse session is already active')
                    filename = body.get('file')
                    listed = json.loads(command('files', '--json'))
                    if not isinstance(filename, str) or filename not in listed:
                        raise ValueError('El archivo no está en el listado actual')
                    output = command('print', filename, timeout=50)
                    if auto_timelapse:
                        try:
                            start_print_timelapse(mode=capture_mode)
                        except (OSError, ValueError, RuntimeError) as exc:
                            return self.json(200, {'detail': output[-1000:], 'timelapse_error': str(exc)})
                elif action in simple:
                    output = command(*simple[action], timeout=50)
                else:
                    raise ValueError('Acción no admitida')
                if action == 'cancel':
                    TIMELAPSES.stop('print_cancelled')
                return self.json(200, {'detail': output[-1000:]})
            if path == '/api/printer/selection':
                profile = body.get('profile')
                host = body.get('host')
                if bool(profile) == bool(host):
                    raise ValueError('Selecciona un host o un perfil')
                if profile:
                    profiles = json.loads(command('profiles', 'list', selected=False))
                    if profile not in profiles:
                        raise ValueError('Perfil inexistente')
                    with STATE_LOCK:
                        SELECTED.update(profile=profile, host=None)
                else:
                    with STATE_LOCK:
                        eligible = DISCOVERED.get(host) == 8899
                    if not private_ip(host) or not eligible:
                        raise ValueError('Selecciona una impresora descubierta con puerto 8899')
                    with STATE_LOCK:
                        SELECTED.update(host=host, profile=None)
                return self.json(200, dict(SELECTED))
            if path == '/api/printer/profiles':
                name, host = body.get('name'), body.get('host')
                if not isinstance(name, str) or not PROFILE_NAME.fullmatch(name):
                    raise ValueError('Nombre de perfil inválido')
                if not isinstance(host, str) or not private_ip(host):
                    raise ValueError('Se requiere una IPv4 privada válida')
                command('profiles', 'add', name, '--host', host, selected=False)
                return self.json(200, {'added': name})
            if path == '/api/printer/profiles/delete':
                name = body.get('name')
                if not isinstance(name, str) or not PROFILE_NAME.fullmatch(name):
                    raise ValueError('Perfil inválido')
                command('profiles', 'delete', name, selected=False)
                with STATE_LOCK:
                    if SELECTED['profile'] == name:
                        SELECTED.update(host=None, profile=None)
                return self.json(200, {'deleted': name})
            if path == '/api/printer/timelapses/delete':
                return self.json(200, TIMELAPSES.delete(body.get('id')))
            if path == '/api/printer/timelapse':
                action = body.get('action')
                if action == 'stop':
                    return self.json(200, TIMELAPSES.stop('manual'))
                if action == 'start':
                    # Manual recordings made during a print also stop at print completion.
                    argv = cli_argv()
                    capture_mode = body.get('mode', 'interval')
                    return self.json(200, TIMELAPSES.start(
                        argv, selected_status_reader(argv), auto=False, mode=capture_mode))
                raise ValueError('Acción de timelapse inválida')
            if path == '/api/printer/notifications':
                action = body.get('action')
                with STATE_LOCK:
                    worker = WORKERS['notifications']
                    if action == 'stop':
                        if worker and worker.poll() is None:
                            worker.terminate()
                    elif action == 'start':
                        if not shutil.which('notify-send'):
                            raise ValueError('notify-send no está instalado en el equipo Linux')
                        if not worker or worker.poll() is not None:
                            WORKERS['notifications'] = subprocess.Popen(
                                cli_argv('notify', '--events', 'paused,offline,printing,ready'),
                                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
                    else:
                        raise ValueError('Acción de notificaciones inválida')
                return self.json(200, {'running': worker_running('notifications')})
        except (OSError, RuntimeError, ValueError, TypeError, subprocess.TimeoutExpired,
                json.JSONDecodeError) as error:
            return self.json(502, {'error': str(error)})


def serve(*, require_access=False):
    """Serve the integrated frontend and API on loopback only."""
    if not (DIST / 'index.html').is_file():
        raise RuntimeError('Missing frontend/dist/: run cd frontend && npm ci && npm run build')
    if require_access and not ACCESS_CONFIG:
        raise RuntimeError('Cloudflare Access configuration is required')
    if ACCESS_CONFIG:
        _jwks_client(ACCESS_CONFIG['jwks_url'])
        print('Cloudflare Access validation enabled: ' + ACCESS_CONFIG['public_origin'], flush=True)
    else:
        print('Local-only mode: Cloudflare authentication disabled; do NOT publish a Tunnel route', flush=True)
    TIMELAPSES.recover()
    port = int(os.environ.get('AD4_WEB_PORT', '8765'))
    print('FFAdv4Manager: http://127.0.0.1:' + str(port) + '/', flush=True)
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    try:
        serve()
    except (RuntimeError, ValueError) as exc:
        sys.exit(str(exc))
