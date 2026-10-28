"""Real camera view controls and scoped mode gestures."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_camera_shortcuts_use_real_threejs_renderer():
    builder=(ROOT/"scripts/prepare_mosaic.py").read_text()
    shell=(ROOT/"overlays/mosaic/public/ad4-v3.js").read_text()
    assert 'export * as renderer from' in builder
    for control in ('ad4-v3-view-fit','ad4-v3-view-top','ad4-v3-view-iso'):
        assert control in shell
    assert 'orbit.target.set' in shell
    assert 'camera.lookAt' in shell
def test_swipe_only_segmented_transform_mode():
    shell=(ROOT/"overlays/mosaic/public/ad4-v3.js").read_text()
    assert 'modeBar?.addEventListener("pointerdown"' in shell
    assert 'transformModes.indexOf(mode)' in shell
