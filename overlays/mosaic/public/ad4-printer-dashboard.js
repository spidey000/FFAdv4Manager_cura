/* Unified mobile-first Printer workspace. The existing authenticated
 * controller owns every hardware operation; navigation only rearranges DOM. */
(() => {
 "use strict";
 const page=document.getElementById("ad4-v3-printer-page");
 const manager=document.getElementById("ad4-manager");
 if(!page||!manager)return;
 const $=id=>document.getElementById(id);
 const demo=globalThis.__AD4_STATIC_PREVIEW__===true;
 const icon=name=>'<span class="ad4-printer-icon" data-ad4-icon="'+name+'" aria-hidden="true"></span>';
 const route=(key,label,iconName)=>'<button type="button" data-printer-go="'+key+'" aria-pressed="false">'+icon(iconName)+'<span>'+label+'</span></button>';
 page.dataset.printerView="overview";
 page.innerHTML=
  '<header class="ad4-printer-header">'+
   '<div class="ad4-printer-ident">'+icon("printer")+
    '<div><h2>Adventurer 4</h2><span id="ad4-v3-printer-page-state" role="status" aria-live="polite">Printer connection not checked</span></div></div>'+
   '<div class="ad4-printer-header-actions"><span id="ad4-printer-updated">Not updated</span>'+
   '<button type="button" id="ad4-printer-refresh" class="ad4-printer-icon-btn" aria-label="Refresh printer status" title="Refresh">'+icon("refresh")+'</button></div>'+
  '</header>'+
  '<details class="ad4-printer-connection-details"><summary>Connection details</summary><p id="ad4-printer-connection-note">Connection profile selects a network address, not another printer model.</p></details>'+
  '<nav class="ad4-printer-nav" aria-label="Printer sections">'+
   route("overview","Overview","layout-grid")+route("files","Files","file")+
   route("media","Camera & Timelapses","camera")+route("diagnostics","Diagnostics","wrench")+
  '</nav>'+
  '<div class="ad4-printer-overview-content" data-printer-overview>'+
   '<div class="ad4-printer-facts">'+
    '<div class="ad4-printer-fact"><span>Machine</span><strong id="ad4-printer-machine">—</strong></div>'+
    '<div class="ad4-printer-fact"><span>Nozzle / target</span><strong id="ad4-printer-nozzle">—</strong></div>'+
    '<div class="ad4-printer-fact"><span>Bed / target</span><strong id="ad4-printer-bed">—</strong></div>'+
   '</div>'+
   '<section class="ad4-printer-current" aria-label="Current print summary">'+
    '<div class="ad4-printer-section-title"><h3>Current print</h3><span id="ad4-printer-job-status" class="ad4-printer-status">Unavailable</span></div>'+
    '<strong id="ad4-printer-job-name" title="Current job">No active job reported</strong>'+
    '<div class="ad4-printer-progress-track" id="ad4-printer-progress-track" role="progressbar" aria-label="Print progress" aria-valuemin="0" aria-valuemax="100"><span id="ad4-printer-progress-fill"></span></div>'+
    '<span id="ad4-printer-progress-text">Progress not reported</span>'+
    '<div class="ad4-printer-job-metrics">'+
     '<div><span>Elapsed</span><strong id="ad4-printer-elapsed">—</strong></div>'+
     '<div><span>Remaining</span><strong id="ad4-printer-remaining">—</strong></div>'+
     '<div><span>Layer</span><strong id="ad4-printer-layer">—</strong></div>'+
    '</div>'+
   '</section>'+
   '<div class="ad4-printer-jump-grid">'+
    '<button type="button" data-printer-go="files">'+icon("file")+'<span>Printer files</span><strong id="ad4-printer-file-count">—</strong></button>'+
    '<button type="button" data-printer-go="media">'+icon("camera")+'<span>Camera & timelapses</span><strong id="ad4-printer-record-summary">On demand</strong></button>'+
    '<button type="button" data-printer-go="diagnostics">'+icon("gear")+'<span>Connections & diagnostics</span><strong id="ad4-printer-profile-summary">—</strong></button>'+
   '</div>'+
  '</div>';
 page.append(manager);
 const section=key=>manager.querySelector('[data-printer-feature="'+key+'"]');
 const views={};
 for(const key of ["overview","files","media","diagnostics"]){
  const div=document.createElement("div");div.className="ad4-printer-internal-view";
  div.dataset.printerPanel=key;div.hidden=key!=="overview";
  manager.append(div);views[key]=div;
 }
 const add=(view,node)=>{if(node)views[view].append(node)};
 // Each existing element, ID and listener survives its move to a logical view.
 add("overview",section("live"));
 add("overview",section("controls"));
 add("files",section("files"));
 const tools=section("tools");
 add("files",tools);
 add("media",section("camera"));
 add("media",section("timelapse"));
 const connections=section("connection");
 if(connections){connections.open=false;add("diagnostics",connections)}
 // The tools section mixes file upload with diagnostic details. Retain all
 // operations, but place advanced tools into the diagnostics view.
 if(tools){
  const advanced=document.createElement("section");advanced.className="ad4-section ad4-printer-advanced";
  advanced.innerHTML="<h3>Advanced tools</h3>";
  for(const details of [...tools.children].filter(x=>x.tagName==="DETAILS")){
   details.open=false;advanced.append(details);
  }
  add("diagnostics",advanced);
  const heading=tools.querySelector("h3");if(heading)heading.textContent="Upload & convert";
 }
 const live=section("live");
 if(live){
  const start=$("ad4-live-consult");if(start)start.textContent="Toolpath";
  const canvas=$("ad4-live-canvas");
  if(canvas){
   canvas.tabIndex=0;canvas.setAttribute("role","button");canvas.setAttribute("aria-label","Open live toolpath monitoring");
   canvas.addEventListener("click",()=>{if(!demo)start?.click()});
   canvas.addEventListener("keydown",e=>{if(e.target===canvas&&(e.key==="Enter"||e.key===" ")){e.preventDefault();if(!demo)start?.click()}});
  }
  const actions=live.querySelector(".ad4-tools");
  if(actions){const heading=document.createElement("h4");heading.textContent="Monitoring";actions.before(heading)}
 }
 const control=section("controls");
 if(control){
  const tools=control.querySelector(".ad4-tools");
  if(tools){
   for(const id of ["ad4-pause","ad4-resume","ad4-cancel"]){
    const b=$(id);if(!b)continue;
    b.classList.add("ad4-printer-command");
    if(id==="ad4-cancel")b.classList.add("ad4-destructive");
   }
   const fanLabel=document.createElement("p");
   fanLabel.className="ad4-printer-subheading";fanLabel.textContent="Cooling fan";
   const fanOff=$("ad4-fan_off"),fanOn=$("ad4-fan_on");
   if(fanOff&&fanOn){
    const fan=document.createElement("div");fan.className="ad4-printer-fan-controls";
    fan.append(fanOff,fanOn);tools.after(fan);fan.before(fanLabel);
   }
  }
 }
 const fileSection=section("files");
 if(fileSection){
  const filters=fileSection.querySelector(".ad4-file-filters");
  if(filters){
   const search=document.createElement("label");search.className="ad4-printer-search";
   search.innerHTML=icon("file")+'<input id="ad4-file-search" type="search" aria-label="Search all printer files" placeholder="Search printer files…">';
   filters.before(search);
   $("ad4-file-search").addEventListener("input",()=>globalThis.AD4Printer?.setFileSearch?.());
  }
  const pagination=fileSection.querySelector(".ad4-pagination");
  if(pagination){pagination.classList.add("ad4-printer-pagination");}
 }
 const cameraSection=section("camera");
 if(cameraSection){
  const action=cameraSection.querySelector(".ad4-tools");
  const img=$("ad4-camera");
  if(action&&img){
   const area=document.createElement("div");area.className="ad4-printer-camera-stage";
   area.innerHTML='<span id="ad4-printer-camera-empty">Camera off · Start live video or take a snapshot</span>';
   area.prepend(img);action.before(area);
   const toggle=document.createElement("label");toggle.className="ad4-printer-camera-switch";
   toggle.innerHTML='<span>Live camera</span><input type="checkbox" role="switch" id="ad4-printer-camera-switch" aria-label="Live camera">';
   action.prepend(toggle);
   const legacy=$("ad4-live-toggle");legacy.classList.add("ad4-printer-legacy-camera");
   const input=$("ad4-printer-camera-switch");
   input.addEventListener("change",()=>{
    if(demo||legacy.disabled){input.checked=false;return}
    if(input.checked!==(legacy.getAttribute("aria-pressed")==="true"))legacy.click();
   });
   const sync=()=>{
    const streaming=legacy.getAttribute("aria-pressed")==="true";
    input.checked=streaming;input.disabled=demo||legacy.disabled;
    const empty=$("ad4-printer-camera-empty");
    empty.textContent=streaming?"Connecting to live camera…":"Camera off · Start live video or take a snapshot";
    empty.hidden=!img.hidden;
   };
   new MutationObserver(sync).observe(legacy,{attributes:true,attributeFilter:["aria-pressed","disabled"]});
   new MutationObserver(sync).observe(img,{attributes:true,attributeFilter:["src","hidden"]});
   sync();
   const enlarge=document.createElement("button");enlarge.type="button";
   enlarge.className="ad4-printer-icon-btn";enlarge.title="Expand camera";
   enlarge.setAttribute("aria-label","Expand camera");enlarge.innerHTML=icon("scale");
   enlarge.disabled=demo;
   enlarge.addEventListener("click",async()=>{
    if(!img.hidden && area.requestFullscreen){
     try{await area.requestFullscreen()}catch(error){globalThis.AD4Printer?.say?.(error.message,true)}
    }
   });action.append(enlarge);
  }
 }
 const activeView=()=>page.dataset.printerView||"overview";
 function navigate(view,{scroll=true}={}){
  if(!views[view])view="overview";
  const previous=activeView();
  // No background MJPEG or 3D polling after leaving a monitoring view.
  if(previous==="overview"&&view!=="overview")$("ad4-live-stop")?.click();
  if(previous==="media"&&view!=="media"&&$("ad4-printer-camera-switch")?.checked)
   $("ad4-printer-camera-switch").click();
  page.dataset.printerView=view;
  for(const [key,node] of Object.entries(views))node.hidden=key!==view;
  for(const link of page.querySelectorAll("[data-printer-go]")){
   const selected=link.dataset.printerGo===view;
   link.setAttribute("aria-pressed",String(selected));
  }
  if(scroll)page.scrollTop=0;
 }
 page.addEventListener("click",event=>{
  const target=event.target.closest("[data-printer-go]");
  if(target){navigate(target.dataset.printerGo);return}
 });
 document.addEventListener("ad4:printer-reset",()=>navigate("overview"));
 document.addEventListener("ad4:printer-navigate",event=>{
  const view=event.detail?.view||"overview";
  navigate(view);
  const target=event.detail?.target&&$(event.detail.target);
  if(target){if(target.closest("details"))target.closest("details").open=true;
   requestAnimationFrame(()=>target.scrollIntoView({block:"nearest",behavior:"smooth"}))}
 });
 // The header refreshes status; the native controller refreshes file state.
 const get=async path=>{
  const response=await fetch("./api/printer"+path,{cache:"no-store",credentials:"same-origin"});
  if(!response.ok)throw Error("Printer service HTTP "+response.status);
  return response.json();
 };
 const fmt=(v,suffix="")=>v===null||v===undefined||v===""?"—":String(v)+suffix;
 const seconds=v=>{
  if(!Number.isFinite(v)||v<0)return "—";
  const n=Math.round(v),h=Math.floor(n/3600),m=Math.floor(n%3600/60);
  return h?h+"h "+m+"m":m+"m";
 };
 let refreshSerial=0,inFlight=false,lastPoll=0;
 async function refresh(){
  if(demo||document.body.dataset.ad4Screen!=="printer"||inFlight)return;
  inFlight=true;lastPoll=Date.now();const serial=++refreshSerial;
  $("ad4-v3-printer-page-state").textContent="Checking printer…";
  try{
   const responses=await Promise.allSettled([get("/status"),get("/files?details=1"),get("/timelapse"),get("/timelapses"),get("/profiles"),get("/session")]);
   if(serial!==refreshSerial||document.body.dataset.ad4Screen!=="printer")return;
   const state=responses[0].status==="fulfilled"?responses[0].value:null;
   const backend=responses.some(x=>x.status==="fulfilled");
   const connected=Boolean(state?.machine_status&&!/OFFLINE|DISCONNECT|UNAVAILABLE|ERROR|UNKNOWN|NOT CONNECTED/i.test(String(state.machine_status)));
   const raw=fmt(state?.machine_status);
   const active=connected&&/BUILDING|PRINTING|PAUSED/i.test(raw);
   const paused=connected&&/PAUSED/i.test(raw);
   $("ad4-v3-printer-page-state").textContent=connected?raw:backend?"Disconnected":"Server unavailable";
   page.dataset.printerConnection=connected?"connected":backend?"disconnected":"error";
   $("ad4-printer-machine").textContent=raw;
   $("ad4-printer-nozzle").textContent=connected?fmt(state.nozzle_current,"°")+" / "+fmt(state.nozzle_target,"°"):"—";
   $("ad4-printer-bed").textContent=connected?fmt(state.bed_current,"°")+" / "+fmt(state.bed_target,"°"):"—";
   const job=$("ad4-printer-job-name"),jobText=active?fmt(state.current_file):"No active job reported";
   job.textContent=jobText;job.title=jobText;
   const badge=$("ad4-printer-job-status");
   badge.textContent=paused?"Paused":active?"Printing":connected?raw:"Offline";
   badge.dataset.state=paused?"paused":active?"printing":connected?"idle":"offline";
   const percent=Number(state?.progress_percent),valid=active&&Number.isFinite(percent)&&percent>=0&&percent<=100;
   $("ad4-printer-progress-fill").style.width=valid?percent+"%":"0%";
   $("ad4-printer-progress-text").textContent=valid?Math.round(percent)+"% complete":"Progress not reported";
   const track=$("ad4-printer-progress-track");
   if(valid)track.setAttribute("aria-valuenow",String(percent));else track.removeAttribute("aria-valuenow");
   // Only display elapsed/remaining if the bridge actually reports these.
   $("ad4-printer-elapsed").textContent=active?seconds(state.elapsed_seconds):"—";
   $("ad4-printer-remaining").textContent=active?seconds(state.remaining_seconds):"—";
   const estimate=globalThis.AD4LayerEstimate;
   const estimated=active&&state.layer_current==null&&estimate&&estimate.file===state.current_file&&Date.now()-estimate.stamp<10000;
   const layer=estimated?estimate.layer:state?.layer_current;
   const total=estimated?estimate.total:state?.layer_total;
   $("ad4-printer-layer").textContent=active&&layer!=null?fmt(layer)+(total!=null?" / "+total:"")+(estimated?" · est.":""):"—";
   if(responses[1].status==="fulfilled"&&connected){
    const files=responses[1].value;
    $("ad4-printer-file-count").textContent=Array.isArray(files)?files.length+" files":"—";
   }else $("ad4-printer-file-count").textContent="—";
   if(responses[2].status==="fulfilled"){
    const recording=responses[2].value;
    const saved=responses[3].status==="fulfilled"&&Array.isArray(responses[3].value)?responses[3].value.length:null;
    $("ad4-printer-record-summary").textContent=(recording?.running?"Recording":recording?.encoding?"Encoding":saved==null?"On demand":saved+" saved");
   }else $("ad4-printer-record-summary").textContent="Unavailable";
   const activeProfile=responses[5].status==="fulfilled"?responses[5].value?.profile:null;
   $("ad4-printer-profile-summary").textContent=fmt(activeProfile);
   $("ad4-printer-connection-note").textContent="Selected network profile: "+fmt(activeProfile)+". Connection profiles choose an address and camera configuration, not another printer model.";
   const updated=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
   $("ad4-printer-updated").textContent="Updated "+updated;
  }catch(error){
   page.dataset.printerConnection="error";
   $("ad4-v3-printer-page-state").textContent="Connection error";
   globalThis.AD4Printer?.say?.(error.message,true);
  }finally{inFlight=false}
 }
 $("ad4-printer-refresh").addEventListener("click",()=>{
  refresh();if(!demo)globalThis.AD4Printer?.refresh?.().catch(()=>{});
 });
 if(demo){
  $("ad4-v3-printer-page-state").textContent="Public preview · Printer offline";
  page.dataset.printerConnection="disconnected";
  $("ad4-printer-refresh").disabled=true;
  $("ad4-printer-refresh").title="Live status requires the authenticated server";
 }
 document.querySelector('#ad4-v3-top [data-route="printer"]')?.addEventListener("click",()=>queueMicrotask(refresh));
 setInterval(()=>{if(!demo&&document.body.dataset.ad4Screen==="printer"&&Date.now()-lastPoll>15000)refresh()},2500);
 navigate("overview",{scroll:false});
 globalThis.AD4Icons?.hydrate?.(page);
})();
