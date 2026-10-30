"""Read executable G-code from text or a bounded FlashForge GX container."""
import struct
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
