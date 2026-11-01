"""Printer time estimates use stored uploads and existing status, never new TCP calls."""
import json

import pytest

from server import ad4_bridge as bridge, current_job


@pytest.fixture(autouse=True)
def isolated_metadata(monkeypatch, tmp_path):
    bridge.invalidate_status_cache()
    monkeypatch.setattr(bridge, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(bridge, 'FILE_METADATA_PATH', tmp_path / 'uploaded-files.json')
    monkeypatch.setattr(bridge, 'SELECTED', {'host': '192.168.1.42', 'profile': None})
    monkeypatch.setattr(bridge, 'HOST', None)
    yield
    bridge.invalidate_status_cache()


def status(**kwargs):
    result = {'machine_status': 'BUILDING_FROM_SD', 'status_available': True,
            'stale': False, 'current_file': '/data/part.gx', 'progress_percent': 24,
            'sd_current': 240, 'sd_total': 1000}
    result.update(kwargs)
    return result


def remember(duration=2674, **fields):
    bridge.save_upload_metadata('part.gx', {'estimated_seconds': duration, **fields})


def test_estimated_elapsed_remaining_and_edge_percentages():
    remember()
    result = bridge.with_estimated_print_times(status())
    assert result['elapsed_seconds_estimate'] == pytest.approx(641.76)
    assert result['remaining_seconds_estimate'] == pytest.approx(2032.24)
    zero = bridge.with_estimated_print_times(status(progress_percent=0, sd_current=0))
    assert zero['elapsed_seconds_estimate'] == 0
    assert zero['remaining_seconds_estimate'] == 2674
    full = bridge.with_estimated_print_times(status(progress_percent=100, sd_current=1000))
    assert full['elapsed_seconds_estimate'] == 2674
    assert full['remaining_seconds_estimate'] == 0


def test_paused_keeps_approximation_while_progress_does_not_change():
    remember()
    paused = status(machine_status='PAUSED')
    assert bridge.with_estimated_print_times(paused) == bridge.with_estimated_print_times(paused)


@pytest.mark.parametrize('change', [
    {'machine_status': 'READY'},
    {'machine_status': 'HEATING'},
    {'machine_status': 'OFFLINE', 'status_available': False},
    {'stale': True},
    {'status_available': False},
    {'current_file': '/data/different.gx'},
    {'current_file': None},
    {'progress_percent': None},
    {'progress_percent': float('nan')},
    {'progress_percent': -1},
    {'progress_percent': 101},
    {'sd_current': -1, 'progress_percent': 0},
    {'sd_current': 1001, 'progress_percent': 100},
    {'sd_total': 0},
    {'sd_current': 600},
])
def test_invalid_or_unmatched_status_never_gets_estimates(change):
    remember()
    state = status()
    state.update(change)
    result = bridge.with_estimated_print_times(state)
    assert 'elapsed_seconds_estimate' not in result
    assert 'remaining_seconds_estimate' not in result


def test_missing_or_malformed_metadata_is_ignored():
    assert 'elapsed_seconds_estimate' not in bridge.with_estimated_print_times(status())
    remember(duration=None)
    assert 'elapsed_seconds_estimate' not in bridge.with_estimated_print_times(status())
    remember(duration=float('inf'))
    assert 'elapsed_seconds_estimate' not in bridge.with_estimated_print_times(status())
    bridge.FILE_METADATA_PATH.write_text('{"host:192.168.1.42":{"part.gx":[]}}')
    assert 'elapsed_seconds_estimate' not in bridge.with_estimated_print_times(status())


def test_other_printer_scope_and_mismatched_gx_size_cannot_leak_estimates():
    remember(remote_size_bytes=1000)
    assert bridge.with_estimated_print_times(status())['remaining_seconds_estimate'] > 0
    assert 'remaining_seconds_estimate' not in bridge.with_estimated_print_times(status(sd_total=900, sd_current=216))
    bridge.SELECTED['host'] = '192.168.1.43'
    assert 'remaining_seconds_estimate' not in bridge.with_estimated_print_times(status())


def test_status_api_enriches_cached_sample_without_extra_printer_requests(monkeypatch):
    remember()
    calls = []
    def fake_command(*args, **_kwargs):
        calls.append(args)
        return json.dumps(status())
    monkeypatch.setattr(bridge, 'command', fake_command)
    bridge.cached_status()  # One existing hardware observation.
    result = bridge.display_status()
    assert result['remaining_seconds_estimate'] == pytest.approx(2032.24)
    assert calls == [('status', '--json')]


def test_current_job_uses_same_cache_and_has_estimates(monkeypatch):
    remember()
    calls = []
    def fake_read(_bridge, _argv, *args):
        calls.append(args)
        return status()
    monkeypatch.setattr(current_job, '_read', fake_read)
    result = current_job.snapshot(bridge, include_position=False)
    assert result['status']['elapsed_seconds_estimate'] == pytest.approx(641.76)
    assert calls == [('status', '--json')]
