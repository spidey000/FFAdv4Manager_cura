#!/usr/bin/env bash
# Native CuraEngine fork compiled locally. Prereqs: compiler C++20, cmake, git.
# Python packages are isolated in .venv; engine artifacts live in .local/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
test -x .venv/bin/python || { echo "Run scripts/install.sh first"; exit 1; }
git submodule update --init vendor/mosaic-slicer
git -C vendor/mosaic-slicer submodule update --init third_party/CuraEngine third_party/conan-config
.venv/bin/python -m pip install 'conan==2.7.1'
ENGINE="$ROOT/vendor/mosaic-slicer/third_party/CuraEngine"
CONFIG="$ROOT/vendor/mosaic-slicer/third_party/conan-config"
.venv/bin/conan config install -t dir "$CONFIG"
.venv/bin/conan profile detect --force
mkdir -p .local/curaengine/build .local/curaengine/bin
.venv/bin/conan install "$ENGINE" -of "$ROOT/.local/curaengine/build" -s build_type=Release --build=missing -o enable_arcus=False -o enable_plugins=False
cmake -S "$ENGINE" -B "$ROOT/.local/curaengine/build" -DCMAKE_TOOLCHAIN_FILE="$ROOT/.local/curaengine/build/conan_toolchain.cmake" -DCMAKE_BUILD_TYPE=Release -DENABLE_ARCUS=OFF -DENABLE_PLUGINS=OFF -DENABLE_TESTING=OFF
cmake --build "$ROOT/.local/curaengine/build" --config Release -j 2
BIN="$(find "$ROOT/.local/curaengine/build" -type f -name CuraEngine -perm -111 | head -n1)"
test -n "$BIN" || { echo "CuraEngine binary not found"; exit 1; }
cp "$BIN" "$ROOT/.local/curaengine/bin/CuraEngine"
echo "Server native CuraEngine available at .local/curaengine/bin/CuraEngine"
