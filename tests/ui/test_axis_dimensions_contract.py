"""Public mm-only transform UI and collision-safe scaling contract."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS = (ROOT / "overlays/mosaic/public/ad4-v3.js").read_text()
CSS = (ROOT / "overlays/mosaic/public/ad4-v3.css").read_text()


def test_scale_edits_use_real_mesh_dimensions_not_visible_percentages():
    assert 'units={translate:" mm",rotate:"°",scale:" mm"}' in JS
    assert "function modelBaseSize(" in JS
    assert "function modelDimension(" in JS
    assert "base*Math.abs(mesh.scale[axis])" in JS
    assert "percent:before[key]*ratio*100" in JS  # native Mosaic only
    assert "if(mode===\"scale\")return modelDimension(axis,mesh)" in JS
    assert 'scale:"%"' not in JS


def test_independent_axis_locks_share_state_across_both_editors():
    assert "const axisLocks=new WeakMap()" in JS
    assert JS.count('data-lock-axis=') >= 2
    assert "isAxisLocked(axis,mesh)" in JS
    assert 'const changed=["x","y","z"].filter(a=>!isAxisLocked(a,mesh));' in JS
    assert 'const unlocked=["x","y","z"].filter(a=>!isAxisLocked(a,mesh)' in JS
    assert 'button.setAttribute("aria-pressed",String(locked))' in JS
    assert "ad4-axis-locked" in JS + CSS
    assert "ad4-v3-resize-lock" not in JS
    assert 'id="ad4-viewer-lock"' not in JS


def test_bulk_proportions_switch_controls_all_individual_padlocks():
    assert 'id="ad4-v3-scale-lock-all"' in JS
    assert 'id="ad4-viewer-scale-lock-all"' in JS
    assert "Lock proportions" in JS
    assert 'axisLocks.set(mesh,new Set(locked?["x","y","z"]:[]));' in JS
    assert 'checkbox.checked=Boolean(allLocked)' in JS
    assert 'setAllAxisLocks(e.target.checked)' in JS
    assert '#ad4-v3-scale-lock-row[hidden]' in CSS


def test_first_move_attaches_native_gizmo_even_when_mode_is_translate():
    assert "controls?.object!==mesh" in JS
    assert "controls?.enabled!==true" in JS
    assert "!controls?.getHelper?.()?.parent" in JS


def test_nav_focus_no_longer_paints_rectangle():
    assert "#ad4-v3-top > .ad4-v3-icon-button:focus-visible" in CSS
    assert "outline:none!important" in CSS
    assert "text-decoration:underline" in CSS


def test_oversize_dimensions_are_editable_but_slice_guard_remains_authoritative():
    assert 'return rounded>=low&&rounded<=high?rounded:null' in JS
    assert 'scaleBed={x:220,y:200,z:250}' in JS
    assert 'dimension<0.01||dimension>MAX_EDIT_MM' in JS
    assert 'const MAX_EDIT_MM=100000;' in JS
    assert 'if(mode==="scale")return rounded>=0.01&&rounded<=MAX_EDIT_MM?rounded:null;' in JS
    assert 'if(mode==="translate")return Math.abs(rounded)<=MAX_EDIT_MM?rounded:null;' in JS
    assert "plate?.ad4_begin_transform?.()" in JS
    assert "plate?.ad4_commit_transform?.()" in JS
    assert 'if(mismatch||accepted===false)' in JS
    assert "Size rejected · No changes applied" in JS


def test_clickable_lucide_locks_and_millimetre_fields():
    assert 'svg("unlock")' in JS
    assert 'svg(locked?"lock":"unlock")' in JS
    assert "button.innerHTML=svg(locked?" in JS
    assert "grid-template-columns:16px minmax(0,1fr) 28px 21px" in CSS
    assert "ad4-axis-lock[aria-pressed=true]" in CSS
