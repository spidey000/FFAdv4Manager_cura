/* Native MosaicSlicer printer dashboard. No browser slicing or direct LAN access. */
const root="./api/printer";
const el=id=>document.getElementById(id);
const dialog=el("ad4-manager"), status=el("ad4-manager-status");
let files=[], page=0, poll=null, isLive=false, gallery=[], playing=null, busy=false;
let hardwareConnected=false, activeJob=false, recordingState=null, refreshPromise=null;
const encode=encodeURIComponent;
function say(msg,isError=false){
 status.textContent=msg;status.dataset.error=String(isError);
 // Upload/print actions originate in the layer viewport as well as the
 // manager. Surface their failure where the user initiated the action.
 if(document.body?.dataset?.ad4Screen==="sliced"){
  document.dispatchEvent(new CustomEvent(isError?"ad4:viewer-error":"ad4:viewer-recovered",{
   detail:{code:"PRINT_TRANSFER_FAILED",message:String(msg)}
  }));
 }
}
function fmt(v,suffix=""){return v==null||v===""?"—":String(v)+suffix}
function bytes(n){return Number.isFinite(n)?(n/1024/1024).toFixed(1)+" MB":"—"}
function duration(seconds){if(!Number.isFinite(seconds))return "—";const v=Math.round(seconds);return Math.floor(v/3600)+"h "+Math.floor(v%3600/60)+"m"}
function date(iso){if(!iso)return "—";const value=new Date(iso);return Number.isNaN(value.getTime())?"—":value.toLocaleString()}
async function api(path, options={}){
 const response=await fetch(root+path,{cache:"no-store",...options});
 const contentType=response.headers.get("Content-Type")||"";
 const payload=contentType.includes("json")?await response.json():await response.blob();
 if(!response.ok)throw Error(payload?.error||"Printer service returned HTTP "+response.status);
 return payload;
}
async function post(path,data){return api(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)})}
async function task(label,fn){
 if(busy)return;
 busy=true;say(label+"…");
 try{
  const result=await fn();
  say(result?.timelapse_error?"Print started; recording failed: "+result.timelapse_error:label+" completed",!!result?.timelapse_error);
  await refresh().catch(()=>{});
  return result;
 }catch(e){say(e.message,true)}
 finally{busy=false;setHardwareAvailability(hardwareConnected);renderFiles()}
}
const isPrinting=s=>/BUILDING|PRINTING|PAUSED/i.test(s||"");
const printerIsAvailable=s=>Boolean(s?.machine_status&&!/OFFLINE|DISCONNECT|UNAVAILABLE|ERROR|UNKNOWN|NOT CONNECTED/i.test(String(s.machine_status)));
function setHardwareAvailability(available){
 hardwareConnected=available;
 for(const id of ["ad4-fan_on","ad4-fan_off","ad4-snapshot","ad4-live-toggle"]){
  const button=el(id);if(button)button.disabled=!available;
 }
 for(const id of ["ad4-upload","ad4-send-print"]){el(id).disabled=!available||activeJob||busy}
 el("ad4-timelapse-start").disabled=!available||!recordingState||recordingState.running||recordingState.encoding;
 el("ad4-timelapse-stop").disabled=!recordingState?.running||recordingState?.encoding;
 if(!available){
  for(const id of ["ad4-machine","ad4-nozzle","ad4-bed","ad4-progress","ad4-layer","ad4-file"]){
   const field=el(id);if(field)field.textContent="—";
  }
  for(const id of ["ad4-pause","ad4-resume","ad4-cancel"]){const button=el(id);if(button)button.disabled=true}
  closeVideo();
 }
}
function updateState(s){
 el("ad4-machine").textContent=fmt(s.machine_status);
 el("ad4-nozzle").textContent=fmt(s.nozzle_current,"°C")+" / "+fmt(s.nozzle_target,"°C");
 el("ad4-bed").textContent=fmt(s.bed_current,"°C")+" / "+fmt(s.bed_target,"°C");
 el("ad4-progress").textContent=fmt(s.progress_percent,"%");
 el("ad4-layer").textContent=fmt(s.layer_current)+(s.layer_total!=null?" / "+s.layer_total:" (not reported)");
 const estimate=globalThis.AD4LayerEstimate;
 if(s.layer_current==null&&estimate&&isPrinting(s.machine_status)&&estimate.file===s.current_file&&Date.now()-estimate.stamp<10000)
  el("ad4-layer").textContent=estimate.layer+" / "+estimate.total+" (estimated)";
 el("ad4-file").textContent=fmt(s.current_file);
 const state=String(s.machine_status||"");
 el("ad4-pause").disabled=!isPrinting(state)||/PAUSED/i.test(state);
 el("ad4-resume").disabled=!/PAUSED/i.test(state);
 el("ad4-cancel").disabled=!isPrinting(state);
}
function sortedFiles(){
 const sort=el("ad4-file-sort").value;
 return [...files].sort((a,b)=>{
  if(sort==="duration")return (a.estimated_seconds??Infinity)-(b.estimated_seconds??Infinity)||a.name.localeCompare(b.name);
  if(sort==="date")return (b.uploaded_at||"").localeCompare(a.uploaded_at||"")||a.name.localeCompare(b.name);
  return a.name.localeCompare(b.name);
 });
}
function renderFiles(){
 const list=sortedFiles(),size=Number(el("ad4-page-size").value)||10;
 const pages=Math.max(1,Math.ceil(list.length/size));page=Math.max(0,Math.min(page,pages-1));
 const holder=el("ad4-file-list");holder.replaceChildren();
 for(const file of list.slice(page*size,(page+1)*size)){
  const line=document.createElement("div");line.className="ad4-file-row";
  const meta=document.createElement("div");meta.className="ad4-file-meta";
  const title=document.createElement("strong");title.textContent=file.name;
  const small=document.createElement("small");
  small.textContent=[duration(file.estimated_seconds),file.hotend!=null?file.hotend+"°C / "+fmt(file.bed,"°C"):"",date(file.uploaded_at)].filter(x=>x&&x!=="—").join(" · ")||"Stored on printer";
  meta.append(title,small);
  const start=document.createElement("button");start.textContent="Print";start.disabled=busy||!hardwareConnected||activeJob;
  start.addEventListener("click",async()=>{
   const selection=await confirmPrint({filename:file.name,time:file.estimated_seconds!=null?duration(file.estimated_seconds):null,
    nozzle:file.hotend,bed:file.bed,remoteFile:file.path,start:true});
   if(selection)await task("Starting stored print",()=>post("/actions",{
    action:"print",file:file.path,timelapse:selection.timelapse,timelapse_mode:selection.mode,
    timelapse_interval:selection.interval,timelapse_fps:selection.fps
   }));
  });
  line.append(meta,start);holder.append(line);
 }
 if(!list.length){const p=document.createElement("p");p.className="ad4-help";p.textContent=hardwareConnected?"No files stored on the printer":"Files unavailable · Printer disconnected";holder.append(p)}
 el("ad4-files-page").textContent=(page+1)+" / "+pages;
 el("ad4-files-prev").disabled=page===0;
 el("ad4-files-next").disabled=page>=pages-1;
}
function renderGallery(){
 const holder=el("ad4-gallery");holder.replaceChildren();
 for(const item of gallery){
  const line=document.createElement("div");line.className="ad4-file-row";
  const meta=document.createElement("div");meta.className="ad4-file-meta";
  const title=document.createElement("strong");title.textContent=date(item.created_at);
  const small=document.createElement("small");
  small.textContent=[item.mode==="layer"?"Z-layer experimental":"Time interval",item.frames+" frames",bytes(item.size_bytes),
    item.video_ready?"MP4 ready":item.encoding?"Encoding":item.error||"Not yet ready"].join(" · ");
  meta.append(title,small);
  const actions=document.createElement("span");actions.className="ad4-item-buttons";
  if(item.video_ready){
   const play=document.createElement("button");play.textContent=playing===item.id?"Close":"Play";
   play.addEventListener("click",()=>{
    const video=el("ad4-timelapse-preview");
    if(playing===item.id){video.pause();video.removeAttribute("src");video.load();video.hidden=true;playing=null}
    else{video.pause();video.src=root+"/timelapses/video?id="+encode(item.id);video.hidden=false;video.load();playing=item.id}
    renderGallery();
   });
   const a=document.createElement("a");a.textContent="MP4";a.download="timelapse-"+item.id+".mp4";
   a.href=root+"/timelapses/download?id="+encode(item.id);a.className="ad4-download";
   actions.append(play,a);
  }
  const remove=document.createElement("button");remove.textContent="Delete";remove.className="ad4-destructive";
  remove.disabled=item.running||item.encoding;
  remove.addEventListener("click",async()=>{
   if(!confirm("Permanently delete timelapse from "+date(item.created_at)+"?"))return;
   await task("Deleting timelapse",()=>post("/timelapses/delete",{id:item.id}));
   if(playing===item.id){el("ad4-timelapse-preview").hidden=true;el("ad4-timelapse-preview").removeAttribute("src");playing=null}
   await loadGallery();
  });actions.append(remove);line.append(meta,actions);holder.append(line);
 }
 if(!gallery.length)holder.textContent=hardwareConnected?"No timelapses recorded":"Gallery unavailable · Printer disconnected";
}
async function loadGallery(){gallery=await api("/timelapses");renderGallery()}
async function refresh(){
 if(refreshPromise)return refreshPromise;
 refreshPromise=refreshNow();
 try{return await refreshPromise}finally{refreshPromise=null}
}
async function refreshNow(){
 const responses=await Promise.allSettled([api("/status"),api("/files?details=1"),api("/timelapse")]);
 const [state,remote,recording]=responses;
 const available=state.status==="fulfilled"&&printerIsAvailable(state.value);
 activeJob=available&&isPrinting(state.value.machine_status);
 if(available)updateState(state.value);
 setHardwareAvailability(available);
 if(remote.status==="fulfilled"&&available)files=Array.isArray(remote.value)?remote.value:[];
 else files=[];
 renderFiles();
 if(recording.status==="fulfilled"){
  const r=recording.value;
  recordingState=r;
  el("ad4-timelapse-status").textContent=r.encoding?"Encoding MP4…":r.running?
   "● Recording "+r.frames+" frames · "+(r.mode==="layer"?"Z layers (experimental)":"10-second interval"):
   r.error?"Recording error: "+r.error:"No active recording";
  el("ad4-timelapse-start").disabled=r.running||r.encoding;
  el("ad4-timelapse-stop").disabled=!r.running;
 }else recordingState=null;
 setHardwareAvailability(available);
 if(!available&&!recordingState?.running&&!recordingState?.encoding)el("ad4-timelapse-status").textContent="Printer disconnected";
 if(responses.every(x=>x.status==="rejected"))throw state.reason;
}
function closeVideo(){
 isLive=false;el("ad4-live-toggle").textContent="Start live video";
 el("ad4-live-toggle").setAttribute("aria-pressed","false");
 const img=el("ad4-camera");img.removeAttribute("src");img.hidden=true;
 if(img.dataset.blob){URL.revokeObjectURL(img.dataset.blob);delete img.dataset.blob}
}
function openManagerPanel(){
 if(!dialog.open)dialog.show();setHardwareAvailability(false);
 if(globalThis.__AD4_STATIC_PREVIEW__===true){
  // Pages has no server. Keep every control visible but prevent mutations
  // and network attempts from the sample interface.
  for(const control of dialog.querySelectorAll("button,input,select"))control.disabled=true;
  say("Public preview · Open the authenticated server to use printer controls");
  return;
 }
 say("Loading printer status…");
 refresh().catch(e=>say(e.message,true));loadGallery().catch(e=>say(e.message,true));
 clearInterval(poll);poll=setInterval(()=>{
  if(!dialog.open){clearInterval(poll);return}
  refresh().catch(e=>say(e.message,true));
  loadGallery().catch(()=>{});
 },9000);
}
el("ad4-open-manager").addEventListener("click",openManagerPanel);
document.addEventListener("ad4:printer-enter",openManagerPanel);
const close=()=>{clearInterval(poll);closeVideo();el("ad4-timelapse-preview").pause();dialog.close()};
el("ad4-close-manager").addEventListener("click",close);
dialog.addEventListener("close",()=>{clearInterval(poll);closeVideo();el("ad4-timelapse-preview").pause()});
el("ad4-refresh").addEventListener("click",()=>refresh().then(()=>say("Updated")).catch(e=>say(e.message,true)));
el("ad4-refresh-files").addEventListener("click",()=>refresh().catch(e=>say(e.message,true)));
for(const id of ["ad4-file-sort","ad4-page-size"])el(id).addEventListener("change",()=>{page=0;renderFiles()});
el("ad4-files-prev").addEventListener("click",()=>{page--;renderFiles()});
el("ad4-files-next").addEventListener("click",()=>{page++;renderFiles()});
for(const action of ["pause","resume","cancel","fan_on","fan_off"]){
 el("ad4-"+action).addEventListener("click",()=>{
  if(action==="cancel"&&!confirm("Cancel the current physical print?"))return;
  task("Printer "+action,()=>post("/actions",{action}));
 });
}
el("ad4-snapshot").addEventListener("click",async()=>{
 closeVideo();
 try{const blob=await api("/camera"),url=URL.createObjectURL(blob),img=el("ad4-camera");
  img.src=url;img.dataset.blob=url;img.hidden=false;say("Camera snapshot updated")}
 catch(e){say(e.message,true)}
});
el("ad4-live-toggle").addEventListener("click",()=>{
 if(isLive){closeVideo();return}
 const img=el("ad4-camera");if(img.dataset.blob){URL.revokeObjectURL(img.dataset.blob);delete img.dataset.blob}
 img.src=root+"/camera/live";img.hidden=false;isLive=true;
 el("ad4-live-toggle").textContent="Stop live video";el("ad4-live-toggle").setAttribute("aria-pressed","true");
 say("Live camera streaming via protected server");
});
el("ad4-camera").addEventListener("error",()=>{if(isLive){closeVideo();say("Live camera unavailable",true)}});
el("ad4-gallery-refresh").addEventListener("click",()=>loadGallery().catch(e=>say(e.message,true)));
el("ad4-timelapse-start").addEventListener("click",()=>task("Starting timelapse",()=>post("/timelapse",{action:"start",mode:el("ad4-capture-mode").value})));
el("ad4-timelapse-stop").addEventListener("click",()=>task("Finalizing MP4",async()=>{const result=await post("/timelapse",{action:"stop"});await loadGallery();return result}));
// Preview only. Exact frame counts depend on actual print duration, camera availability,
// firmware Z reports and possible missed/duplicate layer transitions.
const capturePrefs={fps:10,interval:10};
function estimateSeconds(raw){
 const text=String(raw??"").trim().toLowerCase().replace(/,/g,".");
 if(!text||/unknown|not reported|unavailable|—/.test(text))return NaN;
 const dayClock=text.match(/^(\d+)\s+(\d{1,2}):(\d{2})$/);
 if(dayClock)return +dayClock[1]*86400 + +dayClock[2]*3600 + +dayClock[3]*60;
 const clock=text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(clock)return +clock[1]*3600 + +clock[2]*60 + (+clock[3]||0);
 let total=0,found=false;
 for(const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(days?|d\b|hours?|hrs?|hr\b|h\b|minutes?|mins?|min\b|m\b|seconds?|secs?|sec\b|s\b)/g)){
  total+=+match[1]*(/^d/.test(match[2])?86400:/^h/.test(match[2])?3600:/^m/.test(match[2])?60:1);
  found=true;
 }
 return found?total:NaN;
}
function countSlicedLayers(gcode){
 if(typeof gcode!=="string"||!gcode)return null;
 const found=new Set();
 for(const match of gcode.matchAll(/(?:^|\n);\s*LAYER\s*:\s*(\d+)\s*(?:\r?\n|$)/g))found.add(+match[1]);
 if(found.size)return found.size;
 const declared=gcode.match(/(?:^|\n);\s*LAYER_COUNT\s*:\s*(\d+)/);
 if(declared&&Number(declared[1])>0)return Number(declared[1]);
 const parsed=Number(globalThis.AD4GCodePreview?.count);
 return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;
}
function videoLength(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return "Unknown";
 const total=Math.round(seconds),mins=Math.floor(total/60),secs=total%60;
 return (mins>=60?Math.floor(mins/60)+"h "+String(mins%60).padStart(2,"0")+"m ":"")+ (mins<60?mins+"m ":"")+String(secs).padStart(2,"0")+"s";
}
async function confirmPrint({
 filename,material="Artillery PLA Basic",nozzle=null,bed=null,time=null,
 filament=null,layers=null,layerHeight=null,speed=null,support=null,adhesion=null,
 bytes=null,remoteFile=null,gcode=null,start=true
}){
 const dlg=document.createElement("dialog");dlg.className="ad4-print-confirm";
 dlg.setAttribute("aria-label",start?"Review print job":"Review printer upload");
 const heading=document.createElement("h3");heading.textContent=start?"Review before printing":"Review before upload";
 const subtitle=document.createElement("p");subtitle.className="ad4-preflight-subtitle";
 subtitle.textContent=start?"Confirm the actual sliced job, printer and recording settings.":"The file will be uploaded but not started.";
 const details=document.createElement("dl");details.className="ad4-preflight-details";
 const value=v=>v===null||v===undefined||v===""||v==="—"?"Not reported":String(v);
 function detail(label,text,optionalClass){
  const dt=document.createElement("dt");dt.textContent=label;
  const dd=document.createElement("dd");dd.textContent=value(text);
  if(optionalClass)dd.className=optionalClass;
  details.append(dt,dd);return dd;
 }
 detail("File",filename);
 detail("Printer","Flashforge Adventurer 4");
 detail("Material",material);
 detail("Nozzle temperature",nozzle==null?null:nozzle+" °C");
 detail("Bed temperature",bed==null?null:bed+" °C");
 detail("Layer height",layerHeight==null?null:layerHeight+" mm");
 detail("Print speed",speed==null?null:speed+" mm/s");
 detail("Support",support==null?null:(support===true||support==="true"?"Enabled":"Disabled"));
 detail("Adhesion",adhesion);
 detail("Print time · estimate",time);
 detail("Filament · estimate",filament);
 detail("Layers · sliced G-code",layers);
 detail("G-code size",Number.isFinite(bytes)?(bytes/1024/1024).toFixed(2)+" MB":null);
 const live=detail("Live printer status","Checking…","ad4-preflight-live");
 const actualNozzle=detail("Nozzle · current / target","Checking…","ad4-preflight-live");
 const actualBed=detail("Bed · current / target","Checking…","ad4-preflight-live");
 const recording=detail("Existing timelapse","Checking…","ad4-preflight-live");
 const timelapse=document.createElement("fieldset");timelapse.className="ad4-preflight-timelapse";
 const legend=document.createElement("legend");legend.textContent="Timelapse";
 const intro=document.createElement("label");intro.className="ad4-preflight-switch";
 const enabled=document.createElement("input");enabled.type="checkbox";
 enabled.checked=start&&Boolean(el("ad4-auto-timelapse")?.checked);
 enabled.disabled=!start;
 const copy=document.createElement("span");copy.textContent="Automatically capture when the print starts";
 intro.append(enabled,copy);
 const grid=document.createElement("div");grid.className="ad4-preflight-controls";
 function select(label,values,selected){
  const wrap=document.createElement("label");wrap.textContent=label;
  const field=document.createElement("select");
  for(const [key,name] of values){
   const option=document.createElement("option");option.value=String(key);option.textContent=name;
   field.append(option);
  }
  field.value=String(selected);wrap.append(field);grid.append(wrap);return field;
 }
 const mode=select("Capture trigger",[["layer","On layer change (M114 Z estimate)"],["interval","Every N seconds"]],el("ad4-capture-mode")?.value==="layer"?"layer":"interval");
 const interval=select("Photo interval",[[5,"5 s"],[10,"10 s"],[15,"15 s"],[30,"30 s"],[60,"60 s"]],capturePrefs.interval);
 const fps=select("Video frame rate",[[5,"5 FPS"],[10,"10 FPS"],[15,"15 FPS"],[20,"20 FPS"],[24,"24 FPS"],[30,"30 FPS"]],capturePrefs.fps);
 const prediction=document.createElement("output");prediction.className="ad4-preflight-prediction";
 prediction.setAttribute("aria-live","polite");
 const explanation=document.createElement("small");explanation.className="ad4-preflight-note";
 const issue=document.createElement("p");issue.className="ad4-preflight-warning";issue.setAttribute("role","status");
 const actions=document.createElement("div");actions.className="ad4-confirm-actions";
 const cancel=document.createElement("button");cancel.textContent="Cancel";cancel.type="button";
 const accept=document.createElement("button");accept.textContent=start?"Send & print":"Send only";accept.type="button";accept.className="ad4-primary";
 accept.disabled=true;
 actions.append(cancel,accept);
 timelapse.append(legend,intro,grid,prediction,explanation);
 dlg.append(heading,subtitle,details,timelapse,issue,actions);document.body.append(dlg);
 let thumbnailURL=null,done=false,checking=false,printerOk=false,recordingOk=false;
 if(remoteFile){
  api("/tools/preview?file="+encode(remoteFile)).then(blob=>{
   if(!dlg.isConnected)return;
   const img=document.createElement("img");thumbnailURL=URL.createObjectURL(blob);
   img.src=thumbnailURL;img.alt="Actual stored file thumbnail";img.width=160;img.height=120;
   dlg.insertBefore(img,timelapse);
  }).catch(()=>{});
 }
 function refreshPrediction(){
  const active=enabled.checked&&start;
  mode.disabled=!active;fps.disabled=!active;interval.disabled=!active||mode.value!=="interval";
  grid.classList.toggle("ad4-preflight-inactive",!active);
  if(!start){
   prediction.textContent="Upload only · recording can be enabled when starting the stored file";
   explanation.textContent="No capture starts during file transfer.";
  }else if(!active){
   prediction.textContent="Timelapse disabled";
   explanation.textContent="The print starts without automatic camera recording.";
  }else{
   const seconds=estimateSeconds(time);
   const count=mode.value==="layer"?Number(layers):Math.ceil(seconds/Number(interval.value));
   const valid=Number.isFinite(count)&&count>0&&count<=1000000;
   prediction.textContent=valid?"≈ "+Math.ceil(count)+" photos · video ≈ "+videoLength(count/Number(fps.value)):"Video duration unavailable · missing "+(mode.value==="layer"?"layer count":"print time")+" estimate";
   explanation.textContent=mode.value==="layer"?"One photo per detected Z-layer change; firmware polling may miss transitions. This is an estimate, not a guarantee.":"Assumes the predicted print time, continuous capture and no missed camera frames.";
  }
 }
 function stillSliced(){
  return !gcode||(globalThis.app?.gui?.slicer?.exported_gcode===gcode&&
    el("slice-export-container")?.dataset.active==="true");
 }
 function ready(){
  const activeRecording=enabled.checked&&start;
  if(!stillSliced())issue.textContent="G-code changed or settings invalidated the slice. Re-slice before sending.";
  else if(!printerOk)issue.textContent="Printer offline, printing or status cannot be verified. Sending is blocked.";
  else if(activeRecording&&!recordingOk)issue.textContent="A timelapse is already recording or encoding, or recording status is unavailable.";
  else issue.textContent="";
  accept.disabled=checking||Boolean(issue.textContent);
 }
 async function checkHardware(){
  if(checking||done)return false;
  checking=true;ready();
  const [printer,session]=await Promise.allSettled([api("/status"),api("/timelapse")]);
  if(done)return false;
  printerOk=printer.status==="fulfilled"&&printerIsAvailable(printer.value)&&!isPrinting(printer.value.machine_status);
  recordingOk=session.status==="fulfilled"&&!session.value.running&&!session.value.encoding&&!session.value.id;
  live.textContent=printer.status==="fulfilled"?value(printer.value.machine_status)+(printerOk?" · ready":" · not available"):"Unavailable · server unreachable";
  const temp=(state,current,target)=>state.status==="fulfilled"?value(state.value[current])+" °C / "+value(state.value[target])+" °C":"Unavailable";
  actualNozzle.textContent=temp(printer,"nozzle_current","nozzle_target");
  actualBed.textContent=temp(printer,"bed_current","bed_target");
  recording.textContent=session.status==="fulfilled"?(recordingOk?"None active":session.value.encoding?"Encoding MP4":session.value.running?"Recording":"Session occupied"):"Unavailable";
  live.title="Last checked "+new Date().toLocaleTimeString();
  checking=false;ready();return !accept.disabled;
 }
 enabled.addEventListener("change",()=>{refreshPrediction();ready()});
 mode.addEventListener("change",refreshPrediction);
 interval.addEventListener("change",refreshPrediction);
 fps.addEventListener("change",refreshPrediction);
 const stale=()=>{ready()};
 document.addEventListener("ad4:gcode-stale",stale);
 refreshPrediction();ready();
 let poll=null;
 return new Promise(resolve=>{
  const finish=selection=>{
   if(done)return;
   done=true;clearInterval(poll);document.removeEventListener("ad4:gcode-stale",stale);
   if(thumbnailURL)URL.revokeObjectURL(thumbnailURL);
   dlg.close();dlg.remove();resolve(selection);
  };
  cancel.onclick=()=>finish(null);
  accept.onclick=async()=>{
   if(!await checkHardware())return;
   const selection={timelapse:Boolean(start&&enabled.checked),mode:mode.value,
    interval:Number(interval.value),fps:Number(fps.value)};
   capturePrefs.interval=selection.interval;capturePrefs.fps=selection.fps;
   if(el("ad4-auto-timelapse"))el("ad4-auto-timelapse").checked=selection.timelapse;
   if(el("ad4-capture-mode"))el("ad4-capture-mode").value=selection.mode;
   finish(selection);
  };
  dlg.addEventListener("cancel",e=>{e.preventDefault();finish(null)});
  dlg.showModal();
  checkHardware();
  poll=setInterval(()=>{if(dlg.open)checkHardware()},5000);
 });
}
async function upload(start){
 try{await refresh()}catch(e){return say(e.message,true)}
 if(!hardwareConnected||activeJob)return say(activeJob?"A print is already active (including paused jobs)":"Printer unavailable",true);
 const gcode=globalThis.app?.gui?.slicer?.exported_gcode;
 if(typeof gcode!=="string"||!gcode.trim())return say("Slice a model on the server first",true);
 const model=globalThis.app?.gui?.file?.stl_file_name||"MosaicSlicer.stl";
 const name=(model.replace(/\.[^.]+$/,"").replace(/[^A-Za-z0-9_. -]/g,"_").slice(0,85)||"model")+".gcode";
 const settings=globalThis.app?.settings?.active_containers?.export_settings?.();
 if(el("slice-export-container")?.dataset.active!=="true")
  return say("G-code is stale: re-slice with current settings before sending",true);
 const candidates=[settings?.global||{},settings?.["extruder.0"]||{}];
 const setting=key=>candidates.map(x=>x[key]).find(x=>x!==undefined);
 const allowed=await confirmPrint({filename:name,material:"Artillery PLA Basic",
  nozzle:setting("material_print_temperature")??null,
  bed:setting("material_bed_temperature")??null,
  time:el("gcode-time-estimate")?.textContent?.trim()||null,
  filament:el("material-estimate")?.textContent?.trim()||null,
  layers:countSlicedLayers(gcode),layerHeight:setting("layer_height")??null,
  speed:setting("speed_print")??null,support:setting("support_enable")??null,
  adhesion:setting("adhesion_type")??null,bytes:new Blob([gcode]).size,gcode,start});
 if(!allowed)return;
 if(globalThis.app?.gui?.slicer?.exported_gcode!==gcode||el("slice-export-container")?.dataset.active!=="true")
  return say("G-code changed during confirmation; re-slice before sending",true);
 const layer=Number(settings?.global?.layer_height);
 const prefix=Number.isFinite(layer)&&layer>=0.06&&layer<=0.4?"; layer_height: "+layer+"\n":"";
 const params=new URLSearchParams({start:String(start),name,
  timelapse:String(allowed.timelapse),timelapse_mode:allowed.mode,
  timelapse_interval:String(allowed.interval),timelapse_fps:String(allowed.fps)});
 await task(start?"Sending and printing":"Uploading GX",async()=>{
  const res=await api("/jobs?"+params,{method:"POST",headers:{"Content-Type":"text/plain; charset=utf-8"},body:prefix+gcode});
  say("Uploaded as "+res.remote_name+(res.timelapse_error?" · Recording failed: "+res.timelapse_error:""),!!res.timelapse_error);
  return res;
 });
}
el("ad4-upload").addEventListener("click",()=>upload(false));
el("ad4-send-print").addEventListener("click",()=>upload(true));
globalThis.AD4Printer={upload,refresh,api,post,task,confirmPrint,say,closeVideo};
async function loadProfiles(){
 const [profiles,session]=await Promise.all([api("/profiles"),api("/session")]);
 const select=el("ad4-connection-profiles");select.replaceChildren();
 for(const name of profiles){const op=document.createElement("option");op.value=name;op.textContent=name+(session.profile===name?" · active":"");select.append(op)}
 if(session.profile)select.value=session.profile;
}
el("ad4-discover").addEventListener("click",()=>globalThis.AD4Tools?.discover());
el("ad4-profile-use").addEventListener("click",()=>task("Selecting connection",()=>post("/selection",{profile:el("ad4-connection-profiles").value})));
el("ad4-profile-delete").addEventListener("click",async()=>{
 const name=el("ad4-connection-profiles").value;
 if(name&&confirm("Delete connection profile "+name+"?")){await task("Deleting connection",()=>post("/profiles/delete",{name}));await loadProfiles()}
});
el("ad4-profile-add").addEventListener("click",async()=>{
 if(globalThis.AD4Tools)return globalThis.AD4Tools.saveProfile("add");
 await task("Adding connection",()=>post("/profiles",{name:el("ad4-profile-name").value.trim(),host:el("ad4-profile-host").value.trim()}));
 await loadProfiles().catch(()=>{});
});
for(const kind of ["doctor","info","position"])el("ad4-diagnostic-"+kind).addEventListener("click",async()=>{
 try{const result=await api("/diagnostics?kind="+encode(kind));
 el("ad4-diagnostic-result").textContent=typeof result.output==="string"?result.output:JSON.stringify(result.output,null,2)}
 catch(e){say(e.message,true)}
});
dialog.addEventListener("toggle",()=>{
 if(dialog.open && globalThis.__AD4_STATIC_PREVIEW__!==true)loadProfiles().catch(()=>{});
});
el("ad4-open-manager").addEventListener("click",()=>{
 if(globalThis.__AD4_STATIC_PREVIEW__!==true)loadProfiles().catch(()=>{});
});
document.addEventListener("ad4:profiles-changed",()=>loadProfiles().catch(()=>{}));
