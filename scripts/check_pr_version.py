#!/usr/bin/env python3
"""Require each PR to increment the appropriate AD4 Studio component version."""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
UI_PATH = "overlays/mosaic/public/ad4-v3.js"
API_PATH = "pyproject.toml"
NUMBERS = r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
UI_PATTERN = re.compile(r'(?m)^const VERSION_UI\s*=\s*"(' + NUMBERS + r')";')
API_PATTERN = re.compile(r'(?m)^version\s*=\s*"(' + NUMBERS + r')"\s*$')


def parse_version(contents: str, component: str) -> tuple[int, int, int]:
    pattern = UI_PATTERN if component == "UI" else API_PATTERN
    match = pattern.search(contents)
    if match is None:
        raise ValueError(f"{component}: missing/invalid MAJOR.MINOR.PATCH version")
    return tuple(int(part) for part in match.groups()[1:])


def components_for_path(path: str) -> set[str]:
    """Detect runtime changes, with installation considered shared."""
    if path == "scripts/install.sh":
        return {"UI", "API"}
    if path.startswith(("overlays/mosaic/", "frontend/", "vendor/",
                        "tests/ui/")) or path in (
        "scripts/prepare_mosaic.py", ".github/workflows/pages.yml"
    ):
        return {"UI"}
    if path.startswith(("server/", "ffadv4manager/", "cura-profiles/",
                        "tests/server/", "tests/cli/", "tests/cura/",
                        "tests/integration/")) or path in (
        API_PATH, "scripts/build_engine.sh", ".github/workflows/native-engine.yml"
    ):
        return {"API"}
    return set()


def check_version_policy(
    base_ui: str, current_ui: str, base_api: str, current_api: str,
    changed_paths: list[str],
) -> list[str]:
    base = {
        "UI": parse_version(base_ui, "UI"),
        "API": parse_version(base_api, "API"),
    }
    head = {
        "UI": parse_version(current_ui, "UI"),
        "API": parse_version(current_api, "API"),
    }
    required: set[str] = set()
    for path in changed_paths:
        required.update(components_for_path(path))
    if not required:
        required.add("UI")  # Documentation and infrastructure-only PRs.
    failures = []
    for component in ("UI", "API"):
        before, after = base[component], head[component]
        version = ".".join(map(str, before))
        if after < before:
            failures.append(f"{component}: version decreased below base {version}")
        elif component in required and after == before:
            failures.append(
                f"{component}: PR must increase version from {version} (usually PATCH +1)"
            )
    return failures


def git(*args: str) -> str:
    return subprocess.check_output(
        ["git", *args], cwd=ROOT, stderr=subprocess.PIPE, text=True
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="Base commit or ref")
    args = parser.parse_args()
    try:
        changed_paths = [
            path for path in git("diff", "--name-only", args.base, "HEAD").splitlines()
            if path
        ]
        base_ui = git("show", f"{args.base}:{UI_PATH}")
        base_api = git("show", f"{args.base}:{API_PATH}")
        current_ui = (ROOT / UI_PATH).read_text(encoding="utf-8")
        current_api = (ROOT / API_PATH).read_text(encoding="utf-8")
        errors = check_version_policy(
            base_ui, current_ui, base_api, current_api, changed_paths
        )
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"PR version policy error: {error}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print("VERSION CHECK FAILED: " + error, file=sys.stderr)
        print("See AGENTS.md: Regla obligatoria de versionado para todo PR",
              file=sys.stderr)
        return 1
    print(f"Version policy passed ({len(changed_paths)} changed files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
