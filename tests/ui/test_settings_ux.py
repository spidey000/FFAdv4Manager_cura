"""Regression tests: no duplicate Cura profile picker, collapsed accordions and compact controls."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_no_duplicate_profiles_or_catalog_button():
    js=(ROOT/"overlays/mosaic/src/gui/ad4-settings.mjs").read_text()
    css=(ROOT/"overlays/mosaic/public/ad4-settings.css").read_text()
    assert "All Cura settings" not in js
    assert "All Cura categories" in js
    assert "legacy.hidden=true" in js
    assert "#profile-selector-div{display:none!important}" in css
def test_group_and_controls():
    js=(ROOT/"overlays/mosaic/src/gui/ad4-settings.mjs").read_text()
    css=(ROOT/"overlays/mosaic/public/ad4-settings.css").read_text()
    assert 'section.dataset.closed="true"' in js
    assert "ad4:enter-settings" in js
    assert 'input.setAttribute("role","switch")' in js
    assert "width:76px!important" in css
