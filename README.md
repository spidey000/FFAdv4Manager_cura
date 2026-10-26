# FFAdv4Manager Cura — FlashForge Adventurer 4 only

A self-hosted CuraEngine web slicer and **FlashForge Adventurer 4 printer manager**. Built from [FFAdv4Manager](https://github.com/spidey000/FFAdv4Manager) and [Symple Slicer](https://github.com/SynDaverCO/symple-slicer).

**One printer: Adventurer 4, 220 × 200 × 250 mm, 0.4 mm nozzle. One default filament: Artillery PLA Basic.** Other printer profiles are not exposed by this application. Both the original CLI implementation and its complete web printer manager are retained.

## Agent installation prompt (copy/paste)

```text
Install https://github.com/spidey000/FFAdv4Manager_cura for my ONE FlashForge Adventurer 4. Use Linux on the same LAN as the printer. Clone this repository with its pinned submodule and run bash scripts/install.sh. Do not install any Python package globally: use ONLY .venv/bin/python and .venv/bin/ffadv4manager-cura. Keep npm dependencies under frontend/node_modules. Preserve the pinned Symple Slicer CuraEngine WebAssembly bundle. Build the frontend and show me read-only printer status first. Ask for my printer LAN IP (do not guess it). Bind port 8765 to 127.0.0.1 only. If I request remote HTTPS, use Cloudflare Tunnel and Cloudflare Access; configure the documented CF_ACCESS_* environment variables and run ffadv4manager-cura --require-access. Do not expose raw FlashForge TCP 8899 or camera 8080, do not open router ports. Never submit a print/upload/motion command without asking me first. Report each verified functionality and any untested hardware behavior.
```

## GitHub Pages — browser-only demo

Automatic deployment: **https://spidey000.github.io/FFAdv4Manager_cura/**

The `Deploy Cura preview to GitHub Pages` workflow publishes a Vite build plus the
pinned CuraEngine WebAssembly slicer and **only the Adventurer 4 / Artillery PLA**
application profiles. Visitors can load a model, slice it and download G-code.

**Pages cannot run the Python CLI or access your LAN printer.** It intentionally
disables printing, uploading and printer management. For genuine remote control
keep using the self-hosted server with Cloudflare Tunnel + Access described below.

**Enable Pages once:** open the repository on GitHub → **Settings → Pages →
Build and deployment → Source → GitHub Actions**. On subsequent pushes to
`main`, the workflow builds and publishes the site. Manual runs are also
available through **Actions → Deploy Cura preview to GitHub Pages → Run workflow**.
If Pages has not yet been enabled, the first deployment may fail at the
`configure-pages` stage until this setting is changed.

No Python environment is needed on GitHub Pages: it serves static assets only.
The local/server edition below still uses an isolated `.venv` and
`frontend/node_modules` as requested.

## Installation (Linux)

Requirements: Python 3.9+ with `venv`, Git, Node.js 20+, npm, working Internet during installation. The printer is on the same trusted LAN as the server.

```bash
git clone https://github.com/spidey000/FFAdv4Manager_cura.git
cd FFAdv4Manager_cura
bash scripts/install.sh
.venv/bin/ffadv4manager config set --host YOUR_PRINTER_LAN_IP
.venv/bin/ffadv4manager status --json  # read-only
.venv/bin/ffadv4manager-cura
```

Open `http://127.0.0.1:8765/` **on the server machine**. For remote use, configure **Cloudflare Tunnel + Cloudflare Access** and launch `.venv/bin/ffadv4manager-cura --require-access`. The bridge binds to `127.0.0.1` only; keep the private HTTP origin inaccessible to the Internet. `--require-access` intentionally fails closed if Access configuration is missing. Follow the original [Cloudflare deployment guide](https://github.com/spidey000/FFAdv4Manager/blob/main/docs/DEPLOY_CLOUDFLARE.md) for the required identity claims.

### Isolation and reproducibility

* All Python packages are installed into `.venv/`, never into system Python; do **not** use `sudo pip` or `--break-system-packages`.
* Node packages are installed under `frontend/node_modules/` with `npm ci`, using the committed `package-lock.json`.
* CuraEngine is the **pinned WebAssembly binary** provided by the AGPL-3.0 Symple Slicer submodule. It runs inside the browser, and does **not** need a global Cura or CuraEngine installation. It is not a Python dependency.
* The source checkout includes only the AD4 application profiles; the pinned vendor submodule contains its upstream code/resources, but additional printers are not registered in the UI. External profile lists are overridden with the local single-printer list.
* The installer downloads packages and the submodule on first installation. A `venv` is isolated, **not automatically an offline bundle**; a fully air-gapped installer would additionally require vendored wheels and npm packages.

## Mobile-first workflow

The mobile interface follows the **Three_slicer_responsive** layout: a full-height 3D viewport, compact quick-action bar at the bottom, and a collapsible Cura settings sheet that rises above the viewport. The native Cura controls are preserved inside the sheet; the slicing engine and single-printer profiles are unchanged.

1. Tap **Model (+)** in the bottom bar to load an STL, OBJ or 3MF file (up to 100 MB). The model is passed into Cura's own loader; the desktop editor's native file picker remains usable.
2. Tap **Settings (⚙)** to open the bottom sheet. Configure the default **FlashForge Adventurer 4** printer, **Artillery PLA Basic** material and process parameters with native Cura controls. Close with **×**, the backdrop, or Escape. On desktop the normal Cura panel remains visible.
3. Tap **Slice model** to invoke CuraEngine directly from the bottom bar. The view stays unobstructed while the model is prepared. Once real G-code is available, **Re-slice** becomes available.
4. When G-code is ready, the bottom bar splits into **Print** (upload GX and request a print start) and **Upload only** (store without requesting a start). Both actions use the original authenticated FFAdv4Manager bridge and show confirmation before contacting the printer. Upload-only is subject to firmware behavior.
5. Tap the **AD4 status button** in the top bar to open the full printer manager: live status, temperature, camera, stored files, controls and diagnostics. This is available only on your self-hosted server.
6. On **GitHub Pages**, there is no printer connection: the action is **Download G-code**, and the printer manager does not appear.

To use layer preview after slicing, open **Settings** and select **Print and Preview** from Cura's built-in page selector. Changes to a Cura model or print parameter invalidate older G-code, so re-slice before sending.

**Remote use:** serve the application privately through Cloudflare Tunnel + Access. GitHub Pages is only a slicing demonstration, never a printer controller.

The source filename is retained (ASCII-normalized by the CLI), and GX upload names are prefixed with available time/filament metadata, for example `01_02_1.23m_Benchy.gx`. Unknown estimates are **not fabricated**. The GX converter includes a header and BMP thumbnail support. The shell attempts to capture an 80×60 thumbnail from the Cura WebGL canvas and embeds it as G-code comments for GX conversion; if WebGL capture fails the converter uses a blank image. The firmware display preview has not been confirmed for this flow.

**Safety:** The material profile starts conservatively with 205 °C nozzle (210 °C first layer), 55 °C bed and controlled print speeds, not a calibrated manufacturer-certified preset. Always inspect the model and G-code; verify the physical printer in person before unattended operation. An upload-only command is not a manufacturer guarantee that every firmware revision will avoid starting the print.

## Project structure

| Component | What it does |
|---|---|
| `vendor/symple-slicer/` | Pinned AGPL CuraEngine WebAssembly / Three.js web slicer |
| `cura-profiles/` | Single-machine Cura definitions and default Artillery PLA preset |
| `frontend/` | Mobile-first 3D viewer, bottom Cura settings sheet, safe same-origin slicer bridge and existing printer manager |
| `server/cura_bridge.py` | Serves Cura from the pinned submodule and profile files through the same-origin bridge |
| `server/ad4_bridge.py` | Original printer API, JWT Access checks, upload/jobs and timelapse |
| `ffadv4manager/` | The unchanged LAN printer CLI, GX converter, and thumbnail/metadata utilities |
| `scripts/install.sh` | `venv` creation, dependency installation and frontend build |

The core LAN transport, auth and upload APIs are copied from upstream FFAdv4Manager at commit `3aba69cd9661d76b5591d5a577fa4348bc111831`. Browser Cura is supplied by Symple Slicer at commit `6e580c4591c90ac235c6a5dd8e9a58c1faf82c39`. The FlashForge machine JSON comes from `Ultimaker/Cura/resources/definitions/flashforge_adventurer4.def.json` and its base/extruder definition. Filament temperature range: [Artillery Basic PLA](https://es.store.artillery3d.com/products/pla-basic-1).

## Tests

```bash
.venv/bin/python -m pip install pytest
.venv/bin/python -m pytest -q tests
npm test --prefix frontend
npm run build --prefix frontend
```

Printer hardware is **not tested** by installing or running CI. The original frontend ThreeSlicer UI is not the default in this fork; the pinned Symple interface replaces the slicer while preserving the original PrinterManager implementation.

## Licenses

AGPL-3.0-or-later applies to the web UI and Symple Slicer; the imported FFAD4Manager CLI is GPL-3.0-or-later. Preserve the original license notices and publish the corresponding source when required by these licenses. This repository is not affiliated with FlashForge, Cura/UltiMaker, SynDaver, or Artillery.

## Camera, uploads and MP4 timelapses

The local bridge now exposes an on-demand, authenticated MJPEG stream (never the camera LAN URL), a paginated printer-file viewer with metadata learned only from uploads made by this host, and an MP4 timelapse gallery with HTML5 seek/download. Timelapses are recorded by a server-owned process and survive closing the browser. Auto recording is opt-in per print; if FFmpeg fails after printing has started, the API reports `timelapse_error` without pretending the print was cancelled. A recovered session is encoded at server restart when JPEG frames exist. The Python venv includes `imageio-ffmpeg` to provide an FFmpeg binary without global package installation (host FFmpeg is fallback). This is interval-based capture; hardware layer synchronization is not guaranteed.

## Mobile Cura settings and profiles

The **Settings** drawer controls the pinned CuraEngine slicer through its real getOption/setOption interface, never replacing the engine. It has full-width Quality/Strength/Speed/Support/Material tabs, Basic/Advanced/Expert filters, descriptions on parameter taps, yellow reset indicators for modified values, soft-green expanded presets, and responsive mobile controls. Custom process and material presets are browser-local, with save/update/delete operations. Only the Adventurer 4 machine is available. Changing settings invalidates previously sliced G-code; enabling **Auto slice** triggers a new slice after settings are changed in the drawer when a model is loaded. The **Timelapse** toggle opts in per remote print. The printer API still blocks excessive Artillery PLA temperatures.
