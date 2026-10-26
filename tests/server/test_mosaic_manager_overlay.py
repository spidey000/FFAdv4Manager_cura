"""Contract tests for regenerated Mosaic-only printer manager overlay."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def test_manager_markup_and_event_bindings():
    preparer=(ROOT/"scripts/prepare_mosaic.py").read_text()
    manager=(ROOT/"overlays/mosaic/public/ad4-manager.js").read_text()
    styles=(ROOT/"overlays/mosaic/public/ad4.css").read_text()
    ids=["ad4-file-list","ad4-file-sort","ad4-auto-timelapse","ad4-capture-mode",
         "ad4-gallery","ad4-timelapse-preview","ad4-live-toggle","ad4-connection-profiles"]
    for id in ids:
        assert 'id="'+id+'"' in preparer
        assert '"'+id+'"' in manager
    assert 'ad4-manager.js' in preparer
    assert '"./api/printer"' in manager
    assert 'globalThis.app?.gui?.slicer?.exported_gcode' in manager
    assert 'timelapse_mode' in manager
    assert 'window.location' not in manager
    assert '#ad4-manager' in styles

def test_server_has_all_manager_endpoints():
    bridge=(ROOT/"server/ad4_bridge.py").read_text()
    for route in ('/api/printer/timelapses','/api/printer/camera/live',
                  '/api/printer/timelapse','/api/printer/profiles'):
        assert route in bridge
