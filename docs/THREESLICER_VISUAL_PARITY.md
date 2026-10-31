# ThreeSlicer visual parity in AD4 Studio

## Source and legal provenance

The **MIT-only** standalone ThreeSlicer viewer modules are kept verbatim, apart from converting local imports from `.js` to `.mjs` and a tiny vertex-shader clip for hidden feature types, under `overlays/mosaic/src/gui/viewer/ad4-three-slicer/`.

Upstream repository: https://github.com/kimgh06/Three_Slicer/tree/main/viewer-package

Source:
- `src/core/toolpath_shaders.js` (MIT original shader normals, mitered segment joins, shared color packing and Lambert-style lighting).
- `src/scene/toolpath_mesh.js` (8-vertex, 24-index four-ring bead instancing; range uniforms; actual 2×/4× geometric LOD).
- `src/core/toolpath_segments.js` (two-pass typed-array memory layout, real layer heights, linked path joins).
- `src/core/toolpath_lod.js` (screen-space LOD selection, preservation of base layers and exact detail for cut ranges).
- `toolpath_palette.js`, `toolpath_views.js`, `toolpath_encoding.js`, `viewer_defaults.js`, `theme.js`.

The original [MIT license](../overlays/mosaic/src/gui/viewer/ad4-three-slicer/LICENSE) is included in the source **and published with the compiled Pages files**. No ThreeSlicer/Orca/Prusa AGPL slicer code is incorporated, and native CuraEngine remains the sole slicer.

## Adapter contracts

- The existing G-code parser and FlashForge AD4 printer/export workflows remain authoritative. `ad4-gcode-geometry.mjs` maps parsed G-code to ThreeSlicer's `{z, paths, widths}` contract and preserves original `;TYPE:` names for AD4's category toggles.
- Feature colors follow ThreeSlicer's wall orange, blue infill, green bridge and neutral support palette. The UI swatches and packed shader colors use the same source.
- Unlike our previous 32-vertex-per-bead extrusion, One **instanced draw** handles extrusion across all types and layers; travel lines are a separate optional draw.
- A one-based inclusive layer-range control maps to ThreeSlicer's zero-based uniforms. Unlike visibility-by-group, filtering does not rebuild the GPU mesh.
- Type visibility is encoded as a negative packed color, clipped by a single extra vertex-shader condition. The color buffers and both LODs update together.
- The source uses **true geometry LOD** at 2× and 4×, preserving first/raft/skirt layers. No artificial horizontal dark stripes.
- Per-segment estimated line width uses the filament volume inferred from G-code E commands where meaningful; otherwise uses the existing 0.42 mm fallback.

## Bug and regression checklist

1. Render 3DBenchy on both mobile (390 px) and desktop (1280 px); verify 8 template vertices, 24 indices, correct GPU counts, and no WebGL errors.
2. Layer-cut boundaries must not show higher layers, and must force full detail even when far away.
3. Categorical filtering must actually clip the affected GPU instances; travel must remain optional and non-printing.
4. Check source G-code unchanged for export and print, camera fit and grid alignment, hidden/disposed model reload, unsupported G-code categories, and missing print geometry.
5. Preserve real different layer heights/Z-hop semantics and ensure no NaN vertex data.
6. Run Node/Python tests, native CuraEngine test and published GitHub Pages browser smoke before calling the change complete.

## Known limits

This adapts the full **standalone toolpath-rendering pipeline**, not the ThreeSlicer web app, printer presets, slicing kernel or its React UI. A test in headless Chromium doesn't measure frame rate on a physical Android GPU. Print origin and material profile continue to be determined by our native AD4 server.
