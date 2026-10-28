/* Persistent Adventurer 4 information dashboard.
 * Every supported card remains visible when the printer or API is offline.
 * Read-only data is requested exclusively via the authenticated server bridge.
 */
(() => {
 "use strict";
 const page=document.getElementById("ad4-v3-printer-page");
 if(!page)return;
 const $=id=>document.getElementById(id);
 const demo=window.__AD4_STATIC_PREVIEW__===true;
 const cards=[
  ["status","Machine status","Machine","—","control","Print controls"],
  ["temperatures","Temperatures","Nozzle / bed","— / —","control","Temperature & fan controls"],
  ["progress","Print progress","Completion / layer","— / —","control","Print controls"],
  ["job","Current file","Job filename","—","files","Printer files"],
  ["camera","Camera","Snapshot / live feed","Unavailable","camera","Open camera"],
  ["files","Stored printer files","Files on printer","—","files","Browse files"],
  ["timelapse","Timelapses","Recording and gallery","Unavailable","timelapse","View timelapses"],
  ["controls","Print & fan controls","Pause, resume, cancel, fan","Unavailable","control","Open controls"],
  ["connection","Connection profiles","Selected profile","—","control","Manage connections"],
  ["diagnostics","Diagnostics","Doctor, printer info, M114","Unavailable","control","Open diagnostics"]
 ];
 const escape=text=>String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 page.innerHTML='<div class="ad4-printer-overview"><div><h2>Adventurer 4</h2>'+
  '<p id="ad4-v3-printer-page-state" role="status" aria-live="polite">Printer not connected · All information cards remain visible</p></div>'+
  '<button id="ad4-printer-refresh" type="button">Refresh</button></div>'+
  '<p id="ad4-printer-note" class="ad4-printer-note">'+
  (demo?'GitHub Pages is a visual demo. Live values require the authenticated Linux server.':
   'Live values are loaded from the private printer bridge. Cards stay visible when disconnected.')+'</p>'+
  '<div class="ad4-printer-dashboard">'+cards.map(([id,title,label,placeholder,pane,action])=>
   '<article class="ad4-printer-card" data-printer-card="'+id+'">'+
   '<h3>'+escape(title)+'</h3><span class="ad4-printer-label">'+escape(label)+'</span>'+
   '<strong id="ad4-printer-value-'+id+'" class="ad4-printer-value">'+escape(placeholder)+'</strong>'+
   '<p id="ad4-printer-detail-'+id+'" class="ad4-printer-detail">Unavailable · Printer disconnected</p>'+
   '<button type="button" data-printer-pane="'+pane+'">'+escape(action)+'</button></article>').join('')+'</div>';
 const defaults=Object.fromEntries(cards.map(([id,,,placeholder])=>[id,placeholder]));
 let backend=false,connected=false,inFlight=false,lastPoll=0,serial=0;
 const unavailable=demo?"Unavailable · Public preview":"Unavailable · Printer disconnected";
 const fmt=(value,suffix="")=>value===null||value===undefined||value===""?"—":String(value)+suffix;
 const put=(id,value,description)=>{
  const field=$("ad4-printer-value-"+id),detail=$("ad4-printer-detail-"+id);
  if(field)field.textContent=value==null?"—":String(value);
  if(detail)detail.textContent=description;
 };
 function clearValues(reason){
  for(const [id,value] of Object.entries(defaults))put(id,value,reason);
 }
 function enableActions(){
  for(const button of page.querySelectorAll("[data-printer-pane]")){
   const section=button.closest("[data-printer-card]")?.dataset.printerCard;
   // Connection profiles and 'Doctor' can work when the printer is offline,
   // provided the private server is available.
   button.disabled=demo||(!connected&&!(backend&&["connection","diagnostics"].includes(section)));
   button.title=button.disabled?(demo?"Requires private server":"Printer disconnected or server unavailable"):"";
  }
  $("ad4-printer-refresh").disabled=demo;
 }
 function openManager(pane){
  const dialog=$("ad4-manager");
  if(!dialog||demo)return;
  if(!dialog.open)$("ad4-open-manager")?.click();
  const tab=dialog.querySelector('#ad4-v3-manager-tabs [data-pane="'+pane+'"]');
  tab?.click();
  if(pane==="control"){
   const target=dialog.querySelector(".ad4-section summary");
   if(target?.parentElement?.tagName==="DETAILS")target.parentElement.open=true;
  }
 }
 page.addEventListener("click",event=>{
  const button=event.target.closest("[data-printer-pane]");
  if(button&&!button.disabled)openManager(button.dataset.printerPane);
 });
 const get=async path=>{
  const response=await fetch("./api/printer"+path,{cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  return response.json();
 };
 async function refresh(){
  if(demo||document.body.dataset.ad4Screen!=="printer"||inFlight)return;
  inFlight=true;lastPoll=Date.now();const current=++serial;
  $("ad4-v3-printer-page-state").textContent="Checking printer connection…";
  const results=await Promise.allSettled([
   get("/status"),get("/files?details=1"),get("/timelapse"),
   get("/timelapses"),get("/profiles"),get("/session")
  ]);
  inFlight=false;
  if(current!==serial||document.body.dataset.ad4Screen!=="printer")return;
  backend=results.some(item=>item.status==="fulfilled");
  const state=results[0].status==="fulfilled"?results[0].value:null;
  connected=Boolean(state?.machine_status&&!/OFFLINE|DISCONNECT|UNAVAILABLE|ERROR|UNKNOWN|NOT CONNECTED/i.test(String(state.machine_status)));
  clearValues(backend?unavailable:"Unavailable · Server unreachable");
  $("ad4-v3-printer-page-state").textContent=connected?"Connected · Live printer information":
   backend?"Printer disconnected · All cards remain visible":"Server unavailable · All cards remain visible";
  if(connected){
   put("status",fmt(state.machine_status),"Connected via the authenticated printer bridge");
   put("temperatures",fmt(state.nozzle_current,"°C")+" / "+fmt(state.bed_current,"°C"),
    "Targets "+fmt(state.nozzle_target,"°C")+" / "+fmt(state.bed_target,"°C"));
   put("progress",fmt(state.progress_percent,"%")+" / "+fmt(state.layer_current),
    state.layer_total==null?"Layer total not reported":"Layer "+fmt(state.layer_current)+" of "+fmt(state.layer_total));
   put("job",fmt(state.current_file),state.current_file?"Currently printing":"No active job reported");
   put("camera","Available on request","Snapshot and live video are never started automatically");
   put("controls",fmt(state.machine_status),"Pause · Resume · Cancel · Fan");
   put("diagnostics","Available on request","Doctor · Printer info · M114 position");
   if(results[1].status==="fulfilled"){
    const files=results[1].value;
    put("files",Array.isArray(files)?String(files.length):"—","Stored G-code / GX files");
   }
   if(results[2].status==="fulfilled"){
    const record=results[2].value||{};
    const count=results[3].status==="fulfilled"&&Array.isArray(results[3].value)?results[3].value.length:null;
    put("timelapse",record.running?"Recording":record.encoding?"Encoding":"Idle",
      (record.running?fmt(record.frames)+" frames":"No active recording")+
      (count===null?"":" · "+count+" saved videos"));
   }
  }
  if(results[4].status==="fulfilled"){
   const names=results[4].value;
   const active=results[5].status==="fulfilled"?results[5].value?.profile:null;
   put("connection",fmt(active),(Array.isArray(names)?names.length:0)+" saved profiles"+
    (connected?"":" · Printer disconnected"));
  }
  enableActions();
 }
 $("ad4-printer-refresh").addEventListener("click",refresh);
 clearValues(demo?"Unavailable · Public preview":"Unavailable · Printer disconnected");
 enableActions();
 document.querySelector('#ad4-v3-top [data-route="printer"]')?.addEventListener("click",()=>queueMicrotask(refresh));
 setInterval(()=>{if(!demo&&document.body.dataset.ad4Screen==="printer"&&Date.now()-lastPoll>15000)refresh()},2500);
 globalThis.AD4Icons?.hydrate?.();
})();
