import json
import struct
from unittest.mock import patch
from pathlib import Path
from server.mosaic_slicer import (
    START, MACHINE, PLA, SlicingError, check_settings, is_valid_stl, parse_frame,
)


def dummy_stl():
    header = b"Server test".ljust(80, b" ")
    return header + struct.pack("<I", 1) + b"\0" * 50


def test_frame_extracts_valid_stl_and_locks_printer():
    settings = {
        "global": {"machine_width": 999, "machine_start_gcode": "M112", "layer_height": 0.2},
        "extruder.0": {"material_diameter": 3},
        "/tmp/input/model.stl": {"extruder_nr": "0"},
    }
    body = json.dumps(settings).encode()
    stl, values = parse_frame(len(body).to_bytes(4, "big") + body + dummy_stl())
    assert stl == dummy_stl()
    assert values["global"]["machine_width"] == 220
    assert values["global"]["machine_start_gcode"] == START
    assert values["extruder.0"]["material_diameter"] == 1.75
    assert values["global"]["material_bed_temperature"] == 55


def test_refuses_other_printers_and_overheated_materials():
    data = {"global": {}, "extruder.0": {}, "/tmp/input/model.stl": {}}
    import pytest
    with pytest.raises(SlicingError):
        check_settings({**data, "extruder.1": {}})
    with pytest.raises(SlicingError):
        check_settings({**data, "global": {"speed_print": 900}})


def test_only_valid_stl_binary_and_ascii():
    assert is_valid_stl(dummy_stl())
    assert not is_valid_stl(b"not a model")
