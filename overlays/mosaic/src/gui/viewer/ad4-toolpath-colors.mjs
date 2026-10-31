/* Shared G-code feature palette for Three.js geometry and the mobile legend.
 * Cura emits WALL-OUTER / SKIN / FILL; PrusaSlicer, Orca and SuperSlicer emit
 * PERIMETER / OVERHANG PERIMETER / INTERNAL INFILL / SOLID INFILL.
 * Keep original names so toolpath visibility and timing controls remain exact.
 */
export const TOOLPATH_COLORS = Object.freeze({
  // CuraEngine
  "WALL-OUTER": "#ff5f57",
  "WALL-INNER": "#38d98b",
  "SKIN": "#f4ce46",
  "FILL": "#f59e0b",
  "SUPPORT": "#9973f9",
  "SUPPORT-INTERFACE": "#c4a1ff",
  "SKIRT": "#00bfa6",
  "BRIM": "#2dd4bf",
  "RAFT": "#60a5fa",
  "TRAVEL": "#22d3ee",
  // PrusaSlicer / Slic3r / OrcaSlicer / SuperSlicer
  "PERIMETER": "#ff5f57",
  "EXTERNAL PERIMETER": "#f87171",
  "OVERHANG PERIMETER": "#ff57bd",
  "INTERNAL INFILL": "#f59e0b",
  "SOLID INFILL": "#f4ce46",
  "TOP SOLID INFILL": "#a3e635",
  "BRIDGE INFILL": "#5ed0e8",
  "INTERNAL BRIDGE INFILL": "#5ed0e8",
  "GAP FILL": "#38bdf8",
  "IRONING": "#e879f9",
  "SUPPORT MATERIAL": "#9973f9",
  "SUPPORT MATERIAL INTERFACE": "#c4a1ff",
  "SKIRT/BRIM": "#2dd4bf",
  "WIPE TOWER": "#c084fc",
  "CUSTOM": "#fb7185",
  "OTHER": "#98a6a1"
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
