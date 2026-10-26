#!/usr/bin/env python3
"""Build a GitHub Pages static CuraEngine preview. No printer backend is published."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
CURA = ROOT / "vendor" / "symple-slicer" / "src-app"
PROFILES = ROOT / "cura-profiles"
INTEGRATION = '<script src="../cura-integration.js"></script>'

def main():
    if not (DIST / "index.html").is_file():
        raise RuntimeError("Build Vite before packaging Pages")
    if not (CURA / "index.html").is_file():
        raise RuntimeError("Missing pinned Symple Slicer submodule")
    if not (CURA / "lib" / "slicing-engines" / "CuraEngine" / "CuraEngine.wasm").is_file():
        raise RuntimeError("Missing pinned CuraEngine WebAssembly binary")
    if not (DIST / "cura-integration.js").is_file():
        raise RuntimeError("Missing Cura integration script")
    shutil.copytree(CURA, DIST / "cura", dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns(".git"))
    shutil.copytree(PROFILES, DIST / "cura-profiles", dirs_exist_ok=True)
    index = DIST / "cura" / "index.html"
    html = index.read_text(encoding="utf-8")
    if "</body>" not in html:
        raise RuntimeError("Unexpected upstream Symple Slicer layout")
    if INTEGRATION not in html:
        html = html.replace("</body>", INTEGRATION + "</body>")
    index.write_text(html, encoding="utf-8")
    (DIST / ".nojekyll").touch()
    assert INTEGRATION in index.read_text(encoding="utf-8")
    assert (DIST / "cura-profiles" / "profile_list.toml").is_file()
    print("GitHub Pages static CuraEngine artifact ready at", DIST)

if __name__ == "__main__":
    main()
