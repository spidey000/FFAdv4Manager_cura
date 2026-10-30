# AGENTS.md — FFAdv4Manager_cura / AD4 Studio

> Instructions for coding agents, assistants, reviewers and automation operating on **this repository**. Read this file and the relevant docs before changing code. Actual implementation and tests are authoritative; issue discussions and the backlog are not proof that a feature is shipped.

## Mission and boundaries

Build and maintain a reliable, mobile-first **FlashForge Adventurer 4** web workspace based on pinned MosaicSlicer, **server-only native CuraEngine**, and FFAdv4Manager's LAN CLI. Prefer correct working integration, safe physical actions and clear provenance over impressive but fictional UI. Never pretend a static GitHub Pages demo is a working slicer or printer connection.

- Target printer: Adventurer 4 only, 220 × 200 × 250 mm, 0.4 mm nozzle, one extruder. Default material: **Artillery PLA Basic**. Keep machine geometry, temperature and firmware restrictions consistent across UI, server and GX converter.
- Public Pages: visual/static interactive demo, real Three.js model and settings, demo layer fixture; **no native slice, upload or print**.
- Private Linux service: builds/runs a native CuraEngine with resolved JSON settings support (-r); serves the application and same-origin printer API. Physical actions require a reachable printer and explicit user intent.
- There is no confirmed stock-AD4 command to download G-code from the running job. Never claim M661 or M662 returns print-file bytes. Source provenance must always be visible. See docs/PRINTER_INTEGRATION.md.

## Source map — edit the right file

| Location | Ownership |
| --- | --- |
| `overlays/mosaic/src/gui/` | Edited/overridden Mosaic source modules: slicer integration, settings, presets, contextual help, layer renderer, icons |
| `overlays/mosaic/public/` | AD4 Studio UI, printer manager, live job, styling, demo fixtures |
| `vendor/mosaic-slicer`, `vendor/settings-guide` | **Pinned upstream Git submodules. Do not edit or silently advance** |
| `scripts/prepare_mosaic.py` | Regenerates `frontend/` from pinned submodules + overlays |
| `frontend/` | **Generated and ignored. Never treat it as the source of truth or commit it** |
| `server/cura_bridge.py`, `server/mosaic_slicer.py` | HTTP slice endpoint; native CuraEngine invocation and validation |
| `server/ad4_bridge.py`, `server/manager_tools.py` | Same-origin authenticated bridge and allowlisted printer controls |
| `server/current_job.py`, `server/job_tracking.py`, `server/layer_capture.py` | Active print source provenance, M114 estimated layers and G-code parsing |
| `server/timelapse_service.py` | Server-owned camera capture, session lifecycle and MP4 encoding |
| `ffadv4manager/` | Python CLI, FlashForge LAN transport, config, GX converter, safeguards |
| `cura-profiles/` | Fixed Adventurer 4 Cura printer definition |
| `tests/` | CLI, server, integration, UI and real Chromium smoke tests |
| `.github/workflows/` | CI, native CuraEngine validation, Pages publication |

Read the actual code before assuming a route, setting, menu, tool or command exists. Do not add an undocumented parallel API/controller if the existing manager can be extended.

## Local setup and reproducible checks

Requirements: Linux, Python >=3.10 with venv, Node >=20/npm, git; native build additionally requires CMake >=3.20, Ninja, C++20/GCC >=12 and dependency network access.

~~~bash
git clone --recurse-submodules https://github.com/spidey000/FFAdv4Manager_cura.git
cd FFAdv4Manager_cura
bash scripts/install.sh
.venv/bin/ffadv4manager-cura
~~~

- `bash scripts/install.sh` creates `.venv/`, recreates `frontend/`, builds the frontend and normally builds the native engine. `AD4_SKIP_ENGINE_BUILD=1` is for preview/CI only.
- Do not replace native CuraEngine with WASM, a stub engine or a standard binary lacking the required resolved `-r` interface.
- Smoke check `/api/slice/engine` before asserting that slicing works. When available, native end-to-end validation runs with `.venv/bin/python scripts/verify_native_slicing.py --output-dir /tmp/ad4-native-validation`.
- Python regression: `.venv/bin/python -m pytest -q tests/cli tests/server tests/integration tests/cura tests/ui` (install pytest into the venv if necessary).
- UI regressions: `tests/ui/pages_browser_smoke.py`, `tests/ui/printer_manager_browser.py`, `tests/ui/live_job_browser.py`. Use Chromium with real compiled JS, at **320 × 568, 390 × 844 and 1280 × 800** where applicable. Screenshots alone are not functional tests.
- JavaScript syntax: run `node --check` on modified stand-alone scripts. Build/CI should confirm no missing resources or uncaught browser exceptions.

## Hardware, access and security: mandatory invariants

1. **Never send real printer commands from CI, public Pages or unsupervised agent tests.** Use a fake/simulated transport. For hardware tests, obtain explicit user authorization and clearly distinguish observations from firmware assumptions.
2. Physical uploads and starts are separate operations; upload-only must **not intentionally issue M23/M24**. Preserve confirmation and fail-closed behavior on busy/paused printing. Do not bypass checks with force except for an explicit user request in a suitable context.
3. Recheck filename/source before associating a running print. Preserve provenance labels: retained server upload, user association, or separately verified admin downloader. Unknown source -> camera/position remain usable, geometry unavailable.
4. Do not invent printer features: M114 reports coordinates, M27 progress, M661 filenames, M662 a BMP thumbnail. Layer is **estimated**, not exact executed instruction. Capture by layer is experimental and depends on measured Z + source layer table.
5. Maintain thermal and GX file validation. Never let a missing temperature in GX metadata silently disable safeguards. Verify executable G-code body, GX offsets and maximum sizes.
6. Keep local service loopback-only by default; for remote mode use authenticated Access as specified in docs/DEPLOY_CLOUDFLARE.md. Never expose printer TCP 8899, MJPEG 8080 or arbitrary shell/network proxy routes.
7. Avoid arbitrary server filesystem paths, remote private-network SSRF, unconstrained subprocess commands, insecure auth fallback, persistence of secrets, or user-controlled shell execution.
8. Long transfers, decoding and encoding must not block urgent pause/resume/cancel. Keep actions idempotent or safely serialized where appropriate. Ensure camera streams, jobs and workers clean up correctly.
9. Timelapses are server-owned and should finalize to MP4 even if the browser closes. Distinguish interval capture from estimated-Z triggers. Handle offline/paused/finished cases explicitly.

## UI expectations

- Preserve real Mosaic Three.js geometry and selection; do not replace functional elements with screenshots or hard-coded visual demos.
- Navigation, file/models controls, transform/rulers and settings must work on mobile. No horizontal overflow, clipped bottom actions, unscrollable Print panels or nonfunctional Printer/Filament tabs.
- Keep one coherent Lucide icon language. Controls need semantics, accessible labels, disabled states and feedback; help icon and label open the bundled SettingsGuide modal with scroll, X, Escape and backdrop dismissal.
- Cura settings must map to actual underlying resolved settings, not a small invented subset. Respect preset propagation, category/facet filtering, collapsed-by-default groups, and live value reset behavior.
- Public preview should **visibly explain** why server-only actions are disabled. Never simulate successful physical actions.
- UI may change substantially, but modules should stay separable and lifecycle-managed. Do not mutate the upstream submodules to patch a local UI issue.

## Git and PR process

1. Inspect the newest `main`, relevant PRs/commits, current behavior and regression tests. Prefer a narrow branch + reviewable PR, not silent direct edits to main.
2. Implement root cause fixes, not only visual changes. Keep scoped changes grouped and update regression tests and docs when the user-visible behavior changes.
3. Rebuild the frontend from overlays and test the real browser, not a detached mock or a screenshot only. Exercise both Pages preview and local API flows appropriate to the change.
4. Report exact tests run, hardware not tested, known limitations, and any deploy verification uncertainty. A green mocked CI test does not prove a printer command works on physical hardware.
5. Never merge a PR with failing relevant checks, unresolved conflicts or critical test regressions. Confirm the deployed Pages version when claiming a live UI change.

## Docs, screenshots and agent-maintenance rules

- Maintain **README.md** as the inviting user-facing landing page: screenshots, concrete features, installation, security, limitations, docs entry points. Do not append a second competing historical README to describe each new UI generation.
- README screenshots are genuine **Chromium captures from the public demo**. The Pages job sets `AD4_DOC_SCREENSHOT_DIR` so `tests/ui/pages_browser_smoke.py` exports `frontend/dist/screenshots/ad4-studio-{desktop,mobile}.png` and `ad4-studio-settings-mobile.png`. Pages publishes those files and validates that the links exist. Do **not** invent a screenshot or commit `frontend/`.
- If changing navigation/layout, update the smoke script if its assertions legitimately changed, recapture the same named views, and verify the published images.
- Keep docs/PRINTER_INTEGRATION.md, docs/CLI.md, docs/WEB_API.md, docs/AD4_UI_REGRESSION_TESTS.md and README consistent with actual code. Remove broken paths and stale claims rather than copying them forward.
- Backlog and plans are **not** shipped features. Cite actual PRs/commits for capabilities, and state remaining constraints without euphemisms.
- Preserve the licenses/notices of the CLI (GPL-3.0-or-later) and of MosaicSlicer/CuraEngine/SettingsGuide (AGPL-3.0 and applicable third-party terms).

## State of project at 2026-10-30

Merged PRs #21–#24 improved printer action reliability, connection management, file metadata, live print layers beside the camera, and verified **real native CuraEngine → G-code → GX** flow under simulated printer transport. **Physical printer behavior still needs supervised verification.** Do not interpret the user-requested future preflight/timelapse enhancements as already implemented unless the current code and tests prove it.

When in doubt: **inspect source → reproduce with a test → implement in the correct layer → validate → document only what is proven.**
