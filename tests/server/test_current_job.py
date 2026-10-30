import io
import json
from unittest.mock import Mock
from urllib.parse import urlsplit
import pytest

from server import current_job as jobs, job_tracking as tracking, ad4_bridge as bridge
from server.layer_capture import layer_from_position

GCODE = b'''G90
M82
G1 X0 Y0 Z0.3
G1 X10 Y0 E1
G1 Z1.3
G1 X0 Y10
G1 Z0.5
G1 X10 Y10 E2
G92 E0
G1 Z0.8
G1 X0 Y10 E1
'''


def test_actual_variable_layers_ignore_zhop_and_extrusion_reset():
    parsed = tracking.parse_toolpath(GCODE, 'test.gcode')
    assert [layer['z'] for layer in parsed['layers']] == [.3, .5, .8]
    assert parsed['segment_count'] == 3
    assert parsed['layers'][2]['segments'][-3:] == [0., 10., .8]
    assert layer_from_position({'Z': .5}, .2, [.3, .5, .8]) == 2


def test_relative_flashprint_extrusion_and_xy_arcs():
    code = b'G90\nM83\nG1 X0 Y0 Z.2\nG1 X10 A1\nG3 X0 Y10 I-10 J0 A1\n'
    parsed = tracking.parse_toolpath(code, 'part.g')
    assert parsed['layer_total'] == 1
    assert parsed['segment_count'] > 2
    assert parsed['layers'][0]['segments'][-3:] == [0., 10., .2]


def test_duplicate_markers_at_same_z_are_one_physical_layer():
    parsed = tracking.parse_toolpath(b'M83\nG1 Z.2\n;LAYER:-1\nG1 X10 E1\n;LAYER:0\nG1 Y10 E1\n', 'part.gcode')
    assert parsed['layer_total'] == 1


def test_large_toolpaths_preserve_layer_count_and_disclose_render_sampling(monkeypatch):
    monkeypatch.setattr(tracking, 'MAX_SEGMENTS', 10)
    code = 'M83\nG1 Z.2\n' + ''.join(f'G1 X{i} E1\n' for i in range(1, 40))
    parsed = tracking.parse_toolpath(code.encode(), 'part.gcode')
    assert parsed['simplified'] is True
    assert parsed['segment_count'] == 39
    assert parsed['rendered_segment_count'] <= 10
    assert parsed['layer_total'] == 1


def test_layer_tracker_requires_separated_stable_observations_and_resets_job(monkeypatch):
    now = [1.]
    monkeypatch.setattr(tracking.time, 'monotonic', lambda: now[0])
    tracker = tracking.LayerTracker()
    layers = [{'z': .3}, {'z': .5}, {'z': .8}]
    assert tracker.update('a', layers, {'Z': .5}) is None
    assert tracker.update('a', layers, {'Z': .5}) is None
    now[0] += 1
    assert tracker.update('a', layers, {'Z': .5}) == 2
    now[0] += 1
    assert tracker.update('a', layers, {'Z': 50}) == 2  # Parked head isn't layer 3.
    assert tracker.update('b', layers, {'Z': .3}) is None
    assert tracker.update('b', layers, {'Z': .3}, active=False) is None


def test_same_filename_restarted_job_resets_on_progress_drop(monkeypatch):
    now = [1.]
    monkeypatch.setattr(tracking.time, 'monotonic', lambda: now[0])
    tracker = tracking.LayerTracker()
    layers = [{'z': .3}, {'z': .5}]
    tracker.update('same-file', layers, {'Z': .5}, progress=98)
    now[0] += 1
    assert tracker.update('same-file', layers, {'Z': .5}, progress=98) == 2
    now[0] += 1
    assert tracker.update('same-file', layers, {'Z': .3}, progress=1) is None
    now[0] += 1
    assert tracker.update('same-file', layers, {'Z': .3}, progress=1) == 1


@pytest.fixture
def setup_job(monkeypatch, tmp_path):
    monkeypatch.setattr(bridge, 'DATA_DIR', tmp_path)
    monkeypatch.setattr(bridge, 'SELECTED', {'host': '192.168.1.42', 'profile': None})
    monkeypatch.setenv('FFADV4MANAGER_CONFIG', str(tmp_path / 'config.ini'))
    monkeypatch.delenv('AD4_JOB_DOWNLOAD_ARGV', raising=False)
    monkeypatch.setattr(jobs, 'TRACKERS', {})
    # Use an OrderedDict because production bounds tracker retention by recency.
    from collections import OrderedDict
    monkeypatch.setattr(jobs, 'TRACKERS', OrderedDict())
    status = {'current_file': '/data/test.gx', 'machine_status': 'BUILDING_FROM_SD'}
    def read(_bridge, argv, *args):
        return status if args[0] == 'status' else {'X': 5., 'Y': 0., 'Z': .3}
    monkeypatch.setattr(jobs, '_read', read)
    return status


def test_archived_copy_is_scoped_and_never_claims_remote_download(setup_job, monkeypatch):
    scope, _ = jobs.connection(bridge)
    jobs.remember(bridge, scope, '/data/test.gx', GCODE, 'original.gcode')
    state = jobs.snapshot(bridge)
    assert state['geometry_available'] is True
    assert state['source']['kind'] == 'server_upload'
    assert state['source']['remote_verified'] is False
    assert state['layer_total'] == 3
    monkeypatch.setattr(bridge, 'SELECTED', {'host': '192.168.1.43', 'profile': None})
    assert jobs.snapshot(bridge)['source'] is None


def test_download_without_transport_explicitly_returns_501(setup_job):
    handler = Mock()
    handler.data.return_value = {'current_file': '/data/test.gx'}
    jobs.post(handler, '/api/printer/current-job/fetch', urlsplit('/'), bridge)
    assert handler.json.call_args.args[0] == 501


def test_current_job_change_rejects_association(setup_job, monkeypatch):
    handler = Mock()
    handler.headers = {'Content-Length': str(len(GCODE)), 'Content-Type': 'application/octet-stream'}
    handler.rfile = io.BytesIO(GCODE)
    monkeypatch.setattr(jobs, '_read', Mock(side_effect=[setup_job, {'Z': .3}, {'current_file': 'another.gx'}]))
    with pytest.raises(ValueError, match='changed jobs'):
        jobs.post(handler, '/api/printer/current-job/associate',
                  urlsplit('/?current_file=/data/test.gx&name=original.gcode'), bridge)
    assert not jobs._index(bridge)


def test_user_association_provenance_and_stale_geometry_tokens(setup_job):
    handler = Mock()
    handler.headers = {'Content-Length': str(len(GCODE)), 'Content-Type': 'application/octet-stream'}
    handler.rfile = io.BytesIO(GCODE)
    jobs.post(handler, '/api/printer/current-job/associate',
              urlsplit('/?current_file=/data/test.gx&name=original.gcode'), bridge)
    state = jobs.snapshot(bridge)
    assert state['source']['kind'] == 'user_association'
    assert not state['source']['remote_verified']
    jobs.get(handler, '/api/printer/current-job/toolpath', urlsplit('/?token=stale'), bridge)
    assert handler.json.call_args.args[0] == 409


def test_configured_downloader_uses_argv_and_checks_job_after_download(setup_job, monkeypatch):
    from pathlib import Path
    import subprocess
    monkeypatch.setenv('AD4_JOB_DOWNLOAD_ARGV', json.dumps(['reader', '{host}', '{remote_file}', '{output}']))
    def download(argv, **kwargs):
        assert argv[1:3] == ['192.168.1.42', '/data/test.gx']
        from ffadv4manager.core.gx_converter.gx_writer import encode_gx
        from ffadv4manager.core.gx_converter.metadata import PrintMetadata
        from ffadv4manager.core.gx_converter.thumbnail import extract_thumbnail_bmp
        Path(argv[-1]).write_bytes(encode_gx(PrintMetadata(), extract_thumbnail_bmp([]), GCODE.decode()))
        return subprocess.CompletedProcess(argv, 0)
    monkeypatch.setattr(jobs.subprocess, 'run', download)
    handler = Mock()
    handler.data.return_value = {'current_file': '/data/test.gx'}
    jobs.post(handler, '/api/printer/current-job/fetch', urlsplit('/'), bridge)
    source = handler.json.call_args.args[1]['source']
    assert source['kind'] == 'printer_download'
    assert source['remote_verified'] is True
