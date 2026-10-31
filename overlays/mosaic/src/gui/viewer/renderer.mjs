// AD4 Studio: render on demand rather than 60 GPU draws/sec when idle.
// This is installed over pinned Mosaic's renderer by prepare_mosaic.py.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export const viewport = document.getElementById("viewer");
export const canvas = document.getElementById("stl-viewer");
export let view_width = Math.max(1, viewport.clientWidth);
export let view_height = Math.max(1, viewport.clientHeight);
export let scene_name = "model";

let current_scene;
let lastRenderError = null;
let lastRenderCode = null;
let scheduled = false;
let started = false;
let lastRatio = 0;
const MAX_DRAWING_PIXELS = 1600000;

export const camera = new THREE.PerspectiveCamera(75, view_width / view_height);
camera.position.set(150, 150, 150);

export const renderer = new THREE.WebGLRenderer({
  antialias: matchMedia("(pointer:fine)").matches,
  canvas, alpha: true, powerPreference: "high-performance",
  preserveDrawingBuffer: false,
});
renderer.setClearColor(0xffffff, 0);
renderer.shadowMap.enabled = false;

export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

function resize() {
  const w = Math.round(viewport.clientWidth);
  const h = Math.round(viewport.clientHeight);
  if (w < 1 || h < 1) return false;
  // Cap physical framebuffer pixels; high-DPI phones otherwise multiply fill
  // rate by 4-9. Avoid a permanent maximum-quality framebuffer.
  const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_DRAWING_PIXELS / (w * h)));
  if (w === view_width && h === view_height && Math.abs(ratio - lastRatio) < 0.001) return true;
  view_width = w; view_height = h; lastRatio = ratio;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  return true;
}

function frame() {
  scheduled = false;
  if (document.hidden || !resize()) return;
  // OrbitControls emits 'change' while damping is active, scheduling only the
  // frames needed for the camera to settle after user input.
  controls.update();
  // O(1) shader uniform update: no per-segment or per-layer CPU work on zoom.
  // ThreeSlicer chooses genuine geometric LOD using camera projection;
  // in a cut-layer view full detail is retained.
  if(scene_name==="gcode")globalThis.AD4GCodePreview?.updateLod(camera,view_height);
  if (current_scene) {
    try {
      renderer.render(current_scene, camera);
      if(lastRenderError)document.dispatchEvent(new CustomEvent("ad4:viewer-recovered",{
        detail:{code:lastRenderCode}
      }));
      lastRenderError = null;
      lastRenderCode = null;
    } catch(error) {
      const message=error?.message || String(error);
      if(message!==lastRenderError) {
        lastRenderError=message;
        lastRenderCode=scene_name==="gcode"?"LAYER_RENDER_FAILED":"MODEL_RENDER_FAILED";
        document.dispatchEvent(new CustomEvent("ad4:viewer-error",{
          detail:{code:scene_name==="gcode"?"LAYER_RENDER_FAILED":"MODEL_RENDER_FAILED",
            message:"3D scene could not be drawn: "+message}
        }));
      }
    }
  }
}

export function invalidate() {
  if (!scheduled && !document.hidden) {
    scheduled = true;
    requestAnimationFrame(frame);
  }
}
export function set_scene(scene, name) {
  current_scene = scene;
  scene_name = name;
  invalidate();
}
export function animate() {
  if (started) return;
  started = true;
  const observer = new ResizeObserver(invalidate);
  observer.observe(viewport);
  controls.addEventListener("change", invalidate);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) invalidate(); });
  document.addEventListener("ad4:models-changed", invalidate);
  // Controls written through the compact mobile input panel also change meshes.
  for (const name of ["input", "change", "pointerup"]) {
    document.addEventListener(name, invalidate, {passive: true, capture: true});
  }
  invalidate();
}
