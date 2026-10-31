# Unified 3D viewport diagnostics

AD4 Studio displays editor/slicer failures inside `#viewer #ad4-viewer-error`,
at the bottom-left of the model or G-code layer viewport. The yellow background
and red text communicate a blocking or actionable error, not normal status.

The panel uses **textContent** (never HTML) for imported filenames and server
responses. Source priorities: invalid plate > import errors > slicing failure >
printer transfer > G-code preview failure > backend availability > rejected
action. Safety errors stay visible until resolved. **Imports, cloning and transformations
are always editable**, including models outside the bed or colliding with each
other. Only **Slice and STL export** are disabled until the authoritative
Three.js model-viewer passes validation. This lets users correct oversized
models instead of losing their work.

## Code inventory

| Codes | Origin | Resolution |
| --- | --- | --- |
| `BED_X_MIN`, `BED_X_MAX` | Model transformed past left/right X edge | Move/scale or Arrange. Alert names model and measured overflow in mm. |
| `BED_Y_MIN`, `BED_Y_MAX` | Model transformed past front/rear build plate edge | Move/scale or Arrange. Uses scene Z coordinate as printer Y. |
| `BELOW_BED`, `HEIGHT_OVERFLOW` | Model below the bed or higher than 250 mm | Reorient or resize model. |
| `MODEL_COLLISION` | Convex projected model footprints overlap | Separate models or Arrange. Identifies both names. |
| `INVALID_GEOMETRY` | Invalid mesh, coordinates or degenerate bounds | Repair or replace model. |
| `PLATE_CHECK_FAILED`, `PLATE_CHECK_UNAVAILABLE` | Model geometry cannot be validated or viewer bridge missing | Blocking, fail closed; refresh/check browser logs. |
| `EMPTY_PLATE` | No 3D models loaded | Add an STL/3MF; Slice disabled, no noisy warning on initial empty preview. |
| `INVALID_TRANSFORM_VALUE` | Non-finite, nonpositive or unreasonably large numeric parameter | Correct the numeric value. A finite out-of-bed move or oversize dimension is allowed. |
| `FILE_UNSUPPORTED`, `FILE_TOO_LARGE`, `FILE_READ_FAILED` | STL/3MF file selection or browser FileReader | Choose supported file below 250 MB with readable data. |
| `MODEL_LOAD_FAILED`, `MODEL_DEMO_FAILED` | STL/3MF parser, worker or sample load | Re-upload or repair geometry. |
| `GCODE_MISSING`, `GCODE_PARSE_FAILED`, `GCODE_DEMO_FAILED` | Layer viewer or sample toolpath load | Re-slice or load a valid demo. |
| `MODEL_RENDER_FAILED`, `LAYER_RENDER_FAILED` | Three.js failed to draw the model or construct/render layer toolpaths | Check GPU/browser compatibility or faulty geometry and reload. |
| `WEBGL_CONTEXT_LOST` | Browser graphics context lost | GPU/context restore event clears error; otherwise reload. |
| `ENGINE_UNAVAILABLE` | Server CuraEngine status endpoint failed / is offline | Check server installation and connection. GitHub Pages deliberately has no backend. |
| `SLICE_FAILED` | CuraEngine rejected the request, network failed or server returned error | Investigate the reported cause, geometry and server. |
| `PRINT_TRANSFER_FAILED` | Printer upload/send/print command failed while viewing layers | Verify printer connection, remote file or G-code safety warning. |

## Audit scope and exclusions

The code paths examined include `model_viewer` import/transform/registry,
`file.mjs` and FileReader, `ad4-stl-worker-client`,
`ad4-plate-layout`, `ad4-plate-operations`, `slicer.mjs`,
`actions.mjs`, `gcode_viewer.mjs`, `parser.mjs`,
`renderer.mjs`, `ad4-studio.js`, `ad4-v3.js`, and `ad4-manager.js`.

Printer dashboard-only issues such as timelapse recording, webcam failures,
printer telemetry or profile configuration remain in their respective manager
cards. Their normal status is not elevated into the **3D model/layer viewport**.
A failed upload or send initiated from the layer viewport *is* elevated.

The geometry checker conservatively **marks as not sliceable** any overlap of the full projected
3D bounding volumes, not only a top/bottom surface intersection. As a result
it may mark some mathematically non-intersecting, nested objects as unsafe for
slicing; users can still edit the models freely. Auto Arrange adds
2 mm separation between convex footprints when a safe arrangement is found.
If it cannot fit the plate, it leaves existing positions unchanged. Clone still
creates the new model and allows manual resizing or movement. This is **not** a slicer setting:
brim/skirt clearances and other print-process constraints remain CuraEngine's
responsibility.

A new user-visible PR changes the UI's own semantic version in
`overlays/mosaic/public/ad4-v3.js` as required by `AGENTS.md`.
