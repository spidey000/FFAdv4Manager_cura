from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def test_mosaic_upstream_replaces_old_browser_slicer():
    generated=ROOT/"frontend"
    assert (generated/"src/gui/slicer.mjs").is_file()
    assert not (generated/"src/main.jsx").exists()
    code=(generated/"src/gui/slicer.mjs").read_text()
    assert 'fetch("./api/slice"' in code
    assert 'CuraEngine' not in (generated/"src/engine/index.mjs").read_text()
    assert "curaengine_worker" not in (generated/"webpack.config.js").read_text()
    assert "ad4-manager.js" in (generated/"public/index.html").read_text()
    assert "flashforge_adventurer4" in (generated/"src/settings/index.mjs").read_text()
