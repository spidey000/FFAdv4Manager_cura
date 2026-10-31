"""Independently identifiable running Python backend build.

The semantic version follows pyproject.toml. Git is optional: source archives
still expose their real package version without inventing a commit hash.
"""
from importlib.metadata import PackageNotFoundError, version
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def _detect_backend_version():
    try:
        package_version = version("ffadv4manager")
    except PackageNotFoundError:
        # Source checkouts used by tests may not be installed as a distribution.
        source = ROOT / "pyproject.toml"
        try:
            match = re.search(r'(?m)^version\s*=\s*"([^"]+)"', source.read_text(encoding="utf-8"))
        except OSError:
            match = None
        package_version = match.group(1) if match else "unknown"

    revision = os.environ.get("AD4_BACKEND_REVISION", "")
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", revision):
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--verify", "HEAD"],
                cwd=ROOT, capture_output=True, text=True,
                timeout=3, check=False,
            )
            revision = result.stdout.strip() if result.returncode == 0 else ""
        except (OSError, subprocess.TimeoutExpired):
            revision = ""
    return {
        "version": package_version,
        "revision": revision[:8] if re.fullmatch(r"[0-9a-fA-F]{7,40}", revision) else None,
    }


# Snapshot at server import/startup. Git pulls do not retroactively change the
# build identifier of an already-running Python process.
_RUNNING_BACKEND_VERSION = _detect_backend_version()


def backend_version_info():
    return dict(_RUNNING_BACKEND_VERSION)
