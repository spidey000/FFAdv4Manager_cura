# ThreeSlicer-style GPU instancing for AD4 Studio G-code

## Reference and license
Technical reference: [ThreeSlicer toolpath renderer](https://github.com/kimgh06/Three_Slicer/blob/main/viewer-package/src/scene/toolpath_mesh.js) and [toolpath spec](https://github.com/kimgh06/Three_Slicer/blob/main/viewer-package/TOOLPATH_SPEC.md). ThreeSlicer's standalone viewer is MIT; the slicer kernel is separately AGPL. The implementation here is an independent adapter for AD4 Studio's existing Three.js engine, UI categories, variable G-code Z and page-level scene graph. **Do not import the slicer/kernel or copy AGPL libvgcode code.** Preserve the existing app license.

## Findings
The current AD4 builder expands every extrusion into 32 world-space vertices and 84 indices, duplicating positions across ~90,000 Benchy segments, then stores a shade byte for each vertex. The 10%-darker bevel occupies less than a pixel at fit-to-view and cannot communicate the stacked layer structure in distant views.

## Execution plan
1. Replace each expanded filament with an **InstancedBufferGeometry** using a single reusable 32-vertex chamfered cross-section template. The GPU receives a start/end point, bottom/top, width and layer ID per extrusion.
2. Preserve one group per G-code layer and one mesh per category: category toggles and the 1-based inclusive layer-range API continue to operate without rebuilding geometry. Travel remains separate, unextruded and translucent.
3. Use `MeshBasicMaterial` shader augmentation (no second pass, lights or shadow maps) for the physical chamfer plus **screen-space adaptive seam contrast** based on projected pixels per layer. Show every join when close; every 2/4/8 joins as needed at distance. It is a visual effect, never a change to G-code or Z heights.
4. Explicitly set the actual world-space bounding boxes and spheres because the instanced template's bounds are not representative. Release instance attributes, shared shader programs and travel geometry correctly on reload.
5. Keep heavy-file cooperative yields, limit source point sampling only as a fallback for extreme toolpaths, preserve printed paths and category colors, and keep small devices usable.
6. Test physically correct 0.08/0.2/0.4/0.6 mm heights, material visibility, layer scrubbing, zoom-adaptive shader compilation, closed-bead colors, memory budget, 3DBenchy screenshot (mobile and desktop) and fallback behavior.
7. Review CI and targeted browser logs, fix regressions, merge only when green, then verify the actual GitHub Pages deploy.

## Acceptance
- Original 241-layer 3DBenchy loads with full width/height and correct colors.
- GPU instance buffer footprint is materially lower than expanded vertices; no extra per-layer shader program or GPU draw calls.
- Layers visible both close and far, without physically moving beads or adding geometry to the G-code.
- Toggle/range, G-code export and printer safety remain intact.
- CI and the published Pages smoke check pass.
