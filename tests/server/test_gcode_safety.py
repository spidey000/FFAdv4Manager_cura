import struct
import pytest

from server.gcode_safety import require_safe_artillery_heating as check


def test_gcode_allows_conservative_temperature():
    check(b"; nozzle_temperature: 205\nM140 S55\nM104 S210\nM109 T0 S205\nM190 R55\n", "part.gcode")


@pytest.mark.parametrize("job", [
    b"M104 S240\n", b"M109 S240\n", b"M140 S105\n", b"M190 R105\n",
    b"; nozzle_temperature = 240\nG1 X1\n",
    b"; bed_temperature: 105\nG1 X1\n",
])
def test_blocks_unsafe_commands_and_metadata(job):
    with pytest.raises(ValueError, match="Artillery PLA"):
        check(job, "part.gcode")


def test_comments_not_interpreted_as_commands():
    check(b"; M104 S240\nM104 S205\n; M190 S105\nM190 S55\n", "part.gco")


def test_gx_requires_valid_metadata_and_safe_temperatures():
    from ffadv4manager.core.gx_converter.gx_writer import encode_gx
    from ffadv4manager.core.gx_converter.metadata import PrintMetadata
    from ffadv4manager.core.gx_converter.thumbnail import extract_thumbnail_bmp
    def gx(nozzle, bed, body="G1 X1\n"):
        return encode_gx(PrintMetadata(nozzle_right=nozzle, bed_temp=bed),
                         extract_thumbnail_bmp([]), body)
    check(gx(205, 55), "part.gx")
    for payload in (gx(240, 55), gx(205, 105), b"xgcode 1.0\n\0"):
        with pytest.raises(ValueError):
            check(payload, "part.gx")


def test_gx_checks_executable_body_and_offsets():
    from ffadv4manager.core.gx_converter.gx_writer import encode_gx
    from ffadv4manager.core.gx_converter.metadata import PrintMetadata
    from ffadv4manager.core.gx_converter.thumbnail import extract_thumbnail_bmp
    payload = encode_gx(PrintMetadata(nozzle_right=205, bed_temp=55),
                        extract_thumbnail_bmp([]), "M104S240\nM140 S105\n")
    with pytest.raises(ValueError, match="Artillery PLA"):
        check(payload, "part.gx")
    broken = bytearray(payload)
    struct.pack_into('<I', broken, 20, 0)
    with pytest.raises(ValueError, match="offsets"):
        check(bytes(broken), "part.gx")


@pytest.mark.parametrize("body", [b"M104S240", b"N12M190R105", b"M104 (comment) S240"])
def test_compact_heater_commands_are_checked(body):
    with pytest.raises(ValueError, match="Artillery PLA"):
        check(body, "part.gcode")
