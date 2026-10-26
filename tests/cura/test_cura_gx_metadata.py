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
