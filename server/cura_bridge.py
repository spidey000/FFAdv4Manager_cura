"""MosaicSlicer frontend served locally; all slicing takes place on this server."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

from . import ad4_bridge as bridge
from .mosaic_slicer import MAX_FRAME, SlicingError, cancel_slice, engine_binary, parse_frame, slice_model, progress_snapshot

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"


class MosaicHandler(bridge.Handler):
    def do_GET(self):
        if urlsplit(self.path).path == "/api/slice/progress":
            if not self.request_authorized():
                return self.json(401 if bridge.ACCESS_CONFIG else 403, {"error": "Unauthorized"})
            requested = parse_qs(urlsplit(self.path).query).get("job_id", [""])[0]
            if requested and not re.fullmatch(r"[0-9a-fA-F-]{1,64}", requested):
                return self.json(400, {"error": "Invalid job identifier"})
            return self.json(200, progress_snapshot(requested))
        if urlsplit(self.path).path == "/api/slice/engine":
            if not self.request_authorized():
                return self.json(401 if bridge.ACCESS_CONFIG else 403, {"error": "Unauthorized"})
            try:
                engine_binary()
                return self.json(200, {"available": True, "location": "server"})
            except SlicingError as error:
                return self.json(503, {"available": False, "error": str(error)})
        return super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/api/slice", "/api/slice/cancel"):
            return super().do_POST()
        if not self.request_authorized(write=True):
            return self.json(401 if bridge.ACCESS_CONFIG else 403, {"error": "Unauthorized"})
        if path == "/api/slice/cancel":
            return self.json(200, {"cancelled": cancel_slice()})
        if not self.headers.get("Content-Type", "").startswith("application/vnd.ffadv4-slice"):
            return self.json(415, {"error": "Unsupported slice media type"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 88 or size > MAX_FRAME:
                return self.json(413, {"error": "Invalid model or settings size"})
            model, settings = parse_frame(self.rfile.read(size))
            job_id = self.headers.get("X-AD4-Slice-Id", "")
            if job_id and not re.fullmatch(r"[0-9a-fA-F-]{1,64}", job_id):
                return self.json(400, {"error": "Invalid job identifier"})
            result = slice_model(model, settings, job_id=job_id)
            return self.json(200, {
                "gcode": result.gcode,
                "time_seconds": result.seconds,
                "filament_mm": result.filament_mm,
                "engine": "server",
            })
        except (ValueError, OSError, SlicingError) as error:
            return self.json(422, {"error": str(error)})


def serve(*, require_access=False):
    if not (DIST / "index.html").is_file():
        raise RuntimeError("MosaicSlicer missing. Run bash scripts/install.sh")
    bridge.DIST = DIST
    if not os.environ.get("AD4_CLI"):
        bridge.CLI = str(Path(sys.executable).with_name("ffadv4manager"))
    bridge.Handler = MosaicHandler
    bridge.serve(require_access=require_access)


def main():
    parser = argparse.ArgumentParser(description="MosaicSlicer UI and server-side CuraEngine")
    parser.add_argument("--require-access", action="store_true")
    args = parser.parse_args()
    serve(require_access=args.require_access)


if __name__ == "__main__":
    main()
