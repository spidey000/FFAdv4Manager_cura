/* AD4 Studio v3. A full UX/navigation shell around the real Mosaic renderer.
 * No client slicing; the established server + protected printer bridge own actions.
 */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const staticPreview = window.__AD4_STATIC_PREVIEW__ === true;
const root = document.body;
const make = (tag,klass,text) => {
  const el = document.createElement(tag);
  if(klass) el.className=klass;
  if(text!==undefined) el.textContent=text;
  return el;
};
const icon = name => ({
  cube:'<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V7M12 12v10"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4L14 13l-3-3 3.7-3.7Z"/>',
  filament:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 8V3M15.5 14l4.3 2.5M8.5 14l-4.3 2.5"/>',
  printer:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6zM17 12h2"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-2.8 2.8a1.7 1.7 0 0 0-1.9-.3l-1.2.5-.6 2h-4l-.6-2-1.2-.5a1.7 1.7 0 0 0-1.9.3l-2.8-2.8A1.7 1.7 0 0 0 3 15l-.5-1.2-2-.6v-4l2-.6L3 7.4a1.7 1.7 0 0 0-.3-1.9l2.8-2.8a1.7 1.7 0 0 0 1.9.3L8.6 2.5l.6-2h4l.6 2 1.2.5a1.7 1.7 0 0 0 1.9-.3l2.8 2.8a1.7 1.7 0 0 0-.3 1.9l.5 1.2 2 .6v4l-2 .6z" transform="translate(1 1) scale(.9)"/>',
  file:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  camera:'<path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>',
  orient:'<path d="M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M22 12l-3-3m3 3-3 3"/>',
  move:'<path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3M12 21l-3-3m3 3 3-3"/>',
  rotate:'<path d="M4 12a8 8 0 1 1 3 6M4 19v-6h6"/>',
  scale:'<path d="M4 9V4h5M20 15v5h-5M4 4l7 7m9 9-7-7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
  sliders:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'
})[name] || '<circle cx="12" cy="12" r="8"/>';
const svg = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icon(name)+'</svg>';
const navButton = (name,label,click) => {
 const b=make("button","ad4-v3-icon-button");
 b.type="button";b.dataset.tab=name;b.innerHTML=svg(name)+"<span>"+label+"</span>";
 b.addEventListener("click",click);return b;
};
const TOP=[["cube","Preview","preview"],["wrench","Print","print"],["filament","Filament","filament"],["printer","Printer","printer"],["gear","App","app"]];
let current="preview",tool="file",managerPane="camera",lastGcode=false,previousModelCount=0;
const modelCount=()=>Object.keys(globalThis.app?.gui?.model_viewer?.models||{}).length;
const header=make("header","ad4-v3-header");header.id="ad4-v3-header";
header.innerHTML='<div class="ad4-v3-brand"><span class="ad4-v3-logo">'+svg("cube")+'</span><span><strong>AD4 Studio</strong><small>FlashForge Adventurer 4</small></span></div>'+
  '<button type="button" id="ad4-v3-status" aria-label="Printer status and navigation menu" aria-expanded="false" aria-controls="ad4-v3-status-menu"><span class="ad4-v3-status-dot"></span><span id="ad4-v3-printer-status">Printer</span>'+svg("chevron")+'</button>';
const top=make("nav","ad4-v3-top");top.id="ad4-v3-top";top.setAttribute("aria-label","Main sections");
root.append(header,top);
const statusMenu=make("nav","ad4-v3-status-menu");statusMenu.id="ad4-v3-status-menu";statusMenu.hidden=true;
statusMenu.setAttribute("aria-label","Printer and navigation shortcuts");
statusMenu.innerHTML='<strong id="ad4-v3-menu-status">Printer status</strong><button type="button" data-open="printer">Printer controls</button><button type="button" data-open="preview">Prepare model</button><button type="button" data-open="sliced">Layer preview</button><a href="https://github.com/spidey000/FFAdv4Manager_cura" target="_blank" rel="noopener noreferrer">Source code · FFAdv4Manager_cura</a>';
header.append(statusMenu);
function closeStatusMenu(){statusMenu.hidden=true;$("ad4-v3-status").setAttribute("aria-expanded","false")}
$("ad4-v3-status").addEventListener("click",()=>{const opening=statusMenu.hidden;statusMenu.hidden=!opening;$("ad4-v3-status").setAttribute("aria-expanded",String(opening))});
statusMenu.addEventListener("click",e=>{const target=e.target.closest("[data-open]");if(target){closeStatusMenu();activate(target.dataset.open)}});
document.addEventListener("pointerdown",e=>{if(!header.contains(e.target))closeStatusMenu()});
const bottom=make("nav","ad4-v3-bottom");bottom.id="ad4-v3-bottom";bottom.setAttribute("aria-label","Editor tools");
root.append(bottom);
const action=make("section","ad4-v3-action-row");action.id="ad4-v3-action-row";root.append(action);
const extra=make("section","ad4-v3-extra");extra.id="ad4-v3-extra";root.append(extra);
const note=make("div","ad4-v3-toast");note.id="ad4-v3-toast";note.setAttribute("role","status");note.hidden=true;
note.innerHTML='<span id="ad4-v3-toast-message"></span><button type="button" aria-label="Dismiss notification">×</button>';
note.querySelector("button").addEventListener("click",()=>{note.hidden=true});root.append(note);
let noteHandle;
function notify(message){
 $("ad4-v3-toast-message").textContent=message;note.hidden=false;clearTimeout(noteHandle);
 noteHandle=setTimeout(()=>note.hidden=true,4200);
}
function closeSheet(){
 if(root.classList.contains("ad4-sheet-open"))$("ad4-sheet-close")?.click();
}
function ensureSheet(){
 if(innerWidth<=767&&!root.classList.contains("ad4-sheet-open"))$("ad4-dock-settings")?.click();
}
function sliceReady(){return $("slice-export-container")?.dataset.active==="true" && typeof globalThis.app?.gui?.slicer?.exported_gcode==="string";}
function hasModel(){return Boolean(globalThis.app?.gui?.file?.stl_file_name) && modelCount()>0;}
function refreshState(){
 const model=hasModel(),sliced=model&&sliceReady();
 if(previousModelCount>0 && modelCount()===0){$("slice-export-container")?.setAttribute("data-active","false")}
 previousModelCount=modelCount();
 root.classList.toggle("ad4-has-model",model);
 root.classList.toggle("ad4-v3-sliced",sliced);
 const name=globalThis.app?.gui?.file?.stl_file_name||"";
 const label=$("ad4-v3-file-label");
 if(label)label.textContent=model?name.split(/[\\/]/).pop():"No model loaded";
 const state=$("ad4-v3-file-detail");
 if(state)state.textContent=sliced?[$("gcode-time-estimate")?.textContent,$("material-estimate")?.textContent].filter(Boolean).join(" · "):model?"Ready for CuraEngine · server-side slicing":"STL or 3MF · FlashForge Adventurer 4";
 const slice=$("ad4-dock-slice");
 if(slice)slice.disabled=staticPreview || !model || $("slice-progress-container")?.dataset.active==="true";
 const newPreview=$("ad4-v3-preview-status");
 if(newPreview)newPreview.textContent=sliced?"Real G-code ready":"Slice a model to preview layers";
 const navSlice=$("ad4-v3-nav-slice");if(navSlice)navSlice.classList.toggle("ready",sliced);
 const slicingBusy=$("slice-progress-container")?.dataset.active==="true";
 const start=$("ad4-v3-run-slice");if(start){start.hidden=!model||sliced;start.disabled=staticPreview||slicingBusy}
 const preview=$("ad4-v3-show-layers");if(preview)preview.hidden=!sliced;
 for(const name of ["ad4-v3-export","ad4-v3-send","ad4-v3-print"]){
  const b=$(name);if(b)b.disabled=!sliced||(staticPreview&&name!=="ad4-v3-export");
 }
 const layer=$("ad4-v3-layer-input"),native=$("layer-number");
 if(layer&&native){
  const max=Number(native.max)||1;
  if(layer.max!==String(max))layer.max=String(max);
  layer.value=native.value||max;
  $("ad4-v3-layer-number").textContent=String(layer.value)+" / "+String(max);
 }
 const progressBadge=$("ad4-v3-progress");
 if(progressBadge)progressBadge.hidden=!sliced;
}
function topActive(){
 for(const b of top.querySelectorAll("button"))b.setAttribute("aria-pressed",String(b.dataset.route===(current==="sliced"||current==="transform"?"preview":current)));
}
function activate(name){
 closeStatusMenu();closeSheet();
 current=name;
 root.dataset.ad4Screen=name;
 $("sidebar-container")?.setAttribute("aria-hidden",String(name!=="print"&&name!=="filament"));
 if(name==="print"||name==="filament"){
  const b=$("ad4-categories button[data-name='"+(name==="filament"?"Material":"Quality")+"']");
  b?.click();
 }
 if(name==="preview"||name==="transform"||name==="slice-info")$("prepare-tab-button")?.click();
 if(name==="sliced"){
  if(!sliceReady()){notify("Slice a model on the server to view actual layers");current="preview";root.dataset.ad4Screen="preview";$("prepare-tab-button")?.click()}
  else $("preview-tab-button")?.click();
 }
 if(name==="app"||name==="printer"||name==="slice-info")closeSheet();
 if(name==="transform")setTransform("rotate");
 topActive();renderTools();refreshState();
 dispatchEvent(new Event("resize"));
}
for(const [symbol,label,route] of TOP){
 const b=navButton(symbol,label,()=>activate(route));b.dataset.route=route;top.append(b);
}
const printerPage=make("section","ad4-v3-info-page");printerPage.id="ad4-v3-printer-page";
printerPage.innerHTML='<h2>Adventurer 4</h2><p id="ad4-v3-printer-page-state">Printer management uses your authenticated private Linux server.</p><div class="ad4-v3-info-card"><strong>Camera and printer controls</strong><p>Connect to the private server through Cloudflare Access to see the live camera, printer files, diagnostics and print controls. GitHub Pages is preview-only.</p><button type="button" id="ad4-v3-open-controls">Open printer controls</button></div>';
root.append(printerPage);
$("ad4-v3-open-controls").disabled=staticPreview;
$("ad4-v3-open-controls").addEventListener("click",()=>openPrinter("control"));
const sliceInfo=make("section","ad4-v3-info-page");sliceInfo.id="ad4-v3-slice-info";
sliceInfo.innerHTML='<h2>Server-side slicing</h2><div class="ad4-v3-info-card"><strong>CuraEngine is not available on GitHub Pages</strong><p>The 3D model and Cura settings work in the public preview. To generate G-code or GX, open this application on your authenticated Linux server.</p><button type="button" id="ad4-v3-return-preview">Return to model</button></div>';
root.append(sliceInfo);
$("ad4-v3-return-preview").addEventListener("click",()=>activate("preview"));
const intro=make("div","ad4-v3-workspace-card");intro.id="ad4-v3-workspace-card";
intro.innerHTML='<div class="ad4-v3-file-symbol">'+svg("cube")+'</div><span><strong id="ad4-v3-file-label">No model loaded</strong><small id="ad4-v3-file-detail">STL or 3MF</small></span>';
$("viewer")?.append(intro);
const layerUI=make("section","ad4-v3-layer-card");layerUI.id="ad4-v3-layer-card";
layerUI.innerHTML='<div class="ad4-v3-card-title"><strong>Sliced preview</strong><span id="ad4-v3-preview-status">Slice a model to preview layers</span></div>'+
'<div class="ad4-v3-legend"><span><i class="wall"></i>Walls</span><span><i class="skin"></i>Top/Bottom</span><span><i class="infill"></i>Infill</span><span><i class="travel"></i>Travel</span></div>'+
'<div class="ad4-v3-layer-control"><label for="ad4-v3-layer-input">'+svg("layers")+' Layers</label><input id="ad4-v3-layer-input" type="range" min="1" max="1" value="1"><output id="ad4-v3-layer-number">1 / 1</output></div>'+
'<div class="ad4-v3-estimates"><span>'+svg("clock")+' <b id="ad4-v3-time">—</b><small>Estimated time</small></span><span>'+svg("filament")+' <b id="ad4-v3-material">—</b><small>Filament</small></span></div>';
root.append(layerUI);
$("ad4-v3-layer-input").addEventListener("input",event=>{
 const original=$("layer-number");if(!original)return;
 original.value=event.target.value;original.dispatchEvent(new Event("input",{bubbles:true}));
 $("ad4-v3-layer-number").textContent=event.target.value+" / "+original.max;
});
const transform=make("section","ad4-v3-transform");transform.id="ad4-v3-transform";
transform.innerHTML='<div class="ad4-v3-transform-top"><strong>Orientation / Transform</strong><small id="ad4-v3-transform-help">Select a model on the plate to transform it</small></div>'+
'<nav class="ad4-v3-mode"><button type="button" data-mode="translate">'+svg("move")+'Move</button><button type="button" data-mode="rotate">'+svg("rotate")+'Rotate</button><button type="button" data-mode="scale">'+svg("scale")+'Scale</button></nav>'+
'<div class="ad4-v3-axis-list"></div>'+
'<div class="ad4-v3-transform-actions"><button type="button" id="ad4-v3-rotate90">Rotate Z +90°</button><button type="button" id="ad4-v3-transform-reset">Reset selected axis</button><button type="button" id="ad4-v3-transform-apply">Apply</button></div>';
root.append(transform);
const axisList=transform.querySelector(".ad4-v3-axis-list");
let mode="rotate";
for(const axis of ["x","y","z"]){
 const row=make("label","ad4-v3-axis");row.dataset.axis=axis;
 row.innerHTML='<b>'+axis.toUpperCase()+'</b><input type="range" min="-180" max="180" step="1" value="0" aria-label="'+axis.toUpperCase()+' transform"><output>0°</output>';
 axisList.append(row);
 row.querySelector("input").addEventListener("input",e=>setAxis(axis,Number(e.target.value)));
}
function sourceAxis(axis){
 const prefix=mode==="rotate"?"rotation":mode==="translate"?"movement":"scale";
 return $(prefix+"-"+axis+"-value");
}
function setAxis(axis,value){
 const source=sourceAxis(axis);
 const focused=globalThis.app?.gui?.model_viewer?.focused;
 if(!focused||!source){notify("Tap the model to select it before editing its orientation");return}
 source.value=String(value);
 source.dispatchEvent(new Event("input",{bubbles:true}));
 const row=axisList.querySelector('[data-axis="'+axis+'"]');
 row.querySelector("output").textContent=String(value)+(mode==="rotate"?"°":mode==="scale"?"%":" mm");
 $("slice-export-container")?.setAttribute("data-active","false");
}
function setTransform(next){
 mode=next;
 for(const b of transform.querySelectorAll("[data-mode]"))b.setAttribute("aria-pressed",String(b.dataset.mode===next));
 const focused=globalThis.app?.gui?.model_viewer?.focused;
 const controls=globalThis.app?.gui?.model_viewer?.model_controls;
 if(focused&&controls?.mode!==next){
  const btn=$(next==="translate"?"movement-button":next==="rotate"?"rotate-button":"scale-button");
  btn?.firstElementChild?.click();
 }
 for(const axis of ["x","y","z"]){
  const row=axisList.querySelector('[data-axis="'+axis+'"]');
  const input=row.querySelector("input"),source=sourceAxis(axis);
  const value=Number(source?.value);
  input.min=next==="rotate"?"-180":next==="scale"?"10":"-110";
  input.max=next==="rotate"?"180":next==="scale"?"250":"110";
  input.value=String(Number.isFinite(value)?value:next==="scale"?100:0);
  row.querySelector("output").textContent=input.value+(next==="rotate"?"°":next==="scale"?"%":" mm");
 }
 $("ad4-v3-transform-help").textContent=focused?"Drag a slider or the colored axes above":"Tap the model on the bed to select it";
}
for(const b of transform.querySelectorAll("[data-mode]"))b.addEventListener("click",()=>setTransform(b.dataset.mode));
$("ad4-v3-rotate90").addEventListener("click",()=>{
 if(mode!=="rotate")setTransform("rotate");
 const value=Number(sourceAxis("z")?.value)||0;
 setAxis("z",((value+270)%360)-180);
 setTransform("rotate");
});
$("ad4-v3-transform-reset").addEventListener("click",()=>{for(const axis of ["x","y","z"])setAxis(axis,mode==="scale"?100:0);setTransform(mode)});
$("ad4-v3-transform-apply").addEventListener("click",()=>activate("preview"));
const app=make("section","ad4-v3-app");app.id="ad4-v3-app";
app.innerHTML='<h2>App settings</h2><p>AD4 Studio · FlashForge Adventurer 4</p>'+
'<div class="ad4-v3-app-card"><strong>Slicing engine</strong><span>CuraEngine · Linux server only</span><small>GitHub Pages is a visual-only preview. Real slice, print and camera require your authenticated server.</small></div>'+
'<div class="ad4-v3-app-card"><strong>Saved profiles</strong><span>Browser-local process and Artillery PLA settings</span><div class="ad4-v3-app-actions"><button id="ad4-v3-export-profiles">'+svg("upload")+' Export profiles</button><button id="ad4-v3-import-profiles">'+svg("file")+' Import profiles</button></div><input id="ad4-v3-profile-file" type="file" accept=".json,application/json" hidden></div>'+
'<div class="ad4-v3-app-card"><strong>Printer connection</strong><span>Protected API and LAN bridge</span><button id="ad4-v3-open-printer">Open printer manager</button></div>'+
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
$("ad4-v3-open-printer").addEventListener("click",()=>openPrinter("control"));
const manager=$("ad4-manager");
const manageTab=make("nav","ad4-v3-manager-tabs");manageTab.id="ad4-v3-manager-tabs";
const sectionMap={control:["Print controls","Printer connections and diagnostics"],files:["Printer files"],camera:["Camera"],timelapse:["Timelapses"]};
if(manager){
 const head=manager.querySelector(".ad4-head");
 head?.after(manageTab);
 for(const [key,title] of [["camera","Camera"],["timelapse","Timelapse"],["files","Files"],["control","Control"]]){
  const b=make("button",null,title);b.type="button";b.dataset.pane=key;b.addEventListener("click",()=>setManagerPane(key));manageTab.append(b);
 }
 manager.querySelector("details")?.setAttribute("open","");
}
function setManagerPane(pane){
 managerPane=pane;
 for(const b of manageTab.querySelectorAll("button"))b.setAttribute("aria-pressed",String(b.dataset.pane===pane));
 for(const section of manager.querySelectorAll(".ad4-section")){
  const h=section.querySelector("h3")?.textContent||"";
  const allowed=sectionMap[pane]||[];
  section.hidden=!allowed.some(title=>h.includes(title))&&!(pane==="control"&&section.tagName==="DETAILS");
 }
}
function openPrinter(pane){
 if(staticPreview){activate("printer");return}
 closeSheet();setManagerPane(pane);
 if(!manager.open)$("ad4-open-manager")?.click();
 setManagerPane(pane);
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
bottom.append(
 toolBtn("file","File",editorButtons.file,"ad4-v3-nav-file"),
 toolBtn("camera","Camera",editorButtons.camera,"ad4-v3-nav-camera"),
 toolBtn("orient","Orient",editorButtons.orient,"ad4-v3-nav-orient"),
 toolBtn("move","Transform",editorButtons.move,"ad4-v3-nav-move"),
 toolBtn("layers","Slice",editorButtons.slice,"ad4-v3-nav-slice")
);
function actionButton(id,label,click,primary=false){
 const b=make("button","ad4-v3-action"+(primary?" primary":""),label);b.id=id;b.type="button";b.addEventListener("click",click);return b;
}
const openModel=actionButton("ad4-v3-open-model","＋ Open model",()=>$("ad4-dock-model")?.click());
const removeModel=actionButton("ad4-v3-remove-model","Remove model",()=>{
 const focused=globalThis.app?.gui?.model_viewer?.focused;
 if(!focused){notify("Select a model on the plate to remove it");return}
 if(!confirm("Remove the selected model?"))return;
 $("context-delete")?.click();
  setTimeout(()=>{refreshState();renderTools()},150);
});
const demoModel=actionButton("ad4-v3-demo","◈ Demo STL",()=>$("ad4-dock-demo")?.click());
const previewLayers=actionButton("ad4-v3-show-layers","◫ Layers",()=>activate("sliced"));
const exportGcode=actionButton("ad4-v3-export","Export G-code",()=>$("export-gcode-button")?.click());
const upload=actionButton("ad4-v3-send","Send to printer",()=>{if(!staticPreview)openPrinter("files");$("ad4-upload")?.click()});
const print=actionButton("ad4-v3-print","Print now",()=>{if(!staticPreview)openPrinter("files");$("ad4-send-print")?.click()},true);
const runSlice=actionButton("ad4-v3-run-slice","Slice model",()=>{if(!staticPreview)$("ad4-dock-slice")?.click();else notify("Slicing requires the private CuraEngine server")},true);
function renderTools(){
 action.replaceChildren();
 if(current==="preview"){
  action.append(openModel,removeModel,...(staticPreview?[demoModel]:[]),previewLayers,...(staticPreview?[]:[runSlice]));
 }else if(current==="sliced"){
  action.append(previewLayers,exportGcode,upload,print);
 }
 // Profile save/update actions live inside "Profiles & filters". Do not duplicate
 // them as a large green action that only toggles the panel (and can close it).

 for(const b of bottom.querySelectorAll("button")){
  b.setAttribute("aria-pressed",String(
   current==="transform"?b.id==="ad4-v3-nav-move":
   current==="sliced"||current==="slice-info"?b.id==="ad4-v3-nav-slice":
   current==="preview"?b.id==="ad4-v3-nav-file":false
  ));
 }
 runSlice.hidden=staticPreview||!hasModel()||sliceReady();
  removeModel.hidden=!hasModel();
 previewLayers.hidden=!sliceReady();
 exportGcode.disabled=!sliceReady();
 upload.disabled=staticPreview||!sliceReady();
 print.disabled=staticPreview||!sliceReady();
}
function checkStatus(){
 const original=$("ad4-open-manager")?.textContent||"";
 const state=staticPreview?"Demo":(original.replace("AD4 · ","")||"Offline");
  $("ad4-v3-printer-status").textContent=state;
  $("ad4-v3-menu-status").textContent=staticPreview?"Demo · Private server not connected":state;
  $("ad4-v3-status").setAttribute("aria-label","Printer status: "+state+". Open navigation menu");
  $("ad4-v3-printer-page-state").textContent=staticPreview?"Preview mode · connect to the authenticated server to manage the printer":state;
}
$("ad4-v3-file-label")?.addEventListener("click",()=>$("ad4-dock-model")?.click());
$("stl-file")?.addEventListener("change",()=>{activate("preview");setTimeout(refreshState,500)});
$("ad4-v3-layer-number").textContent="1 / 1";
let tick=0;
setInterval(()=>{
 refreshState();checkStatus();
  if(current==="preview"){removeModel.hidden=!hasModel()}
 if(++tick%3===0){
  if(current==="sliced"){
   $("ad4-v3-time").textContent=$("gcode-time-estimate")?.textContent||"—";
   $("ad4-v3-material").textContent=$("material-estimate")?.textContent||"—";
  }
  if(current==="transform"){
   const focused=globalThis.app?.gui?.model_viewer?.focused;
   $("ad4-v3-transform-help").textContent=focused?"Drag the axes or adjust values":"Tap the model on the bed to select it";
  }
 }
},1000);
addEventListener("keydown",e=>{
 if(e.key!=="Escape")return;
  if(!statusMenu.hidden){closeStatusMenu();return}
 if(current!=="preview" && !manager?.open)activate("preview");
});
activate("preview");
})();
