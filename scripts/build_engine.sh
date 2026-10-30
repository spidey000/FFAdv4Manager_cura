#!/usr/bin/env bash
# Native CuraEngine fork compiled locally. Prereqs: compiler C++20, cmake, git.
# Python packages are isolated in .venv; engine artifacts live in .local/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
test -x .venv/bin/python || { echo "Run scripts/install.sh first"; exit 1; }
command -v cmake >/dev/null || { echo "Install CMake 3.20+ and a C++20 compiler first"; exit 1; }
export CONAN_HOME="${AD4_CONAN_HOME:-$ROOT/.local/conan2}"
git submodule update --init vendor/mosaic-slicer
git -C vendor/mosaic-slicer submodule update --init third_party/CuraEngine third_party/conan-config
.venv/bin/python -m pip install 'conan==2.7.1'
ENGINE="$ROOT/vendor/mosaic-slicer/third_party/CuraEngine"
CONFIG="$ROOT/vendor/mosaic-slicer/third_party/conan-config"
.venv/bin/conan config install -t dir "$CONFIG"
.venv/bin/conan profile detect --force
mkdir -p .local/curaengine/build .local/curaengine/bin
.venv/bin/conan install "$ENGINE" -of "$ROOT/.local/curaengine/build" \
  -s build_type=Release -s compiler.cppstd=20 --build=missing \
  -c tools.build:skip_test=True -o '&:enable_arcus=False' -o '&:enable_plugins=False'
# cmake_layout() places generators below build/Release/generators, not directly
# under --output-folder. Require one generated toolchain instead of guessing.
mapfile -t TOOLCHAINS < <(find "$ROOT/.local/curaengine/build" -type f -name conan_toolchain.cmake)
test "${#TOOLCHAINS[@]}" -eq 1 || { echo "Expected one Conan toolchain, found ${#TOOLCHAINS[@]}"; exit 1; }
cmake -S "$ENGINE" -B "$ROOT/.local/curaengine/build/native" \
  -DCMAKE_TOOLCHAIN_FILE="${TOOLCHAINS[0]}" -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_ARCUS=OFF -DENABLE_PLUGINS=OFF -DENABLE_TESTING=OFF
cmake --build "$ROOT/.local/curaengine/build/native" --config Release -j "${AD4_BUILD_JOBS:-2}"
BIN="$ROOT/.local/curaengine/build/native/CuraEngine"
test -x "$BIN" || { echo "CuraEngine binary not found"; exit 1; }
cp "$BIN" "$ROOT/.local/curaengine/bin/CuraEngine"
echo "Server native CuraEngine available at .local/curaengine/bin/CuraEngine"

