"""Read executable G-code from text or a bounded FlashForge GX container."""
import struct
import re
from pathlib import Path

GX_MAGIC = b"xgcode 1.0\n\0"
MAX_JOB_BYTES = 100 * 1024 * 1024


def executable_gcode(payload: bytes, filename: str) -> bytes:
    if not payload or len(payload) > MAX_JOB_BYTES:
        raise ValueError("Empty or oversized print file")
    if Path(filename).suffix.lower() == ".gx":
        if not payload.startswith(GX_MAGIC) or len(payload) < 58:
            raise ValueError("Invalid or truncated GX header")
        _, bmp, offset, duplicate = struct.unpack_from("<4I", payload, 12)
        if bmp != 58 or offset != duplicate or not bmp + 54 <= offset < len(payload):
            raise ValueError("Invalid GX thumbnail/G-code offsets")
        if payload[bmp:bmp + 2] != b"BM":
            raise ValueError("GX thumbnail is not a BMP")
        bmp_size = struct.unpack_from("<I", payload, bmp + 2)[0]
        if bmp_size < 54 or bmp + bmp_size != offset:
            raise ValueError("Invalid or overlapping GX thumbnail")
        payload = payload[offset:]
    elif Path(filename).suffix.lower() not in (".gcode", ".gco", ".g"):
        raise ValueError("Unsupported print file format")
    if b"\0" in payload:
        raise ValueError("Executable G-code contains binary data")
    if not payload.strip():
        raise ValueError("Print file has no executable G-code")
    return payload

# The Adventurer 4's official Cura end script retracts the Z platform with
# G162, then homes X/Y. Do not home Z toward the finished part at shutdown.
_MOTION = re.compile(rb"^G(?:0*[0-3]|0*10|0*11|0*28|0*161|0*162)(?![0-9])", re.I)
_G28 = re.compile(rb"^G0*28(?![0-9])", re.I)
_SHUTDOWN = re.compile(rb"^M(?:0*18|0*84|0*2|0*30|0*0|0*1)(?![0-9])", re.I)


def _command(line: bytes) -> bytes:
    """Discard comments and optional line numbers without changing source bytes."""
    code = line.split(b";", 1)[0].strip()
    return re.sub(rb"^N\d+\s*", b"", code, flags=re.I).strip().upper()


def _homes_xy(command: bytes) -> bool:
    match = _G28.match(command)
    if not match:
        return False
    parameters = command[match.end():]
    axes = set(re.findall(rb"([XYZ])(?=[^A-Z]|$)", parameters))
    return not axes or {"X", "Y"} <= {axis.decode("ascii") for axis in axes}


def ensure_final_xy_homing(payload: bytes, filename: str) -> bytes:
    """Make the last physical move an X/Y home, before motor-off/end commands.

    Modifies only executable G-code, leaving a GX header and bitmap intact.
    Files already ending in an X/Y home are unchanged. Never mutate user files
    in place: callers write the returned bytes to a temporary output.
    """
    executable = executable_gcode(payload, filename)
    lines = executable.splitlines(keepends=True)
    commands = [_command(line) for line in lines]
    last_motion = next((i for i in range(len(lines) - 1, -1, -1)
                        if _MOTION.match(commands[i])), -1)
    if last_motion >= 0 and _homes_xy(commands[last_motion]):
        return payload

    # Some slicers put M18/M84 (motors off) or M2/M30 (program end) at
    # the tail; a homing appended after these can be ignored by firmware.
    insertion = next((i for i in range(last_motion + 1, len(lines))
                      if _SHUTDOWN.match(commands[i])), len(lines))
    newline = b"\r\n" if b"\r\n" in executable[:4096] else b"\n"
    prefix, suffix = b"".join(lines[:insertion]), b"".join(lines[insertion:])
    if prefix and not prefix.endswith((b"\n", b"\r")):
        prefix += newline
    # G162 Z is the AD4's official Z park (moves the bed away from the part).
    # G28 X Y then becomes the last movement; non-motion shutdown can follow.
    code = prefix + (b"; AD4 final movement: home X/Y" + newline
                     + b"G162 Z F1800" + newline + b"G28 X Y" + newline) + suffix
    if len(payload) - len(executable) + len(code) > MAX_JOB_BYTES:
        raise ValueError("Final homing would exceed the maximum print file size")
    return payload[:len(payload) - len(executable)] + code
