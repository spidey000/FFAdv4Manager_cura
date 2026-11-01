from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import threading

import pytest
from server import ad4_bridge as bridge, current_job


@pytest.fixture(autouse=True)
def clean_cache(monkeypatch, tmp_path):
    bridge.invalidate_status_cache()
    monkeypatch.setattr(bridge, 'DATA_DIR', tmp_path)
    yield
    bridge.invalidate_status_cache()


def test_concurrent_status_consumers_share_a_single_query(monkeypatch):
    entered, release = threading.Event(), threading.Event()
    calls = []
    def command(*_a, **_k):
        calls.append(1)
        entered.set()
        assert release.wait(2)
        return '{"machine_status":"READY"}'
    monkeypatch.setattr(bridge, 'command', command)
    monkeypatch.setattr(current_job, '_read', lambda *_a: {})
    with ThreadPoolExecutor(max_workers=3) as pool:
        first = pool.submit(bridge.cached_status)
        assert entered.wait(1)
        second = pool.submit(bridge.selected_status_reader(bridge.cli_argv()))
        third = pool.submit(lambda: current_job.snapshot(bridge)['status'])
        release.set()
        assert all(f.result(timeout=3)['ready_to_print'] for f in (first, second, third))
    assert len(calls) == 1


def test_failure_never_reuses_cached_ready_and_is_not_called_disconnected(monkeypatch):
    monkeypatch.setattr(bridge, 'command', lambda *_a, **_k: '{"machine_status":"READY"}')
    assert bridge.cached_status()['ready_to_print']
    bridge.invalidate_status_cache()
    def fail(*_a, **_k): raise RuntimeError('Printer control busy')
    monkeypatch.setattr(bridge, 'command', fail)
    state = bridge.cached_status()
    assert state['machine_status'] is None
    assert state['connection_status'] == 'unavailable'
    assert state['ready_to_print'] is False
    assert 'busy' in state['status_errors']['query']


def test_cache_scope_is_pinned_to_selection(monkeypatch):
    seen = []
    def command(*_a, **kw):
        seen.append(kw['_argv'])
        return '{"machine_status":"IDLE"}'
    monkeypatch.setattr(bridge, 'command', command)
    assert bridge.cached_status(['cli', '--host', 'one'])['ready_to_print']
    assert bridge.cached_status(['cli', '--host', 'two'])['ready_to_print']
    assert len(seen) == 2


def test_cli_failure_retains_transaction_phase_in_server_error(monkeypatch):
    failed = subprocess.CompletedProcess([], 1, 'M29: ok\n',
        'AD4_TRANSACTION_ERROR {"stage":"print_start"}\nError: missing M24 ACK\n')
    monkeypatch.setattr(bridge.subprocess, 'run', lambda *_a, **_k: failed)
    with pytest.raises(bridge.PrinterCommandError) as exc:
        bridge.command('upload', 'part.gcode', '--start')
    assert exc.value.transaction['stage'] == 'print_start'


def test_partial_status_is_honest_and_preserves_metrics(monkeypatch):
    partial = {'machine_status': None, 'connection_status': 'partial', 'progress_percent': 98}
    monkeypatch.setattr(bridge, 'command', lambda *_a, **_k: json.dumps(partial))
    state = bridge.cached_status()
    assert state['connection_status'] == 'partial'
    assert state['progress_percent'] == 98
    assert not state['ready_to_print']
