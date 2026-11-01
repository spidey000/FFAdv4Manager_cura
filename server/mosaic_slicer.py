"""Server-side CuraEngine adapter for MosaicSlicer (no browser slicing).

Requires the MosaicSlicer/CuraEngine native executable with the -r resolved
JSON flag. The standard CuraEngine build might not support this flag.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import threading
from dataclasses import dataclass

from ffadv4manager.core.job_file import ensure_final_xy_homing

ROOT = Path(__file__).resolve().parents[1]
MAX_STL = 50 * 1024 * 1024
MAX_JSON = 512 * 1024
# Mosaic exports the entire pinned Cura catalog (over 650 global values), not
# just the values visible in the sidebar. Keep a bounded envelope for that set.
MAX_SETTINGS_PER_GROUP = 1024
MAX_GCODE = 100 * 1024 * 1024
MAX_FRAME = MAX_STL + MAX_JSON + 4
SETTING_NAME = re.compile(r"^[a-z][a-zA-Z0-9_]{0,79}$")
SUPPORTED_GROUPS = {"global", "extruder.0", "/tmp/input/model.stl"}
LOCK = threading.Lock()
ACTIVE_PROCESS: subprocess.Popen | None = None
# One machine/one native engine job at a time. The status is server-observed,
# never a timer-generated progress guess.
ACTIVE_PROGRESS = {"job_id": None, "state": "idle", "stage": "", "percent": None, "log_path": None}
PROGRESS_LINE = re.compile(r"Progress:\s*([a-z+\w-]+):\d+:\d+\s+([\d.]+)%", re.I)
STAGE_LINE = re.compile(r"Starting (slice|layerparts|inset\+skin|support|export)", re.I)


def parse_engine_progress(log: str) -> tuple[str, int | None]:
    """CuraEngine -v prints fractional completion (e.g. 0.458613%)."""
    matches = list(PROGRESS_LINE.finditer(log))
    if matches:
        final = matches[-1]
        value = float(final.group(2))
        # CuraEngine's legacy CLI appends '%' to a fraction in [0, 1].
        percent = value * 100 if value <= 1 else value
        return final.group(1), max(0, min(99, int(percent)))
    phases = list(STAGE_LINE.finditer(log))
    return (phases[-1].group(1), None) if phases else ("Preparing", None)


def progress_snapshot(job_id: str | None = None) -> dict:
    with LOCK:
        status = ACTIVE_PROGRESS.copy()
    if job_id and status["job_id"] != job_id:
        return {"state": "pending", "stage": "Waiting for CuraEngine", "percent": None}
    # Read the subprocess log through a second file descriptor; never seek
    # the writer's file object or hold LOCK while doing filesystem I/O.
    path = status.get("log_path")
    if status["state"] == "running" and path:
        try:
            with open(path, "rb") as stream:
                stream.seek(0, os.SEEK_END)
                stream.seek(max(0, stream.tell() - 131072))
                raw = stream.read().decode("utf-8", "replace")
            stage, percent = parse_engine_progress(raw)
            status["stage"] = stage
            status["percent"] = percent
        except OSError:
            pass
    return {key: status[key] for key in ("state", "stage", "percent")}


# These are the official Adventurer 4 start/end G-code commands as shipped
# in Ultimaker Cura, not commands supplied by a remote browser.
START = ";Start Gcode\nG28\nM132 X Y Z A B\nG1 Z50.000 F420\nG161 X Y F3300\nM7 T0\nM6 T0\nM651 S255\n;End Start"
END = ";End Gcode\nM104 S0 T0\nM140 S0 T0\nG162 Z F1800\nG28 X Y\nM132 X Y A B\nM652\nG91\nM18"
MACHINE = {
    "machine_width": 220, "machine_depth": 200, "machine_height": 250,
    "machine_center_is_zero": True, "machine_heated_bed": True,
    "machine_extruder_count": 1, "machine_nozzle_size": 0.4,
    "material_diameter": 1.75, "machine_start_gcode": START, "machine_end_gcode": END,
}
PLA = {
    "material_print_temperature": 205,
    "material_print_temperature_layer_0": 210,
    "material_bed_temperature": 55,
    "material_bed_temperature_layer_0": 55,
    "material_diameter": 1.75,
}
LIMITS = {
    "material_print_temperature": (180, 220),
    "material_print_temperature_layer_0": (180, 220),
    "material_bed_temperature": (0, 65),
    "material_bed_temperature_layer_0": (0, 65),
    "speed_print": (1, 65),
    "speed_travel": (1, 100),
    "acceleration_print": (1, 1200),
    "acceleration_travel": (1, 1200),
}


class SlicingError(Exception):
    pass


def engine_binary() -> str:
    override = os.environ.get("AD4_CURAENGINE_BIN", "").strip()
    bundled = ROOT / ".local" / "curaengine" / "bin" / "CuraEngine"
    candidate = override or (str(bundled) if bundled.is_file() else "")
    if not candidate:
        raise SlicingError(
            "CuraEngine server binary is not installed. Run bash scripts/build_engine.sh "
            "after scripts/install.sh, or set AD4_CURAENGINE_BIN to a "
            "MosaicSlicer-compatible native CuraEngine with -r support."
        )
    executable = shutil.which(candidate)
    if not executable or not os.access(executable, os.X_OK):
        raise SlicingError("Server CuraEngine binary not executable: " + candidate)
    return executable


def is_valid_stl(model: bytes) -> bool:
    if len(model) < 84 or len(model) > MAX_STL:
        return False
    triangles = struct.unpack_from("<I", model, 80)[0]
    if triangles > 0 and 84 + triangles * 50 == len(model):
        return True
    sample = model[:400].lstrip().lower()
    return sample.startswith(b"solid ") and b"facet" in model[:16384]


def parse_frame(body: bytes) -> tuple[bytes, dict]:
    if len(body) < 88 or len(body) > MAX_FRAME:
        raise SlicingError("Invalid request size")
    count = int.from_bytes(body[:4], "big")
    if not 2 <= count <= MAX_JSON or count + 4 >= len(body):
        raise SlicingError("Invalid settings length")
    try:
        settings = json.loads(body[4:4 + count])
    except (UnicodeDecodeError, ValueError) as exc:
        raise SlicingError("Settings must be valid JSON") from exc
    stl = body[4 + count:]
    if not is_valid_stl(stl):
        raise SlicingError("The uploaded file is not a valid STL model")
    return stl, check_settings(settings)


def check_settings(settings: object) -> dict:
    if not isinstance(settings, dict) or set(settings) != SUPPORTED_GROUPS:
        raise SlicingError("Only the Adventurer 4, extruder 0 and one STL are supported")
    checked = {}
    for group, values in settings.items():
        if not isinstance(values, dict) or len(values) > MAX_SETTINGS_PER_GROUP:
            raise SlicingError("Invalid settings group")
        result = {}
        for key, value in values.items():
            if not isinstance(key, str) or not SETTING_NAME.fullmatch(key):
                raise SlicingError("Invalid Cura setting name")
            if isinstance(value, (dict, type(None))):
                raise SlicingError("Invalid Cura setting value")
            if isinstance(value, (str, list)) and len(value) > 50000:
                raise SlicingError("Cura setting too large")
            # Validate nested list values, never hand arbitrary objects to native code.
            if isinstance(value, list):
                if len(value) > 500 or any(not isinstance(i, (int, float, bool, str, list)) for i in value):
                    raise SlicingError("Invalid array setting")
            if isinstance(value, str) and ("\x00" in value):
                raise SlicingError("Invalid string setting")
            if key in LIMITS:
                low, high = LIMITS[key]
                try:
                    numerical = float(value)
                except (TypeError, ValueError) as exc:
                    raise SlicingError("Unsafe setting: " + key) from exc
                if not low <= numerical <= high:
                    raise SlicingError("Unsafe setting: " + key)
            result[key] = value
        checked[group] = result

    # The server is the sole authority for the printer and firmware commands.
    checked["global"].update(MACHINE)
    # Artillery PLA Basic defaults are applied unless the user selects a
    # value within the safety envelope, and never through another material.
    for key, value in PLA.items():
        checked["global"].setdefault(key, value)
    checked["extruder.0"]["material_diameter"] = 1.75
    for key in ("material_print_temperature", "material_print_temperature_layer_0",
                "material_bed_temperature", "material_bed_temperature_layer_0"):
        v = checked["extruder.0"].get(key, PLA[key])
        low, high = LIMITS[key]
        if not isinstance(v, (int, float)) or not low <= v <= high:
            raise SlicingError("Unsafe material value: " + key)
        checked["extruder.0"][key] = v
    checked["/tmp/input/model.stl"] = {"extruder_nr": "0"}
    return checked


def cancel_slice() -> bool:
    with LOCK:
        process = ACTIVE_PROCESS
    if process and process.poll() is None:
        with LOCK:
            ACTIVE_PROGRESS["state"] = "cancelled"
            ACTIVE_PROGRESS["stage"] = "Cancelled"
            ACTIVE_PROGRESS["percent"] = None
        process.terminate()
        return True
    return False


@dataclass
class SliceResult:
    gcode: str
    seconds: int | None
    filament_mm: float | None


def finalized_gcode(gcode: str, engine_log: str) -> str:
    # Sequential native Cura writes a placeholder header to the file (TIME 6666,
    # zero filament, empty bounds), then logs the final header after slicing.
    # Replace only that initial comment block, never any executable instruction.
    headers = re.findall(r"Gcode header after slicing: ((?:;[^\r\n]*\r?\n)+)", engine_log)
    initial = re.match(r"^(?:;[^\r\n]*\r?\n)+", gcode)
    if headers and initial:
        return headers[-1] + gcode[initial.end():]
    return gcode


def slice_model(stl: bytes, settings: dict, *, timeout: int = 240, job_id: str = "") -> SliceResult:
    global ACTIVE_PROCESS
    executable = engine_binary()
    with tempfile.TemporaryDirectory(prefix="ad4-cura-") as directory:
        root = Path(directory)
        model = root / "model.stl"
        settings_path = root / "settings.json"
        output_path = root / "output.gcode"
        model.write_bytes(stl)
        resolved = {
            group if group != "/tmp/input/model.stl" else str(model): values
            for group, values in settings.items()
        }
        settings_path.write_text(json.dumps(resolved, ensure_ascii=False), encoding="utf-8")
        argv = [executable, "slice", "-v", "-r", str(settings_path), "-o", str(output_path)]
        with LOCK:
            if ACTIVE_PROCESS and ACTIVE_PROCESS.poll() is None:
                raise SlicingError("Another server-side slice is in progress")
            engine_log = (root / "engine.log").open("w+b")
            try:
                proc = subprocess.Popen(
                    argv, cwd=str(root), stdin=subprocess.DEVNULL,
                    stdout=engine_log, stderr=subprocess.STDOUT,
                    env={**os.environ, "OMP_NUM_THREADS": "2", "CURAENGINE_LOG_LEVEL": "info"},
                )
            except BaseException:
                engine_log.close()
                raise
            ACTIVE_PROCESS = proc
            ACTIVE_PROGRESS.update(job_id=job_id, state="running", stage="Preparing",
                                   percent=None, log_path=str(root / "engine.log"))
        succeeded = False
        try:
            try:
                proc.communicate(timeout=timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()
                raise SlicingError("CuraEngine server job exceeded time limit")
            engine_log.seek(0, os.SEEK_END)
            engine_log.seek(max(0, engine_log.tell() - 256 * 1024))
            log_text = engine_log.read().decode("utf-8", "replace")
            if proc.returncode != 0:
                raise SlicingError("CuraEngine failed: " + log_text[-1200:])
            if not output_path.is_file() or output_path.stat().st_size > MAX_GCODE:
                raise SlicingError("CuraEngine generated no output or an oversized G-code file")
            gcode = finalized_gcode(output_path.read_text(encoding="utf-8", errors="replace"), log_text)
            gcode = ensure_final_xy_homing(gcode.encode("utf-8"), "output.gcode").decode("utf-8")
            if not re.search(r"(?m)^(?:G0|G1|M104|M109)\b", gcode):
                raise SlicingError("CuraEngine did not return executable G-code")
            match = re.search(r"(?m)^;TIME:(\d+)", gcode)
            seconds = int(match.group(1)) if match else None
            match = re.search(r"(?mi)^;filament used:\s*([\d.]+)\s*m\b", gcode)
            filament = float(match.group(1)) * 1000 if match else None
            succeeded = True
            return SliceResult(gcode, seconds, filament)
        finally:
            engine_log.close()
            with LOCK:
                if ACTIVE_PROCESS is proc:
                    ACTIVE_PROCESS = None
                if ACTIVE_PROGRESS["job_id"] == job_id:
                    if ACTIVE_PROGRESS["state"] != "cancelled":
                        ACTIVE_PROGRESS["state"] = "completed" if succeeded else "failed"
                        ACTIVE_PROGRESS["stage"] = "Complete" if succeeded else "Failed"
                        ACTIVE_PROGRESS["percent"] = 100 if succeeded else None
                    ACTIVE_PROGRESS["log_path"] = None

