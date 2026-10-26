# FFAdv4Manager Cura · MosaicSlicer · Adventurer 4

The old React/Symple interface has been **completely replaced by [MosaicSlicer](https://github.com/ading2210/MosaicSlicer)**. The upstream source is pinned as a git submodule; our modifications live in `overlays/mosaic/` and are applied reproducibly by `scripts/prepare_mosaic.py`.

**CuraEngine slicing takes place only on the local Linux server.** The browser displays MosaicSlicer's model editor, settings, and G-code preview, but never loads or runs a CuraEngine WASM worker. The printer manager still uses the original FFAdv4Manager LAN CLI.

## Requirements and installation

- Linux machine on the same LAN as the printer, Python 3.10+, Node.js 20+, npm and git.
- **Native MosaicSlicer/CuraEngine** executable with support for `-r` resolved settings JSON (ordinary CuraEngine binaries might not support it).
- For building native engine: a C++20 compiler, CMake 3.20+, build tools and access to the UltiMaker/Conan dependency remotes.

```bash
git clone https://github.com/spidey000/FFAdv4Manager_cura.git
cd FFAdv4Manager_cura
bash scripts/install.sh
bash scripts/build_engine.sh
.venv/bin/ffadv4manager config set --host YOUR_ADVENTURER4_LAN_IP
.venv/bin/ffadv4manager status --json
.venv/bin/ffadv4manager-cura
```

Open `http://127.0.0.1:8765/` on the Linux server. Installation creates `.venv/` for all Python packages, `frontend/node_modules/` for MosaicSlicer dependencies, and `.local/curaengine/` for the natively compiled engine. No Python packages are installed globally.

The **native engine compilation has not yet been tested successfully in CI**. `scripts/build_engine.sh` is the build recipe; if it fails due to a missing C++ dependency, the web server can still display MosaicSlicer but will **not** slice until a compatible binary is installed. Alternatively set `AD4_CURAENGINE_BIN=/absolute/path/to/CuraEngine` to a verified compatible executable. The HTTP endpoint `/api/slice/engine` reports whether the executable is configured.

## What runs where

```text
Browser: MosaicSlicer viewer · editable Cura settings · G-code preview
  POST /api/slice (STL + resolved Cura settings)
      ↓
Local Linux server: Python API in .venv → native CuraEngine -r → G-code
      ↓
Browser: preview and optional export
      ↓ upload / print from Printer manager
FFAdv4Manager CLI → GX (thumbnail + metadata) → FlashForge Adventurer 4 LAN
```

Only the **Adventurer 4**, 220 × 200 × 250 mm with a 0.4 mm nozzle, is configured. The starting filament settings correspond to **Artillery PLA Basic**: 205 °C nozzle, 210 °C first layer, and 55 °C bed. Other printer models are not selectable. The server locks the machine dimensions, single extruder and firmware start/end G-code and applies safety limits to temperatures and speeds.

The **Printer manager** provides read-only status and diagnostics plus the supported existing CLI controls for stored files, camera, fan, pause/resume/cancel, timelapse, upload-only and send & print.

## Secure remote usage

For remote access, publish the loopback-only service through **Cloudflare Tunnel + Cloudflare Access** and launch `.venv/bin/ffadv4manager-cura --require-access`, with server-side `CF_ACCESS_*` variables set according to [deployment documentation](docs/DEPLOY_CLOUDFLARE.md). Never expose printer TCP port 8899 or camera port 8080 to the public internet.

GitHub Pages cannot execute server-side CuraEngine. The former Pages slicer is removed and its public URL displays a notice pointing to this server-only repository.

## Tests and provenance

The repository ships GitHub Actions checks for the isolated frontend compilation, server-side request validation, CLI/GX regressions and printer bridge smoke tests. CI does **not** compile native CuraEngine or physically operate your printer; fully successful end-to-end slicing and printing require supervised verification on your hardware.

MosaicSlicer upstream is AGPL-3.0-only; CuraEngine is AGPL-3.0; the imported FFAdv4Manager CLI retains GPL-3.0-or-later notices. Preserve all upstream attribution and comply with AGPL network-use source obligations.
