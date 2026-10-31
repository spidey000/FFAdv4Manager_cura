"""Actual bundled Three.js current-job renderer + camera with a simulated printer."""
import functools
import io
import json
import os
import shutil
from pathlib import Path
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
from playwright.sync_api import sync_playwright

from server.job_tracking import parse_toolpath

ROOT = Path(__file__).resolve().parents[2]
CODE = b'G90\nM83\nG1 Z.3\nG1 X20 E1\nG1 Y20 E1\nG1 X0 E1\nG1 Y0 E1\nG1 Z.5\nG1 X20 E1\nG1 Y20 E1\nG1 X0 E1\nG1 Y0 E1\nG1 Z.8\nG1 X20 E1\nG1 Y20 E1\n'


def run():
    source = {'kind': 'server_upload', 'sha256': 'a' * 64, 'remote_verified': False, 'name': 'part.gcode'}
    state = {'status': {'machine_status': 'BUILDING_FROM_SD', 'current_file': '/data/part.gx', 'progress_percent': 42},
             'position': {'X': 10, 'Y': 0, 'Z': .5}, 'active': True, 'source': source, 'job_token': 'fixture',
             'layer_current': 2, 'layer_total': 3, 'layer_estimated': True, 'geometry_available': True, 'download_supported': False}
    geometry = {**parse_toolpath(CODE, 'part.gcode'), 'job_token': 'fixture', 'source': source}
    picture = io.BytesIO()
    Image.new('RGB', (320, 240), (33, 63, 51)).save(picture, 'JPEG')
    requests = []
    def printer(route):
        path = route.request.url.split('/api/printer', 1)[1]
        requests.append(path)
        if path == '/camera/live':
            return route.fulfill(status=200, content_type='image/jpeg', headers={'Cache-Control': 'no-store'}, body=picture.getvalue())
        if path.startswith('/current-job/toolpath'): data = geometry
        elif path == '/current-job': data = state
        elif path == '/status': data = state['status']
        elif path.startswith('/files'): data = []
        elif path == '/profiles': data = []
        elif path == '/session': data = {'profile': None, 'notifying': False}
        elif path == '/timelapse': data = {'running': False, 'encoding': False}
        elif path == '/tools/telemetry': data = {'monitoring': False, 'records': [], 'waiting': False, 'wait_result': None}
        else: data = []
        route.fulfill(status=200, content_type='application/json', body=json.dumps(data))
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT / 'frontend/dist')))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium") or None, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            for width in (390, 1280):
                page = browser.new_page(viewport={'width': width, 'height': 1000})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('**/api/printer/**', printer)
                page.route('**/api/slice/engine', lambda route: route.fulfill(status=503, content_type='application/json', body='{"available":false}'))
                page.goto('http://127.0.0.1:' + str(server.server_port), wait_until='networkidle')
                page.wait_for_function('globalThis.AD4LiveRenderer && globalThis.app?.gui?.slicer', timeout=30000)
                original = page.evaluate('globalThis.app.gui.slicer.exported_gcode')
                page.locator('#ad4-v3-top [data-route="printer"]').click()
                page.wait_for_function('!document.querySelector("[data-printer-card=job] button").disabled', timeout=15000)
                page.locator('[data-printer-card="job"] button').click()
                page.wait_for_function('document.querySelector("#ad4-live-canvas canvas") !== null', timeout=15000)
                page.wait_for_function('document.querySelector("#ad4-live-camera").naturalWidth > 0')
                cameras_before = requests.count('/camera/live')
                page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
                assert page.locator('#ad4-live-camera').get_attribute('src') is None
                with page.expect_response('**/api/printer/camera/live') as resumed:
                    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))')
                resumed.value.finished()
                page.wait_for_function('document.querySelector("#ad4-live-camera").naturalWidth > 0 && !!document.querySelector("#ad4-live-camera").getAttribute("src")')
                assert requests.count('/camera/live') > cameras_before
                assert page.locator('#ad4-live-camera-toggle').is_checked()
                page.wait_for_function('document.querySelector("#ad4-live-position").textContent.includes("2 / 3")')
                assert page.locator('#ad4-live-source').inner_text().startswith('Source: retained copy')
                assert page.locator('#ad4-live-fetch').is_disabled()
                box = page.locator('.ad4-live-pair').evaluate('(e)=>({width:e.clientWidth,overflow:e.scrollWidth,cols:getComputedStyle(e).gridTemplateColumns})')
                assert box['overflow'] <= box['width'] + 1
                assert len(box['cols'].split()) == 2, box
                page.locator('#ad4-live-right').click()
                assert page.evaluate('globalThis.app.gui.slicer.exported_gcode') == original
                assert page.evaluate('document.body.dataset.ad4Screen') == 'printer'
                page.screenshot(path=f'/tmp/ad4-current-job-{width}.png')
                page.locator('#ad4-v3-top [data-route="preview"]').click()
                page.wait_for_function('document.querySelector("#ad4-live-canvas canvas") === null')
                assert page.locator('#ad4-live-camera').get_attribute('src') is None
                assert not errors, errors
                page.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
    assert '/current-job' in requests
    print('Actual bundled 3D live job and side-by-side camera passed at 390 and 1280 px; editor state unchanged')


if __name__ == '__main__':
    run()

