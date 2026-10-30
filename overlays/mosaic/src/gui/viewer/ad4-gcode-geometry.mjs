/* Low-overhead G-code layer mesh builder.
 * One batched BufferGeometry per Cura feature type per layer, no per-segment
 * Three.js Mesh / Material / Vector allocations. Source remains unmodified.
 */
import * as THREE from "three";

export const PREVIEW_SEGMENT_BUDGET = 400000;
const COLORS = Object.freeze({
  "WALL-OUTER":0xff443d, "WALL-INNER":0x37cf74,
  "SKIN":0xffdc46, "FILL":0xffa526, "SUPPORT":0x8c80ff,
  "SUPPORT-INTERFACE":0xbd88ff, "SKIRT":0x00c6bb,
  "BRIM":0x38cbad, "RAFT":0x64ba9f,
  "TRAVEL":0x13dbe9, "OTHER":0x98a6a1
});

function addRibbon(vertices, a, b, radius) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 0.0001 ||
      !Number.isFinite(a.z) || !Number.isFinite(b.z)) return;
  const ox = -dy / distance * radius, oy = dx / distance * radius;
  // Two front/back visible triangles for a deposited toolpath ribbon.
  // Renderer rotates the G-code group -90° around X into the bed plane.
  vertices.push(
    a.x+ox, a.y+oy, a.z,  a.x-ox, a.y-oy, a.z,  b.x+ox, b.y+oy, b.z,
    b.x+ox, b.y+oy, b.z,  a.x-ox, a.y-oy, a.z,  b.x-ox, b.y-oy, b.z,
  );
}

export function buildGcodeLayers(parsedData) {
  const group = new THREE.Group();
  const layers = [];
  const materials = new Map();
  const categories = new Set();
  const segmentCount = parsedData.reduce((sum, layer) => sum + layer.length, 0);
  const stride = Math.max(1, Math.ceil(segmentCount / PREVIEW_SEGMENT_BUDGET));
  let previous = null, index = 0, displayed = 0;

  for (const layer of parsedData) {
    const layerGroup = new THREE.Group();
    const byCategory = new Map();
    let capturedLayerSegment = false;
    for (const point of layer) {
      const b = point.vector;
      const a = previous?.vector;
      previous = point;
      if (!a || !b) continue;
      const type = point.type === "travel" ? "TRAVEL"
        : (point.subtype || "OTHER").trim().toUpperCase();
      // Keep at least one segment per nonempty layer when simplifying a huge
      // path. Original G-code and all layer Z values remain authoritative.
      if (++index % stride !== 0 && capturedLayerSegment) continue;
      const vertices = byCategory.get(type) || [];
      const oldSize = vertices.length;
      addRibbon(vertices, a, b, type === "TRAVEL" ? 0.035 : 0.20);
      if (vertices.length !== oldSize) {
        byCategory.set(type, vertices);
        capturedLayerSegment = true;
        displayed++;
        categories.add(type);
      }
    }
    for (const [type, vertices] of byCategory) {
      if (!vertices.length) continue;
      let material = materials.get(type);
      if (!material) {
        material = new THREE.MeshBasicMaterial({
          color: COLORS[type] ?? COLORS.OTHER, side: THREE.DoubleSide,
          transparent: type === "TRAVEL", opacity: type === "TRAVEL" ? 0.6 : 1,
          depthWrite: type !== "TRAVEL"
        });
        materials.set(type, material);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeBoundingSphere();
      const part = new THREE.Mesh(geometry, material);
      part.userData.ad4Category = type;
      layerGroup.add(part);
    }
    group.add(layerGroup);
    layers.push(layerGroup);
  }
  return {
    mesh: group, layers, categories: [...categories].sort(),
    segmentCount, displayed, simplified: stride > 1
  };
}

export function disposeGcodeLayers(mesh) {
  if (!mesh) return;
  const materials = new Set();
  mesh.traverse(part => {
    part.geometry?.dispose();
    if (part.material) {
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
        materials.add(material);
      }
    }
  });
  for (const material of materials) material.dispose();
}
