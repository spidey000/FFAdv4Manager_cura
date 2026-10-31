"""Static contracts for the AD4 Studio viewer-first redesign.

The actual Mosaic DOM comes from a pinned submodule in the CI build.
No print or network command is executed by these checks.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OVERLAY = ROOT / "overlays" / "mosaic" / "public"
PREPARE = ROOT / "scripts" / "prepare_mosaic.py"
PAGES = ROOT / ".github" / "workflows" / "pages.yml"


def test_mobile_shell_is_packaged_with_upstream_editor():
    prepare = PREPARE.read_text()
    assert "ad4-studio.js" in prepare
    assert "ad4-studio.css" in prepare
    assert "ad4-manager.js" in prepare
    assert "src/gui/slicer.mjs" in prepare
    assert "Cannot remove client-side Cura worker" in prepare


def test_drawer_and_accessibility():
    script = (OVERLAY / "ad4-studio.js").read_text()
    css = (OVERLAY / "ad4-studio.css").read_text()
    for key in (
        "ad4-sheet-open", "ad4-sheet-scrim", "ad4-sheet-close",
        "ad4-dock-settings", "ad4-dock-model", "ad4-dock-slice",
        "ad4-dock-upload", "ad4-dock-print", "ad4-dock-preview",
        "aria-expanded", "aria-hidden", "Escape",
    ):
        assert key in script
    assert "@media (max-width:767px)" in css
    assert "env(safe-area-inset-bottom)" in css
    assert "prefers-reduced-motion" in css
    assert "ad4-filter-hidden" in css


def test_real_slicing_and_printer_only():
    script = (OVERLAY / "ad4-studio.js").read_text()
    assert 'byId("slice-button")?.click()' in script
    assert 'globalThis.AD4Printer?.upload(false)' in script
    assert 'globalThis.AD4Printer?.upload(true)' in script
    assert "AD4_STATIC_PREVIEW" in script
    assert "engineAvailable" in script
    assert 'setAttribute("disabled", "")' in script
    assert "new Worker(" not in script


def test_public_pages_build_deploys_editor_without_browser_engine():
    workflow = PAGES.read_text()
    assert "bash scripts/install.sh" in workflow
    assert "AD4_SKIP_ENGINE_BUILD: '1'" in workflow
    assert "frontend/dist" in workflow
    assert "resources/cura_data.tar.gz" in workflow
    assert "__AD4_STATIC_PREVIEW__=true" in workflow
    assert 'not (root/"js/worker.js").exists()' in workflow
    assert "actions/deploy-pages@v4" in workflow


def test_complete_v3_workspace_is_built_and_wires_actual_editor():
    from pathlib import Path
    source = (ROOT / "overlays/mosaic/public/ad4-v3.js").read_text()
    css = (ROOT / "overlays/mosaic/public/ad4-v3.css").read_text()
    recipe = PREPARE.read_text()
    for name in ("ad4-v3.js","ad4-v3.css"):
        assert name in recipe
    for route in ('"preview"','"print"','"filament"','"printer"','"app"','"sliced"','"transform"'):
        assert route in source
    for control in ("ad4-v3-top","ad4-v3-bottom","ad4-v3-layer-from",
                    "ad4-v3-axis","ad4-v3-manager-tabs","ad4-v3-app"):
        assert control in source or control in css
    assert '"ad4-v3-layer-from"' in source and '"ad4-v3-layer-to"' in source
    assert '"rotation"' in source and '"movement"' in source
    assert '"api/slice"' not in source  # all slicing delegated to Mosaic's server bridge
    assert 'globalThis.app?.gui?.slicer?.exported_gcode' in source
    assert 'window.__AD4_STATIC_PREVIEW__ === true' in source
    assert '@media(max-width:767px)' in css


def test_version_stamp_is_attached_to_viewer_and_built_with_git_revision():
    script = (OVERLAY / "ad4-v3.js").read_text()
    css = (OVERLAY / "ad4-v3.css").read_text()
    prepare = PREPARE.read_text()
    for required in (
        "VERSION_UI", "REVISION_UI", "ad4-version-stamp",
        'document.getElementById("viewer")?.append(versionStamp)',
        './api/version', "API offline", "API —", "cache: \"no-store\"",
    ):
        assert required in script
    assert "#viewer #ad4-version-stamp" in css
    assert "pointer-events:none" in css
    assert "env(safe-area-inset-right)" in css
    assert 'frontend_source.replace("__AD4_FRONTEND_REV__", revision)' in prepare


def test_printer_manager_is_inline_in_main_printer_tab():
    shell = (OVERLAY / "ad4-v3.js").read_text()
    dashboard = (OVERLAY / "ad4-printer-dashboard.js").read_text()
    manager = (OVERLAY / "ad4-manager.js").read_text()
    styles = (OVERLAY / "ad4-v3.css").read_text()
    assert 'id="ad4-v3-open-printer"' not in shell
    assert 'ad4-v3-open-controls' not in shell
    assert 'ad4-v3-manager-tabs' not in shell
    assert 'page.append(manager)' in dashboard
    assert 'data-printer-go' in dashboard
    assert 'setFileSearch' in dashboard
    assert 'ad4:printer-reset' in shell
    assert 'dialog.show()' in manager
    assert 'dialog.showModal()' not in manager
    assert 'embeddedManager.close()' in shell
    for feature in ("live", "controls", "files", "camera", "timelapse", "connection", "tools"):
        assert '"' + feature + '"' in shell
    assert 'repeat(3,minmax(0,1fr))' in styles
    assert 'repeat(2,minmax(0,1fr))' in styles
    assert '#ad4-v3-printer-page #ad4-manager[open]' in styles
    assert 'globalThis.__AD4_STATIC_PREVIEW__===true' in manager
