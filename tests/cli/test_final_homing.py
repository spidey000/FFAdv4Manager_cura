"""Final homing is enforced on printable text and GX without touching metadata."""
import pytest

from ffadv4manager.core.job_file import ensure_final_xy_homing, executable_gcode
from ffadv4manager.core.gx_converter.gx_writer import encode_gx
from ffadv4manager.core.gx_converter.metadata import PrintMetadata
from ffadv4manager.core.gx_converter.thumbnail import extract_thumbnail_bmp
from ffadv4manager.core.gcode_to_gx import upload_file


def test_final_movement_is_xy_home_before_motor_shutdown():
    code = b"G28\nG1 X10 Y10 E1\nM104 S0\nG91\nM18\n"
    out = ensure_final_xy_homing(code, "part.gcode")
    assert out.startswith(code[:code.index(b"M104")])
    assert out.endswith(b"G91\n; AD4 final movement: home X/Y\nG162 Z F1800\nG28 X Y\nM18\n")
    assert out.count(b"G28 X Y") == 1
    assert ensure_final_xy_homing(out, "part.gcode") == out


@pytest.mark.parametrize("code", [
    b"G1 Z10\nG162 Z F1800\nG28 X Y\nM132 X Y A B\nM652\nG91\nM18",
    b"G1 X1\nG28\nM18\n",
    b"G1 X1\nN10 G28X0Y0\nM84\n",
])
def test_existing_final_xy_home_is_not_duplicated(code):
    assert ensure_final_xy_homing(code, "part.gcode") == code


def test_partial_home_and_post_home_motion_trigger_new_final_home():
    first = ensure_final_xy_homing(b"G28 X\nM84\n", "part.gco")
    assert first.index(b"G28 X Y") < first.index(b"M84")
    second = ensure_final_xy_homing(b"G28 X Y\nG1 E-1\nM18\n", "part.g")
    assert second.endswith(b"G162 Z F1800\nG28 X Y\nM18\n")


def test_insert_before_end_program_and_keep_crlf():
    out = ensure_final_xy_homing(b"G1 X1\r\nM2\r\n", "part.gcode")
    assert out.endswith(b"G162 Z F1800\r\nG28 X Y\r\nM2\r\n")
    assert b"\nG28 X Y\r\n" in out


def test_source_without_final_newline_still_has_separate_homing():
    out = ensure_final_xy_homing(b"G1 X12", "part.gcode")
    assert out.startswith(b"G1 X12\n; AD4")
    assert out.endswith(b"G162 Z F1800\nG28 X Y\n")


def test_gx_maintains_header_thumbnail_and_only_changes_executable_gcode():
    original = encode_gx(PrintMetadata(nozzle_right=205, bed_temp=55),
                         extract_thumbnail_bmp([]),
                         "G1 X15\nM104 S0\nM18\n")
    body = executable_gcode(original, "part.gx")
    changed = ensure_final_xy_homing(original, "part.gx")
    assert changed[:len(original) - len(body)] == original[:len(original) - len(body)]
    assert executable_gcode(changed, "part.gx").endswith(
        b"G162 Z F1800\nG28 X Y\nM18\n")
    assert ensure_final_xy_homing(changed, "part.gx") == changed


def test_cli_prepares_temporary_gcode_even_when_no_convert(tmp_path):
    original = tmp_path / "part.gcode"
    original.write_bytes(b"G1 X10\nM18\n")
    with upload_file(original, no_convert=True) as (prepared, remote):
        assert prepared != original
        assert remote is None
        assert prepared.read_bytes().endswith(b"G28 X Y\nM18\n")
    assert original.read_bytes() == b"G1 X10\nM18\n"


def test_cli_prepares_gx_without_touching_the_source(tmp_path):
    file = tmp_path / "part.gx"
    payload = encode_gx(PrintMetadata(nozzle_right=205, bed_temp=55),
                        extract_thumbnail_bmp([]), "G1 X1\nM18\n")
    file.write_bytes(payload)
    with upload_file(file) as (prepared, remote):
        assert prepared != file
        assert remote is None
        assert executable_gcode(prepared.read_bytes(), "part.gx").endswith(
            b"G162 Z F1800\nG28 X Y\nM18\n")
    assert file.read_bytes() == payload


def test_reject_invalid_or_empty_payloads():
    with pytest.raises(ValueError):
        ensure_final_xy_homing(b"", "empty.gcode")
    with pytest.raises(ValueError):
        ensure_final_xy_homing(b"G1 X1\n", "bad.bin")
    with pytest.raises(ValueError):
        ensure_final_xy_homing(b"xgcode 1.0\n\0", "bad.gx")
