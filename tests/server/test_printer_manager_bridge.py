"""Regression checks for the local printer manager bridge; no physical printer needed."""
import json
import struct
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

from server import ad4_bridge as bridge


def valid_test_gx():
    from ffadv4manager.core.gx_converter.gx_writer import encode_gx
    from ffadv4manager.core.gx_converter.metadata import PrintMetadata
    from ffadv4manager.core.gx_converter.thumbnail import extract_thumbnail_bmp
    return encode_gx(PrintMetadata(nozzle_right=205, bed_temp=55),
                     extract_thumbnail_bmp([]), "M104 S205\nG1 X1\n")


class BridgeChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=4)

    def request(self, route, obj=None, origin=None):
        url = 'http://127.0.0.1:' + str(self.port) + route
        headers = {'Origin': origin or 'http://127.0.0.1:' + str(self.port)}
        if obj is None:
            req = Request(url, headers=headers)
        else:
            headers['Content-Type'] = 'application/json'
            req = Request(url, data=json.dumps(obj).encode(), headers=headers)
        with urlopen(req, timeout=4) as response:
            return json.load(response)

    def test_safe_names_and_private_host(self):
        self.assertEqual(bridge.safe_filename('model.gcode'), 'model.gcode')
        self.assertEqual(bridge.safe_filename('Pieza ágil.gcode'), 'Pieza agil.gcode')
        with self.assertRaises(ValueError):
            bridge.safe_filename('../evil.gx')
        with self.assertRaises(ValueError):
            bridge.safe_filename('evil.exe')
        self.assertTrue(bridge.private_ip('192.168.1.5'))
        self.assertFalse(bridge.private_ip('8.8.8.8'))
        self.assertFalse(bridge.private_ip('127.0.0.1'))

    def test_session_endpoint_and_reject_cross_origin(self):
        self.assertIn('notifying', self.request('/api/printer/session'))
        with self.assertRaises(HTTPError) as ctx:
            self.request('/api/printer/actions', {'action': 'pause'}, 'https://untrusted.example')
        self.assertEqual(ctx.exception.code, 403)

    def test_status_and_whitelisted_action(self):
        def cmd(*args, **kwargs):
            if args == ('status', '--json'):
                return '{"machine_status":"READY","bed_current":25}'
            if args == ('pause',):
                return 'ok'
            raise AssertionError('unexpected command ' + repr(args))
        with patch.object(bridge, 'command', side_effect=cmd):
            self.assertEqual(self.request('/api/printer/status')['machine_status'], 'READY')
            self.assertEqual(self.request('/api/printer/actions', {'action': 'pause'}), {'detail': 'ok'})
        with self.assertRaises(HTTPError) as ctx:
            self.request('/api/printer/actions', {'action': 'home'})
        self.assertEqual(ctx.exception.code, 502)

    def test_doctor_returns_failed_checks_as_structured_report(self):
        import subprocess
        report = {'checks': [{'name': 'camera_http', 'ok': False, 'error': 'offline'}]}
        result = subprocess.CompletedProcess([], 1, json.dumps(report), '')
        with patch.object(bridge.subprocess, 'run', return_value=result):
            response = self.request('/api/printer/diagnostics?kind=doctor')
        self.assertEqual(response['output'], report)

    def test_cancel_and_other_commands_do_not_wait_for_video_encoding(self):
        import time
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        def encode(_reason):
            entered.set()
            release.wait(3)
            finished.set()
        try:
            with patch.object(bridge, 'command', return_value='ok'), patch.object(bridge.TIMELAPSES, 'stop', side_effect=encode):
                started = time.monotonic()
                self.assertEqual(self.request('/api/printer/actions', {'action': 'cancel'}), {'detail': 'ok'})
                self.assertLess(time.monotonic() - started, 1)
                self.assertTrue(entered.wait(1))
                self.assertEqual(self.request('/api/printer/actions', {'action': 'pause'}), {'detail': 'ok'})
        finally:
            release.set()
            self.assertTrue(finished.wait(2))

    def test_urgent_controls_bypass_a_slow_transfer_lock(self):
        with patch.object(bridge, 'command', return_value='ok'):
            with bridge.PRINTER_WRITE_LOCK:
                for action in ('pause', 'resume'):
                    self.assertEqual(self.request('/api/printer/actions', {'action': action}), {'detail': 'ok'})

    def test_remote_print_requires_listed_filename(self):
        def cmd(*args, **kwargs):
            if args == ('files', '--json'):
                return '["/data/good.gx"]'
            if args == ('print', '/data/good.gx'):
                return 'started'
            raise AssertionError(args)
        with patch.object(bridge, 'command', side_effect=cmd):
            self.assertEqual(self.request('/api/printer/actions',
                              {'action': 'print', 'file': '/data/good.gx'})['detail'], 'started')
            with self.assertRaises(HTTPError):
                self.request('/api/printer/actions',
                             {'action': 'print', 'file': '/data/other.gx'})

    def test_discovery_and_selection(self):
        with patch.object(bridge, 'command', return_value='[{"name":"AD4","ip":"192.168.1.42","port":8899}]'):
            devices = self.request('/api/printer/discover')
        self.assertEqual(len(devices), 1)
        selection = self.request('/api/printer/selection', {'host': '192.168.1.42'})
        self.assertEqual(selection['host'], '192.168.1.42')
        self.assertIn('--host', bridge.cli_argv('status'))
        with self.assertRaises(HTTPError):
            self.request('/api/printer/selection', {'host': '192.168.1.99'})


    def test_slicer_upload_keeps_model_name_and_reports_real_gx_name(self):
        calls = []

        def fake_cli(*args, **kwargs):
            self.assertEqual(args[0], 'upload')
            temp = Path(args[1])
            calls.append((temp.name, temp.read_bytes()))
            return 'uploaded\nUploaded and listed: 0:/user/01_02_1.23m_Benchy.gx\n'

        url = 'http://127.0.0.1:' + str(self.port) + '/api/printer/jobs?start=false&name=Benchy.gcode'
        headers = {'Origin': 'http://127.0.0.1:' + str(self.port),
                   'Content-Type': 'text/plain; charset=utf-8'}
        with patch.object(bridge, 'command', side_effect=fake_cli):
            request = Request(url, data=b'G28\nG1 X10\n', headers=headers, method='POST')
            with urlopen(request, timeout=4) as response:
                result = json.load(response)
        self.assertEqual(calls, [('Benchy.gcode', b'G28\nG1 X10\n')])
        self.assertEqual(result['remote_name'], '01_02_1.23m_Benchy.gx')
        self.assertEqual(result['remote_path'], '0:/user/01_02_1.23m_Benchy.gx')
        self.assertFalse(result['started'])

    def test_failed_transfer_reports_phase_and_never_repeats_send(self):
        base = 'http://127.0.0.1:' + str(self.port)
        for stage in ('preflight', 'upload_and_verify', 'print_start'):
            with self.subTest(stage=stage):
                error = bridge.PrinterCommandError('missing response', {'stage': stage})
                with patch.object(bridge, 'command', side_effect=error) as command:
                    req = Request(base + '/api/printer/jobs?name=part.gcode&start=true',
                                  data=b'M104 S205\nG1 X1\n', method='POST',
                                  headers={'Origin': base, 'Content-Type': 'text/plain'})
                    with self.assertRaises(HTTPError) as ctx:
                        urlopen(req, timeout=4)
                    result = json.load(ctx.exception)
                self.assertEqual(command.call_count, 1)
                self.assertEqual(result['stage'], stage)
                self.assertEqual(result['retry_safe'], stage == 'preflight')
                self.assertEqual(result['outcome'], 'not_started' if stage == 'preflight' else 'unknown')

    def test_uploaded_gx_filename_is_preserved_and_missing_job_name_rejected(self):
        def fake_cli(*args, **kwargs):
            self.assertEqual(Path(args[1]).name, 'my-part.gx')
            return 'Uploaded and listed: 0:/user/00_33_0.54m_my-part.gx\n'

        base = 'http://127.0.0.1:' + str(self.port)
        headers = {'Origin': base, 'Content-Type': 'application/octet-stream'}
        with patch.object(bridge, 'command', side_effect=fake_cli):
            req = Request(base + '/api/printer/upload?name=my-part.gx',
                          data=valid_test_gx(),
                          headers=headers, method='POST')
            with urlopen(req, timeout=4) as response:
                self.assertEqual(json.load(response)['remote_name'], '00_33_0.54m_my-part.gx')
        req = Request(base + '/api/printer/jobs?start=false', data=b'G28\n',
                      headers={'Origin': base, 'Content-Type': 'text/plain'}, method='POST')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req, timeout=4)
        self.assertEqual(ctx.exception.code, 400)


if __name__ == '__main__':
    unittest.main()
