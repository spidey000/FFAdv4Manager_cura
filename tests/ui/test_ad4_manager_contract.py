"""Ensure the AD4 Studio HTML and manager JavaScript stay compatible.

A frontend redesign previously retained the enhanced manager dialog but silently
replaced its controller with a legacy version, even though the build/CI passed.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANAGER = ROOT / "overlays/mosaic/public/ad4-manager.js"
PREPARER = ROOT / "scripts/prepare_mosaic.py"
STUDIO = ROOT / "overlays/mosaic/public/ad4-studio.js"


def test_manager_has_controller_for_every_generated_dialog_element():
    source = MANAGER.read_text(encoding="utf-8")
    recipe = PREPARER.read_text(encoding="utf-8")
    ids = set(re.findall(r'\bel\("([^"]+)"\)', source))
    declared = set(re.findall(r'\bid="([^"]+)"', recipe))
    # The canonical Mosaic editor owns these IDs in its upstream index.html.
    native_mosaic_ids={"gcode-time-estimate","material-estimate","slice-export-container"}
    missing = ids - declared - native_mosaic_ids
    assert not missing, f"JS references absent HTML IDs: {sorted(missing)}"
    assert len(ids) >= 38, "Unexpected loss of enhanced manager controls"


def test_enhanced_printer_features_not_replaced_by_old_manager():
    source = MANAGER.read_text(encoding="utf-8")
    for key in (
        "ad4-file-sort", "ad4-page-size", "ad4-files-prev",
        "ad4-gallery", "ad4-gallery-refresh", "ad4-timelapse-preview",
        "ad4-live-toggle", "ad4-capture-mode", "ad4-auto-timelapse",
        "ad4-connection-profiles", "ad4-diagnostic-result",
    ):
        assert key in source
    for endpoint in (
        "/files?details=1", "/timelapses", "/timelapses/video",
        "/timelapses/download", "/timelapses/delete",
        "/camera/live", "/diagnostics?kind=", "/profiles",
    ):
        assert endpoint in source
    assert "timelapse_mode" in source
    assert "action:\"start\",mode:" in source
    assert "renderGallery()" in source
    assert "renderFiles()" in source
    assert 'const root="./api/printer"' in source
    assert "http://192.168." not in source


def test_studio_actions_still_target_enhanced_manager():
    studio = STUDIO.read_text(encoding="utf-8")
    manager = MANAGER.read_text(encoding="utf-8")
    for control in ("ad4-open-manager", "AD4Printer"):
        assert control in studio and control in manager
    assert "exported_gcode" in manager
