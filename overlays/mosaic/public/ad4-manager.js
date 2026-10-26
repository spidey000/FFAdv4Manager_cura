/* Standalone MosaicSlicer printer dashboard, using existing authenticated CLI API. */
const apiRoot = "./api/printer";
const $ = id => document.getElementById(id);
const statusNode = $("ad4-manager-status");
let currentFiles = [];
let liveTimer;

async function api(path, opts={}) {
  const res = await fetch(apiRoot + path, {cache:"no-store", ...opts});
  const type = res.headers.get("Content-Type") || "";
  const body = type.includes("json") ? await res.json() : await res.blob();
  if (!res.ok) throw Error(body.error || "Printer API unavailable");
  return body;
}
async function post(path, body) {
  return api(path, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
function message(text) { statusNode.textContent = text; }
function fmt(x, unit="") {return x == null ? "—" : String(x) + unit;}
async function refresh() {
  try {
    const [state, files] = await Promise.all([api("/status"), api("/files")]);
    $("ad4-machine").textContent = fmt(state.machine_status);
    $("ad4-nozzle").textContent = fmt(state.nozzle_current, "°C") + " / " + fmt(state.nozzle_target, "°C");
    $("ad4-bed").textContent = fmt(state.bed_current, "°C") + " / " + fmt(state.bed_target, "°C");
    $("ad4-progress").textContent = fmt(state.progress_percent, "%");
    $("ad4-layer").textContent = fmt(state.layer_current) + " / " + fmt(state.layer_total);
    $("ad4-file").textContent = fmt(state.current_file);
    currentFiles = Array.isArray(files) ? files : [];
    const selector=$("ad4-files");
    const selected=selector.value;
    selector.replaceChildren(...currentFiles.map(filename=>{
      const option=document.createElement("option");
      option.value=filename;option.textContent=filename.split("/").pop();return option;
    }));
    if (currentFiles.includes(selected)) selector.value=selected;
    message("Connected to Adventurer 4");
  } catch(e) { message(e.message); }
}
async function action(key, payload, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  message("Working: "+key);
  try { const result=await post("/actions", payload); message("Done: "+key); await refresh(); return result; }
  catch(e){message("Error: "+e.message);}
}
$("ad4-open-manager").addEventListener("click",()=>{
  $("ad4-manager").showModal();
  refresh();
  liveTimer=setInterval(refresh,9000);
});
$("ad4-close-manager").addEventListener("click",()=>{
  clearInterval(liveTimer); $("ad4-manager").close();
});
$("ad4-refresh").addEventListener("click",refresh);
for (const command of ["pause","resume","cancel","fan_on","fan_off"]) {
  $( "ad4-"+command).addEventListener("click",()=>action(command,{action:command},
    ["cancel"].includes(command) ? "Cancel the current physical print?" : null));
}
$("ad4-print-file").addEventListener("click",()=>{
  const file=$("ad4-files").value;
  if(!file || !currentFiles.includes(file)) return message("Select a stored file");
  action("print",{action:"print",file},"Start real printing of "+file+"?");
});
$("ad4-snapshot").addEventListener("click",async()=>{
  try {
    const frame=await api("/camera");
    const url=URL.createObjectURL(frame);
    const img=$("ad4-camera");
    if(img.dataset.url) URL.revokeObjectURL(img.dataset.url);
    img.src=url;img.dataset.url=url;
    message("Camera image updated");
  }catch(e){message(e.message);}
});
$("ad4-discover").addEventListener("click",async()=>{
  try{
    const found=await api("/discover");
    message(found.map(d=>d.ip||JSON.stringify(d)).join(", ")||"No printer discovered");
  }catch(e){message(e.message);}
});
$("ad4-timelapse-start").addEventListener("click",async()=>{
  try{await post("/timelapse",{action:"start"});message("Timelapse started");}
  catch(e){message(e.message);}
});
$("ad4-timelapse-stop").addEventListener("click",async()=>{
  try{await post("/timelapse",{action:"stop"});message("Timelapse stopped");}
  catch(e){message(e.message);}
});
async function upload(start) {
  const gcode=globalThis.app?.gui?.slicer?.exported_gcode;
  if (!gcode) return message("Slice a model on the server first");
  if (!confirm(start ? "Start a real print on the Adventurer 4?" : "Upload G-code as GX to the Adventurer 4?")) return;
  const model=globalThis.app?.gui?.file?.stl_file_name||"MosaicSlicer.stl";
  const basename=model.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9_. -]/g,"_").slice(0,90)||"model";
  try {
    const response=await fetch("./api/printer/jobs?start="+start+"&name="+encodeURIComponent(basename+".gcode"),{
      method:"POST",headers:{"Content-Type":"text/plain"},body:gcode
    });
    const data=await response.json();
    if(!response.ok) throw Error(data.error||"Upload error");
    message("Uploaded: "+data.remote_name);
    await refresh();
  }catch(e){message(e.message);}
}
$("ad4-upload").addEventListener("click",()=>upload(false));
$("ad4-send-print").addEventListener("click",()=>upload(true));
