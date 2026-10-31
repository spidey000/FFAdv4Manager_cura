/* ThreeSlicer-style warm walls / cool infill feature palette for the GPU renderer and AD4 legend.
 * Cura emits WALL-OUTER / SKIN / FILL; PrusaSlicer, Orca and SuperSlicer emit
 * PERIMETER / OVERHANG PERIMETER / INTERNAL INFILL / SOLID INFILL.
 * Keep original names so toolpath visibility and timing controls remain exact.
 */
export const TOOLPATH_COLORS = Object.freeze({
  // CuraEngine
  "WALL-OUTER": "#fa7329",
  "WALL-INNER": "#e98842",
  "SKIN": "#338cdb",
  "FILL": "#5cb8f0",
  "SUPPORT": "#808a99",
  "SUPPORT-INTERFACE": "#a5acb7",
  "SKIRT": "#9ea8b8",
  "BRIM": "#9ea8b8",
  "RAFT": "#6b7585",
  "TRAVEL": "#5a6270",
  // PrusaSlicer / Slic3r / OrcaSlicer / SuperSlicer
  "PERIMETER": "#fa7329",
  "EXTERNAL PERIMETER": "#fa7329",
  "OVERHANG PERIMETER": "#4dcca0",
  "INTERNAL INFILL": "#5cb8f0",
  "SOLID INFILL": "#338cdb",
  "TOP SOLID INFILL": "#338cdb",
  "BRIDGE INFILL": "#4dcca0",
  "INTERNAL BRIDGE INFILL": "#4dcca0",
  "GAP FILL": "#f5c238",
  "IRONING": "#cc6bbb",
  "SUPPORT MATERIAL": "#808a99",
  "SUPPORT MATERIAL INTERFACE": "#a5acb7",
  "SKIRT/BRIM": "#9ea8b8",
  "WIPE TOWER": "#947fe0",
  "CUSTOM": "#d78c45",
  "OTHER": "#fa7329"
});

const dynamicColors = new Map();

export function colorForToolpathType(type) {
  const name = String(type ?? "OTHER").trim().toUpperCase() || "OTHER";
  if (Object.hasOwn(TOOLPATH_COLORS, name)) return TOOLPATH_COLORS[name];
  if (dynamicColors.has(name)) return dynamicColors.get(name);
  // Deterministic vivid fallback, not identical grey for every unknown type.
  // Pure function of its feature name: viewport legend and GPU always agree.
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash = Math.imul(hash ^ name.charCodeAt(i), 16777619) >>> 0;
  }
  const h = (hash % 360) / 30, lightness = 0.60, chroma = 0.26;
  const hex = n => {
    const k = (n + h) % 12;
    const component = lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * component).toString(16).padStart(2, "0");
  };
  const result = "#" + hex(0) + hex(8) + hex(4);
  dynamicColors.set(name, result);
  return result;
}
