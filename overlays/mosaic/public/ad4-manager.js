/* Native MosaicSlicer printer dashboard. No browser slicing or direct LAN access. */
const root="./api/printer";
const el=id=>document.getElementById(id);
const dialog=el("ad4-manager"), status=el("ad4-manager-status");
let files=[], page=0, poll=null, isLive=false, gallery=[], playing=null, busy=false;
let hardwareConnected=false;
const encode=encodeURIComponent;
function say(msg,isError=false){status.textContent=msg;status.dataset.error=String(isError)}
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
 finally{busy=false}
}
const isPrinting=s=>/BUILDING|PRINTING|PAUSED/i.test(s||"");
const printerIsAvailable=s=>Boolean(s?.machine_status&&!/OFFLINE|DISCONNECT|UNAVAILABLE|ERROR|UNKNOWN|NOT CONNECTED/i.test(String(s.machine_status)));
function setHardwareAvailability(available){
 hardwareConnected=available;
 for(const id of ["ad4-fan_on","ad4-fan_off","ad4-snapshot","ad4-live-toggle","ad4-upload",
  "ad4-send-print","ad4-timelapse-start","ad4-timelapse-stop"]){
  const button=el(id);if(button)button.disabled=!available;
 }
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
  const start=document.createElement("button");start.textContent="Print";start.disabled=busy||!hardwareConnected;
  start.addEventListener("click",()=>{if(confirm("Start real print of "+file.name+"?")) task("Starting stored print",()=>post("/actions",{
   action:"print",file:file.path,timelapse:el("ad4-auto-timelapse").checked,timelapse_mode:el("ad4-capture-mode").value
  }))});
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
 const responses=await Promise.allSettled([api("/status"),api("/files?details=1"),api("/timelapse")]);
 const [state,remote,recording]=responses;
 const available=state.status==="fulfilled"&&printerIsAvailable(state.value);
 if(available)updateState(state.value);
 setHardwareAvailability(available);
 if(remote.status==="fulfilled"&&available)files=Array.isArray(remote.value)?remote.value:[];
 else files=[];
 renderFiles();
 if(recording.status==="fulfilled"){
  const r=recording.value;
  el("ad4-timelapse-status").textContent=r.encoding?"Encoding MP4…":r.running?
   "● Recording "+r.frames+" frames · "+(r.mode==="layer"?"Z layers (experimental)":"10-second interval"):
   r.error?"Recording error: "+r.error:"No active recording";
  el("ad4-timelapse-start").disabled=r.running||r.encoding;
  el("ad4-timelapse-stop").disabled=!r.running;
 }
 setHardwareAvailability(available);
 if(!available)el("ad4-timelapse-status").textContent="Unavailable · Printer disconnected";
 if(responses.every(x=>x.status==="rejected"))throw state.reason;
}
function closeVideo(){
 isLive=false;el("ad4-live-toggle").textContent="Start live video";
 el("ad4-live-toggle").setAttribute("aria-pressed","false");
 const img=el("ad4-camera");img.removeAttribute("src");img.hidden=true;
 if(img.dataset.blob){URL.revokeObjectURL(img.dataset.blob);delete img.dataset.blob}
}
el("ad4-open-manager").addEventListener("click",()=>{
 if(!dialog.open)dialog.showModal();setHardwareAvailability(false);say("Loading printer status…");
 refresh().catch(e=>say(e.message,true));loadGallery().catch(e=>say(e.message,true));
 clearInterval(poll);poll=setInterval(()=>{
  if(!dialog.open){clearInterval(poll);return}
  refresh().catch(e=>say(e.message,true));
  loadGallery().catch(()=>{});
 },9000);
});
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
async function upload(start){
 const gcode=globalThis.app?.gui?.slicer?.exported_gcode;
 if(typeof gcode!=="string"||!gcode.trim())return say("Slice a model on the server first",true);
 const model=globalThis.app?.gui?.file?.stl_file_name||"MosaicSlicer.stl";
 const name=(model.replace(/\.[^.]+$/,"").replace(/[^A-Za-z0-9_. -]/g,"_").slice(0,85)||"model")+".gcode";
 if(!confirm(start?"Start a real print on Adventurer 4?":"Upload this G-code as GX to Adventurer 4?"))return;
 const settings=globalThis.app?.settings?.active_containers?.export_settings?.();
 const layer=Number(settings?.global?.layer_height);
 const prefix=Number.isFinite(layer)&&layer>=0.06&&layer<=0.4?"; layer_height: "+layer+"\n":"";
 const params=new URLSearchParams({start:String(start),name,
  timelapse:String(start&&el("ad4-auto-timelapse").checked),timelapse_mode:el("ad4-capture-mode").value});
 await task(start?"Sending and printing":"Uploading GX",async()=>{
  const res=await api("/jobs?"+params,{method:"POST",headers:{"Content-Type":"text/plain; charset=utf-8"},body:prefix+gcode});
  say("Uploaded as "+res.remote_name+(res.timelapse_error?" · Recording failed: "+res.timelapse_error:""),!!res.timelapse_error);
  return res;
 });
}
el("ad4-upload").addEventListener("click",()=>upload(false));
el("ad4-send-print").addEventListener("click",()=>upload(true));
async function loadProfiles(){
 const [profiles,session]=await Promise.all([api("/profiles"),api("/session")]);
 const select=el("ad4-connection-profiles");select.replaceChildren();
 for(const name of profiles){const op=document.createElement("option");op.value=name;op.textContent=name+(session.profile===name?" · active":"");select.append(op)}
 if(session.profile)select.value=session.profile;
}
el("ad4-discover").addEventListener("click",()=>task("Discovering printers",async()=>{
 const devices=await api("/discover");
 say(devices.length?devices.map(d=>d.ip).join(", "):"No printer discovered");return {};
}));
el("ad4-profile-use").addEventListener("click",()=>task("Selecting connection",()=>post("/selection",{profile:el("ad4-connection-profiles").value})));
el("ad4-profile-delete").addEventListener("click",async()=>{
 const name=el("ad4-connection-profiles").value;
 if(name&&confirm("Delete connection profile "+name+"?")){await task("Deleting connection",()=>post("/profiles/delete",{name}));await loadProfiles()}
});
el("ad4-profile-add").addEventListener("click",async()=>{
 await task("Adding connection",()=>post("/profiles",{name:el("ad4-profile-name").value.trim(),host:el("ad4-profile-host").value.trim()}));
 await loadProfiles().catch(()=>{});
});
for(const kind of ["doctor","info","position"])el("ad4-diagnostic-"+kind).addEventListener("click",async()=>{
 try{const result=await api("/diagnostics?kind="+encode(kind));
 el("ad4-diagnostic-result").textContent=typeof result.output==="string"?result.output:JSON.stringify(result.output,null,2)}
 catch(e){say(e.message,true)}
});
dialog.addEventListener("toggle",()=>{if(dialog.open)loadProfiles().catch(()=>{})});
el("ad4-open-manager").addEventListener("click",()=>loadProfiles().catch(()=>{}));
