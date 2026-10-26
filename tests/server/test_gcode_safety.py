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
    def gx(nozzle, bed):
        return (b"xgcode 1.0\n\0" + struct.pack("<4i", 0, 58, 0, 0)
                + struct.pack("<iiih", 120, 0, 0, 1)
                + struct.pack("<8h", 200, 0, 2, 60, bed, nozzle, 0, 1))
    check(gx(205, 55), "part.gx")
    for payload in (gx(240, 55), gx(205, 105), b"xgcode 1.0\n\0"):
        with pytest.raises(ValueError):
            check(payload, "part.gx")
