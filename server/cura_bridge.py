"""MosaicSlicer frontend served locally; all slicing takes place on this server."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

from . import ad4_bridge as bridge
from .trace_logging import event as trace_event
from .version import backend_version_info
from .mosaic_slicer import MAX_FRAME, SlicingError, cancel_slice, engine_binary, parse_frame, slice_model, progress_snapshot

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"


class MosaicHandler(bridge.Handler):
    def do_GET(self):
        if urlsplit(self.path).path == "/api/version":
            if not self.request_authorized():
                return self.json(401 if bridge.ACCESS_CONFIG else 403, {"error": "Unauthorized"})
            return self.json(200, backend_version_info())
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
            cancelled = cancel_slice()
            trace_event(bridge.DATA_DIR, "slice.cancelled", cancelled=cancelled)
            return self.json(200, {"cancelled": cancelled})
        if not self.headers.get("Content-Type", "").startswith("application/vnd.ffadv4-slice"):
            return self.json(415, {"error": "Unsupported slice media type"})
        job_id = None
        started = None
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 88 or size > MAX_FRAME:
                return self.json(413, {"error": "Invalid model or settings size"})
            frame = self.rfile.read(size)
            if len(frame) != size:
                raise ValueError("Incomplete slice request")
            model, settings = parse_frame(frame)
            job_id = self.headers.get("X-AD4-Slice-Id", "")
            if job_id and not re.fullmatch(r"[0-9a-fA-F-]{1,64}", job_id):
                return self.json(400, {"error": "Invalid job identifier"})
            job_id = job_id or uuid.uuid4().hex
            started = time.monotonic()
            trace_event(bridge.DATA_DIR, "slice.started", job_id=job_id,
                        model_bytes=len(model), model_sha256=hashlib.sha256(model).hexdigest(),
                        settings_groups=len(settings),
                        settings_count=sum(len(values) for values in settings.values()
                                           if isinstance(values, dict)))
            result = slice_model(model, settings, job_id=job_id)
            trace_event(bridge.DATA_DIR, "slice.completed", job_id=job_id,
                        duration_ms=round((time.monotonic() - started) * 1000, 1),
                        gcode_bytes=len(result.gcode.encode("utf-8")),
                        time_seconds=result.seconds, filament_mm=result.filament_mm)
            return self.json(200, {
                "gcode": result.gcode,
                "time_seconds": result.seconds,
                "filament_mm": result.filament_mm,
                "engine": "server",
            })
        except (ValueError, OSError, SlicingError) as error:
            fields = {"error": str(error)}
            if job_id:
                fields["job_id"] = job_id
            if started is not None:
                fields["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            trace_event(bridge.DATA_DIR, "slice.failed" if job_id else "slice.request.failed", **fields)
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
