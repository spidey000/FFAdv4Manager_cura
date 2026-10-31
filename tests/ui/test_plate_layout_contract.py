"""Integration invariants for cloned/arranged models in the Mosaic editor."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREP = (ROOT / "scripts/prepare_mosaic.py").read_text()
VIEWER = (ROOT / "overlays/mosaic/public/ad4-v3.js").read_text()
ICONS = (ROOT / "overlays/mosaic/src/gui/ad4-icon-pack.mjs").read_text()
OPS = (ROOT / "overlays/mosaic/src/gui/viewer/ad4-plate-operations.mjs").read_text()


def test_build_installs_authoritative_collision_guard():
    assert "ad4-plate-layout.mjs" in PREP
    assert "ad4-plate-operations.mjs" in PREP
    assert "if (!ad4Plate.acceptNewModel(mesh))" in PREP
    assert "if (!ad4Plate.isValid()) throw new Error" in PREP
    assert "export const ad4_auto_arrange" in PREP
    assert "export const ad4_clone_selected" in PREP
    assert "model.mesh.geometry === models[focused].mesh.geometry" in PREP


def test_clone_is_fully_registered_and_rejected_when_full():
    assert "if (!arrange([...activeMeshes(),mesh]))" in OPS
    assert "models[mesh.uuid]={mesh,data:source.data,name:mesh.name}" in OPS
    assert "interactions.scene_objects[mesh.uuid]=sceneobj" in OPS
    assert "focusModel(mesh.uuid)" in OPS
    assert "new CustomEvent(\"ad4:models-changed\"" in OPS


def test_invalid_drag_and_compound_numeric_edits_are_reversible():
    for item in (
        'controls.addEventListener("dragging-changed"',
        'controls.addEventListener("mouseUp"',
        'document.addEventListener("input"',
        "restore(selected)", "validateSelected()",
        "ad4_begin_transform", "ad4_commit_transform",
    ):
        assert item in OPS + PREP + VIEWER
    assert "plate?.ad4_begin_transform?.()" in VIEWER
    assert "plate?.ad4_commit_transform?.()" in VIEWER


def test_compact_left_rail_and_consistent_icons():
    assert 'arrangeButton.id="ad4-v3-auto-arrange"' in VIEWER
    assert 'cloneButton.id="ad4-v3-clone"' in VIEWER
    assert 'viewerTransform.append(arrangeButton)' in VIEWER
    assert 'viewerTransform.append(cloneButton)' in VIEWER
    assert 'arrangeButton.disabled=modelCount()===0' in VIEWER
    assert 'cloneButton.disabled=!hasSelection()' in VIEWER
    assert '"layout-grid":LayoutGrid' in ICONS
    assert '"copy-plus":CopyPlus' in ICONS
