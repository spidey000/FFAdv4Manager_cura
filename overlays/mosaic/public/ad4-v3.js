/* AD4 Studio v3. A full UX/navigation shell around the real Mosaic renderer.
 * No client slicing; the established server + protected printer bridge own actions.
 */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const staticPreview = window.__AD4_STATIC_PREVIEW__ === true;
const root = document.body;

/* The UI version is deliberately independent of the Python backend version.
 * The build system replaces REVISION_UI with the exact frontend checkout hash.
 * Neither a GitHub Pages preview nor a failed API request may invent a backend version.
 */
const VERSION_UI = "0.2.3";
const REVISION_UI = "__AD4_FRONTEND_REV__";
const validRevision = value => /^[0-9a-f]{7,40}$/i.test(value || "");
const versionStamp = document.createElement("div");
versionStamp.id = "ad4-version-stamp";
versionStamp.setAttribute("aria-label", "Frontend and backend versions");
const uiStamp = document.createElement("span");
uiStamp.id = "ad4-version-ui";
uiStamp.textContent = "UI v" + VERSION_UI + (validRevision(REVISION_UI) ? " · " + REVISION_UI : "");
uiStamp.title = "Frontend build " + (validRevision(REVISION_UI) ? REVISION_UI : "revision unavailable");
const apiStamp = document.createElement("span");
apiStamp.id = "ad4-version-api";
apiStamp.textContent = staticPreview ? "API —" : "API …";
apiStamp.title = staticPreview ? "No backend on GitHub Pages" : "Checking backend version";
versionStamp.append(uiStamp, apiStamp);
document.getElementById("viewer")?.append(versionStamp);
async function refreshBackendVersion() {
  if (staticPreview) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("./api/version", {
      cache: "no-store", credentials: "same-origin", signal: controller.signal
    });
    if (!response.ok) throw new Error("Backend version unavailable");
    const info = await response.json();
    if (!info || typeof info.version !== "string" ||
        !/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(info.version)) {
      throw new Error("Invalid backend version response");
    }
    const rev = validRevision(info.revision) ? " · " + info.revision.slice(0, 8) : "";
    apiStamp.textContent = "API v" + info.version + rev;
    apiStamp.title = "Backend " + info.version + (rev ? " (" + info.revision + ")" : " (revision unavailable)");
  } catch (_) {
    apiStamp.textContent = "API offline";
    apiStamp.title = "Backend disconnected or version endpoint unavailable";
  } finally {
    clearTimeout(timeout);
  }
}
if (!staticPreview) {
  refreshBackendVersion();
  setInterval(() => {
    if (!document.hidden) refreshBackendVersion();
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshBackendVersion();
  });
}


/* Always-visible, accessible slicing progress, including mobile where the
 * original Mosaic sidebar/progress element is inside a collapsed panel. */
const sliceHud = document.createElement("section");
sliceHud.id = "ad4-slice-progress-hud";
sliceHud.hidden = true;
sliceHud.setAttribute("role", "status");
sliceHud.setAttribute("aria-live", "polite");
sliceHud.innerHTML = '<div class="ad4-slice-hud-title"><strong>CuraEngine · Slicing</strong><strong id="ad4-slice-hud-percent">—</strong></div>'+
  '<progress id="ad4-slice-hud-bar" max="100"></progress>'+
  '<div class="ad4-slice-hud-foot"><span id="ad4-slice-hud-stage">Preparing…</span>'+
  '<button type="button" id="ad4-slice-hud-cancel">Cancel</button></div>';
root.append(sliceHud);
sliceHud.querySelector("#ad4-slice-hud-cancel").addEventListener("click", () => {
  document.getElementById("cancel-button")?.click();
  sliceHud.hidden = true;
});
let hideSliceHud;
const sliceStageNames = {
  "slice": "Generating layers", "layerparts": "Building layer contours",
  "inset+skin": "Walls and solid surfaces", "support": "Supports",
  "export": "Writing G-code", "Preparing": "Preparing model"
};
document.addEventListener("ad4:slice-progress", event => {
  const info = event.detail || {};
  clearTimeout(hideSliceHud);
  if (info.state === "cancelled" || info.state === "failed") {
    sliceHud.hidden = true;
    return;
  }
  sliceHud.hidden = false;
  const numeric = Number.isFinite(info.percent);
  const bar = sliceHud.querySelector("#ad4-slice-hud-bar");
  if (numeric) bar.value = Math.max(0, Math.min(100, info.percent));
  else bar.removeAttribute("value"); // HTML progressbar indeterminate state.
  sliceHud.querySelector("#ad4-slice-hud-percent").textContent =
    numeric ? Math.round(info.percent) + "%" : "Working…";
  sliceHud.querySelector("#ad4-slice-hud-stage").textContent =
    sliceStageNames[info.stage] || info.stage || "CuraEngine processing";
  sliceHud.querySelector("#ad4-slice-hud-cancel").hidden = info.state === "completed";
  if (info.state === "completed") hideSliceHud = setTimeout(() => { sliceHud.hidden = true; }, 1600);
});

const make = (tag,klass,text) => {
  const el = document.createElement(tag);
  if(klass) el.className=klass;
  if(text!==undefined) el.textContent=text;
  return el;
};
// Icons come from the bundled Lucide package, not independent handcrafted SVG paths.
const svg=name=>'<span class="ad4-lucide" data-ad4-icon="'+name+'"></span>';
document.addEventListener("ad4:icons-ready",()=>globalThis.AD4Icons?.hydrate());
const navButton = (name,label,click) => {
 const b=make("button","ad4-v3-icon-button");
 b.type="button";b.dataset.tab=name;b.innerHTML=svg(name)+"<span>"+label+"</span>";
 b.addEventListener("click",click);return b;
};
const TOP=[["cube","Preview","preview"],["wrench","Print","print"],["filament","Filament","filament"],["printer","Printer","printer"],["gear","App","app"]];
let current="preview",tool="file",managerPane="camera",lastGcode=false,previousModelCount=0;
const modelCount=()=>Object.keys(globalThis.app?.gui?.model_viewer?.models||{}).length;
const header=make("header","ad4-v3-header");header.id="ad4-v3-header";
// Compact layout: no branded secondary header.
const top=make("nav","ad4-v3-top");top.id="ad4-v3-top";top.setAttribute("aria-label","Main sections");
root.append(header,top);
function closeStatusMenu(){}
const bottom=make("nav","ad4-v3-bottom");bottom.id="ad4-v3-bottom";bottom.setAttribute("aria-label","Editor tools");
root.append(bottom);
const action=make("section","ad4-v3-action-row");action.id="ad4-v3-action-row";root.append(action);
const extra=make("section","ad4-v3-extra");extra.id="ad4-v3-extra";root.append(extra);
const note=make("div","ad4-v3-toast");note.id="ad4-v3-toast";note.setAttribute("role","status");note.hidden=true;
note.innerHTML='<span id="ad4-v3-toast-message"></span><button type="button" aria-label="Dismiss notification">×</button>';
note.querySelector("button").addEventListener("click",()=>{note.hidden=true});root.append(note);
let noteHandle;
// Shared surface: both the model scene and the layer toolpath use #viewer.
// Errors are text-only to avoid interpreting filenames/server messages as HTML.
const viewerError=document.createElement("aside");
viewerError.id="ad4-viewer-error";
viewerError.hidden=true;
viewerError.setAttribute("role","alert");
viewerError.setAttribute("aria-live","assertive");
viewerError.innerHTML='<strong id="ad4-viewer-error-heading">Cannot slice</strong>'+
 '<p id="ad4-viewer-error-message"></p>';
$("viewer")?.append(viewerError);
const viewerErrors=new Map();
const priorities={plate:100,model:80,slicer:70,layers:60,engine:50,operation:40};
let plateErrorSignature="";
function renderViewerError(){
 const candidates=[...viewerErrors.entries()]
  .sort((a,b)=>(priorities[b[0]]||0)-(priorities[a[0]]||0));
 const first=candidates[0];
 if(!first){viewerError.hidden=true;return}
 viewerError.hidden=false;
 $("ad4-viewer-error-heading").textContent=first[1].heading;
 $("ad4-viewer-error-message").textContent=first[1].message;
 viewerError.dataset.errorCode=first[1].code;
}
function showViewerError(channel,code,message,heading="Editor error"){
 viewerErrors.set(channel,{code,heading,message:String(message||"Unknown error").slice(0,400)});
 renderViewerError();
}
function clearViewerError(channel){viewerErrors.delete(channel);renderViewerError()}
function currentPlateStatus(){
 const plate=globalThis.app?.gui?.model_viewer;
 if(!plate || modelCount()===0)return null;
 return plate.ad4_plate_status?.() || {valid:false,code:"PLATE_CHECK_UNAVAILABLE",
  reason:"Build plate validation is not ready. Slicing is blocked."};
}
function updatePlateError(){
 const status=currentPlateStatus();
 const signature=status&&!status.valid?status.code+"|"+status.reason:"";
 if(signature===plateErrorSignature)return;
 plateErrorSignature=signature;
 if(signature)showViewerError("plate",status.code,status.reason+
  " · Correct the model before slicing.","Slice blocked · Build plate");
 else clearViewerError("plate");
}
document.addEventListener("ad4:plate-rejected",event=>{
 showViewerError("operation",event.detail?.code||"INVALID_TRANSFORM",
  event.detail?.reason||"The attempted operation would violate the plate limits",
  "Position rejected · No changes applied");
});
document.addEventListener("ad4:plate-valid",()=>{clearViewerError("operation");updatePlateError()});
document.addEventListener("ad4:viewer-error",event=>{
 const info=event.detail||{},code=String(info.code||"EDITOR_ERROR");
 const channel=/GCODE|LAYER|PREVIEW/.test(code)?"layers":
  /MODEL|FILE/.test(code)?"model":/ENGINE/.test(code)?"engine":"slicer";
 showViewerError(channel,code,info.message||"The operation could not be completed",
  channel==="layers"?"Layer preview error":
  channel==="model"?"Model loading error":
  channel==="engine"?"CuraEngine unavailable":"Slicing error");
});
document.addEventListener("ad4:slice-progress",event=>{
 const info=event.detail||{};
 if(info.state==="running"||info.state==="completed")clearViewerError("slicer");
 else if(info.state==="failed")showViewerError("slicer","SLICE_FAILED",
  info.message||"CuraEngine could not generate the G-code. Check the model and server.",
  "Slicing failed");
});
document.addEventListener("ad4:demo-gcode-ready",()=>clearViewerError("layers"));
function notify(message){
 $("ad4-v3-toast-message").textContent=message;note.hidden=false;clearTimeout(noteHandle);
 noteHandle=setTimeout(()=>note.hidden=true,4200);
}
document.addEventListener("ad4:plate-arranged",event=>{
 notify(event.detail?.count===1?"Model positioned safely":"Models arranged without collisions");
});
// Reject print/slice actions even if another component bypasses this UI.
document.addEventListener("click",event=>{
 if (!event.target?.closest?.("#slice-button,#ad4-v3-run-slice,#ad4-dock-slice")) return;
 const plate=globalThis.app?.gui?.model_viewer;
 const status=currentPlateStatus();
 if(status?.valid!==true){
   event.preventDefault();event.stopImmediatePropagation();
   updatePlateError();
   if(!status)showViewerError("model","NO_MODEL","Add a model before slicing","Slice blocked");
 }
},true);
function closeSheet(){
 if(root.classList.contains("ad4-sheet-open"))$("ad4-sheet-close")?.click();
}
function ensureSheet(){
 if(innerWidth<=767&&!root.classList.contains("ad4-sheet-open"))$("ad4-dock-settings")?.click();
}
function sliceReady(){return $("slice-export-container")?.dataset.active==="true" && typeof globalThis.app?.gui?.slicer?.exported_gcode==="string";}
function hasModel(){return Boolean(globalThis.app?.gui?.file?.stl_file_name) && modelCount()>0;}
function refreshState(){
 updatePlateError();
 const status=currentPlateStatus(),plateValid=status?.valid===true;
 const model=hasModel(),sliced=model&&sliceReady();
 if(previousModelCount>0 && modelCount()===0){$("slice-export-container")?.setAttribute("data-active","false")}
 previousModelCount=modelCount();
 root.classList.toggle("ad4-has-model",model);
 root.classList.toggle("ad4-v3-sliced",sliced);
 const name=globalThis.app?.gui?.file?.stl_file_name||"";
 const label=null;
 if(label)label.textContent=model?name.split(/[\\/]/).pop():"No model loaded";
 const state=null;
 if(state)state.textContent=sliced?[$("gcode-time-estimate")?.textContent,$("material-estimate")?.textContent].filter(Boolean).join(" · "):model?"Ready for CuraEngine · server-side slicing":"STL or 3MF · FlashForge Adventurer 4";
 const slice=$("ad4-dock-slice");
 if(slice)slice.disabled=staticPreview || !model || !plateValid || $("slice-progress-container")?.dataset.active==="true";
 const newPreview=$("ad4-v3-preview-status");
 if(newPreview)newPreview.textContent=sliced?(staticPreview?"Demo G-code · preview only":"Real G-code ready"):"Slice a model to preview layers";
 const navSlice=$("ad4-v3-nav-slice");if(navSlice)navSlice.classList.toggle("ready",sliced);
 const slicingBusy=$("slice-progress-container")?.dataset.active==="true";
 const start=$("ad4-v3-run-slice");if(start){start.hidden=staticPreview||!model||sliced;start.disabled=staticPreview||slicingBusy||!plateValid}
 const preview=$("ad4-v3-show-layers");if(preview)preview.hidden=!sliced;
 for(const name of ["ad4-v3-export","ad4-v3-send","ad4-v3-print"]){
  const b=$(name);if(b)b.disabled=!sliced||(staticPreview&&name!=="ad4-v3-export");
 }
 // Native G-code layers remain authoritative; the range controls act on actual mesh groups.
 if(current==="sliced")requestAnimationFrame(initLayerRulers);
 viewerTransform.hidden=!["preview","transform"].includes(current);
 syncModelsDock();
 const progressBadge=$("ad4-v3-progress");
 if(progressBadge)progressBadge.hidden=!sliced;
}
function topActive(){
 for(const b of top.querySelectorAll("button"))b.setAttribute("aria-pressed",String(b.dataset.route===(current==="sliced"||current==="transform"||current==="slice-info"?"preview":current)));
}
function activate(name){
 // Both screens share Three.js camera and OrbitControls. Preserve world pose.
 const renderApi=globalThis.app?.gui?.renderer;
 const orbit=renderApi?.controls,cam=renderApi?.camera;
 const retainCamera=cam&&orbit&&
   ["preview","sliced","transform","slice-info"].includes(current)&&
   ["preview","sliced","transform","slice-info"].includes(name);
 const pose=retainCamera?{
   position:cam.position.clone(),quaternion:cam.quaternion.clone(),
   target:orbit.target.clone(),zoom:cam.zoom
 }:null;
 closeStatusMenu();closeSheet();closeModelsMenu();
 current=name;
 root.dataset.ad4Screen=name;
 $("sidebar-container")?.setAttribute("aria-hidden",String(name!=="print"&&name!=="filament"));
 if(name==="print"||name==="filament"){
  const b=document.querySelector("#ad4-categories button[data-name='"+(name==="filament"?"Material":"Quality")+"']");
  b?.click();
  document.dispatchEvent(new CustomEvent("ad4:enter-settings",{detail:{screen:name}}));
 }
 if(name==="preview"||name==="transform"||name==="slice-info")$("prepare-tab-button")?.click();
 if(name==="sliced"){
  if(!sliceReady()){notify("Slice a model on the server to view actual layers");current="preview";root.dataset.ad4Screen="preview";$("prepare-tab-button")?.click()}
  else $("preview-tab-button")?.click();
 }
 if(name==="app"||name==="printer"||name==="slice-info")closeSheet();
 // Entering Printer opens the existing controller as an inline non-modal panel.
 // Leaving closes it and stops video and printer polling.
 const embeddedManager=$("ad4-manager");
 if(name==="printer"){
  if(embeddedManager&&!embeddedManager.open)document.dispatchEvent(new Event("ad4:printer-enter"));
 }else if(embeddedManager?.open){
  embeddedManager.close();
 }
 if(name==="transform")setTransform("rotate");
 topActive();renderTools();refreshState();
 if(pose)requestAnimationFrame(()=>{
   cam.position.copy(pose.position);
   cam.quaternion.copy(pose.quaternion);
   cam.zoom=pose.zoom;cam.updateProjectionMatrix();
   orbit.target.copy(pose.target);orbit.update();
   renderApi.invalidate();
 });
 dispatchEvent(new Event("resize"));
}
for(const [symbol,label,route] of TOP){
 const b=navButton(symbol,label,()=>activate(route));b.dataset.route=route;top.append(b);
}
const printerPage=make("section","ad4-v3-info-page");printerPage.id="ad4-v3-printer-page";
printerPage.innerHTML='<h2>Adventurer 4</h2><p id="ad4-v3-printer-page-state">Checking printer connection…</p>';
root.append(printerPage);
const sliceInfo=make("section","ad4-v3-info-page");sliceInfo.id="ad4-v3-slice-info";
sliceInfo.innerHTML='<h2>Server-side slicing</h2><div class="ad4-v3-info-card"><strong>CuraEngine is not available on GitHub Pages</strong><p>The 3D model and Cura settings work in the public preview. To generate G-code or GX, open this application on your authenticated Linux server.</p><button type="button" id="ad4-v3-return-preview">Return to model</button></div>';
root.append(sliceInfo);
$("ad4-v3-return-preview").addEventListener("click",()=>activate("preview"));
// File overlay removed from viewport.
/* Decorative selection brackets track the *real* selected Three.js geometry.
 * Do not intercept canvas gestures; no fake selection state is created.
 */
const frame=make("div","ad4-v3-selection-brackets");
frame.id="ad4-v3-selection-brackets";
frame.setAttribute("aria-hidden","true");
for(const pos of ["tl","tr","bl","br"]){
 const corner=make("i","ad4-v3-selection-"+pos);frame.append(corner);
}
frame.hidden=true;$("viewer")?.append(frame);
function refreshSelectionBrackets(){
 if(!["preview","transform"].includes(current)){frame.hidden=true;return}
 const mv=globalThis.app?.gui?.model_viewer;
 const selection=mv?.focused?mv?.models?.[mv.focused]?.mesh:null;
 const camera=globalThis.app?.gui?.renderer?.camera;
 const canvas=$("stl-viewer");
 if(!selection||!selection.visible||!camera||!canvas){frame.hidden=true;return}
 selection.geometry?.computeBoundingBox?.();
 const bounding=selection.geometry?.boundingBox;
 if(!bounding){frame.hidden=true;return}
 const points=[];
 for(const x of [bounding.min.x,bounding.max.x])
 for(const y of [bounding.min.y,bounding.max.y])
 for(const z of [bounding.min.z,bounding.max.z]){
  const p=selection.position.clone().set(x,y,z);
  selection.localToWorld(p);
  p.project(camera);
  if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.z>=-1&&p.z<=1)
   points.push({x:(p.x+1)*canvas.clientWidth*.5,y:(1-p.y)*canvas.clientHeight*.5});
 }
 if(!points.length){frame.hidden=true;return}
 const x0=Math.min(...points.map(p=>p.x)),x1=Math.max(...points.map(p=>p.x));
 const y0=Math.min(...points.map(p=>p.y)),y1=Math.max(...points.map(p=>p.y));
 const w=canvas.clientWidth,h=canvas.clientHeight;
 const pad=9,left=Math.max(0,x0-pad),top=Math.max(0,y0-pad);
 const width=Math.min(w-left,Math.max(36,x1-x0+pad*2));
 const height=Math.min(h-top,Math.max(36,y1-y0+pad*2));
 Object.assign(frame.style,{left:left+"px",top:top+"px",width:width+"px",height:height+"px"});
 frame.hidden=false;
}
setInterval(refreshSelectionBrackets,120);


const layerUI=make("section","ad4-v3-layer-card");layerUI.id="ad4-v3-layer-card";
layerUI.innerHTML=
'<div id="ad4-v3-range-panel">'+
'<div class="ad4-v3-double-range" id="ad4-v3-double-range" aria-label="Visible layer range"><div class="ad4-v3-range-track"></div><div class="ad4-v3-range-selected" id="ad4-v3-range-selected"></div><button type="button" class="ad4-v3-range-thumb" id="ad4-v3-range-min" role="slider" aria-valuemin="1" aria-valuemax="100" aria-valuenow="1" aria-label="From layer"><span id="ad4-v3-layer-from">1</span></button><button type="button" class="ad4-v3-range-thumb" id="ad4-v3-range-max" role="slider" aria-valuemin="1" aria-valuemax="100" aria-valuenow="100" aria-label="To layer"><span id="ad4-v3-layer-to">100</span></button></div>'+
'<div class="ad4-v3-move-scrub"><label for="ad4-v3-move-position">Move <output id="ad4-v3-move-status">—</output></label><input id="ad4-v3-move-position" type="range" min="0" max="1" value="1" aria-label="ThreeSlicer path movement position within current layer"></div>'+
'<div class="ad4-v3-estimates"><div class="ad4-v3-stat" title="Estimated print time">'+svg("clock")+'<strong id="ad4-v3-time">—</strong></div><div class="ad4-v3-stat" title="Estimated filament weight">'+svg("filament")+'<strong id="ad4-v3-material">— g</strong></div></div></div>'+
'<div id="ad4-v3-types-panel" hidden><div class="ad4-v3-mode-selector"><label for="ad4-v3-color-mode">Color by</label><select id="ad4-v3-color-mode" aria-label="ThreeSlicer coloring mode"><option value="feature">Feature type</option><option value="filament">Filament</option><option value="height">Layer height</option><option value="width">Line width</option></select></div><div id="ad4-v3-type-list" aria-live="polite"></div><div class="ad4-v3-type-pages"><button id="ad4-v3-types-prev" type="button" aria-label="Previous feature types">‹</button><span id="ad4-v3-types-pages">1 / 1</span><button id="ad4-v3-types-next" type="button" aria-label="Next feature types">›</button></div></div>';
root.append(layerUI);
root.querySelector("#ad4-v3-color-mode")?.addEventListener("change",event=>{
  globalThis.AD4GCodePreview?.setViewMode(event.target.value);
});
const movePosition=root.querySelector("#ad4-v3-move-position");
let lastMoveLayer=-1,lastMoveTotal=-1;
function syncMoveScrub(force=false){
  const total=globalThis.AD4GCodePreview?.moveCount||0;
  const activeLayer=Number(document.getElementById("layer-number")?.value)||0;
  if(!force&&activeLayer===lastMoveLayer&&total===lastMoveTotal)return;
  lastMoveLayer=activeLayer;lastMoveTotal=total;
  movePosition.max=String(Math.max(1,total));
  movePosition.value=String(Math.max(1,total));
  movePosition.disabled=total===0;
  root.querySelector("#ad4-v3-move-status").textContent=total+" / "+total;
  globalThis.AD4GCodePreview?.setMoveRange(total);
}
movePosition.addEventListener("input",()=>{
  const at=Number(movePosition.value);
  const total=globalThis.AD4GCodePreview?.moveCount||0;
  const result=globalThis.AD4GCodePreview?.setMoveRange(at);
  root.querySelector("#ad4-v3-move-status").textContent=
    Math.min(at,total)+" / "+total;
});


let layerFrom=1,layerTo=1,layerCount=0,showTypes=false,typesGcodeCache="";
const TYPE_PAGE_SIZE=3;
let typePage=0,typeRows=[];
root.dataset.ad4LayerPanel="range";
const typeLabels={
 "WALL-OUTER":"Outer wall","WALL-INNER":"Inner wall","SKIN":"Top / Bottom","FILL":"Infill",
 "SUPPORT":"Supports","SUPPORT-INTERFACE":"Support interface",
 "SKIRT":"Skirt","BRIM":"Brim","RAFT":"Raft","TRAVEL":"Travel","OTHER":"Other",
 "PERIMETER":"Perimeter","EXTERNAL PERIMETER":"External perimeter",
 "OVERHANG PERIMETER":"Overhang perimeter","INTERNAL INFILL":"Internal infill",
 "SOLID INFILL":"Solid infill","TOP SOLID INFILL":"Top solid infill",
 "BRIDGE INFILL":"Bridge infill","INTERNAL BRIDGE INFILL":"Internal bridge",
 "GAP FILL":"Gap fill","IRONING":"Ironing","SUPPORT MATERIAL":"Support material",
 "SUPPORT MATERIAL INTERFACE":"Support interface","SKIRT/BRIM":"Skirt / Brim",
 "WIPE TOWER":"Wipe tower","CUSTOM":"Custom"
};
// The UI reads each color directly from the same module that colors Three.js
// geometry. Different slicers use different ;TYPE: feature names.
function updateRangeVisual(){
 const max=Math.max(1,layerCount),denominator=Math.max(1,max-1);
 const left=(layerFrom-1)/denominator*100,right=(layerTo-1)/denominator*100;
 const selected=$("ad4-v3-range-selected");selected.style.left=left+"%";selected.style.width=(right-left)+"%";
 for(const [side,value,position] of [["min",layerFrom,left],["max",layerTo,right]]){
  const thumb=$("ad4-v3-range-"+side);
  thumb.style.left=position+"%";
  thumb.setAttribute("aria-valuemax",String(max));
  thumb.setAttribute("aria-valuenow",String(value));
  thumb.querySelector("span").textContent=String(value);
 }

}
function commitLayerRange(bound,raw){
 if(!layerCount)return;
 const value=Math.max(1,Math.min(layerCount,Math.round(Number(raw)||1)));
 if(bound==="lower")layerFrom=Math.min(value,layerTo);
 else layerTo=Math.max(layerFrom,value);
 globalThis.AD4GCodePreview?.setRange(layerFrom,layerTo);
 updateRangeVisual();
 syncMoveScrub(true);
}
function initLayerRulers(){
 const count=globalThis.AD4GCodePreview?.count||0;
 if(!count||current!=="sliced")return;
 if(count!==layerCount){layerCount=count;layerFrom=1;layerTo=count}
 updateRangeVisual();syncMoveScrub();refreshTypes();
}
const layerRail=$("ad4-v3-double-range");
let draggedLayerThumb=null;
function positionToLayer(clientX){
 const rect=layerRail.getBoundingClientRect();
 return 1+Math.round(Math.max(0,Math.min(1,(clientX-rect.left)/Math.max(1,rect.width)))*Math.max(0,layerCount-1));
}
layerRail.addEventListener("pointerdown",event=>{
 if(!layerCount||event.button!==0)return;
 const target=event.target.closest(".ad4-v3-range-thumb");
 const value=positionToLayer(event.clientX);
 draggedLayerThumb=target?(target.id.endsWith("min")?"lower":"upper"):(Math.abs(value-layerFrom)<=Math.abs(value-layerTo)?"lower":"upper");
 layerRail.setPointerCapture(event.pointerId);
 commitLayerRange(draggedLayerThumb,value);
 event.preventDefault();
});
layerRail.addEventListener("pointermove",event=>{
 if(!draggedLayerThumb)return;
 commitLayerRange(draggedLayerThumb,positionToLayer(event.clientX));
});
for(const eventName of ["pointerup","pointercancel","lostpointercapture"])layerRail.addEventListener(eventName,()=>draggedLayerThumb=null);
for(const [id,bound] of [["ad4-v3-range-min","lower"],["ad4-v3-range-max","upper"]]){
 $(id).addEventListener("keydown",event=>{
  if(!["ArrowLeft","ArrowRight","Home","End","PageUp","PageDown"].includes(event.key))return;
  event.preventDefault();
  const currentValue=bound==="lower"?layerFrom:layerTo;
  const next=event.key==="Home"?1:event.key==="End"?layerCount:currentValue+({"ArrowLeft":-1,"ArrowRight":1,"PageUp":10,"PageDown":-10}[event.key]||0);
  commitLayerRange(bound,next);
 });
}
function estimateTypeTimes(gcode){
 // Feedrate-based approximation only; accelerations and firmware pauses omitted.
 const totals=new Map(),lines=gcode.split(/\r?\n/);
 let xyz={X:0,Y:0,Z:0,E:0},feed=1800,absolute=true,absoluteE=true,kind="OTHER";
 for(const raw of lines){
  const comment=raw.split(";")[1]?.trim()||"";
  if(comment.startsWith("TYPE:"))kind=comment.slice(5).toUpperCase()||"OTHER";
  const cmd=raw.split(";")[0].trim(),op=cmd.split(/\s+/)[0];
  if(op==="G90"){absolute=true;continue}if(op==="G91"){absolute=false;continue}
  if(op==="M82"){absoluteE=true;continue}if(op==="M83"){absoluteE=false;continue}
  if(op==="G92"){for(const m of cmd.matchAll(/([XYZE])(-?\d+(?:\.\d+)?)/g))xyz[m[1]]=Number(m[2]);continue}
  if(op!=="G0"&&op!=="G1")continue;
  const next={...xyz};let extrude=false;
  for(const m of cmd.matchAll(/([XYZEF])(-?\d+(?:\.\d+)?)/g)){
   const key=m[1],value=Number(m[2]);
   if(key==="F")feed=value;
   else{next[key]=(key==="E"?absoluteE:absolute)?value:xyz[key]+value;if(key==="E")extrude=next.E>xyz.E}
  }
  const distance=Math.hypot(next.X-xyz.X,next.Y-xyz.Y,next.Z-xyz.Z);
  if(distance>0&&feed>0){
   const category=extrude?kind:"TRAVEL";
   totals.set(category,(totals.get(category)||0)+distance/feed*60);
  }
  xyz=next;
 }
 return totals;
}
function formatDuration(seconds){return formatPrintClock(seconds)}
function refreshTypes(){
 const api=globalThis.AD4GCodePreview,gcode=globalThis.app?.gui?.slicer?.exported_gcode;
 if(!api?.count||!gcode||!showTypes)return;
 if(typesGcodeCache===gcode)return;typesGcodeCache=gcode;
 const times=estimateTypeTimes(gcode),categories=api.types||[],list=$("ad4-v3-type-list");
 list.replaceChildren();typeRows=[];
 for(const key of [...new Set([...categories,...times.keys()])]){
  const row=make("label","ad4-v3-type-row");
  row.dataset.toolpathType=key;
  const swatch=make("i","ad4-v3-type-swatch");
  swatch.style.backgroundColor=api.colorForType?.(key)||"#98a6a1";
  const name=make("span","ad4-v3-type-name",typeLabels[key]||key);
  const duration=make("small","ad4-v3-type-time",formatDuration(times.get(key)));
  const toggle=make("input");toggle.type="checkbox";toggle.checked=!api.hiddenTypes?.has(key);toggle.setAttribute("aria-label","Show "+(typeLabels[key]||key));
  toggle.addEventListener("change",()=>api.setTypeVisible(key,toggle.checked));
  row.append(swatch,name,duration,toggle);typeRows.push(row);
 }
 renderTypePage();
}
function renderTypePage(){
 const pages=Math.max(1,Math.ceil(typeRows.length/TYPE_PAGE_SIZE));
 typePage=Math.max(0,Math.min(typePage,pages-1));
 $("ad4-v3-type-list").replaceChildren(...typeRows.slice(typePage*TYPE_PAGE_SIZE,(typePage+1)*TYPE_PAGE_SIZE));
 $("ad4-v3-types-pages").textContent=(typePage+1)+" / "+pages;
 $("ad4-v3-types-prev").disabled=typePage===0;
 $("ad4-v3-types-next").disabled=typePage===pages-1;
}
$("ad4-v3-types-prev").addEventListener("click",()=>{typePage--;renderTypePage()});
$("ad4-v3-types-next").addEventListener("click",()=>{typePage++;renderTypePage()});
function toggleLayerTypePanel(){
 showTypes=!showTypes;
 $("ad4-v3-range-panel").hidden=showTypes;
 $("ad4-v3-types-panel").hidden=!showTypes;

 root.dataset.ad4LayerPanel=showTypes?"types":"range";
 $("ad4-v3-show-layers").setAttribute("aria-pressed",String(showTypes));
 updateLayerViewButton();
 if(showTypes){typePage=0;$("ad4-v3-color-mode").value=globalThis.AD4GCodePreview?.viewMode||"feature";typesGcodeCache="";refreshTypes()}
}

const transform=make("section","ad4-v3-transform");transform.id="ad4-v3-transform";
transform.innerHTML='<button type="button" class="ad4-v3-sheet-handle" id="ad4-v3-sheet-handle" aria-label="Drag to resize Transform panel"><span></span></button>'+
'<div class="ad4-v3-transform-top"><strong>Transform</strong><small id="ad4-v3-transform-help">Select a model on the plate to transform it</small></div>'+
'<nav class="ad4-v3-mode"><button type="button" data-mode="translate">'+svg("move")+'Move</button><button type="button" data-mode="rotate">'+svg("rotate")+'Rotate</button><button type="button" data-mode="scale">'+svg("scale")+'Scale</button></nav>'+
'<div class="ad4-v3-camera-toolbar" aria-label="3D camera views"><button id="ad4-v3-view-fit" type="button">Fit model</button><button id="ad4-v3-view-top" type="button">Top view</button><button id="ad4-v3-view-iso" type="button">Isometric</button></div>'+
'<div class="ad4-v3-snap"><label><input id="ad4-v3-snap" type="checkbox" checked> Snap 5 units</label><label id="ad4-v3-lock-wrap"><input id="ad4-v3-resize-lock" type="checkbox" checked> Lock proportions</label></div>'+
 '<div class="ad4-v3-axis-list"></div>'+
'<div class="ad4-v3-transform-actions"><button type="button" id="ad4-v3-rotate90">Rotate Z +45°</button><button type="button" id="ad4-v3-transform-reset">Reset selected axis</button><button type="button" id="ad4-v3-transform-apply">Apply</button></div>';
root.append(transform);
const axisList=transform.querySelector(".ad4-v3-axis-list");
let mode="rotate";
const rulers=new Map();
let synchronizing=false;
const limits={translate:[-110,110],rotate:[-180,180],scale:[10,250]};
const units={translate:" mm",rotate:"°",scale:"%"};
const axisRows={};
for(const axis of ["x","y","z"]){
 const row=make("section","ad4-v3-axis");row.dataset.axis=axis;
 row.innerHTML='<div class="ad4-v3-axis-top"><b>'+axis.toUpperCase()+'</b>'+
 '<input class="ad4-v3-axis-value" type="number" step="1" value="0" aria-label="'+axis.toUpperCase()+' exact value">'+
 '<span class="ad4-v3-axis-unit">°</span>'+
 '<div class="ad4-v3-axis-step"><button type="button" data-offset="-45">−45°</button><button type="button" data-offset="45">+45°</button></div></div>'+
 '<div class="ad4-v3-axis-ruler" role="slider" tabindex="0" aria-label="'+axis.toUpperCase()+' ruler" aria-valuemin="-180" aria-valuemax="180" aria-valuenow="0">'+
 '<span class="ad4-v3-ruler-needle" aria-hidden="true"></span></div>';
 axisList.append(row);axisRows[axis]=row;
 const numeric=row.querySelector(".ad4-v3-axis-value");
 numeric.addEventListener("change",()=>setAxis(axis,Number(numeric.value)));
 numeric.addEventListener("blur",()=>setAxis(axis,Number(numeric.value)));
 numeric.addEventListener("keydown",e=>{if(e.key==="Enter")numeric.blur()});
 row.querySelectorAll("[data-offset]").forEach(b=>b.addEventListener("click",()=>{
   if(mode!=="rotate")return;
   const old=Number(sourceAxis(axis)?.value)||0;
   setAxis(axis,((old+Number(b.dataset.offset)+540)%360)-180,{exact:true});
 }));
 const holder=row.querySelector(".ad4-v3-axis-ruler");
 holder.addEventListener("keydown",e=>{
   if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
   e.preventDefault();
   const [min,max]=limits[mode],snap=$("ad4-v3-snap").checked;
   const step=snap?5:1;
   const current=Number(sourceAxis(axis)?.value)||0;
   const val=e.key==="Home"?min:e.key==="End"?max:current+(e.key==="ArrowRight"?step:-step);
   setAxis(axis,val);
 });
}
function sourceAxis(axis){
 const prefix=mode==="rotate"?"rotation":mode==="translate"?"movement":"scale";
 return $(prefix+"-"+axis+"-value");
}
function hasSelection(){return Boolean(globalThis.app?.gui?.model_viewer?.focused)}
function normalized(mode,value,snap,exact){
 const [low,high]=limits[mode];
 if(!Number.isFinite(value))return null;
 const rounded=snap&&!exact?Math.round(value/5)*5:value;
 return Math.max(low,Math.min(high,rounded));
}
function renderAxis(axis,current){
 const row=axisRows[axis],input=row.querySelector(".ad4-v3-axis-value");
 input.value=String(Number(current.toFixed(3)));
 const holder=row.querySelector(".ad4-v3-axis-ruler"),number=Number(input.value);
 row.querySelector(".ad4-v3-axis-unit").textContent=units[mode];
 holder.setAttribute("aria-valuenow",String(number));
 holder.setAttribute("aria-valuetext",number+units[mode]);
 holder.setAttribute("aria-valuemin",String(limits[mode][0]));
 holder.setAttribute("aria-valuemax",String(limits[mode][1]));
 const inst=rulers.get(axis);
 if(inst&&inst.options.currentValue!==number){
   synchronizing=true;
   inst.options.currentValue=number;
   try{inst.dreawCanvas()}finally{synchronizing=false}
 }
}
function refreshAxis(){
 for(const axis of ["x","y","z"]){
   const read=Number(sourceAxis(axis)?.value),number=Number.isFinite(read)?read:mode==="scale"?100:0;
   renderAxis(axis,number);
 }
}
function setAxis(axis,raw,{exact=false}={}){
 if(!hasSelection()){notify("Tap a model to select it before transforming");return}
 const snap=$("ad4-v3-snap").checked;
 const value=normalized(mode,raw,snap,exact);
 if(value===null){notify("Enter a valid numeric value");return}
 const old=Number(sourceAxis(axis)?.value)|| (mode==="scale"?100:0);
 const locked=mode==="scale"&&$("ad4-v3-resize-lock").checked;
 if(mode==="scale")lockLabel.querySelector("input").checked=locked;
 const factor=locked&&old!==0?value/old:1;
 const plate=globalThis.app?.gui?.model_viewer;
 plate?.ad4_begin_transform?.();
 for(const key of locked?["x","y","z"]:[axis]){
  const source=sourceAxis(key);if(!source)continue;
  const prior=Number(source.value);
  const target=key===axis?value:Math.min(250,Math.max(10,Number((prior*factor).toFixed(5))));
  source.value=String(target);
  source.dispatchEvent(new Event("input",{bubbles:true}));
 }
 const accepted=plate?.ad4_commit_transform?.();
 if(accepted===false) updateCompactValues();
 $("slice-export-container")?.setAttribute("data-active","false");
 refreshAxis();
 updateCompactValues();
 if(mode==="scale")captureScaleBaseline();
}
function initRulers(){
 const Slider=globalThis.SlideRuler?.default||globalThis.SlideRuler;
 for(const axis of ["x","y","z"]){
  const row=axisRows[axis],holder=row.querySelector(".ad4-v3-axis-ruler");
  const [min,max]=limits[mode],value=Number(sourceAxis(axis)?.value)|| (mode==="scale"?100:0);
  const width=Math.max(150,holder.clientWidth),existing=rulers.get(axis);
  if(existing&&existing.options.canvasWidth===width&&existing.options.minValue===min&&existing.options.maxValue===max)continue;
  holder.querySelector("canvas")?.remove();rulers.delete(axis);
  if(typeof Slider==="function"){
   synchronizing=true;
   try{
    const createdMode=mode;
    const ruler=new Slider({el:holder,canvasWidth:width,canvasHeight:63,minValue:min,maxValue:max,
     currentValue:value,precision:$("ad4-v3-snap").checked?5:1,divide:11,
     colorDecimal:"#a0b3ab",colorDigit:"#697e78",fontColor:"#bfd3ca",
     fontSize:12,heightDecimal:24,heightDigit:12,handleValue:next=>{
      // A ruler can finish a swipe after the user switches Scale -> Rotate.
      // Never apply an old scale value to a different transform mode.
      if(synchronizing||mode!==createdMode||!holder.isConnected)return;
      setAxis(axis,next);
     }});
    rulers.set(axis,ruler);
   }finally{synchronizing=false}
  }else{
   // Explicit unavailable state, rather than a fake nonfunctional slider.
   holder.setAttribute("aria-disabled","true");
   holder.title="Ruler library unavailable; numeric editor remains functional";
  }
 }
 refreshAxis();
}
const viewerTransform=make("nav","ad4-viewer-transform");
viewerTransform.id="ad4-viewer-transform";
viewerTransform.setAttribute("aria-label","Model transforms");
for(const [type,iconName,label] of [["translate","move","Move"],["rotate","rotate","Rotate"],["scale","scale","Scale"]]){
 const btn=navButton(iconName,label,()=>{if(!hasSelection()){notify("Select a model on the plate");return}setTransform(activeViewerMode===type?null:type)});
 btn.dataset.viewerMode=type;btn.setAttribute("aria-label",label+" selected model");
 viewerTransform.append(btn);
}
// Permanent plate tools beside Move / Rotate / Scale. Clone always repacks.
const arrangeButton=navButton("layout-grid","Arrange",()=>{
 const plate=globalThis.app?.gui?.model_viewer;
 if(!plate?.ad4_auto_arrange){notify("Model editor is still loading");return}
 plate.ad4_auto_arrange();
});
arrangeButton.id="ad4-v3-auto-arrange";
arrangeButton.setAttribute("aria-label","Auto arrange all models without collisions");
arrangeButton.title="Auto Arrange · keep every model inside the build plate";
viewerTransform.append(arrangeButton);
const cloneButton=navButton("copy-plus","Clone",()=>{
 const plate=globalThis.app?.gui?.model_viewer;
 if(!plate?.ad4_clone_selected){notify("Model editor is still loading");return}
 plate.ad4_clone_selected();
});
cloneButton.id="ad4-v3-clone";
cloneButton.setAttribute("aria-label","Clone selected model and auto arrange");
cloneButton.title="Clone selected model and arrange all without collisions";
viewerTransform.append(cloneButton);
function updatePlateButtons(){
 arrangeButton.disabled=modelCount()===0;
 cloneButton.disabled=!hasSelection();
}
document.addEventListener("ad4:models-changed",updatePlateButtons);
setInterval(updatePlateButtons,300);
updatePlateButtons();
let activeViewerMode=null;
const compactValues=make("div","ad4-viewer-values");compactValues.id="ad4-viewer-values";compactValues.hidden=true;
for(const axis of ["x","y","z"]){const label=make("label","ad4-viewer-value-row");label.innerHTML='<span>'+axis.toUpperCase()+'</span><input type="number" inputmode="decimal" step="any" aria-label="'+axis.toUpperCase()+' transform value"><span class="ad4-viewer-value-unit"></span>';const input=label.querySelector("input");input.addEventListener("change",()=>setAxis(axis,Number(input.value),{exact:true}));input.addEventListener("keydown",e=>{if(e.key==="Enter")input.blur()});compactValues.append(label)}
const editorBox=make("div","ad4-viewer-editor-box");editorBox.hidden=true;
editorBox.append(compactValues);
const snapLabel=make("label","ad4-viewer-snap");
snapLabel.innerHTML='<input id="ad4-viewer-snap" type="checkbox" checked><span>Snap 5</span>';
editorBox.append(snapLabel);
const lockLabel=make("label","ad4-viewer-lock");lockLabel.innerHTML='<input id="ad4-viewer-lock" type="checkbox" checked><span>Lock proportions</span>';lockLabel.hidden=true;editorBox.append(lockLabel);
viewerTransform.append(editorBox);
$("viewer")?.append(viewerTransform);
lockLabel.querySelector("input").addEventListener("change",e=>{$("ad4-v3-resize-lock").checked=e.target.checked;captureScaleBaseline()});
let scaleBaseline=null,scaleDragActive=false,scaleSyncing=false;
function captureScaleBaseline(){const mesh=globalThis.app?.gui?.model_viewer?.model_controls?.object;scaleBaseline=mesh?mesh.scale.clone():null}
function ensureScaleLock(){
 const controls=globalThis.app?.gui?.model_viewer?.model_controls;
 if(!controls||controls.__ad4ScaleLockAttached)return;
 controls.__ad4ScaleLockAttached=true;
 controls.addEventListener("mouseDown",()=>{scaleDragActive=true;captureScaleBaseline()});
 controls.addEventListener("mouseUp",()=>{scaleDragActive=false;captureScaleBaseline()});
 controls.addEventListener("objectChange",()=>{
  if(scaleSyncing||!scaleDragActive||activeViewerMode!=="scale"||!lockLabel.querySelector("input").checked||!scaleBaseline||!controls.object)return;
  const mesh=controls.object,old=scaleBaseline,now=mesh.scale;
  const axes=["x","y","z"].filter(a=>Math.abs(old[a])>1e-8);
  if(!axes.length)return;
  const axis=axes.reduce((best,a)=>Math.abs(now[a]/old[a]-1)>Math.abs(now[best]/old[best]-1)?a:best,axes[0]);
  const ratio=now[axis]/old[axis];if(!Number.isFinite(ratio)||ratio<=0)return;
  scaleSyncing=true;
  try{for(const a of axes)now[a]=old[a]*ratio;mesh.updateMatrixWorld(true)}finally{scaleSyncing=false}
 });
}
const scaleLockPoll=setInterval(()=>{ensureScaleLock();if(activeViewerMode==="scale"&&!scaleDragActive&&!scaleBaseline)captureScaleBaseline()},500);
snapLabel.querySelector("input").addEventListener("change",e=>{$("ad4-v3-snap").checked=e.target.checked;if(activeViewerMode)setTransform(mode)});
function setTransform(next){
 activeViewerMode=next;
 editorBox.hidden=next===null;
 compactValues.hidden=next===null;
 lockLabel.hidden=next!=="scale";
 snapLabel.hidden=next===null;
 if(next===null){for(const b of viewerTransform.querySelectorAll("[data-viewer-mode]"))b.setAttribute("aria-pressed","false");
  globalThis.app?.gui?.model_viewer?.model_controls?.detach?.();return;}
 mode=next;
 if(next==="scale"){ensureScaleLock();captureScaleBaseline();lockLabel.querySelector("input").checked=$("ad4-v3-resize-lock").checked;}
 for(const b of viewerTransform.querySelectorAll("[data-viewer-mode]"))b.setAttribute("aria-pressed",String(b.dataset.viewerMode===next));
 for(const b of transform.querySelectorAll("[data-mode]"))b.setAttribute("aria-pressed",String(b.dataset.mode===next));
 const focused=globalThis.app?.gui?.model_viewer?.focused,controls=globalThis.app?.gui?.model_viewer?.model_controls;
 if(focused&&controls?.mode!==next){
  const btn=$(next==="translate"?"movement-button":next==="rotate"?"rotate-button":"scale-button");
  btn?.firstElementChild?.click();
 }
 $("ad4-v3-rotate90").hidden=next!=="rotate";
 $("ad4-v3-lock-wrap").hidden=next!=="scale";
 for(const axis of ["x","y","z"]){
  const row=axisRows[axis],input=row.querySelector(".ad4-v3-axis-value");
  input.min=String(limits[next][0]);input.max=String(limits[next][1]);
  input.step=$("ad4-v3-snap").checked?"5":"1";
  row.querySelector(".ad4-v3-axis-step").hidden=next!=="rotate";
 }
 rulers.clear();
 for(const row of Object.values(axisRows))row.querySelector("canvas")?.remove();
 $("ad4-v3-transform-help").textContent=focused?"Swipe the ruler or edit a value":"Tap the model on the bed to select it";
 // Reflect the newly selected native mode immediately; never show Scale % as Rotate °.
 refreshAxis();
 updateCompactValues();
 requestAnimationFrame(initRulers);
}
// Read the live Three.js mesh rather than the native text inputs: upstream
// updates those inputs only after dragging ends, so they lag the gizmo.
function liveTransformValue(mesh,axis){
 if(mode==="scale")return mesh.scale[axis]*100;
 if(mode==="rotate")return mesh.rotation[axis]*180/Math.PI+(axis==="x"?90:0);
 if(axis==="x")return mesh.position.x;
 if(axis==="y")return mesh.position.z;
 mesh.geometry?.computeBoundingBox?.();
 const half=(mesh.geometry?.boundingBox?.max?.z-mesh.geometry?.boundingBox?.min?.z)/2||0;
 return mesh.position.y-half;
}
function updateCompactValues(){
 if(!activeViewerMode)return;
 const mv=globalThis.app?.gui?.model_viewer;
 const mesh=mv?.models?.[mv.focused]?.mesh;
 const rows=compactValues.querySelectorAll(".ad4-viewer-value-row");
 for(const [i,axis] of ["x","y","z"].entries()){
  const row=rows[i],field=row.querySelector("input");
  if(document.activeElement!==field){
   const value=mesh?liveTransformValue(mesh,axis):Number(sourceAxis(axis)?.value);
   const next=Number.isFinite(value)?String(Number(value.toFixed(3))):"";
   if(field.value!==next)field.value=next;
  }
  row.querySelector(".ad4-viewer-value-unit").textContent=units[mode];
 }
}
// TransformControls emits objectChange on every drag update, not only mouseUp.
let liveValueFrame=0;
function scheduleLiveTransformValues(){
 if(liveValueFrame)return;
 liveValueFrame=requestAnimationFrame(()=>{liveValueFrame=0;updateCompactValues()});
}
function bindLiveTransformValues(){
 const controls=globalThis.app?.gui?.model_viewer?.model_controls;
 if(!controls||controls.__ad4LiveValuesBound)return;
 controls.__ad4LiveValuesBound=true;
 controls.addEventListener("objectChange",scheduleLiveTransformValues);
 controls.addEventListener("mouseDown",scheduleLiveTransformValues);
 controls.addEventListener("mouseUp",scheduleLiveTransformValues);
}
bindLiveTransformValues();
// Also pick up model selection / programmatic transforms without dragging.
setInterval(()=>{bindLiveTransformValues();updateCompactValues()},250);
/* Actual three.js camera, no fake screenshots or alternative model renderer. */
function cameraView(preset){
 const renderer=globalThis.app?.gui?.renderer;
 const camera=renderer?.camera,orbit=renderer?.controls;
 if(!camera||!orbit){notify("3D camera is not ready");return}
 const objects=Object.values(globalThis.app?.gui?.model_viewer?.models||{});
 const selected=globalThis.app?.gui?.model_viewer?.focused;
 const target=selected&&objects.find(o=>o?.mesh?.uuid===selected);
 const objs=target?[target]:objects;
 if(!objs.length){notify("Load a model first");return}
 const centers=[],radii=[];
 for(const obj of objs){
  const mesh=obj.mesh;if(!mesh)continue;
  mesh.geometry?.computeBoundingBox?.();
  const bounds=mesh.geometry?.boundingBox;
  const scale=mesh.scale||{x:1,y:1,z:1};
  const half=bounds?Math.max(
    (bounds.max.x-bounds.min.x)*Math.abs(scale.x),
    (bounds.max.y-bounds.min.y)*Math.abs(scale.y),
    (bounds.max.z-bounds.min.z)*Math.abs(scale.z))/2:15;
  centers.push({x:mesh.position.x,y:mesh.position.y,z:mesh.position.z});
  radii.push(half);
 }
 if(!centers.length)return;
 const center={x:centers.reduce((n,c)=>n+c.x,0)/centers.length,
 y:centers.reduce((n,c)=>n+c.y,0)/centers.length,
 z:centers.reduce((n,c)=>n+c.z,0)/centers.length};
 const radius=Math.max(22,...radii);
 const distance=preset==="fit"?Math.max(95,radius*4.2):Math.max(125,radius*4);
 orbit.target.set(center.x,center.y,center.z);
 if(preset==="top")camera.position.set(center.x,center.y+distance,center.z+.01);
 else camera.position.set(center.x+distance*.65,center.y+distance*.72,center.z+distance*.65);
 camera.lookAt(center.x,center.y,center.z);orbit.update();
 notify(preset==="top"?"Top view":preset==="fit"?"Model fitted":"Isometric view");
}
for(const [preset,id] of [["fit","ad4-v3-view-fit"],["top","ad4-v3-view-top"],["iso","ad4-v3-view-iso"]]){
 $(id)?.addEventListener("click",()=>cameraView(preset));
}
/* Swipe the segmented mode control, never the ruler or the STL canvas. */
const transformModes=["translate","rotate","scale"];
const modeBar=transform.querySelector(".ad4-v3-mode");
let swipeStart=null;
modeBar?.addEventListener("pointerdown",event=>{swipeStart={x:event.clientX,y:event.clientY};});
modeBar?.addEventListener("pointerup",event=>{
 if(!swipeStart)return;
 const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
 swipeStart=null;
 if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.3)return;
 const idx=transformModes.indexOf(mode),next=Math.max(0,Math.min(2,idx+(dx<0?1:-1)));
 if(next!==idx)setTransform(transformModes[next]);
});



for(const b of transform.querySelectorAll("[data-mode]"))b.addEventListener("click",()=>setTransform(b.dataset.mode));
$("ad4-v3-snap").addEventListener("change",()=>setTransform(mode));
$("ad4-v3-resize-lock").addEventListener("change",()=>refreshAxis());
$("ad4-v3-rotate90").addEventListener("click",()=>{
 if(mode!=="rotate")return;
 const value=Number(sourceAxis("z")?.value)||0;
 setAxis("z",((value+225)%360)-180,{exact:true});
});
$("ad4-v3-transform-reset").addEventListener("click",()=>{
 for(const axis of ["x","y","z"]){
  if(!hasSelection())break;
  // Reset the selected transform only, leaving the other modes untouched.
  setAxis(axis,mode==="scale"?100:0,{exact:true});
 }
});
$("ad4-v3-transform-apply").addEventListener("click",()=>activate("preview"));
const handle=$("ad4-v3-sheet-handle");
let dragAt=null;
handle?.addEventListener("pointerdown",e=>{
 dragAt={y:e.clientY,height:transform.getBoundingClientRect().height};
 handle.setPointerCapture(e.pointerId);
});
handle?.addEventListener("pointermove",e=>{
 if(!dragAt)return;
 const height=Math.max(220,Math.min(innerHeight*.67,dragAt.height+dragAt.y-e.clientY));
 root.style.setProperty("--ad4-transform-height",height+"px");
});
handle?.addEventListener("pointerup",e=>{
 if(!dragAt)return;
 dragAt=null;
 const height=transform.getBoundingClientRect().height;
 const target=height<270?225:height<440?350:Math.round(innerHeight*.65);
 root.style.setProperty("--ad4-transform-height",target+"px");
 dispatchEvent(new Event("resize"));requestAnimationFrame(initRulers);
});
const app=make("section","ad4-v3-app");app.id="ad4-v3-app";
app.innerHTML='<h2>App settings</h2><p>AD4 Studio · FlashForge Adventurer 4</p>'+
'<div class="ad4-v3-app-card"><strong>Slicing engine</strong><span>CuraEngine · Linux server only</span><small>GitHub Pages is a visual-only preview. Real slice, print and camera require your authenticated server.</small></div>'+
'<div class="ad4-v3-app-card"><strong>Saved profiles</strong><span>Browser-local process and Artillery PLA settings</span><div class="ad4-v3-app-actions"><button id="ad4-v3-export-profiles">'+svg("upload")+' Export profiles</button><button id="ad4-v3-import-profiles">'+svg("file")+' Import profiles</button></div><input id="ad4-v3-profile-file" type="file" accept=".json,application/json" hidden></div>'+
'<div class="ad4-v3-app-card"><strong>Project</strong><a href="https://github.com/spidey000/FFAdv4Manager_cura" target="_blank" rel="noopener noreferrer">FFAdv4Manager_cura on GitHub</a></div>';
root.append(app);
const PRESET_KEY="ffadv4-mosaic-custom-presets-v1";
$("ad4-v3-export-profiles").addEventListener("click",()=>{
 const json=localStorage.getItem(PRESET_KEY)||'{"process":[],"material":[]}';
 const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
 const a=make("a");a.href=url;a.download="AD4_Studio_profiles.json";a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("ad4-v3-import-profiles").addEventListener("click",()=>$("ad4-v3-profile-file").click());
$("ad4-v3-profile-file").addEventListener("change",async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>1048576)throw Error("The preset file is too large");
  const json=JSON.parse(await file.text());
  const clean={process:[],material:[]};
  for(const type of ["process","material"]){
   if(!Array.isArray(json[type]))throw Error("Missing "+type+" preset list");
   for(const item of json[type].slice(0,40)){
    if(!item||typeof item.name!=="string"||!item.values||typeof item.values!=="object")continue;
    const safe={};
    for(const [key,value] of Object.entries(item.values)){
     if(typeof value==="boolean"||(typeof value==="number"&&Number.isFinite(value)))safe[key]=value;
    }
    clean[type].push({name:item.name.slice(0,49),values:safe});
   }
  }
  if(!confirm("Import browser-local presets? Existing custom presets will be replaced after refreshing the page."))return;
  localStorage.setItem(PRESET_KEY,JSON.stringify(clean));
  notify("Profiles imported. Reload the app to use them.");
 }catch(error){notify("Profile import failed: "+error.message)}finally{e.target.value=""}
});
/* Reuse the live printer controller directly in the Printer workspace.
 * No duplicate controls or modal: every card targets its real backend API.
 */
const manager=$("ad4-manager");
if(manager){
 const names={
  "Current print":"live","Print controls":"controls","Printer files":"files","Camera":"camera",
  "Timelapses":"timelapse","Printer connections and diagnostics":"connection",
  "Files and diagnostics":"tools"
 };
 for(const section of manager.querySelectorAll(":scope > .ad4-section")){
  const title=section.querySelector("h3,summary")?.textContent?.trim();
  if(names[title])section.dataset.printerFeature=names[title];
 }
 manager.querySelector("details.ad4-section")?.setAttribute("open","");
}
function openPrinter(pane="controls"){
 if(current!=="printer")activate("printer");
 const key={live:"live",control:"controls",files:"files",camera:"camera",
  timelapse:"timelapse",connection:"connection",diagnostics:"connection",tools:"tools"}[pane]||"controls";
 requestAnimationFrame(()=>{
  const target=manager?.querySelector('[data-printer-feature="'+key+'"]');
  if(target?.tagName==="DETAILS")target.open=true;
  target?.scrollIntoView({block:"start",behavior:"smooth"});
 });
}

function toolBtn(symbol,label,fn,id){
 const b=navButton(symbol,label,fn);if(id)b.id=id;return b;
}
const editorButtons={
 file:()=>activate("preview"),
 camera:()=>{activate("printer");if(!staticPreview)openPrinter("camera")},
 orient:()=>{activate("transform");setTransform("rotate")},
 move:()=>{activate("transform");setTransform("translate")},
 slice:()=>{if(sliceReady())activate("sliced");else if(staticPreview||!hasModel())activate("slice-info");else $("ad4-dock-slice")?.click()}
};
// File and Slice are separate workflows. Model selection gets its own dock item.
const modelsDock=toolBtn("boxes","Models",toggleModelsMenu,"ad4-v3-nav-models");
modelsDock.disabled=true;
modelsDock.setAttribute("aria-expanded","false");
modelsDock.setAttribute("aria-controls","ad4-v3-models-menu");
bottom.append(
 toolBtn("file","File",editorButtons.file,"ad4-v3-nav-file"),
 modelsDock,
 toolBtn("layers","Slice",editorButtons.slice,"ad4-v3-nav-slice")
);

const modelsMenu=make("section","ad4-v3-models-menu");
modelsMenu.id="ad4-v3-models-menu";
modelsMenu.hidden=true;
modelsMenu.setAttribute("aria-label","Loaded models");
modelsMenu.innerHTML='<div class="ad4-v3-models-head"><strong>'+svg("boxes")+' Models</strong><span id="ad4-v3-models-count">0 models</span></div><div id="ad4-v3-models-list" class="ad4-v3-models-list" role="list"></div>';
root.append(modelsMenu);
let modelsMenuOpen=false;
function modelViewerAPI(){return globalThis.app?.gui?.model_viewer}
function syncModelsDock(){
 if(!modelsDock)return;
 const available=modelCount()>0;
 modelsDock.disabled=!available;
 modelsDock.setAttribute("aria-disabled",String(!available));
 if(!available&&modelsMenuOpen)closeModelsMenu();
 modelsDock.setAttribute("aria-expanded",String(modelsMenuOpen));
 modelsDock.setAttribute("aria-pressed",String(modelsMenuOpen));
 const fileDock=$("ad4-v3-nav-file");
 if(fileDock&&modelsMenuOpen)fileDock.setAttribute("aria-pressed","false");
}
function closeModelsMenu(){
 if(!modelsMenuOpen)return;
 modelsMenuOpen=false;
 modelsMenu.hidden=true;
 root.classList.remove("ad4-models-open");
 syncModelsDock();
}
function toggleModelsMenu(){
 if(!modelCount())return;
 if(modelsMenuOpen){closeModelsMenu();return}
 if(current!=="preview")activate("preview");
 modelsMenuOpen=true;
 modelsMenu.hidden=false;
 root.classList.add("ad4-models-open");
 renderModelsMenu();
 syncModelsDock();
}
function renderModelsMenu(){
 if(!modelsMenuOpen)return;
 const mv=modelViewerAPI(),models=mv?.models||{};
 const entries=Object.entries(models),list=$("ad4-v3-models-list");
 list.replaceChildren();
 $("ad4-v3-models-count").textContent=entries.length+" "+(entries.length===1?"model":"models");
 for(const [uuid,model] of entries){
  const name=model.name||model.mesh?.name||"Model "+(entries.findIndex(item=>item[0]===uuid)+1);
  const row=make("div","ad4-v3-models-row");
  row.setAttribute("role","listitem");
  row.dataset.modelUuid=uuid;
  if(mv.focused===uuid)row.classList.add("selected");
  const select=make("button","ad4-v3-model-select");
  select.type="button";select.title="Select "+name;select.setAttribute("aria-label","Select "+name);
  select.innerHTML=svg("box")+'<span class="ad4-v3-model-name"></span>';
  select.querySelector(".ad4-v3-model-name").textContent=name;
  select.addEventListener("click",()=>{
   if(mv.ad4_select_model?.(uuid)){renderModelsMenu()}
   else notify("Model selection is unavailable; rebuild the UI from the current source");
  });
  const visible=make("label","ad4-v3-model-visible");
  visible.title="Show or hide "+name+" in preview (does not affect slicing)";
  const toggle=make("input");toggle.type="checkbox";toggle.checked=model.mesh?.visible!==false;
  toggle.setAttribute("aria-label","Show "+name+" in preview");
  const switchText=make("span","ad4-v3-toggle-track");switchText.setAttribute("aria-hidden","true");
  visible.append(toggle,switchText);
  toggle.addEventListener("change",()=>{
   if(!mv.ad4_set_model_visible?.(uuid,toggle.checked)){
    toggle.checked=!toggle.checked;notify("Model visibility is unavailable");return;
   }
   // Preview visibility must not invalidate slicing or change STL export.
   if(!toggle.checked && mv.focused===uuid && activeViewerMode)setTransform(null);
   renderModelsMenu();
  });
  const remove=make("button","ad4-v3-model-remove");
  remove.type="button";remove.title="Remove "+name;
  remove.setAttribute("aria-label","Delete "+name);
  remove.innerHTML=svg("x");
  remove.addEventListener("click",()=>{
   if(!confirm("Delete model “"+name+"” from the build plate?"))return;
   if(!mv.ad4_delete_model?.(uuid)){notify("Model deletion is unavailable");return}
   renderModelsMenu();refreshState();renderTools();
  });
  row.append(select,visible,remove);list.append(row);
 }
 globalThis.AD4Icons?.hydrate(modelsMenu);
}
document.addEventListener("ad4:models-changed",()=>{
 syncModelsDock();
 if(modelsMenuOpen)renderModelsMenu();
});
document.addEventListener("pointerdown",event=>{
 if(!modelsMenuOpen)return;
 if(modelsMenu.contains(event.target)||modelsDock.contains(event.target))return;
 closeModelsMenu();
},true);
document.addEventListener("focusin",event=>{
 if(!modelsMenuOpen)return;
 if(modelsMenu.contains(event.target)||modelsDock.contains(event.target))return;
 closeModelsMenu();
});

function actionButton(id,label,click,primary=false){
 const b=make("button","ad4-v3-action"+(primary?" primary":""),label);b.id=id;b.type="button";b.addEventListener("click",click);return b;
}
const openModel=actionButton("ad4-v3-open-model","Open model",()=>$("ad4-dock-model")?.click());
const removeModel=actionButton("ad4-v3-remove-model","Remove model",()=>{
 const focused=globalThis.app?.gui?.model_viewer?.focused;
 if(!focused){notify("Select a model on the plate to remove it");return}
 if(!confirm("Remove the selected model?"))return;
 $("context-delete")?.click();
  setTimeout(()=>{refreshState();renderTools()},150);
});
const demoModel=actionButton("ad4-v3-demo","3DBenchy",()=>$("ad4-dock-demo")?.click());
const previewLayers=actionButton("ad4-v3-show-layers","Layer types",toggleLayerTypePanel);
function updateLayerViewButton(){
 const label=showTypes?"Layer range":"Layer types";
 const iconName=showTypes?"sliders-horizontal":"layers";
 previewLayers.innerHTML='<span class="ad4-action-icon" aria-hidden="true">'+svg(iconName)+'</span><span class="ad4-action-text">'+label+'</span>';
 previewLayers.setAttribute("aria-label",showTypes?"Show layer range controls":"Show layer types and visibility");
 globalThis.AD4Icons?.hydrate(previewLayers);
}
updateLayerViewButton();
const exportGcode=actionButton("ad4-v3-export","Export G-code",()=>$("export-gcode-button")?.click());
const upload=actionButton("ad4-v3-send","Send to printer",()=>{if(!staticPreview)globalThis.AD4Printer?.upload(false)});
const print=actionButton("ad4-v3-print","Send and print now",()=>{if(!staticPreview)globalThis.AD4Printer?.upload(true)},true);
const runSlice=actionButton("ad4-v3-run-slice","Slice model",()=>{if(!staticPreview)$("ad4-dock-slice")?.click();else notify("Slicing requires the private CuraEngine server")},true);
function renderTools(){
 action.replaceChildren();
 if(current==="preview"){
  action.append(openModel,removeModel,...(staticPreview?[demoModel]:[]),...(staticPreview?[]:[runSlice]));
 }else if(current==="sliced"){
  action.append(previewLayers,exportGcode,upload,print);
 }
 // Profile save/update actions live inside "Profiles & filters". Do not duplicate
 // them as a large green action that only toggles the panel (and can close it).

 globalThis.AD4Icons?.hydrate(action);
 for(const b of bottom.querySelectorAll("button")){
  b.setAttribute("aria-pressed",String(
   current==="transform"?b.id==="ad4-v3-nav-move":
   current==="sliced"||current==="slice-info"?b.id==="ad4-v3-nav-slice":
   current==="preview"?b.id==="ad4-v3-nav-file":false
  ));
 }
 syncModelsDock();
 runSlice.hidden=staticPreview||!hasModel()||sliceReady();
 runSlice.disabled=staticPreview||currentPlateStatus()?.valid!==true;
  removeModel.hidden=!hasModel();
 previewLayers.hidden=!sliceReady();
 exportGcode.disabled=!sliceReady();
 upload.disabled=staticPreview||!sliceReady();
 print.disabled=staticPreview||!sliceReady();
}
function checkStatus(){}
$("ad4-v3-file-label")?.addEventListener("click",()=>$("ad4-dock-model")?.click());
$("stl-file")?.addEventListener("change",()=>{activate("preview");setTimeout(refreshState,500)});


const PLA_DIAMETER_MM=1.75,PLA_DENSITY_G_CM3=1.24;
function gramsFromFilamentMm(mm){
 return mm*Math.PI*Math.pow(PLA_DIAMETER_MM/2,2)*PLA_DENSITY_G_CM3/1000;
}
function formatWeightGrams(grams){
 return Number.isFinite(grams)&&grams>=0?(grams>=10?String(Math.round(grams)):String(Number(grams.toFixed(1))))+" g":"— g";
}
function formatPrintClock(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return "—";
 // Round upwards once; omit all zero units.
 const totalMinutes=Math.ceil(seconds/60);
 const days=Math.floor(totalMinutes/1440);
 const hours=Math.floor((totalMinutes%1440)/60);
 const minutes=totalMinutes%60;
 // Examples: 1h45m, 2d 44m, 2d 3h5m, 44m, 2d, 0m.
 const clock=(hours?hours+"h":"")+(minutes?minutes+"m":"");
 return (days?days+"d"+(clock?" ":""):"")+(clock||(!days?"0m":""));
}
function parsePrintTime(raw){
 const value=String(raw||"").trim().toLowerCase().replace(/,/g,".");
 if(!value||/not reported|unknown|demo|unavailable/.test(value))return NaN;
 const dayClock=value.match(/^(\d+)\s+(\d{1,2}):(\d{2})$/);
 if(dayClock)return (+dayClock[1]*86400)+(+dayClock[2]*3600)+(+dayClock[3]*60);
 const clock=value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(clock)return +clock[1]*3600+(+clock[2])*60+(+clock[3]||0);
 let seconds=0,found=false;
 for(const m of value.matchAll(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)(?=\s*(?:\d|$))/g)){
  const n=Number(m[1]),unit=m[2];
  seconds+=n*(/^d/.test(unit)?86400:/^h/.test(unit)?3600:/^m/.test(unit)?60:1);
  found=true;
 }
 return found?seconds:NaN;
}
function parseFilamentGrams(raw){
 const m=String(raw||"").trim().toLowerCase().replace(/,/g,".").match(/^(\d+(?:\.\d+)?)\s*(mm|m|g|grams?)$/);
 if(!m)return NaN;
 const n=Number(m[1]);
 return m[2]==="mm"?gramsFromFilamentMm(n):m[2]==="m"?gramsFromFilamentMm(n*1000):n;
}
let demoStatsSource=null,demoStats={clock:"—",weight:"— g"};
function getDemoStats(){
 const gcode=globalThis.app?.gui?.slicer?.exported_gcode;
 if(typeof gcode!=="string"||!gcode)return {clock:"—",weight:"— g"};
 if(gcode===demoStatsSource)return demoStats;
 demoStatsSource=gcode;
 // Pages showcases a non-printable fixture. Its figures are approximate,
 // derived from feedrates and extruded E in the demonstration toolpath.
 const times=estimateTypeTimes(gcode);
 const seconds=[...times.values()].reduce((sum,n)=>sum+n,0);
 let maxExtrusion=0;
 for(const match of gcode.matchAll(/(?:^|\n)G1[^\n]*\sE(\d+(?:\.\d+)?)/g)){
  maxExtrusion=Math.max(maxExtrusion,Number(match[1]));
 }
 demoStats={clock:formatPrintClock(seconds),weight:formatWeightGrams(gramsFromFilamentMm(maxExtrusion))};
 return demoStats;
}
function updatePrintStats(){
 const time=$("ad4-v3-time"),weight=$("ad4-v3-material");
 if(!time||!weight)return;
 if(staticPreview){
  const stats=getDemoStats();
  time.textContent=stats.clock;
  weight.textContent=stats.weight;
  time.parentElement.title="Illustrative time from demo G-code feedrates; not a CuraEngine estimate";
  weight.parentElement.title="Illustrative PLA mass from demo G-code extrusion; not a CuraEngine estimate";
 }else{
  time.textContent=formatPrintClock(parsePrintTime($("gcode-time-estimate")?.textContent));
  weight.textContent=formatWeightGrams(parseFilamentGrams($("material-estimate")?.textContent));
  time.parentElement.title="CuraEngine estimated print time (compact days, hours and minutes)";
  weight.parentElement.title="Approximate PLA mass (1.75 mm filament, 1.24 g/cm³)";
 }
 time.parentElement.setAttribute("aria-label","Print time "+time.textContent);
 weight.parentElement.setAttribute("aria-label","Filament "+weight.textContent);
}
let tick=0;
setInterval(()=>{
 refreshState();checkStatus();
  if(current==="preview"){removeModel.hidden=!hasModel()}
 if(++tick%3===0){
  if(current==="sliced")updatePrintStats();
  if(current==="transform"){
   const focused=globalThis.app?.gui?.model_viewer?.focused;
   $("ad4-v3-transform-help").textContent=focused?"Drag the axes or adjust values":"Tap the model on the bed to select it";
  }
 }
},1000);
addEventListener("keydown",e=>{
 if(e.key!=="Escape")return;
 if(modelsMenuOpen){closeModelsMenu();return}
 if(current!=="preview" && !manager?.open)activate("preview");
});
activate("preview");
queueMicrotask(()=>globalThis.AD4Icons?.hydrate());
})();
