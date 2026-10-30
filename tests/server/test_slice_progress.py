"""CLI CuraEngine progress is real telemetry, never an invented ETA."""
from pathlib import Path
from unittest.mock import patch

from server.mosaic_slicer import parse_engine_progress, progress_snapshot


def test_native_fractional_progress_samples():
    log = (
        "Starting slice...\n"
        "Progress:slice:1:1    0.018531%\n"
        "Starting inset+skin...\n"
        "Progress:inset+skin:50:100    0.148613%\n"
        "Starting export...\n"
        "Progress:export:120:180    0.761234%\n"
    )
    assert parse_engine_progress(log) == ("export", 76)


def test_no_numeric_progress_means_indeterminate():
    assert parse_engine_progress("Starting support...\n") == ("support", None)
    assert parse_engine_progress("No output yet") == ("Preparing", None)
    assert parse_engine_progress("Progress:export:1:2 0.9999%") == ("export", 99)


def test_progress_snapshot_reads_live_log_without_exposing_path(tmp_path: Path):
    logfile = tmp_path / "engine.log"
    logfile.write_text("Starting export...\nProgress:export:20:100 0.631%\n")
    status = {
        "job_id": "a-valid-job-id",
        "state": "running",
        "stage": "Preparing",
        "percent": None,
        "log_path": str(logfile),
    }
    with patch("server.mosaic_slicer.ACTIVE_PROGRESS", status):
        result = progress_snapshot("a-valid-job-id")
        assert result == {"state": "running", "stage": "export", "percent": 63}
        assert progress_snapshot("other-job")["state"] == "pending"
        assert "log_path" not in result
