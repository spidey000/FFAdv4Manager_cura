"""Server-side Mosaic slice -> existing GX converter, without physical printer."""
import json
import struct
from pathlib import Path

from ffadv4manager.core.gcode_to_gx import convert_gcode_to_gx, GX_MAGIC
from server.mosaic_slicer import check_settings, slice_model


def test_server_slice_output_converts_to_flashforge_gx(tmp_path, monkeypatch):
    executable = tmp_path / "fake-native-cura"
    executable.write_text(
        "#!/usr/bin/env python3\n"
        "import sys, pathlib\n"
        "assert sys.argv[1:3] == ['slice', '-v'] and '-r' in sys.argv\n"
        "settings = pathlib.Path(sys.argv[sys.argv.index('-r') + 1])\n"
        "assert settings.is_file()\n"
        "payload = __import__('json').loads(settings.read_text())\n"
        "assert any(key.endswith('/model.stl') for key in payload)\n"
        "pathlib.Path(sys.argv[sys.argv.index('-o')+1]).write_text("
        "';TIME:3723\\n;Filament used: 1.234m\\nG28\\nM104 S205\\nG1 X1 Y1 E0.2\\n')\n"
    )
    executable.chmod(0o755)
    monkeypatch.setattr("server.mosaic_slicer.engine_binary", lambda: str(executable))
    config = check_settings({
        "global": {"layer_height": 0.2},
        "extruder.0": {},
        "/tmp/input/model.stl": {"extruder_nr": "0"},
    })
    stl = bytes(80) + struct.pack("<I", 1) + bytes(50)
    result = slice_model(stl, config)
    assert result.seconds == 3723
    assert result.filament_mm == 1234
    source = tmp_path / "benchy.gcode"
    source.write_text(result.gcode)
    output = tmp_path / "benchy.gx"
    convert_gcode_to_gx(source, output)
    assert output.read_bytes().startswith(GX_MAGIC)
