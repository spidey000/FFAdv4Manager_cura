/* Real layer-top heights derived from printed G-code moves.
 *
 * Each extrusion's TOP is its actual layer Z. Its BOTTOM is the prior
 * printed layer's Z, so adjacent layers physically touch with no gaps.
 * Z-hops/travel do not define layer heights. Never modify source G-code.
 * This module is Three.js-free so it can be regression-tested in Node.
 */
export const FALLBACK_LAYER_HEIGHT = 0.2;
export const MIN_LAYER_HEIGHT = 0.025;
export const MAX_LAYER_HEIGHT = 0.8;

const validHeight = h =>
  Number.isFinite(h) && h >= MIN_LAYER_HEIGHT && h <= MAX_LAYER_HEIGHT;

export function getLayerStack(parsedData) {
  const tops = parsedData.map(layer => {
    // Travel moves sometimes carry a temporary Z-hop; only extrusion
    // destinations are authoritative for the layer's deposited top plane.
    for (const point of layer) {
      if (point.type === "print" && Number.isFinite(point.vector?.z))
        return point.vector.z;
    }
    return null;
  });

  const differences = [];
  let prior = null;
  for (const z of tops) {
    if (z === null) continue;
    const d = prior === null ? null : z - prior;
    if (validHeight(d)) differences.push(d);
    prior = z;
  }
  differences.sort((a, b) => a - b);
  const inferred = differences.length
    ? differences[Math.floor(differences.length / 2)]
    : FALLBACK_LAYER_HEIGHT;

  const stack = [];
  prior = null;
  for (const z of tops) {
    // A layer without extrusion is still displayed by the layer ruler, but
    // cannot contribute physical geometry or reset the last printed plane.
    if (z === null) {
      stack.push({top: null, bottom: null, height: inferred});
      continue;
    }
    const delta = prior === null ? z : z - prior;
    const height = validHeight(delta) ? delta : inferred;
    stack.push({top: z, bottom: z - height, height});
    prior = z;
  }
  return stack;
}
