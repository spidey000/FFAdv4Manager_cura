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
if [[ "$(printenv AD4_BUILD_CURAENGINE || true)" == "1" ]]; then
  bash scripts/build_engine.sh
elif [[ ! -x ".local/curaengine/bin/CuraEngine" && -z "$(printenv AD4_CURAENGINE_BIN || true)" ]]; then
  echo "WARN: Mosaic UI installed, but server-side native CuraEngine not installed."
  echo "Build native engine with: AD4_BUILD_CURAENGINE=1 bash scripts/install.sh"
  echo "or set AD4_CURAENGINE_BIN to a MosaicSlicer/CuraEngine binary supporting -r."
fi
echo "Run local: .venv/bin/ffadv4manager-cura"
echo "Run private: .venv/bin/ffadv4manager-cura --require-access"
