// Off-thread binary STL decoding for large models. The original ArrayBuffer
// remains intact for duplicate/import workflows; only a copy is transferred.
import * as THREE from "three";

const THRESHOLD = 1024 * 1024; // smaller STLs are faster to parse synchronously.
const MAX_STL = 50 * 1024 * 1024; // same bound as native CuraEngine bridge.
let worker = null;
let sequence = 0;
const pending = new Map();

function resetWorker(error) {
  worker?.terminate();
  worker = null;
  for (const {reject, timeout} of pending.values()) {
    clearTimeout(timeout);
    reject(error);
  }
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  const url = new URL("ad4-stl-worker.js", document.baseURI);
  worker = new Worker(url);
  worker.onmessage = event => {
    const {id, error, positions, normals} = event.data || {};
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    clearTimeout(job.timeout);
    if (error) job.reject(Error(error));
    else job.resolve({positions, normals});
  };
  worker.onerror = event => resetWorker(Error("STL worker: " + (event.message || "failed")));
  return worker;
}

function runWorker(original) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      resetWorker(Error("STL worker exceeded 90s"));
    }, 90000);
    pending.set(id, {resolve, reject, timeout});
    try {
      // Structured clone of input is intentional: model.data must not become
      // detached when a user duplicates a loaded model.
      const transferable = original.slice(0);
      ensureWorker().postMessage({id, buffer: transferable}, [transferable]);
    } catch (error) {
      pending.delete(id);
      clearTimeout(timeout);
      reject(error);
    }
  });
}

export async function parseStlGeometry(input, stlLoader) {
  const data = input instanceof ArrayBuffer ? input
    : input.buffer?.slice(input.byteOffset, input.byteOffset + input.byteLength);
  if (!data) throw Error("Model input must be binary");
  if (data.byteLength > MAX_STL) throw Error("STL exceeds the 50 MiB slicing limit");
  if (data.byteLength < THRESHOLD || typeof Worker === "undefined") return stlLoader.parse(data);
  const view = new DataView(data);
  const count = view.getUint32(80, true);
  if (!count || 84 + count * 50 !== data.byteLength) return stlLoader.parse(data); // ASCII STL
  try {
    const result = await runWorker(data);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(result.positions), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(result.normals), 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    // Availability fallback: the model remains loadable even if CSP blocks
    // workers. The warning tells us why the UI may be less responsive.
    console.warn("Large-STL worker unavailable; falling back to STLLoader", error);
    return stlLoader.parse(data);
  }
}
