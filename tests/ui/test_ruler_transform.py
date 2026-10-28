"""Experimental ruler UI uses pinned, locally shipped MIT SlideRuler and real Mosaic inputs."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_ruler_library_is_local_and_licensed():
    recipe=(ROOT/"scripts/prepare_mosaic.py").read_text()
    lib=(ROOT/"overlays/mosaic/public/ad4-slide-ruler.js").read_text()
    license=(ROOT/"third_party_licenses/slide-ruler-MIT.txt").read_text()
    shell=(ROOT/"overlays/mosaic/public/ad4-v3.js").read_text()
    assert "ad4-slide-ruler.js" in recipe
    assert "SlideRuler" in lib and "SlideRuler" in shell
    assert "MIT License" in license
    assert 'class="ad4-v3-axis-ruler"' in shell
    assert 'class="ad4-v3-axis-slider"' not in shell
def test_snap_rotate_and_proportional_scale():
    shell=(ROOT/"overlays/mosaic/public/ad4-v3.js").read_text()
    assert 'data-offset="-45"' in shell
    assert 'data-offset="45"' in shell
    assert 'Math.round(value/5)*5' in shell
    assert 'value/old' in shell
    assert '--ad4-transform-height' in shell
