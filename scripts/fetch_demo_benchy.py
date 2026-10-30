#!/usr/bin/env python3
"""Fetch the authentic, pinned 3DBenchy demo assets at frontend build time.

Do not check in repackaged STL/G-code binaries or synthesize toolpaths. Git
blob hashes pin content, so an upstream change cannot silently alter the demo.
The G-code is third-party display-only and MUST NEVER be offered for printing
on the FlashForge Adventurer 4 (it has not been sliced for that machine).
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    "demo-benchy.stl": (
        "https://raw.githubusercontent.com/CreativeTools/3DBenchy/master/"
        "Single-part/3DBenchy.stl",
        "5a51bb5f3fb335b4617f00b3ae5f3785690e13e5",
        14 * 1024 * 1024,
    ),
    "demo-benchy.gcode": (
        "https://raw.githubusercontent.com/xyz-tools/gcode-preview/"
        "4f2b58faebe97ca15ee2c901b6c487b8ad34e3e7/"
        "demo/gcodes/3DBenchy.gcode",
        "1beb78352633d214a38ebfd7567840eb6c7e98ad",
        70 * 1024 * 1024,
    ),
}


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def validate(name: str, data: bytes) -> None:
    if name.endswith(".stl"):
        if len(data) < 84:
            raise ValueError("STL too small")
        count = struct.unpack_from("<I", data, 80)[0]
        if not count or 84 + count * 50 != len(data):
            raise ValueError("Not a complete binary 3DBenchy STL")
        if count < 100_000:
            raise ValueError("Expected the full-resolution original 3DBenchy")
    else:
        if not re.search(rb"(?mi)^;\s*(LAYER\s*:\s*\d+|LAYER_CHANGE)\b", data):
            raise ValueError("Benchy G-code has no recognized layer changes")
        if not re.search(rb"(?m)^G[01]\s+.*?\bE[-+\d.]+", data):
            raise ValueError("Benchy G-code has no extrusion toolpaths")


def download_demo(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    cache = Path(os.environ["AD4_BENCHY_CACHE_DIR"]) if os.getenv("AD4_BENCHY_CACHE_DIR") else None
    for filename, (url, expected, maximum) in ASSETS.items():
        target = dest / filename
        if target.is_file() and git_blob_sha(target.read_bytes()) == expected:
            print(f"Benchy demo asset verified: {target}")
            continue
        cached = cache / filename if cache else None
        if cached and cached.is_file():
            data = cached.read_bytes()
        else:
            request = Request(url, headers={"User-Agent": "AD4-Studio-demo-fixtures/1.0"})
            with urlopen(request, timeout=90) as response:
                data = response.read(maximum + 1)
        if not 100_000 < len(data) <= maximum:
            raise ValueError(f"{filename}: unexpected size {len(data)}")
        actual = git_blob_sha(data)
        if actual != expected:
            raise ValueError(f"{filename}: upstream Git blob hash changed: {actual}")
        validate(filename, data)
        with tempfile.NamedTemporaryFile(dir=dest, prefix=f".{filename}.",
                                         delete=False) as stream:
            temp = Path(stream.name)
            try:
                stream.write(data)
            except BaseException:
                temp.unlink(missing_ok=True)
                raise
        temp.replace(target)
        print(f"Authentic {filename}: {len(data):,} bytes; Git blob {actual}")


if __name__ == "__main__":
    download_demo(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "frontend" / "public")
