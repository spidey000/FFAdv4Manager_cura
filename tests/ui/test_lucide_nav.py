from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_lucide_pack_and_navigation():
    prep=(ROOT/"scripts/prepare_mosaic.py").read_text()
    src=(ROOT/"overlays/mosaic/public/ad4-v3.js").read_text()
    pack=(ROOT/"overlays/mosaic/src/gui/ad4-icon-pack.mjs").read_text()
    assert '["lucide"]="1.62.0"' in prep
    assert 'from "lucide"' in pack
    assert 'const icon = name =>' not in src
    assert 'toolBtn("orient","Orient"' not in src
    assert 'ad4-v3-nav-move' in src
