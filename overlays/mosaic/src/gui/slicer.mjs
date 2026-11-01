/* MosaicSlicer GUI with CuraEngine executed ONLY in the Python LAN server.
 * No Cura WASM import, no slicer WebWorker, no fallback to browser slicing.
 * AGPL-3.0-only MosaicSlicer original: https://github.com/ading2210/MosaicSlicer
 */
import { active_containers } from "../settings/index.mjs";
import { format_gcode } from "../settings/formatter.mjs";

export let exported_gcode = null;
// Read-only showcase toolpath for GitHub Pages; never produced by CuraEngine.
export function load_demo_gcode(text) {
  if (globalThis.__AD4_STATIC_PREVIEW__ !== true) throw Error('Demo toolpaths are Pages-only');
  if (typeof text !== 'string' || text.length > 70 * 1024 * 1024 || !/;\s*(?:LAYER\s*:\s*\d+|LAYER_CHANGE)\b/i.test(text)) throw Error('Invalid demo toolpath');
  exported_gcode = text;
  globalThis.AD4DemoBenchyLoaded = true; // visual-only, never enabled for printing
}

let active_controller = null;

export const cura_engine = {
  get active() { return Boolean(active_controller); },
  cancel() { cancel_slice(); }
};

export function cancel_slice() {
  exported_gcode = null;
  if (active_controller) {
    active_controller.abort();
    active_controller = null;
    fetch("./api/slice/cancel", { method: "POST" }).catch(() => {});
    document.dispatchEvent(new CustomEvent("ad4:slice-progress", {detail: {state: "cancelled"}}));
  }
}

function to_blob({stl, settings}) {
  const settings_blob = new TextEncoder().encode(JSON.stringify(settings));
  const len = settings_blob.byteLength;
  if (len > 512 * 1024) throw Error("Settings exceed maximum size");
  const framing = new Uint8Array(4);
  new DataView(framing.buffer).setUint32(0, len, false);
  return new Blob([framing, settings_blob, stl], {type: "application/vnd.ffadv4-slice"});
}

export async function slice(stl, on_progress) {
  exported_gcode = null;
  globalThis.AD4SliceTraceID = null;
  if (active_controller) cancel_slice();
  const controller = new AbortController();
  active_controller = controller;
  let progressTimer = null;
  let finished = false;
  try {
    const settings = active_containers.export_settings();
    settings["/tmp/input/model.stl"] = {extruder_nr: "0"};
    settings.global.machine_start_gcode = format_gcode(settings.global.machine_start_gcode);
    settings.global.machine_end_gcode = format_gcode(settings.global.machine_end_gcode);
    const jobId = crypto.randomUUID();
    let lastPercent = 0;
    let polling = false;
    const report = (percent, stage) => {
      on_progress?.(percent == null ? null : percent / 100, stage);
      document.dispatchEvent(new CustomEvent("ad4:slice-progress", {
        detail: {percent, stage, state: "running"}
      }));
    };
    report(0, "Preparing");
    const poll = async () => {
      if (polling || controller.signal.aborted || finished) return;
      polling = true;
      try {
        const response = await fetch("./api/slice/progress?job_id=" + encodeURIComponent(jobId), {
          cache: "no-store", signal: controller.signal
        });
        if (!response.ok) return;
        const status = await response.json();
        if (finished || status.state !== "running") return;
        // Never invent a percentage: while CuraEngine has not reported a
        // numeric value the UI remains indeterminate.
        const percent = Number.isFinite(status.percent)
          ? Math.max(lastPercent, Math.min(99, status.percent)) : null;
        if (percent != null) lastPercent = percent;
        report(percent, status.stage || "Slicing");
      } catch (error) {
        if (error.name !== "AbortError") console.debug("Slice progress unavailable", error);
      } finally {
        polling = false;
      }
    };
    progressTimer = setInterval(poll, 400);
    const res = await fetch("./api/slice", {
      method: "POST",
      headers: {"Content-Type": "application/vnd.ffadv4-slice", "X-AD4-Slice-Id": jobId},
      body: to_blob({stl, settings}),
      signal: controller.signal,
    });
    finished = true;
    clearInterval(progressTimer);
    const payload = await res.json();
    if (!res.ok) throw Error(payload.error || "Server slicing failed");
    if (payload.engine !== "server") throw Error("Server engine verification failed");
    exported_gcode = payload.gcode;
    // Carry this server trace through the subsequent upload/print transaction.
    globalThis.AD4SliceTraceID = res.headers.get("X-Trace-ID");
    on_progress?.(1, "Complete");
    document.dispatchEvent(new CustomEvent("ad4:slice-progress", {
      detail: {percent: 100, stage: "Complete", state: "completed"}
    }));
    const seconds = payload.time_seconds;
    const metres = payload.filament_mm == null ? null : payload.filament_mm / 1000;
    return {
      time_estimate: seconds == null ? "Not reported by CuraEngine" : format_time(seconds),
      material_estimate: metres == null ? "Not reported" : metres.toFixed(2) + "m",
    };
  } catch (error) {
    if (error.name !== "AbortError") {
      document.dispatchEvent(new CustomEvent("ad4:slice-progress", {detail: {state: "failed", message:error?.message || String(error)}}));
    }
    throw error;
  } finally {
    finished = true;
    clearInterval(progressTimer);
    if (active_controller === controller) active_controller = null;
  }
}

function format_time(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return hours > 0 ? hours + "h " + minutes + "m" : minutes + " minutes";
}
