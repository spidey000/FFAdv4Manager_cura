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
  '<details class="ad4-printer-shell" id="ad4-printer-shell">'+
   '<summary class="ad4-printer-header" aria-label="Printer status and navigation">'+
    '<span class="ad4-printer-ident"><span class="ad4-printer-logo">'+icon("printer")+'</span>'+
     '<span class="ad4-printer-header-copy"><span class="ad4-printer-eyebrow">Printer</span>'+
      '<strong id="ad4-v3-printer-page-state" role="status" aria-live="polite">Checking connection…</strong></span>'+
      '<span class="ad4-printer-connect-dot" aria-hidden="true"></span></span>'+
    icon("chevron-right")+
   '</summary>'+
   '<div class="ad4-printer-shell-body">'+
    '<div class="ad4-printer-shell-toolbar"><span id="ad4-printer-updated">Not updated</span>'+
     '<button type="button" id="ad4-printer-refresh" aria-label="Refresh printer status" title="Refresh">'+icon("refresh")+'</button></div>'+
    '<div class="ad4-printer-facts">'+
     '<div class="ad4-printer-fact"><span>Machine</span><strong id="ad4-printer-machine">—</strong></div>'+
     '<div class="ad4-printer-fact"><span>Nozzle / target</span><strong id="ad4-printer-nozzle">—</strong></div>'+
     '<div class="ad4-printer-fact"><span>Bed / target</span><strong id="ad4-printer-bed">—</strong></div>'+
    '</div>'+
    '<p id="ad4-printer-connection-note">Connection profiles select a network address, not another printer model.</p>'+
    '<nav class="ad4-printer-nav" aria-label="Printer sections">'+
     route("overview","Overview","layout-grid")+route("files","Files","file")+
     route("media","Timelapses","camera")+route("diagnostics","Diagnostics","wrench")+
    '</nav>'+
   '</div>'+
  '</details>'+
  '<div class="ad4-printer-overview-content" data-printer-overview>'+
   '<section class="ad4-printer-current" aria-label="Current print summary">'+
    '<div class="ad4-printer-section-title"><div class="ad4-printer-current-title">'+icon("layers")+
     '<h3>Current print</h3></div><span id="ad4-printer-job-status" class="ad4-printer-status">Unavailable</span></div>'+
    '<strong id="ad4-printer-job-name" title="Current job">No active job reported</strong>'+
    '<div class="ad4-printer-progress-inline">'+
     '<div class="ad4-printer-progress-track" id="ad4-printer-progress-track" role="progressbar" aria-label="Print progress" aria-valuemin="0" aria-valuemax="100"><span id="ad4-printer-progress-fill"></span></div>'+
     '<strong id="ad4-printer-progress-text">—</strong></div>'+
    '<div class="ad4-printer-job-metrics">'+
     '<div class="ad4-printer-print-time">'+icon("clock")+
      '<div><span>Elapsed</span><strong id="ad4-printer-elapsed">—</strong></div></div>'+
     '<div class="ad4-printer-print-time">'+icon("hourglass")+
      '<div><span>Remaining</span><strong id="ad4-printer-remaining">—</strong></div></div>'+
    '</div>'+
   '</section>'+
   '<div class="ad4-printer-jump-grid">'+
    '<button type="button" data-printer-go="files">'+icon("file")+'<span>Printer files</span><strong id="ad4-printer-file-count">—</strong></button>'+
    '<button type="button" data-printer-go="media">'+icon("camera")+'<span>Timelapses</span><strong id="ad4-printer-record-summary">On demand</strong></button>'+
    '<button type="button" data-printer-go="diagnostics">'+icon("gear")+'<span>Connections & diagnostics</span><strong id="ad4-printer-profile-summary">—</strong></button>'+
   '</div>'+
  '</div>';
 page.append(manager);
 const printerShell=$("ad4-printer-shell");
 printerShell.querySelector(".ad4-printer-shell-body").append(page.querySelector(".ad4-printer-jump-grid"));
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
  const printSummary=page.querySelector(".ad4-printer-current");
  if(printSummary)live.prepend(printSummary);
  const start=$("ad4-live-consult");if(start)start.textContent="Start toolpath";
  const title=live.querySelector(".ad4-section-title h3");if(title)title.textContent="Monitoring";
  const canvas=$("ad4-live-canvas");
  if(canvas){
   canvas.tabIndex=0;canvas.setAttribute("role","button");canvas.setAttribute("aria-label","Open live toolpath monitoring");
   canvas.addEventListener("click",()=>{if(!demo)start?.click()});
   canvas.addEventListener("keydown",e=>{if(e.target===canvas&&(e.key==="Enter"||e.key===" ")){e.preventDefault();if(!demo)start?.click()}});
  }
  const actions=live.querySelector(".ad4-tools");
  if(actions){const heading=document.createElement("h4");heading.textContent="Visual controls";actions.before(heading)}
 }
 const control=section("controls");
 if(control){
  const heading=control.querySelector("h3");
  if(heading){heading.textContent=heading.textContent.replace("Print controls","Printer controls");const iconEl=document.createElement("span");iconEl.dataset.ad4Icon="play";iconEl.className="ad4-printer-heading-icon";heading.prepend(iconEl)}
  // Network discovery and refresh remain available from the expanded header,
  // while printer controls show only the three actions affecting the print.
  const shellToolbar=printerShell.querySelector(".ad4-printer-shell-toolbar");
  for(const id of ["ad4-refresh","ad4-discover"]){
   const action=$(id);if(action)shellToolbar.append(action);
  }
  const tools=control.querySelector(".ad4-tools");
  if(tools){
   for(const id of ["ad4-pause","ad4-resume","ad4-cancel"]){
    const b=$(id);if(!b)continue;
    b.classList.add("ad4-printer-command");
    const symbolic={ "ad4-pause":"pause", "ad4-resume":"play", "ad4-cancel":"square" }[id];
    if(!b.querySelector(".ad4-printer-action-glyph")){
     const i=document.createElement("span");i.className="ad4-printer-action-glyph";
     i.dataset.ad4Icon=symbolic;b.prepend(i);
    }
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

 // Keep legacy camera controls in the DOM for their existing backend listeners,
 // but never render a second camera preview/stream in the media view.
 const cameraSection=section("camera");
 if(cameraSection){
  cameraSection.hidden=true;cameraSection.style.display="none";
  const snap=$("ad4-snapshot");
  live?.querySelector(".ad4-monitor-controls")?.append(snap);
  const oldImage=$("ad4-camera");
  oldImage?.addEventListener("load",()=>{
   if(!oldImage.dataset.blob)return;
   const img=$("ad4-live-camera");
   if(img){img.src=oldImage.src;img.hidden=false;$("ad4-live-camera-state").textContent="Snapshot";}
  });
 }
 // Use the app's native modal language, not fullscreen navigation or extra
 // renderers: move the SAME Three.js canvas / MJPEG view into the dialog.
 const monitorModal=document.createElement("dialog");
 monitorModal.id="ad4-printer-monitor-modal";
 monitorModal.className="ad4-printer-monitor-modal";
 monitorModal.setAttribute("aria-label","Expanded print monitoring");
 monitorModal.innerHTML='<header class="ad4-printer-modal-head"><h3 id="ad4-printer-modal-title">Monitoring</h3>'+
  '<button type="button" id="ad4-printer-modal-close" aria-label="Close expanded monitoring">'+icon("x")+'</button></header>'+
  '<div class="ad4-printer-modal-content"></div>';
 document.body.append(monitorModal);
 globalThis.AD4Icons?.hydrate?.(monitorModal);
 document.addEventListener("ad4:icons-ready",()=>globalThis.AD4Icons?.hydrate?.(monitorModal),{once:true});
 const modalContent=monitorModal.querySelector(".ad4-printer-modal-content");
 let expanded=null,parent=null,next=null,opener=null;
 function closeMonitor(){if(monitorModal.open)monitorModal.close()}
 function expandMonitor(kind){
  if(monitorModal.open)return;
  const node=kind==="toolpath"?$("ad4-live-canvas"):$("ad4-live-camera")?.closest(".ad4-live-camera-wrap");
  if(!node)return;
  opener=kind==="toolpath"?$("ad4-live-toolpath-expand"):$("ad4-live-camera-expand");
  expanded=node;parent=node.parentNode;next=node.nextSibling;
  modalContent.append(node);
  $("ad4-printer-modal-title").textContent=kind==="toolpath"?"Toolpath":"Live preview";
  monitorModal.showModal();
  $("ad4-printer-modal-close").focus();
 }
 monitorModal.addEventListener("close",()=>{
  if(!expanded||!parent)return;
  if(next?.parentNode===parent)parent.insertBefore(expanded,next);
  else parent.append(expanded);
  expanded=null;parent=null;next=null;
  if(opener?.isConnected&&document.body.dataset.ad4Screen==="printer")opener.focus();
  opener=null;
 });
 $("ad4-printer-modal-close").addEventListener("click",closeMonitor);
 $("ad4-live-toolpath-expand")?.addEventListener("click",()=>expandMonitor("toolpath"));
 $("ad4-live-camera-expand")?.addEventListener("click",()=>expandMonitor("camera"));
 manager.addEventListener("close",closeMonitor);
 const activeView=()=>page.dataset.printerView||"overview";
 function navigate(view,{scroll=true}={}){
  if(!views[view])view="overview";
  closeMonitor();
  if(view==="overview")printerShell.open=false;
  const previous=activeView();
  // No background MJPEG or 3D polling after leaving a monitoring view.
  if(previous==="overview"&&view!=="overview")$("ad4-live-stop")?.click();
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
   $("ad4-v3-printer-page-state").textContent=connected?"Connected":backend?"Disconnected":"Server unavailable";
   page.dataset.printerConnection=connected?"connected":backend?"disconnected":"error";
   $("ad4-printer-machine").textContent=raw;
   $("ad4-printer-nozzle").textContent=connected?fmt(state.nozzle_current,"°")+" / "+fmt(state.nozzle_target,"°"):"—";
   $("ad4-printer-bed").textContent=connected?fmt(state.bed_current,"°")+" / "+fmt(state.bed_target,"°"):"—";
   const job=$("ad4-printer-job-name"),jobText=active?fmt(state.current_file):"No active job reported";
   job.textContent=jobText;job.title=jobText;
   const badge=$("ad4-printer-job-status");
   badge.textContent=paused?"Paused":active?"Printing":connected?raw:"Offline";
   badge.dataset.state=paused?"paused":active?"printing":connected?"idle":"offline";
   const percent=Number(state?.progress_percent),valid=active&&state?.progress_percent!=null&&state.progress_percent!==""&&Number.isFinite(percent)&&percent>=0&&percent<=100;
   $("ad4-printer-progress-fill").style.width=valid?percent+"%":"0%";
   $("ad4-printer-progress-text").textContent=valid?Math.round(percent)+"%":"—";
   const track=$("ad4-printer-progress-track");
   if(valid)track.setAttribute("aria-valuenow",String(percent));else track.removeAttribute("aria-valuenow");
   // Only display elapsed/remaining if the bridge actually reports these.
   $("ad4-printer-elapsed").textContent=active?seconds(state.elapsed_seconds):"—";
   $("ad4-printer-remaining").textContent=active?seconds(state.remaining_seconds):"—";
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
  if($("ad4-file-list"))$("ad4-file-list").textContent="Files unavailable · Public preview";
  if($("ad4-gallery"))$("ad4-gallery").textContent="Saved recordings require the authenticated server";
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
