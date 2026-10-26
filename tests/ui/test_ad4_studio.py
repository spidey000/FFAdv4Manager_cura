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
    assert 'byId("ad4-upload")?.click()' in script
    assert 'byId("ad4-send-print")?.click()' in script
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
