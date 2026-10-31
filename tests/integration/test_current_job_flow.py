"""HTTP → subprocess transport → archived source → live geometry, without hardware."""
import json
from pathlib import Path
import sys
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen

from server import ad4_bridge as bridge, current_job


def test_uploaded_source_becomes_current_job_preview_through_real_http_and_subprocess(monkeypatch, tmp_path):
    state = tmp_path / 'fake-printer.json'
    fake = tmp_path / 'fake-cli'
    fake.write_text('#!' + sys.executable + '\n' + r'''
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
while args and args[0].startswith('--'):
    args = args[2:]
path = Path(os.environ['AD4_TEST_PRINTER_STATE'])
state = json.loads(path.read_text()) if path.exists() else {'machine_status':'READY'}
if args[0] == 'upload':
    assert Path(args[1]).is_file()
    state = {'machine_status':'BUILDING_FROM_SD','current_file':'/data/00_01_1m_part.gx','progress_percent':42}
    path.write_text(json.dumps(state))
    print('Uploaded and listed: 0:/user/00_01_1m_part.gx')
elif args[0] == 'status': print(json.dumps(state))
elif args[0] == 'position': print(json.dumps({'X':10,'Y':0,'Z':.5}))
elif args[0] == 'cancel':
    path.write_text(json.dumps({'machine_status':'READY'}))
    print('ok')
else: raise RuntimeError(args)
''')
    fake.chmod(0o700)
    monkeypatch.setenv('AD4_TEST_PRINTER_STATE', str(state))
    monkeypatch.setenv('FFADV4MANAGER_CONFIG', str(tmp_path / 'config.ini'))
    monkeypatch.delenv('AD4_JOB_DOWNLOAD_ARGV', raising=False)
    monkeypatch.setattr(bridge, 'CLI', str(fake))
    monkeypatch.setattr(bridge, 'DATA_DIR', tmp_path / 'data')
    monkeypatch.setattr(bridge, 'SELECTED', {'host': '192.168.1.42', 'profile': None})
    server = ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = 'http://127.0.0.1:' + str(server.server_port)
    def request(path, data=None, mime='application/json'):
        req = Request(base + path, data=data, headers={'Origin': base, 'Content-Type': mime})
        with urlopen(req, timeout=5) as response:
            return json.load(response)
    try:
        code = b'M104 S205\nM140 S55\nG90\nM83\nG1 Z.3\nG1 X10 E1\nG1 Z.5\nG1 Y10 E1\nG1 Z.8\nG1 X0 E1\n'
        sent = request('/api/printer/upload?name=part.gcode&start=true', code, 'application/octet-stream')
        assert sent['started'] is True
        assert sent['preview_error'] is None
        live = request('/api/printer/current-job')
        assert live['source']['kind'] == 'server_upload'
        assert not live['source']['remote_verified']
        assert live['layer_total'] == 3
        geometry = request('/api/printer/current-job/toolpath?token=' + live['job_token'])
        assert geometry['layers'][1]['z'] == .5
        time.sleep(2.6)  # Real-time stability debounce must expire across separate observations.
        assert request('/api/printer/current-job')['layer_current'] == 2
        assert request('/api/printer/actions', b'{"action":"cancel"}')['detail'] == 'ok\n'
        stopped = request('/api/printer/current-job')
        assert stopped['active'] is False
        assert stopped['layer_current'] is None
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
