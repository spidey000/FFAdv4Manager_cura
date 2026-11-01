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
        # Extra consumers return immediately with an unavailable display sample;
        # they do not sit in a queue waiting for the slow physical read.
        assert not second.result(timeout=.5)['ready_to_print']
        assert not third.result(timeout=.5)['ready_to_print']
        release.set()
        assert first.result(timeout=3)['ready_to_print']
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


def wait_for_sample():
    import time
    deadline = time.monotonic() + 2
    while bridge.STATUS_INFLIGHT and time.monotonic() < deadline:
        time.sleep(.005)
    assert not bridge.STATUS_INFLIGHT


def test_status_burst_returns_without_waiting_and_starts_one_worker(monkeypatch):
    import time
    entered, release = threading.Event(), threading.Event()
    calls = []
    def command(*_a, **_k):
        calls.append(1)
        entered.set()
        assert release.wait(2)
        return '{"machine_status":"READY"}'
    monkeypatch.setattr(bridge, 'command', command)
    try:
        initial = bridge.display_status()
        assert entered.wait(.5)
        started = time.monotonic()
        with ThreadPoolExecutor(max_workers=12) as pool:
            samples = list(pool.map(lambda _: bridge.display_status(), range(60)))
        assert time.monotonic() - started < .5
        assert all(s['refreshing'] and not s['ready_to_print'] for s in samples)
        assert initial['machine_status'] is None
        assert len(calls) == 1
    finally:
        release.set()
        wait_for_sample()
    assert bridge.display_status()['ready_to_print']
    assert len(calls) == 1


def test_invalidating_an_active_sample_does_not_spawn_a_second_or_restore_ready(monkeypatch):
    entered, release = threading.Event(), threading.Event()
    calls = []
    def command(*_a, **_k):
        calls.append(1)
        entered.set()
        assert release.wait(2)
        return '{"machine_status":"READY"}'
    monkeypatch.setattr(bridge, 'command', command)
    try:
        bridge.display_status()
        assert entered.wait(.5)
        bridge.invalidate_status_cache()
        for _ in range(20):
            assert not bridge.display_status()['ready_to_print']
        assert len(calls) == 1
    finally:
        release.set()
        wait_for_sample()
    # The pre-mutation observation cannot repopulate the cache.
    assert not bridge.STATUS_CACHE


def test_negative_samples_back_off_instead_of_retrying_per_http_request(monkeypatch):
    calls = []
    def command(*_a, **_k):
        calls.append(1)
        return '{"machine_status":null,"connection_status":"partial"}'
    monkeypatch.setattr(bridge, 'command', command)
    bridge.display_status()
    wait_for_sample()
    for _ in range(100):
        assert not bridge.display_status()['ready_to_print']
    assert len(calls) == 1


def test_file_reads_share_cache_and_reject_duplicate_work_without_queueing(monkeypatch):
    entered, release = threading.Event(), threading.Event()
    calls = []
    def reader():
        calls.append(1)
        entered.set()
        assert release.wait(2)
        return ['/data/file.gx']
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(bridge.cached_read, 'files', reader)
        assert entered.wait(.5)
        try:
            with pytest.raises(bridge.PrinterReadBusy, match='no request was queued'):
                bridge.cached_read('files', reader)
        finally:
            release.set()
        assert first.result(timeout=1) == ['/data/file.gx']
    assert bridge.cached_read('files', reader) == ['/data/file.gx']
    assert len(calls) == 1
    bridge.cached_read('files', reader, force=True)
    assert len(calls) == 2


def test_stale_ready_is_never_returned_as_available(monkeypatch):
    monkeypatch.setattr(bridge, 'command', lambda *_a, **_k: '{"machine_status":"READY"}')
    assert bridge.cached_status()['ready_to_print']
    key = tuple(bridge.cli_argv())
    with bridge.STATUS_CACHE_LOCK:
        stamp, sample = bridge.STATUS_CACHE[key]
        bridge.STATUS_CACHE[key] = (stamp - 60, sample)
        view = bridge._status_view(key)
    assert view['stale']
    assert not view['ready_to_print']
    assert view['machine_status'] is None


def test_idle_live_preview_does_not_query_position(monkeypatch):
    from unittest.mock import Mock
    read = Mock(return_value={'machine_status': 'READY'})
    monkeypatch.setattr(current_job, '_read', read)
    monkeypatch.setattr(bridge, 'SELECTED', {'host': '192.168.1.42', 'profile': None})
    result = current_job.snapshot(bridge)
    assert result['position'] == {}
    assert not result['active']
    assert [call.args[2:] for call in read.call_args_list] == [('status', '--json')]


def test_status_sampling_keeps_the_request_trace_id(monkeypatch):
    from server.trace_logging import trace_id, bind_trace_id
    seen = []
    def command(*_a, **_k):
        seen.append(trace_id())
        return '{"machine_status":"READY"}'
    monkeypatch.setattr(bridge, 'command', command)
    with bind_trace_id('sampling-trace-12345'):
        bridge.display_status()
    wait_for_sample()
    assert seen == ['sampling-trace-12345']


def test_profile_host_update_invalidates_the_previous_printer_file_listing(monkeypatch):
    monkeypatch.setattr(bridge, 'SELECTED', {'host': None, 'profile': 'AD4'})
    assert bridge.cached_read('files', lambda: ['/data/printer-a.gx']) == ['/data/printer-a.gx']
    completed = subprocess.CompletedProcess([], 0, 'updated', '')
    monkeypatch.setattr(bridge.subprocess, 'run', lambda *_a, **_k: completed)
    bridge.command('profiles', 'update', 'AD4', '--host', '192.168.1.43', selected=False)
    assert bridge.cached_read('files', lambda: ['/data/printer-b.gx']) == ['/data/printer-b.gx']
