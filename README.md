# FFAdv4Manager Cura — FlashForge Adventurer 4 only

A self-hosted CuraEngine web slicer and **FlashForge Adventurer 4 printer manager**. Built from [FFAdv4Manager](https://github.com/spidey000/FFAdv4Manager) and [Symple Slicer](https://github.com/SynDaverCO/symple-slicer).

**One printer: Adventurer 4, 220 × 200 × 250 mm, 0.4 mm nozzle. One default filament: Artillery PLA Basic.** Other printer profiles are not exposed by this application. Both the original CLI implementation and its complete web printer manager are retained.

## Agent installation prompt (copy/paste)

```text
Install https://github.com/spidey000/FFAdv4Manager_cura for my ONE FlashForge Adventurer 4. Use Linux on the same LAN as the printer. Clone this repository with its pinned submodule and run bash scripts/install.sh. Do not install any Python package globally: use ONLY .venv/bin/python and .venv/bin/ffadv4manager-cura. Keep npm dependencies under frontend/node_modules. Preserve the pinned Symple Slicer CuraEngine WebAssembly bundle. Build the frontend and show me read-only printer status first. Ask for my printer LAN IP (do not guess it). Bind port 8765 to 127.0.0.1 only. If I request remote HTTPS, use Cloudflare Tunnel and Cloudflare Access; configure the documented CF_ACCESS_* environment variables and run ffadv4manager-cura --require-access. Do not expose raw FlashForge TCP 8899 or camera 8080, do not open router ports. Never submit a print/upload/motion command without asking me first. Report each verified functionality and any untested hardware behavior.
```

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

## User workflow

1. Open the Cura tab, load an STL/3MF and select the **FlashForge Adventurer 4** and **Artillery PLA Basic** presets.
2. Click **Slice** inside Cura; CuraEngine slices inside the browser and previews G-code.
3. Use **Upload only** or **Send & print** in the bottom action bar. The server sends the G-code to the unchanged local CLI, which converts it to GX and uploads to the printer.
4. Open **Printer manager** for temperatures/status, camera snapshot, stored files, discovery, profiles, diagnostics, fan, pause/resume/cancel, timelapse and notifications.

The source filename is retained (ASCII-normalized by the CLI), and GX upload names are prefixed with available time/filament metadata, for example `01_02_1.23m_Benchy.gx`. Unknown estimates are **not fabricated**. The GX converter includes a header and BMP thumbnail support. A Cura-generated G-code file may lack an embedded bitmap thumbnail; the firmware display preview has not been confirmed for this flow.

**Safety:** The material profile starts conservatively with 205 °C nozzle (210 °C first layer), 55 °C bed and controlled print speeds, not a calibrated manufacturer-certified preset. Always inspect the model and G-code; verify the physical printer in person before unattended operation. An upload-only command is not a manufacturer guarantee that every firmware revision will avoid starting the print.

## Project structure

| Component | What it does |
|---|---|
| `vendor/symple-slicer/` | Pinned AGPL CuraEngine WebAssembly / Three.js web slicer |
| `cura-profiles/` | Single-machine Cura definitions and default Artillery PLA preset |
| `frontend/` | Responsive shell, embedded Cura slicer and existing printer manager |
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
