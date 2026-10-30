import json
import subprocess
from unittest.mock import Mock
from urllib.parse import urlsplit
import pytest
from server import manager_tools as tools, ad4_bridge as bridge


def test_connection_values_reject_public_hosts_and_invalid_fields():
    for values in ({'host': '8.8.8.8'}, {'host': '192.168.1.42', 'timeout': float('inf')},
                   {'host': '192.168.1.42', 'camera_path': '/../secret'},
                   {'host': '192.168.1.42', 'port': True},
                   {'host': '192.168.1.42', 'script': 'anything'}):
        with pytest.raises(ValueError):
            tools.connection_values(values, bridge)


def test_profile_update_dispatches_all_connection_fields(monkeypatch):
    command = Mock(return_value='updated')
    monkeypatch.setattr(bridge, 'command', command)
    h = Mock()
    h.data.return_value = {'action': 'update', 'name': 'AD4', 'values': {
        'host': '192.168.1.42', 'port': 8899, 'camera_port': 8080,
        'timeout': 12, 'camera_path': '/?action=stream'}}
    tools.post(h, 'profile', urlsplit('/api/printer/tools/profile'), bridge)
    args = command.call_args.args
    assert args[:3] == ('profiles', 'update', 'AD4')
    assert args[args.index('--camera-port') + 1] == '8080'
    assert args[args.index('--timeout') + 1] == '12'


def test_failed_wait_is_exposed_and_does_not_claim_match(monkeypatch, tmp_path):
    worker = Mock()
    worker.poll.return_value = 1
    worker.communicate.return_value = ('', 'Timed out waiting')
    monkeypatch.setattr(tools, 'WAITER', worker)
    monkeypatch.setattr(tools, 'WAIT_RESULT', None)
    monkeypatch.setattr(bridge, 'DATA_DIR', tmp_path)
    result = tools.telemetry_state(bridge)
    assert result['waiting'] is False
    assert result['wait_result']['matched'] is False
    assert 'Timed out' in result['wait_result']['error']


def test_wait_worker_is_bounded_and_selection_is_pinned(monkeypatch, tmp_path):
    monkeypatch.setattr(tools, 'WAITER', None)
    monkeypatch.setattr(tools, 'MONITOR', None)
    monkeypatch.setattr(bridge, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(bridge, 'SELECTED', {'host': '192.168.1.42', 'profile': None})
    popen = Mock()
    popen.return_value.poll.return_value = None
    monkeypatch.setattr(tools.subprocess, 'Popen', popen)
    h = Mock()
    h.data.return_value = {'action': 'start', 'condition': 'bed_below', 'value': 40}
    tools.post(h, 'wait', urlsplit('/api/printer/tools/wait'), bridge)
    argv = popen.call_args.args[0]
    assert '--host' in argv and '192.168.1.42' in argv
    assert argv[-2:] == ['--timeout', '3600']


def test_tools_are_authenticated_by_existing_http_handler():
    # Existing bridge integration test server exercises routing, not only tool functions.
    from http.server import ThreadingHTTPServer
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError
    import threading
    server = ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = 'http://127.0.0.1:' + str(server.server_port)
        req = Request(base + '/api/printer/tools/rename', data=b'{"name":"AD4"}',
                      headers={'Content-Type': 'application/json', 'Origin': 'https://untrusted.example'})
        with pytest.raises(HTTPError) as caught:
            urlopen(req, timeout=3)
        assert caught.value.code == 403
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
