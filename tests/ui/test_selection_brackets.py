"""Decorative selection brackets must use actual focused mesh and camera."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_projected_selected_mesh_brackets():
    shell=(ROOT/"overlays/mosaic/public/ad4-v3.js").read_text()
    css=(ROOT/"overlays/mosaic/public/ad4-v3.css").read_text()
    for term in ('mv?.focused','selection.localToWorld(p)','p.project(camera)','frame.hidden=true'):
        assert term in shell
    assert 'pointer-events:none' in css
    assert 'ad4-v3-selection-brackets' in shell and 'ad4-v3-selection-brackets' in css
