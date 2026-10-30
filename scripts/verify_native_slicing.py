"""Verify browser → real native slice → GX → deposited layers, without a printer."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ffadv4manager.core.gcode_to_gx import convert_gcode_to_gx
from server.gcode_safety import require_safe_artillery_heating
from server.job_tracking import parse_toolpath
from server.mosaic_slicer import engine_binary


def verify(output):
    from playwright.sync_api import sync_playwright
    executable = engine_binary()
    output.mkdir(parents=True, exist_ok=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='ad4-native-check-') as directory:
        env = {k: v for k, v in os.environ.items() if not k.startswith(('CF_ACCESS_', 'AD4_HOST'))}
        env.update(AD4_WEB_PORT=str(port), AD4_CURAENGINE_BIN=executable,
                   AD4_DATA_DIR=directory, FFADV4MANAGER_CONFIG=str(Path(directory) / 'config.ini'))
        log = (output / 'server.log').open('w')
        process = subprocess.Popen([sys.executable, '-m', 'server.cura_bridge'], cwd=ROOT,
                                   env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            base = 'http://127.0.0.1:' + str(port)
            for attempt in range(30):
                try:
                    with urlopen(base + '/api/slice/engine', timeout=2) as response:
                        assert json.load(response)['available'] is True
                    break
                except (URLError, OSError):
                    if process.poll() is not None:
                        raise RuntimeError('Native verification server exited')
                    time.sleep(.5)
            else:
                raise RuntimeError('Native verification server did not start')
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True,
                    executable_path=os.environ.get('CHROME_BIN') or shutil.which('google-chrome') or shutil.which('chromium') or None,
                    args=['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
                page = browser.new_page(viewport={'width': 1280, 'height': 900})
                # No printer operations are permitted by this test, even if the
                # machine running it has a saved or environmental printer host.
                page.route('**/api/printer/**', lambda route: route.fulfill(
                    status=503, content_type='application/json', body='{"error":"Hardware disabled during native verification"}'))
                page.goto(base, wait_until='networkidle')
                page.wait_for_function('globalThis.app?.gui?.file?.load_file && globalThis.app?.settings?.active_containers', timeout=30000)
                page.locator('#stl-file').set_input_files(str(ROOT / 'overlays/mosaic/public/demo-cube-20mm.stl'))
                page.wait_for_function('Object.keys(globalThis.app.gui.model_viewer.models).length === 1')
                settings = page.evaluate('globalThis.app.settings.active_containers.export_settings()')
                (output / 'browser-settings.json').write_text(json.dumps(settings))
                print('Browser settings per group:', {key: len(value) for key, value in settings.items()}, flush=True)
                with page.expect_response(lambda response: response.url.endswith('/api/slice') and response.request.method == 'POST', timeout=300000) as pending:
                    page.locator('#ad4-v3-run-slice').click()
                response = pending.value
                payload = response.json()
                (output / 'slice-response.json').write_text(json.dumps(payload))
                if response.status != 200:
                    raise RuntimeError('Real native slicing failed: ' + str(payload))
                assert payload['engine'] == 'server'
                gcode = payload['gcode']
                assert ';LAYER:' in gcode, 'Native output has no layers'
                assert payload['time_seconds'] > 0 and payload['time_seconds'] != 6666
                assert payload['filament_mm'] > 0, 'Native finalized filament estimate missing'
                page.wait_for_function('typeof globalThis.app.gui.slicer.exported_gcode === "string"')
                assert page.evaluate('globalThis.app.gui.slicer.exported_gcode') == gcode
                page.screenshot(path=str(output / 'native-slice.png'), full_page=True)
                browser.close()
            source = output / 'native-cube.gcode'
            source.write_text(gcode)
            gx = convert_gcode_to_gx(source, output / 'native-cube.gx')
            require_safe_artillery_heating(source.read_bytes(), source.name)
            require_safe_artillery_heating(gx.read_bytes(), gx.name)
            toolpath = parse_toolpath(gx.read_bytes(), gx.name)
            assert toolpath['layer_total'] > 1
            assert toolpath['segment_count'] > 100
            report = {'native_engine_sha256': hashlib.sha256(Path(executable).read_bytes()).hexdigest(),
                      'gcode_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                      'gx_sha256': hashlib.sha256(gx.read_bytes()).hexdigest(),
                      'layers': toolpath['layer_total'], 'deposited_segments': toolpath['segment_count'],
                      'time_seconds': payload['time_seconds'], 'filament_mm': payload['filament_mm'],
                      'hardware_commands_sent': False}
            (output / 'verification.json').write_text(json.dumps(report, indent=2))
            print(json.dumps(report, indent=2))
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
            log.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    verify(parser.parse_args().output_dir.resolve())
