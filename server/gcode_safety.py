"""Server-side fail-closed temperature check for single-printer Artillery PLA Basic.

Applies to both slicing and direct API uploads. This is a *guard*, not a
guarantee of correct hardware temperature or material selection.
"""
import re
import struct
from pathlib import Path

NOZZLE_MAX = 220
BED_MAX = 65
COMMAND = re.compile(r"^(?:N\d+\s+)?(M104|M109|M140|M190)\b", re.I)
PARAM = re.compile(r"\b[SR]\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))\b", re.I)
METADATA = re.compile(
    r"^\s*;\s*(nozzle_temperature|first_layer_temperature|"
    r"bed_temperature|first_layer_bed_temperature)\s*[:=]\s*"
    r"([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s*$", re.I)


def require_safe_artillery_heating(payload, filename):
    """Raise ValueError before calling the printer CLI for unsafe input."""
    suffix = Path(filename).suffix.lower()
    if suffix == ".gx":
        # FlashForge GX metadata: 8 signed 16-bit slots starting at byte 42.
        # Reject truncated/unrecognized GX payloads; do not trust the extension.
        if not payload.startswith(b"xgcode 1.0\n\0") or len(payload) < 58:
            raise ValueError("Invalid or truncated GX temperature header")
        values = struct.unpack_from("<8h", payload, 42)
        nozzle, bed = values[5], values[4]
        if not 0 < nozzle <= NOZZLE_MAX or not 0 < bed <= BED_MAX:
            raise ValueError(
                f"GX temperatures exceed Artillery PLA limits or are missing "
                f"(nozzle {nozzle} / {NOZZLE_MAX}, bed {bed} / {BED_MAX} °C)")
        return

    # G-code uploads are text, including Cura's metadata and actual commands.
    if suffix not in (".gcode", ".gco", ".g"):
        raise ValueError("Unsupported upload format")
    for index, line in enumerate(payload.decode("utf-8", errors="replace").splitlines(), 1):
        meta = METADATA.fullmatch(line)
        if meta:
            key, raw = meta.groups()
            limit = BED_MAX if "bed" in key.lower() else NOZZLE_MAX
            if float(raw) > limit:
                raise ValueError(f"Artillery PLA: line {index} metadata exceeds {limit} °C")
        code = line.split(";", 1)[0].strip()
        match = COMMAND.match(code)
        if not match:
            continue
        limit = BED_MAX if match.group(1).upper() in ("M140", "M190") else NOZZLE_MAX
        for param in PARAM.finditer(code):
            if float(param.group(1)) > limit:
                raise ValueError(
                    f"Artillery PLA: line {index} {match.group(1).upper()} requests "
                    f"{param.group(1)} °C, maximum {limit} °C")
