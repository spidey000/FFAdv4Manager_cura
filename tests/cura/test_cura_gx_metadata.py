"""Cura-specific parsing regressions from the imported FFAdv4Manager converter."""
from ffadv4manager.core.gx_converter.metadata import extract_metadata


def test_cura_filament_used_meters():
    result = extract_metadata([
        ";FLAVOR:Marlin\n", ";TIME:3723\n", ";Filament used: 1.2345m\n",
        ";Layer height: 0.2\n",
    ])
    assert result.print_time == 3723
    assert result.filament_right_mm == 1234 or result.filament_right_mm == 1235
    assert result.layer_height_um == 200


def test_legacy_filament_mm_comments():
    result = extract_metadata([";Filament used [mm]: 2500\n"])
    assert result.filament_right_mm == 2500


def test_cura_heater_commands_fill_missing_gx_temperatures():
    result = extract_metadata([
        ";TIME:1341\n", "M140 S55\n", "M190 S55\n",
        "M104 S210\n", "M109 S210\n", "M104 S205\n",
        "M104 S0\n", "M140 S0\n", "; M104 S999\n",
    ])
    assert result.bed_temp == 55
    assert result.nozzle_right == 210


def test_heater_metadata_handles_tool_wait_targets_and_comment_priority():
    result = extract_metadata([
        ";nozzle_temperature=200\n", "N10 M104T0S210 ; warmup\n",
        "T1\n", "M109R215\n", "M190 R60 (M104 S999)\n",
    ])
    assert result.nozzle_right == 200
    assert result.nozzle_left == 215
    assert result.bed_temp == 60

