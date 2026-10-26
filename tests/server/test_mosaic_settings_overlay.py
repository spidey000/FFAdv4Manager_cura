"""Mosaic native settings overlay smoke contracts and server safe limits."""
from pathlib import Path
import pytest
from server.mosaic_slicer import check_settings,SlicingError,LIMITS

ROOT=Path(__file__).resolve().parents[2]
def test_overlay_is_native_mosaic_and_built_from_sources():
    recipe=(ROOT/"scripts/prepare_mosaic.py").read_text()
    code=(ROOT/"overlays/mosaic/src/gui/ad4-settings.mjs").read_text()
    for term in ("ad4-settings.css","ad4-settings.mjs","ad4-presets.mjs"):
        assert term in recipe
    for term in ("ad4-categories","ad4-complexity","ad4-setting-help",
                 "ad4-presets-panel","ad4-auto-slice","ad4-setting-reset"):
        assert term in code
    assert 'from "../settings/index.mjs"' in code
    assert 'from "./slicer.mjs"' in code
    assert "CuraEngine.wasm" not in code

def test_server_material_limits_match_gx_upload_guard():
    for key in ("material_print_temperature","material_print_temperature_layer_0"):
        assert LIMITS[key][1]==220
    for key in ("material_bed_temperature","material_bed_temperature_layer_0"):
        assert LIMITS[key][1]==65
    base={"global":{},"extruder.0":{},"/tmp/input/model.stl":{}}
    for group in ("global","extruder.0"):
        for key,value in (("material_print_temperature",240),("material_bed_temperature",105)):
            payload={k:dict(v) for k,v in base.items()}
            payload[group][key]=value
            with pytest.raises(SlicingError):
                check_settings(payload)
