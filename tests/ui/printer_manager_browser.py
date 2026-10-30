"""Exercise the actual manager controllers with a simulated API, never hardware."""
import ast
import functools
import io
import json
from pathlib import Path
import shutil
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def run():
    tree = ast.parse((ROOT / 'scripts/prepare_mosaic.py').read_text())
    markup = next(ast.literal_eval(node.value) for node in ast.walk(tree)
                  if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'dialog' for t in node.targets))
    markup = markup[:markup.index('<script')]
    calls = []
    state = {'machine_status': 'READY', 'bed_current': 25}
    record = {'running': False, 'encoding': False}
    bitmap = io.BytesIO()
    Image.new('RGB', (80, 60), 'gray').save(bitmap, 'BMP')
    def api(route):
        req = route.request
        path = req.url.split('/api/printer', 1)[1]
        calls.append((req.method, path, req.post_data))
        if path.startswith('/tools/preview'):
            return route.fulfill(status=200, content_type='image/bmp', body=bitmap.getvalue())
        if path == '/status': data = state
        elif path.startswith('/files?'): data = [{'path': '/data/test.gx', 'name': 'test.gx', 'estimated_seconds': 120}]
        elif path == '/files': data = ['/data/test.gx']
        elif path == '/timelapse': data = record
        elif path == '/timelapses': data = []
        elif path == '/profiles': data = ['AD4']
        elif path == '/session': data = {'profile': 'AD4', 'notifying': False}
        elif path == '/discover': data = [{'name': 'AD4', 'ip': '192.168.1.42', 'port': 8899}]
        elif path.startswith('/tools/profile?'): data = {'host': '192.168.1.42', 'port': 8899, 'timeout': 12, 'camera_port': 8080}
        elif path == '/tools/telemetry': data = {'monitoring': False, 'records': [], 'waiting': False, 'wait_result': None}
        elif path.startswith('/tools/inspect'): data = {'format': 'gcode', 'sha256': 'test-sha', 'size_bytes': 28}
        elif path.startswith('/upload?'): data = {'remote_name': 'test.gx', 'started': False}
        else: data = {'detail': 'ok'}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(data))
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for path in (ROOT / 'overlays/mosaic/public').glob('*'):
            if path.suffix in ('.js', '.css'):
                shutil.copy2(path, root / path.name)
        (root / 'index.html').write_text('<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<link rel="stylesheet" href="ad4.css"><link rel="stylesheet" href="ad4-studio.css"><link rel="stylesheet" href="ad4-v3.css"><link rel="stylesheet" href="ad4-manager-tools.css">'
            '<button id="ad4-open-manager">Printer</button>' + markup +
            '<script type="module" src="ad4-manager.js"></script><script type="module" src="ad4-manager-tools.js"></script>')
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SimpleHTTPRequestHandler, directory=directory))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
                for width in (390, 1280):
                    page = browser.new_page(viewport={'width': width, 'height': 900})
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('dialog', lambda dialog: dialog.accept())
                    page.route('**/api/printer/**', api)
                    page.goto('http://127.0.0.1:' + str(server.server_port))
                    page.wait_for_function('globalThis.AD4Tools !== undefined')
                    page.locator('#ad4-open-manager').click()
                    page.wait_for_function('document.getElementById("ad4-machine").textContent === "READY"')
                    assert page.locator('#ad4-timelapse-stop').is_disabled()
                    page.locator('#ad4-discover').click()
                    page.get_by_role('button', name='AD4 · 192.168.1.42 · Connect').click()
                    page.get_by_text('Printer connections and diagnostics', exact=True).click()
                    page.locator('#ad4-profile-detail').click()
                    page.wait_for_function('document.getElementById("ad4-conn-timeout").value === "12"')
                    page.locator('#ad4-profile-update').click()
                    page.wait_for_function('document.getElementById("ad4-manager-status").textContent.includes("completed")')
                    page.locator('#ad4-local-job').set_input_files({'name': 'part.gcode', 'mimeType': 'text/plain', 'buffer': b'M104 S205\nM140 S55\nG1 X1\n'})
                    page.locator('#ad4-inspect-job').click()
                    page.wait_for_function('document.getElementById("ad4-inspect-result").textContent.includes("test-sha")')
                    page.locator('#ad4-upload-job').click()
                    page.get_by_role('button', name='Send only', exact=True).click()
                    page.wait_for_function('document.getElementById("ad4-manager-status").textContent.includes("completed")')
                    assert any(method == 'POST' and path.startswith('/upload?') for method, path, body in calls)
                    assert not errors, errors
                    assert page.locator('#ad4-manager').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'), 'Horizontal overflow in printer manager' 
                    page.screenshot(path=f'/tmp/ad4-manager-tools-{width}.png')
                    page.close()
                browser.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)
    print('Actual printer manager: discovery, profile editing, file inspection and upload passed at 390 and 1280 px')


if __name__ == '__main__':
    run()
