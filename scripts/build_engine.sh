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
.venv/bin/python -m pip install 'conan==2.21.0'
ENGINE="$ROOT/vendor/mosaic-slicer/third_party/CuraEngine"
CONFIG="$ROOT/vendor/mosaic-slicer/third_party/conan-config"
.venv/bin/conan config install -t dir "$CONFIG"
.venv/bin/conan profile detect --force
# The historical cura.jfrog.io remote no longer serves Conan. Bootstrap the
# upstream recipes from pinned public sources; only Conan Center is consulted
# for the remaining third-party dependencies. Keep vendor submodules untouched.
.venv/bin/conan remote disable cura-conan2
fetch_source() {
  local name="$1" url="$2" revision="$3" destination="$ROOT/.local/sources/$1"
  if ! test -d "$destination/.git"; then
    mkdir -p "$destination"
    git -C "$destination" init
    git -C "$destination" remote add origin "$url"
  fi
  git -C "$destination" fetch --depth 1 origin "$revision"
  git -C "$destination" checkout --detach FETCH_HEAD
}
fetch_source conan-ultimaker-index https://github.com/Ultimaker/conan-ultimaker-index.git c4077fc3e719b436d1cdc2032bf3f851b6f089bb
fetch_source scripta https://github.com/Ultimaker/Scripta_public.git b96045cd9b531d97f42dec8c9a0ef52f773f6b90
RECIPES="$ROOT/.local/sources/conan-ultimaker-index/recipes"
for recipe in sentrylibrary npmpackage; do
  .venv/bin/conan export "$RECIPES/$recipe/all" --version=1.0.0
done
.venv/bin/conan export "$RECIPES/standardprojectsettings/all" --version=0.2.0
.venv/bin/conan export "$RECIPES/standardprojectsettings/all" --version=0.2.0 --user=ultimaker --channel=stable
.venv/bin/conan export "$RECIPES/clipper/all" --version=6.4.2 --user=ultimaker --channel=stable
.venv/bin/conan export "$RECIPES/mapbox-wagyu/all" --version=0.5.0 --user=ultimaker --channel=stable
.venv/bin/conan export "$ROOT/.local/sources/scripta" --version=1.1.0 --user=ultimaker --channel=testing
mkdir -p .local/curaengine/build .local/curaengine/bin
.venv/bin/conan install "$ENGINE" -of "$ROOT/.local/curaengine/build" \
  -s build_type=Release -s compiler.cppstd=20 --build=missing \
  -c tools.build:skip_test=True -o '&:enable_arcus=False' -o '&:enable_plugins=False' \
  -o 'clipper/*:shared=False'
# cmake_layout() places generators below build/Release/generators, not directly
# under --output-folder. Require one generated toolchain instead of guessing.
mapfile -t TOOLCHAINS < <(find "$ROOT/.local/curaengine/build" -type f -name conan_toolchain.cmake)
test "${#TOOLCHAINS[@]}" -eq 1 || { echo "Expected one Conan toolchain, found ${#TOOLCHAINS[@]}"; exit 1; }
cmake -G Ninja -S "$ENGINE" -B "$ROOT/.local/curaengine/build/native" \
  -DCMAKE_TOOLCHAIN_FILE="${TOOLCHAINS[0]}" -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_ARCUS=OFF -DENABLE_PLUGINS=OFF -DENABLE_TESTING=OFF
cmake --build "$ROOT/.local/curaengine/build/native" --config Release -j "${AD4_BUILD_JOBS:-2}"
BIN="$ROOT/.local/curaengine/build/native/CuraEngine"
test -x "$BIN" || { echo "CuraEngine binary not found"; exit 1; }
cp "$BIN" "$ROOT/.local/curaengine/bin/CuraEngine"
echo "Server native CuraEngine available at .local/curaengine/bin/CuraEngine"

