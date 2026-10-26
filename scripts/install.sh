#!/usr/bin/env bash
# Install without touching global site-packages or using sudo.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v python3 >/dev/null || { echo 'Python 3 is required'; exit 1; }
command -v git >/dev/null || { echo 'Git is required'; exit 1; }
command -v node >/dev/null || { echo 'Node.js 20+ is required'; exit 1; }
command -v npm >/dev/null || { echo 'npm is required'; exit 1; }
cd "$ROOT"
echo "== Installing pinned CuraEngine WASM web UI"
git submodule update --init vendor/symple-slicer
test -f vendor/symple-slicer/src-app/lib/slicing-engines/CuraEngine/CuraEngine.wasm || {
  echo 'CuraEngine.wasm missing from submodule'; exit 1;
}
echo "== Creating private Python virtual environment at $ROOT/.venv"
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e .
echo "== Installing project-local Node dependencies"
npm ci --prefix frontend
npm run build --prefix frontend
echo ""
echo "Installation complete. Nothing installed into global Python site-packages."
echo "Configure the LAN printer with:"
echo "  $ROOT/.venv/bin/ffadv4manager config set --host YOUR_PRINTER_LAN_IP"
echo "Start local-only UI with:"
echo "  $ROOT/.venv/bin/ffadv4manager-cura"
echo "Open http://127.0.0.1:8765/"
echo "For Cloudflare Tunnel + Access use --require-access and the CF_ACCESS_* environment vars."
