/* Poll only on explicit consultation; source provenance is always visible. */
(() => {
 "use strict";
 const $=id=>document.getElementById(id),manager=$("ad4-manager"),P=globalThis.AD4Printer;
 if(!manager||!P)return;
 const demo=globalThis.__AD4_STATIC_PREVIEW__===true;
 const section=document.createElement("section");section.className="ad4-section ad4-live-job";section.id="ad4-live-job";
 section.innerHTML=`<div class="ad4-section-title"><h3>Monitoring</h3><button id="ad4-live-consult" type="button">Start toolpath</button></div>
 <p id="ad4-live-status" role="status">Monitoring is off. Start the toolpath or enable live camera when needed.</p>
 <div class="ad4-live-pair">
  <div class="ad4-live-visual"><button id="ad4-live-toolpath-expand" type="button" class="ad4-live-caption ad4-live-expand" aria-haspopup="dialog" aria-label="Expand Toolpath visualization">Toolpath <span data-ad4-icon="scale" aria-hidden="true"></span></button><div id="ad4-live-canvas" class="ad4-live-canvas"></div></div>
  <div class="ad4-live-visual"><button id="ad4-live-camera-expand" type="button" class="ad4-live-caption ad4-live-expand" aria-haspopup="dialog" aria-label="Expand Live preview visualization">Live preview <span data-ad4-icon="scale" aria-hidden="true"></span></button><div class="ad4-live-camera-wrap"><img id="ad4-live-camera" alt="Physical print from the Adventurer 4 camera" hidden><span id="ad4-live-camera-state">Camera stopped</span></div></div>
 </div>
 <div class="ad4-monitor-metrics" aria-label="Nozzle position and estimated print layer">
  <div><span>X</span><strong id="ad4-live-x">—</strong></div>
  <div><span>Y</span><strong id="ad4-live-y">—</strong></div>
  <div><span>Z</span><strong id="ad4-live-z">—</strong></div>
  <div><span>Estimated layer</span><strong id="ad4-live-layer">—</strong></div>
 </div>
 <p id="ad4-live-position" role="status" class="ad4-live-position-text">XYZ — · Estimated layer —</p>
 <p id="ad4-live-source" class="ad4-help">G-code source not loaded</p>
 <div class="ad4-tools ad4-monitor-controls">
  <button id="ad4-live-right" type="button">Right wall view</button>
  <label><span>Live camera</span><input id="ad4-live-camera-toggle" type="checkbox" role="switch" aria-label="Enable live camera"></label>
  <button id="ad4-live-stop" type="button">Stop viewing</button>
  <button id="ad4-live-fetch" type="button" disabled>Fetch printer file</button>
 </div>`;
 manager.querySelector(".ad4-grid").after(section);
 let viewing=false,inFlight=false,timer=null,renderer=null,token=null,snapshot=null,attemptedFile=null,controller=null;
 function text(id,value){$(id).textContent=value}
 function camera(){
  const img=$("ad4-live-camera");
  if(viewing&&!document.hidden&&$("ad4-live-camera-toggle").checked){
   if(!img.getAttribute("src")||!img.getAttribute("src").includes("/api/printer/camera/live"))img.src="./api/printer/camera/live";
   img.hidden=false;text("ad4-live-camera-state","");
  }else{img.removeAttribute("src");img.hidden=true;text("ad4-live-camera-state","Camera stopped")}
 }
 $("ad4-live-camera").onerror=()=>{text("ad4-live-camera-state","Camera unavailable");$("ad4-live-camera").hidden=true};
 $("ad4-live-camera-toggle").onchange=()=>{if($("ad4-live-camera-toggle").checked&&!viewing)start();else camera()};
 function ensureRenderer(){
  if(!renderer){
   if(!globalThis.AD4LiveRenderer)throw Error("3D renderer is still loading; retry in a moment");
   renderer=globalThis.AD4LiveRenderer.create($("ad4-live-canvas"));
  }
 }
 async function fetchSource(){
  if(!snapshot?.status.current_file)return;
  await P.post("/current-job/fetch",{current_file:snapshot.status.current_file});token=null;
 }
 async function refresh(){
  if(!viewing||inFlight||!manager.open||document.hidden)return;
  inFlight=true;const activeController=controller;
  try{
   let state=await P.api("/current-job",{signal:activeController.signal});
   if(state.active&&state.download_supported&&attemptedFile!==state.status.current_file){
    attemptedFile=state.status.current_file;snapshot=state;
    try{await fetchSource();state=await P.api("/current-job",{signal:activeController.signal})}catch(error){P.say("Printer download unavailable: "+error.message,true)}
   }
   if(!viewing||activeController!==controller)return;
   snapshot=state;
   if(state.layer_current!=null){
    globalThis.AD4LayerEstimate={file:state.status.current_file,layer:state.layer_current,total:state.layer_total,stamp:Date.now()};
    $("ad4-layer").textContent=state.layer_current+" / "+state.layer_total+" (estimated)";
   }
   text("ad4-live-status",(state.active?"Printing: ":"Printer state: ")+(state.status.current_file||state.status.machine_status||"Unknown")+" · "+new Date().toLocaleTimeString());
   const source=state.source;
   text("ad4-live-source",source?({server_upload:"Source: retained copy sent by this server; remote contents not re-read",user_association:"Source: file associated by the user; remote contents not verified",printer_download:"Source: downloaded through the configured printer transport"}[source.kind]||"Unknown source")+" · SHA-256 "+source.sha256.slice(0,12):state.source_error);
   $("ad4-live-fetch").disabled=!state.active||!state.download_supported;
   $("ad4-live-fetch").title=state.download_supported?"Download the current file using the configured transport":"No verified AD4 G-code download transport is configured";
   const position=Object.fromEntries(Object.entries(state.position||{}).map(([axis,value])=>[axis.toUpperCase(),value]));
   const p=Object.entries(position).map(([axis,value])=>axis+" "+Number(value).toFixed(2)).join(" · ");
   for(const axis of ["X","Y","Z"])text("ad4-live-"+axis.toLowerCase(),Number.isFinite(position[axis])?Number(position[axis]).toFixed(2)+" mm":"—");
   const layerLabel=!state.active?"not printing":!state.geometry_available?"unavailable (G-code required)":state.layer_current??"stabilizing";
   text("ad4-live-position",(p||"Position unavailable")+" · Estimated layer "+layerLabel+(state.layer_total?" / "+state.layer_total:""));
   text("ad4-live-layer",state.active&&state.layer_current!=null?state.layer_current+(state.layer_total!=null?" / "+state.layer_total:""):"—");
   if(!state.geometry_available){
    if(renderer){renderer.dispose();renderer=null}token=null;
    text("ad4-live-canvas",state.source_error||"No matching G-code source available");
   }else{
    if(state.job_token!==token){
     if(renderer){renderer.dispose();renderer=null}
     $("ad4-live-canvas").replaceChildren();ensureRenderer();
     const geometry=await P.api("/current-job/toolpath?token="+encodeURIComponent(state.job_token),{signal:activeController.signal});
     if(!viewing||activeController!==controller)return;
     renderer.load(geometry);token=state.job_token;
     if(geometry.simplified)text("ad4-live-source",$("ad4-live-source").textContent+" · Render sampled for large toolpath; layer heights retained");
    }
    renderer.update(state);
   }
  }catch(error){if(error.name!=="AbortError")text("ad4-live-status","Tracking unavailable: "+error.message)}
  finally{inFlight=false}
 }
 function start(){
  if(demo)return;
  if(!viewing){P.closeVideo();viewing=true;controller=new AbortController();attemptedFile=null;camera();timer=setInterval(refresh,3000)}
  refresh();
 }
 function stop(){$("ad4-live-camera-toggle").checked=false;viewing=false;clearInterval(timer);controller?.abort();camera();if(renderer){renderer.dispose();renderer=null}token=null;inFlight=false;text("ad4-live-status","Live viewing stopped")}
 $("ad4-live-consult").onclick=start;$("ad4-live-stop").onclick=stop;
 $("ad4-live-right").onclick=()=>renderer?.reset();
 $("ad4-live-fetch").onclick=async()=>{try{await fetchSource();await refresh()}catch(error){P.say(error.message,true)}};
 manager.addEventListener("click",event=>{if(event.target.closest('[data-pane="live"]'))start()});
 $("ad4-open-manager").addEventListener("click",()=>queueMicrotask(()=>{if(manager.querySelector('[data-pane="live"][aria-pressed="true"]'))start()}));
 manager.addEventListener("close",stop);
 for(const id of ["ad4-live-toggle","ad4-snapshot"])$(id).addEventListener("click",()=>{$("ad4-live-camera-toggle").checked=false;camera()});
 document.addEventListener("visibilitychange",()=>{if(document.hidden){controller?.abort();camera()}else if(viewing){controller=new AbortController();camera();refresh()}});
 if(demo){$("ad4-live-consult").disabled=true;text("ad4-live-status","Live tracking requires the printer server")}
})();

