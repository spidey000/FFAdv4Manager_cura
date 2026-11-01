"""Exercise actual thread/process exclusion without touching a physical printer."""
from concurrent.futures import ThreadPoolExecutor
import multiprocessing
import socket
import threading

import pytest

from ffadv4manager import cli
from ffadv4manager.core.client import FlashForgeClient
from ffadv4manager.core.control import ControlBusy, control_session
from ffadv4manager.core.models import PrinterStatus


def _process_lock(host, started, acquired):
    started.set()
    with control_session(host, 8899, timeout=3):
        acquired.set()


def test_processes_share_reentrant_lock_and_release_after_error():
    ctx = multiprocessing.get_context('spawn')
    started, acquired = ctx.Event(), ctx.Event()
    host = 'process-lock-test'
    child = ctx.Process(target=_process_lock, args=(host, started, acquired))
    try:
        with pytest.raises(ValueError):
            with control_session(host, 8899):
                with control_session(host, 8899):
                    child.start()
                    assert started.wait(3)
                    assert not acquired.wait(.1)
                    raise ValueError('release nested locks')
        assert acquired.wait(3)
    finally:
        child.join(4)
        if child.is_alive():
            child.terminate()
            child.join(2)
    assert child.exitcode == 0


def test_busy_is_bounded_and_different_printers_are_independent():
    with ThreadPoolExecutor(max_workers=1) as pool:
        with control_session('printer-a', 8899):
            def contender():
                with control_session('printer-b', 8899, timeout=.05):
                    pass
                with control_session('printer-a', 8899, timeout=.05):
                    pytest.fail('must not acquire another thread lock')
            with pytest.raises(ControlBusy, match='no command sent'):
                pool.submit(contender).result(timeout=1)


def test_status_transaction_cannot_interleave_position_queries(monkeypatch):
    entered, release = threading.Event(), threading.Event()
    commands = []

    class Sock:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def settimeout(self, _): pass
        def sendall(self, data):
            self.code = data.decode().strip('~\r\n')
            commands.append(self.code)
        def recv(self, _):
            if self.code == 'M119':
                entered.set()
                assert release.wait(2)
                return b'MachineStatus: READY\nok\n'
            return {'M105': b'T0:25/0 B:25/0\nok\n', 'M27': b'SD printing byte 0/100\nok\n',
                    'M114': b'X:1 Z:.2\nok\n'}[self.code]

    monkeypatch.setattr(socket, 'create_connection', lambda *_a, **_k: Sock())
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(FlashForgeClient('serialized').status)
        assert entered.wait(1)
        second = pool.submit(FlashForgeClient('serialized').position)
        try:
            assert not second.done()
        finally:
            release.set()
        assert first.result(timeout=3).ready_to_print
        assert second.result(timeout=3)['X'] == 1
    assert commands == ['M119', 'M105', 'M27', 'M114']


def test_m27_only_is_partial_never_ready(monkeypatch):
    client = FlashForgeClient('printer')
    responses = iter(['', '', 'SD printing byte 98/100\nok\n'])
    monkeypatch.setattr(client, 'command', lambda *_a, **_k: next(responses))
    status = client.status()
    assert status.machine_status is None
    assert status.connection_status == 'partial'
    assert not status.status_available
    assert not status.ready_to_print
    assert set(status.status_errors) == {'M119', 'M105'}
    assert status.progress_percent == 98


def test_query_failure_preserves_other_responses(monkeypatch):
    client = FlashForgeClient('printer')
    def command(code, **_):
        if code == 'M119': raise ConnectionResetError('reset')
        if code == 'M105': return 'T0:25/0 B:24/0\nok\n'
        return 'ok\n'
    monkeypatch.setattr(client, 'command', command)
    status = client.status()
    assert status.connection_status == 'partial'
    assert status.bed_current == 24
    assert status.status_errors['M119'] == 'reset'


@pytest.mark.parametrize('action', ['print', 'upload'])
@pytest.mark.parametrize('machine', [None, 'UNKNOWN', 'ERROR', 'HEATING', 'OFFLINE'])
def test_cli_blocks_unknown_or_nonidle_state_even_without_active_job(monkeypatch, tmp_path, capsys, action, machine):
    from unittest.mock import Mock
    client = Mock()
    client.status.return_value = PrinterStatus(raw='', machine_status=machine)
    monkeypatch.setattr(cli, 'FlashForgeClient', lambda *_a, **_k: client)
    monkeypatch.setenv('FFADV4MANAGER_CONFIG', str(tmp_path / 'config.ini'))
    assert cli.main(['--host', 'printer', action, 'part.gx']) == 1
    client.upload_and_confirm_listed.assert_not_called()
    client.print_file.assert_not_called()
    assert 'AD4_TRANSACTION_ERROR {"stage": "preflight"}' in capsys.readouterr().err


def test_upload_and_start_hold_one_session_across_all_phases(monkeypatch, tmp_path):
    from unittest.mock import Mock
    client = Mock()
    client.status.return_value = PrinterStatus(raw='', machine_status='READY')
    path = tmp_path / 'part.gcode'
    path.write_text('G1 X1\n')
    monkeypatch.setenv('FFADV4MANAGER_CONFIG', str(tmp_path / 'config.ini'))
    monkeypatch.setattr(cli, 'FlashForgeClient', lambda *_a, **_k: client)
    probes = []
    def probe(*_a, **_k):
        def contender():
            with control_session('printer', 8899, timeout=.01):
                return 'interleaved'
        with ThreadPoolExecutor(max_workers=1) as pool:
            with pytest.raises(ControlBusy):
                pool.submit(contender).result(timeout=1)
        probes.append(True)
        return '0:/user/part.gcode'
    client.upload_and_confirm_listed.side_effect = probe
    client.print_file.side_effect = probe
    assert cli.main(['--host', 'printer', 'upload', str(path), '--no-convert', '--start']) == 0
    assert len(probes) == 2
