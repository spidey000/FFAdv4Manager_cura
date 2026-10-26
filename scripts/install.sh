#!/usr/bin/env bash
# Python stays inside .venv; Node packages remain inside generated frontend/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v git >/dev/null
command -v npm >/dev/null
command -v python3 >/dev/null
git submodule update --init vendor/mosaic-slicer
git -C vendor/mosaic-slicer submodule update --init third_party/Cura third_party/fdm_materials
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e .
.venv/bin/python scripts/prepare_mosaic.py
npm install --prefix frontend --no-audit --no-fund
(cd frontend && bash scripts/bundle_resources.sh)
npm run build:prod --prefix frontend
if [[ ! -x ".local/curaengine/bin/CuraEngine" && -z "$(printenv AD4_CURAENGINE_BIN || true)" ]]; then
  if [[ "$(printenv AD4_SKIP_ENGINE_BUILD || true)" == "1" ]]; then
    echo "Engine build explicitly skipped (CI/test-only). Slicing unavailable."
  else
    echo "== Building local server-side CuraEngine (-r support required)"
    bash scripts/build_engine.sh
  fi
fi
echo "Run local: .venv/bin/ffadv4manager-cura"
echo "Run private: .venv/bin/ffadv4manager-cura --require-access"
