# AD4 Studio — Mobile UI regression suite

## Target and test principles

- Target: `FFAdv4Manager_cura` built from its pinned MosaicSlicer submodule with the same overrides used by GitHub Pages.
- Browser: Chromium via Playwright in GitHub Actions; desktop 1280×800 and mobile 390×844 / 320×568. These are **emulated viewports**, not physical-device verification.
- Public preview: `window.__AD4_STATIC_PREVIEW__=true`, demo STL is present, the browser never sends jobs to real printer hardware. Server-side CuraEngine must remain disabled in Pages.
- Reproduction: `bash scripts/install.sh` (including submodules); run local Pages variant using `.github/workflows/ci.yml` and `tests/ui/pages_browser_smoke.py`.
- CI saves `/tmp/ad4-pages-*.png` and uploads an artifact `ad4-pages-browser-screenshot` on both successes and failures. Inspect screenshots at each change; do not declare a mobile issue fixed from desktop screenshots alone.

## Regression matrix

| ID | Scenario | Assertion / evidence |
| --- | --- | --- |
| R01 | Startup / demo mesh | No permanent Loading overlay; demo STL loads real 3D geometry; no JS errors |
| R02 | Import STL | A second STL can be loaded into the viewer |
| R03 | Remove model | Last mesh removal clears label, state, actions, and serialized view-state (pending focused-model scenario) |
| R04 | Print at 320×568 | Header visible, content inside viewport, sidebar has one scrollable region, bottom rows reachable |
| R05 | Print at 390×844 | No fixed Save profile over inputs; Quality values not clipped by their accordion |
| R06 | Print at 1280×800 | Visible Quality controls, desktop spacing, no overflow |
| R07 | Profiles & filters | Process and material selectors, checkbox not overlapped; pane fully scrolls with content |
| R08 | Categories | Quality, Strength, Speed, Support, Material have native Cura content when present |
| R09 | Global search | `temperature` from Quality returns material settings; X clears term |
| R10 | Empty/single accordions | Empty groups hidden; single-setting category header not wasteful |
| R11 | Filament route | Changes to Filament route and activates Material category with usable controls |
| R12 | Printer route | Displays printer status and controls or explicit preview-only limitation |
| R13 | Camera from editor | Shows printer/camera unavailable view on Pages; does not look like a dead click |
| R14 | Slice from editor | Shows explicit server-side CuraEngine unavailable view and never invokes Pages slicing |
| R15 | Header status menu | Opens/closes, ARIA expanded updates, shortcuts work; Source Code points to this repository |
| R16 | Toast | Dismissible, non-blocking notification with adequate contrast |
| R17 | Navigation | No icon magnification/layout shift; single active nav mode; other views hide editor toolbar |
| R18 | Transform | Three 44px numeric axes; slider and numeric sync; 5-step snap; 45-degree Z rotation |
| R19 | Resize | Lock proportions checkbox; rotate shortcut hidden in Move and Scale |
| R20 | Accessibility | Labels for sliders, value inputs, Cura settings and profile picker; hidden legacy auto-slice absent from focus |
| R21 | Small-device overflow | `documentElement.scrollWidth <= innerWidth + 1`; interactive targets reachable |
| R22 | Project settings | App cards scroll; code link always reachable |
| R23 | Real server | Protected API, printer manager, real CuraEngine slice, GX upload/print — requires separate integration test and auth; **not verified by Pages smoke** |

## Required screenshot states

For each mobile width, save: Print default, Print after scrolling / expanded native catalog, Filament Material, Printer preview-mode, Transform Scale, Slice unavailable, final Preview. Desktop captures initial and Print where needed. Keep CI artifacts for 14 days.

## Remaining physical checks before a production claim

On Android/iOS hardware, repeat 320-like narrow device and 390px device checks with touch, software keyboard, safe-area insets, focus order and screen reader. On protected Linux host, independently verify camera frames, server CuraEngine G-code/GX, printer storage and printing; **do not** run those tests against GitHub Pages.
