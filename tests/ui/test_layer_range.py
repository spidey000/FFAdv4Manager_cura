"""Server-only G-code preview uses actual parsed Cura layers, not a synthetic slider."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_real_lower_upper_visibility_and_reference():
    prep=(ROOT/"scripts/prepare_mosaic.py").read_text()
    shell=(ROOT/"overlays/mosaic/public/ad4-v3.js").read_text()
    assert 'globalThis.AD4GCodePreview' in prep
    assert 'mesh.visible=index+1>=a&&index+1<=b' in prep
    assert 'globalThis.AD4GCodePreview' in shell
    assert 'ad4-v3-double-range' in shell
    assert 'type="range" min="1" max="1"' not in shell
    assert 'bound==="lower"' in shell
