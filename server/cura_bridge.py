"""CuraEngine web frontend + the FFAdv4Manager secure printer bridge.

Only a single printer (FlashForge Adventurer 4) is exposed in Symple's
forced profile list. This module delegates ALL printer operations to the
upstream ffadv4manager CLI; no duplicate protocol client exists here.
"""
from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urlsplit

from . import ad4_bridge as bridge

ROOT = Path(__file__).resolve().parents[1]
SYMPLE = ROOT / "vendor" / "symple-slicer" / "src-app"
PROFILES = ROOT / "cura-profiles"


class CuraHandler(bridge.Handler):
    """Serve Cura WASM and proprietary machine presets behind Access checks."""

    def translate_path(self, path):
        clean = urlsplit(path).path
        for prefix, root in (("/cura/", SYMPLE), ("/cura-profiles/", PROFILES)):
            if clean.startswith(prefix):
                # Absolute and traversal paths must never leave the approved tree.
                rel = unquote(clean[len(prefix):]).replace("\\", "/")
                target = (root / rel).resolve()
                if not target.is_relative_to(root.resolve()):
                    return str(root / "__blocked__")
                return str(target)
        return super().translate_path(path)

    def send_head(self):
        # Auth is performed in the inherited Handler.do_GET, prior to this.
        if urlsplit(self.path).path == "/cura/index.html":
            try:
                page = (SYMPLE / "index.html").read_text(encoding="utf-8")
            except OSError:
                self.send_error(503, "Cura web submodule not installed")
                return None
            page = page.replace(
                "</body>",
                '<script src="/cura-integration.js"></script></body>',
            )
            payload = page.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            return BytesIO(payload)
        return super().send_head()


def serve(*, require_access=False):
    if not (SYMPLE / "index.html").is_file():
        raise RuntimeError(
            "Cura slicer missing: run git submodule update --init vendor/symple-slicer"
        )
    wasm = SYMPLE / "lib/slicing-engines/CuraEngine/CuraEngine.wasm"
    if not wasm.is_file():
        raise RuntimeError("CuraEngine WASM missing from the pinned Symple Slicer")
    if not (PROFILES / "profile_list.toml").is_file():
        raise RuntimeError("Missing Adventurer 4 profile list")
    bridge.Handler = CuraHandler
    bridge.serve(require_access=require_access)


def main():
    parser = argparse.ArgumentParser(description="AD4 Cura web slicer and printer manager")
    parser.add_argument("--require-access", action="store_true",
                        help="Fail closed unless valid Cloudflare Access config exists")
    args = parser.parse_args()
    serve(require_access=args.require_access)


if __name__ == "__main__":
    main()
