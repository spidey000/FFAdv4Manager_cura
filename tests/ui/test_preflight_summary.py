"""Print preflight and local profile summary must remain functional without Cura backend."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_summary_save_reset_and_stale_gcode():
    code = (ROOT / "overlays/mosaic/src/gui/ad4-settings.mjs").read_text()
    assert "ad4-presets-panel" in code
    assert "ad4-settings-footer" in code
    assert 'choose(type,"")' in code
    assert 'new Event("ad4:gcode-stale")' in code


def test_preflight_has_real_job_values_and_rechecks_before_sending():
    manager = (ROOT / "overlays/mosaic/public/ad4-manager.js").read_text()
    assert "async function confirmPrint" in manager
    for field in ("Layer height", "Print speed", "Support", "Adhesion",
                  "Filament · estimate", "Layers · sliced G-code", "G-code size",
                  "Live printer status", "Existing timelapse"):
        assert field in manager
    assert 'api("/status")' in manager
    assert 'api("/timelapse")' in manager
    assert "printerCanStart(printer.value)" in manager
    assert "el(\"slice-export-container\")?.dataset.active" in manager
    assert "if(!allowed)return" in manager


def test_preflight_estimate_is_derived_from_capture_settings():
    manager = (ROOT / "overlays/mosaic/public/ad4-manager.js").read_text()
    for fragment in ("function countSlicedLayers(", "function estimateSeconds(",
                     "mode.value===\"layer\"", "Math.ceil(seconds/Number(interval.value))",
                     "count/Number(fps.value)", "timelapse_fps:String(allowed.fps)",
                     "timelapse_interval:String(allowed.interval)"):
        assert fragment in manager
    assert "Recording can be enabled" not in manager  # No false promise of immediate upload-only capture.
