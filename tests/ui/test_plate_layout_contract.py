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
    assert "ad4Plate.acceptNewModel(mesh, file_name);" in PREP
    assert "if (!ad4Plate.acceptNewModel" not in PREP
    assert "if (!ad4Plate.isValid()) throw new Error" in PREP
    assert "export const ad4_auto_arrange" in PREP
    assert "export const ad4_clone_selected" in PREP
    assert "m.mesh.geometry === models[focused].mesh.geometry" in PREP


def test_clone_is_registered_even_when_it_cannot_fit():
    assert "arrange([...activeMeshes(),mesh],{quiet:true});" in OPS
    assert "mesh.material.dispose(); // shared geometry" not in OPS
    assert "models[mesh.uuid]={mesh,data:source.data,name:mesh.name}" in OPS
    assert "interactions.scene_objects[mesh.uuid]=sceneobj" in OPS
    assert "focusModel(mesh.uuid)" in OPS
    assert 'emit("models-changed",{count:Object.keys(models).length})' in OPS


def test_invalid_drag_and_compound_numeric_edits_remain_editable():
    for item in (
        'controls.addEventListener("dragging-changed"',
        'controls.addEventListener("mouseUp"',
        'document.addEventListener("input"',
        "validateSelected()", "ad4_begin_transform", "ad4_commit_transform",
        'emit("plate-status",result)',
    ):
        assert item in OPS + PREP + VIEWER
    assert "const result=status();" in OPS
    assert "restore(selected)" not in OPS
    assert 'if(!individual.valid)return fail' not in OPS
    assert "plate?.ad4_begin_transform?.()" in VIEWER
    assert "plate?.ad4_commit_transform?.()" in VIEWER
    assert 'document.addEventListener("ad4:plate-status"' in VIEWER
    assert 'if (!ad4Plate.isValid()) throw new Error' in PREP
    assert 'nativeSlice.disabled=staticPreview||!model||!plateValid' in VIEWER
    assert 'const MAX_EDIT_MM=100000;' in VIEWER


def test_compact_left_rail_and_consistent_icons():
    assert 'arrangeButton.id="ad4-v3-auto-arrange"' in VIEWER
    assert 'cloneButton.id="ad4-v3-clone"' in VIEWER
    assert 'viewerTransform.append(arrangeButton)' in VIEWER
    assert 'viewerTransform.append(cloneButton)' in VIEWER
    assert 'arrangeButton.disabled=modelCount()===0' in VIEWER
    assert 'cloneButton.disabled=!hasSelection()' in VIEWER
    assert '"layout-grid":LayoutGrid' in ICONS
    assert '"copy-plus":CopyPlus' in ICONS
