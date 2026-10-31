"""Contract checks for the shared 3D build plate / G-code viewer errors."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHELL = (ROOT / "overlays/mosaic/public/ad4-v3.js").read_text()
STYLES = (ROOT / "overlays/mosaic/public/ad4-v3.css").read_text()
RECIPE = (ROOT / "scripts/prepare_mosaic.py").read_text()
STUDIO = (ROOT / "overlays/mosaic/public/ad4-studio.js").read_text()
MANAGER = (ROOT / "overlays/mosaic/public/ad4-manager.js").read_text()
SLICER = (ROOT / "overlays/mosaic/src/gui/slicer.mjs").read_text()


def test_shared_lower_left_error_hud_is_safe_and_accessible():
    for marker in (
        'viewerError.id="ad4-viewer-error"',
        'viewerError.setAttribute("role","alert")',
        'viewerError.setAttribute("aria-live","assertive")',
        '$("viewer")?.append(viewerError)',
        'textContent=first[1].message',
        'const priorities={plate:100',
    ):
        assert marker in SHELL
    assert '#viewer #ad4-viewer-error{' in STYLES
    assert 'background:#ffe083;color:#982013' in STYLES
    assert 'left:max(9px,env(safe-area-inset-left))' in STYLES
    assert 'bottom:max(9px,env(safe-area-inset-bottom))' in STYLES


def test_primary_slice_is_fail_closed_when_invalid_or_unavailable():
    for marker in (
        'const status=currentPlateStatus(),plateValid=status?.valid===true',
        '!plateValid ||',
        'start.disabled=staticPreview||slicingBusy||!plateValid',
        'runSlice.disabled=staticPreview||currentPlateStatus()?.valid!==true',
        'event.stopImmediatePropagation()',
        'PLATE_CHECK_UNAVAILABLE',
    ):
        assert marker in SHELL
    assert 'const validPlate=hasModel && plate?.ad4_plate_status?.().valid===true' in STUDIO
    assert "if (!ad4Plate.isValid()) throw new Error" in RECIPE


def test_every_editor_error_source_is_wired_to_the_viewer():
    for code in (
        "FILE_UNSUPPORTED", "FILE_TOO_LARGE", "FILE_READ_FAILED",
        "MODEL_LOAD_FAILED", "GCODE_PARSE_FAILED", "GCODE_MISSING",
    ):
        assert code in RECIPE
    assert 'code:"ENGINE_UNAVAILABLE"' in STUDIO
    assert 'code:"PRINT_TRANSFER_FAILED"' in MANAGER
    assert 'code:"SLICE_FAILED"' in RECIPE
    assert 'state: "failed", message:error?.message' in SLICER
    assert "webglcontextlost" in SHELL
    assert "LAYER_RENDER_FAILED" in RECIPE
    assert "MODEL_RENDER_FAILED" in (ROOT / "overlays/mosaic/src/gui/viewer/renderer.mjs").read_text()
    assert 'ad4:viewer-recovered' in SHELL


def test_specific_error_catalog_is_documented():
    guide = (ROOT / "docs/VIEWER_ERROR_CODES.md").read_text()
    for code in (
        "MODEL_COLLISION", "HEIGHT_OVERFLOW",
        "BED_X_MIN", "BED_X_MAX", "BED_Y_MIN", "BED_Y_MAX",
        "BELOW_BED", "INVALID_GEOMETRY", "ENGINE_UNAVAILABLE",
        "GCODE_PARSE_FAILED", "PRINT_TRANSFER_FAILED",
    ):
        assert code in guide
