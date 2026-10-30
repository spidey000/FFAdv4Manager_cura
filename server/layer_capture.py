"""Experimental read-only M114 Z-change driven capture for FlashForge Adventurer 4.

Samples printer coordinates. Requires *two stable* observations at a higher
quantized layer before taking a camera snapshot. Z-hop can still yield a false
positive: this is not a firmware layer-number event.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import threading
from bisect import bisect_right

PRINTING = {"BUILDING", "BUILDING_FROM_SD", "PRINTING"}


def layer_from_position(payload, height, layer_heights=None):
    if not isinstance(payload, dict) or not 0.06 <= height <= 0.4:
        return None
    z = next((value for key, value in payload.items() if str(key).lower() == "z"), None)
    try:
        z = float(z)
    except (TypeError, ValueError):
        return None
    if not 0.06 <= z < 260:
        return None
    if layer_heights:
        if z < layer_heights[0] - .06 or z > layer_heights[-1] + .6:
            return None
        return max(1, min(len(layer_heights), bisect_right(layer_heights, z + .025)))
    return max(1, round(z / height))


class LayerCapture:
    """Popen-compatible capture worker used by the existing timelapse lifecycle."""
    def __init__(self, argv, folder, status_reader, *, height=0.2, poll_interval=2.0, layer_heights=None):
        self.argv = list(argv)
        self.folder = Path(folder)
        self.status_reader = status_reader
        self.height = height
        self.layer_heights = layer_heights
        self.poll_interval = poll_interval
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="AD4-M114-layer-capture", daemon=True)
        self._thread.start()

    def poll(self):
        return None if self._thread.is_alive() else 0

    def terminate(self):
        self._stop.set()

    def kill(self):
        self.terminate()

    def wait(self, timeout=None):
        self._thread.join(timeout)
        if self._thread.is_alive():
            raise subprocess.TimeoutExpired("layer-capture", timeout)
        return 0

    def _run(self):
        last_layer = 0
        candidate = None
        stable = 0
        while not self._stop.wait(self.poll_interval):
            try:
                if self.status_reader:
                    status = self.status_reader()
                    if str(status.get("machine_status", "")).upper() not in PRINTING:
                        candidate, stable = None, 0
                        continue
                result = subprocess.run([*self.argv, "position", "--json"],
                                        capture_output=True, text=True, timeout=15, check=False)
                if result.returncode:
                    continue
                coords = json.loads(result.stdout)
                layer = layer_from_position(coords, self.height, self.layer_heights)
            except (OSError, ValueError, TypeError, subprocess.TimeoutExpired, json.JSONDecodeError):
                continue
            if layer is None or layer <= last_layer:
                candidate, stable = None, 0
                continue
            if layer == candidate:
                stable += 1
            else:
                candidate, stable = layer, 1
            if stable < 2:
                continue
            frame = self.folder / ("frame-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S-%f") + ".jpg")
            try:
                output = subprocess.run([*self.argv, "camera", "snapshot", str(frame)],
                                        capture_output=True, text=True, timeout=25, check=False)
                if output.returncode or not frame.is_file() or frame.stat().st_size < 4:
                    frame.unlink(missing_ok=True)
                    continue
            except (OSError, subprocess.TimeoutExpired):
                frame.unlink(missing_ok=True)
                continue
            last_layer, candidate, stable = layer, None, 0
