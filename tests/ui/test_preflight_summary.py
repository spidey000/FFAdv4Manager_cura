"""Print preflight and local profile summary must remain functional without Cura backend."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_summary_save_reset_and_stale_gcode():
    code=(ROOT/"overlays/mosaic/src/gui/ad4-settings.mjs").read_text()
    assert "ad4-presets-panel" in code
    assert "ad4-settings-footer" in code
    assert 'choose(type,"")' in code
    assert 'new Event("ad4:gcode-stale")' in code
def test_preflight_shows_only_known_values():
    manager=(ROOT/"overlays/mosaic/public/ad4-manager.js").read_text()
    assert 'async function confirmPrint' in manager
    assert '"Thumbnail","Unavailable"' in manager
    assert 'G-code is stale: re-slice' in manager
    assert 'if(!allowed)return' in manager
