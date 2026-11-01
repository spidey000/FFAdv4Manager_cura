/* Additional CLI tools live inside the existing printer manager. */
(() => {
 "use strict";
 const $=id=>document.getElementById(id), manager=$("ad4-manager"), P=globalThis.AD4Printer;
 if(!manager||!P)return;
 const demo=globalThis.__AD4_STATIC_PREVIEW__===true;
 const section=document.createElement("section");section.className="ad4-section";
 section.innerHTML=`<h3>Files and diagnostics</h3>
 <div class="ad4-tools"><label>Print file <input id="ad4-local-job" type="file" accept=".gx,.gcode,.gco,.g"></label>
 <button id="ad4-inspect-job" type="button">Inspect file</button><button id="ad4-upload-job" type="button">Send file</button>
 <button id="ad4-print-job" class="ad4-primary" type="button">Send &amp; print file</button><button id="ad4-convert-job" type="button">Download GX</button>
 <button id="ad4-export-slice-gx" type="button">Export sliced GX</button></div>
 <pre id="ad4-inspect-result" class="ad4-tool-output" aria-live="polite"></pre>
 <details><summary>Advanced diagnostics</summary><div class="ad4-tools">
 <button id="ad4-raw-list" type="button">Raw file listing</button>
 <input id="ad4-machine-name" maxlength="64" placeholder="Printer name" aria-label="New physical printer name">
 <button id="ad4-rename-machine" type="button">Rename printer</button>
 <a href="https://github.com/spidey000/FFAdv4Manager_cura/blob/main/docs/CLI.md" target="_blank" rel="noopener">CLI guide</a></div></details>
 <details><summary>History and notifications</summary><div class="ad4-tools">
 <button id="ad4-monitor-start" type="button">Record history (1 hour)</button><button id="ad4-monitor-stop" type="button">Stop history</button>
 <a id="ad4-monitor-download" href="./api/printer/tools/log" download>Download JSONL</a>
 <label><input id="ad4-server-notify" type="checkbox" role="switch"> Linux desktop alerts</label>
 <label><input id="ad4-browser-notify" type="checkbox" role="switch"> Browser alerts while open</label></div>
 <p id="ad4-monitor-state" role="status">No monitoring</p><pre id="ad4-monitor-events" class="ad4-tool-output"></pre></details>
 <details><summary>Wait for cooling or printer state</summary><div class="ad4-tools">
 <select id="ad4-wait-condition" aria-label="Wait condition"><option value="bed_below">Bed below °C</option><option value="state">Machine state</option></select>
 <input id="ad4-wait-temperature" type="number" min="0" max="65" value="40" aria-label="Bed temperature threshold">
 <select id="ad4-wait-machine" aria-label="Desired machine state"><option>READY</option><option>PAUSED</option><option>BUILDING_FROM_SD</option><option>BUILDING_COMPLETED</option></select>
 <button id="ad4-wait-start" type="button">Start wait</button><button id="ad4-wait-stop" type="button">Cancel wait</button></div>
 <p id="ad4-wait-result" role="status">No wait active</p></details>`;
 manager.append(section);
 const connections=$("ad4-profile-add").closest("details");
 const advanced=document.createElement("div");advanced.className="ad4-tools";
 advanced.innerHTML=`<label>TCP port <input id="ad4-conn-port" type="number" min="1" max="65535" value="8899"></label>
 <label>Timeout s <input id="ad4-conn-timeout" type="number" min="1" max="30" value="8"></label>
 <label>Camera port <input id="ad4-conn-camera-port" type="number" min="1" max="65535" value="8080"></label>
 <label>Camera path <input id="ad4-conn-camera-path" value="/?action=stream" maxlength="512"></label>
 <button id="ad4-profile-detail" type="button">Edit selected connection</button><button id="ad4-profile-update" type="button">Update connection</button>
 <button id="ad4-config-show" type="button">Load server defaults</button><button id="ad4-config-save" type="button">Save as server defaults</button>
 <button id="ad4-config-reset" type="button">Reset server defaults</button>`;
 connections.append(advanced);
 const discoveries=document.createElement("div");discoveries.className="ad4-tools";
 discoveries.id="ad4-discovered-printers";$("ad4-discover").parentElement.after(discoveries);
 const values=()=>({host:$("ad4-profile-host").value.trim(),port:Number($("ad4-conn-port").value),
  timeout:Number($("ad4-conn-timeout").value),camera_port:Number($("ad4-conn-camera-port").value),camera_path:$("ad4-conn-camera-path").value});
 const fill=v=>{for(const [id,key] of [["ad4-profile-host","host"],["ad4-conn-port","port"],["ad4-conn-timeout","timeout"],["ad4-conn-camera-port","camera_port"],["ad4-conn-camera-path","camera_path"]])if(v[key]!=null)$(id).value=v[key]};
 const run=(name,fn)=>P.task(name,fn);
 async function saveProfile(action){
  await run("Saving connection",()=>P.post("/tools/profile",{action,name:$("ad4-profile-name").value.trim(),values:values()}));
  document.dispatchEvent(new Event("ad4:profiles-changed"));
 }
 async function discover(){
  await run("Discovering printers",async()=>{
   const devices=await P.api("/discover");discoveries.replaceChildren();
   for(const device of devices){
    const b=document.createElement("button");b.type="button";b.textContent=(device.name||"AD4")+" · "+device.ip+" · Connect";
    b.disabled=device.port!==8899;
    b.addEventListener("click",()=>run("Connecting",async()=>{await P.post("/selection",{host:device.ip});$("ad4-profile-host").value=device.ip}));
    discoveries.append(b);
   }
   if(!devices.length)discoveries.textContent="No printer discovered";
  });
 }
 globalThis.AD4Tools={saveProfile,discover};
 $("ad4-profile-detail").onclick=()=>run("Loading connection",async()=>{
  const name=$("ad4-connection-profiles").value;
  const v=await P.api("/tools/profile?name="+encodeURIComponent(name));$("ad4-profile-name").value=name;fill(v);
 });
 $("ad4-profile-update").onclick=()=>saveProfile("update");
 $("ad4-config-show").onclick=()=>run("Loading defaults",async()=>{const c=await P.api("/tools/config");fill(c.values);$("ad4-diagnostic-result").textContent=JSON.stringify(c,null,2)});
 $("ad4-config-save").onclick=()=>{if(confirm("Use this connection as the persistent CLI/server default?"))run("Saving defaults",async()=>{await P.post("/tools/config",{action:"save",values:values()});clearThumbnails()})};
 $("ad4-config-reset").onclick=()=>{if(confirm("Reset persistent CLI/server connection defaults?"))run("Resetting defaults",async()=>{await P.post("/tools/config",{action:"reset"});clearThumbnails()})};
 $("ad4-raw-list").onclick=()=>run("Reading raw listing",async()=>{$("ad4-inspect-result").textContent=(await P.api("/tools/raw")).output});
 $("ad4-rename-machine").onclick=()=>{if(confirm("Rename the physical printer? The network may briefly reconnect."))run("Renaming printer",()=>P.post("/tools/rename",{name:$("ad4-machine-name").value.trim()}))};
 const chosen=()=>{const file=$("ad4-local-job").files[0];if(!file)throw Error("Choose a GX or G-code file first");if(file.size>100*1024*1024)throw Error("Maximum file size is 100 MB");return file};
 const fileCall=(route,file)=>P.api(route+"?name="+encodeURIComponent(file.name),{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
 const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $("ad4-inspect-job").onclick=()=>run("Inspecting file",async()=>{$("ad4-inspect-result").textContent=JSON.stringify(await fileCall("/tools/inspect",chosen()),null,2)});
 $("ad4-convert-job").onclick=()=>run("Converting GX",async()=>{const file=chosen();download(await fileCall("/tools/convert",file),file.name.replace(/\.[^.]+$/,"")+".gx")});
 $("ad4-export-slice-gx").onclick=()=>run("Exporting sliced GX",async()=>{
  const gcode=globalThis.app?.gui?.slicer?.exported_gcode;
  if(typeof gcode!=="string"||$("slice-export-container")?.dataset.active!=="true")throw Error("Re-slice the current model first");
  download(await fileCall("/tools/convert",new File([gcode],"sliced-model.gcode")),"sliced-model.gx");
 });
 async function sendFile(start){
  try{
   const file=chosen();
   const report=await fileCall("/tools/inspect",file);$("ad4-inspect-result").textContent=JSON.stringify(report,null,2);
   const selected=await P.confirmPrint({filename:file.name,bytes:file.size,start});
   if(!selected)return;
   await run(start?"Sending file and printing":"Sending file",()=>P.api("/upload?"+new URLSearchParams({
    name:file.name,start:String(start),timelapse:String(selected.timelapse),
    timelapse_mode:selected.mode,timelapse_interval:String(selected.interval),
    timelapse_fps:String(selected.fps)
   }),{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file}));
  }catch(e){P.say(e.message,true)}
 }
 $("ad4-upload-job").onclick=()=>sendFile(false);$("ad4-print-job").onclick=()=>sendFile(true);
 $("ad4-monitor-start").onclick=()=>run("Starting history",()=>P.post("/tools/monitor",{action:"start"}));
 $("ad4-monitor-stop").onclick=()=>run("Stopping history",()=>P.post("/tools/monitor",{action:"stop"}));
 $("ad4-server-notify").onchange=async e=>{try{await P.post("/notifications",{action:e.target.checked?"start":"stop"})}catch(error){e.target.checked=false;P.say(error.message,true)}};
 $("ad4-browser-notify").onchange=async e=>{
  if(!e.target.checked)return;
  if(!('Notification' in globalThis)||await Notification.requestPermission()!=="granted"){e.target.checked=false;return P.say("Browser notifications unavailable",true)}
  await run("Starting alert history",()=>P.post("/tools/monitor",{action:"start"}));
 };
 $("ad4-wait-start").onclick=()=>run("Waiting for printer",()=>P.post("/tools/wait",{action:"start",condition:$("ad4-wait-condition").value,
  value:$("ad4-wait-condition").value==="state"?$("ad4-wait-machine").value:Number($("ad4-wait-temperature").value)}));
 $("ad4-wait-stop").onclick=()=>run("Cancelling wait",()=>P.post("/tools/wait",{action:"stop"}));
 let lastEvent=null,polling=false;
 async function poll(){
  const alerts=$("ad4-browser-notify").checked;
  const history=$("ad4-monitor-state").closest("details"),wait=$("ad4-wait-result").closest("details");
  const visible=manager.open&&!document.hidden&&(!history?.closest("[hidden]")&&history?.open||!wait?.closest("[hidden]")&&wait?.open);
  if(demo||polling||P.busy||(!alerts&&!visible))return;
  polling=true;
  try{
   const [t,s]=await Promise.all([P.api("/tools/telemetry"),P.api("/session")]);
   $("ad4-monitor-state").textContent=t.monitoring?"Recording status every 5 seconds · stops after 1 hour":"History stopped";
   $("ad4-monitor-events").textContent=t.records.slice(-10).map(r=>r.timestamp+" · "+(r.machine_status||r.event)).join("\n");
   $("ad4-server-notify").checked=s.notifying;
   $("ad4-wait-result").textContent=t.waiting?"Waiting (maximum 1 hour)":t.wait_result?JSON.stringify(t.wait_result):"No wait active";
   $("ad4-monitor-start").disabled=t.monitoring;$("ad4-monitor-stop").disabled=!t.monitoring;
   $("ad4-wait-start").disabled=t.waiting;$("ad4-wait-stop").disabled=!t.waiting;
   const event=[...t.records].reverse().find(r=>["state_change","offline"].includes(r.event));
   if(event&&lastEvent&&event.timestamp!==lastEvent&&$("ad4-browser-notify").checked&&Notification.permission==="granted")new Notification("Adventurer 4",{body:event.machine_status||event.event});
   if(event)lastEvent=event.timestamp;
  }catch{}finally{polling=false}
 }
 for(const id of ["ad4-monitor-state","ad4-wait-result"]){$(id).closest("details")?.addEventListener("toggle",poll)}
 $("ad4-browser-notify").addEventListener("change",poll);
 setInterval(poll,10000);
 // Thumbnail loading is deliberately on demand: never issue one request per file during polling.
 const thumbnails=new Map(),pendingThumbnails=new Set(),fileList=$("ad4-file-list");
 const identity=s=>JSON.stringify([s.host||null,s.profile||null]);
 const thumbnailKey=(printer,name)=>JSON.stringify([printer,name]);
 let restoreVersion=0,thumbnailEpoch=0;
 function clearThumbnails(){for(const url of thumbnails.values())URL.revokeObjectURL(url);thumbnails.clear();restoreVersion++;thumbnailEpoch++;for(const img of fileList.querySelectorAll(".ad4-file-row img"))img.remove()}
 function hideThumbnailsForSelection(){restoreVersion++;thumbnailEpoch++;for(const img of fileList.querySelectorAll(".ad4-file-row img"))img.remove()}
 async function restoreThumbnails(){
  if(demo)return; // Pages has no printer session or thumbnail endpoint.
  const version=++restoreVersion;
  try{
   const printer=identity(await P.api("/session"));if(version!==restoreVersion)return;
   for(const row of fileList.querySelectorAll(".ad4-file-row")){
    const name=row.querySelector("strong")?.textContent,url=thumbnails.get(thumbnailKey(printer,name));
    if(!url)continue;
    let img=row.querySelector("img");if(!img){img=document.createElement("img");img.width=80;img.height=60;img.alt="Printer thumbnail for "+name;row.prepend(img)}
    if(img.getAttribute("src")!==url)img.src=url;
   }
  }catch{}
 }
 // Rows are replaced by refresh/pagination. Restore only cached blobs; /session
 // is server state and does not send a thumbnail request to the physical printer.
 new MutationObserver(restoreThumbnails).observe(fileList,{childList:true});
 document.addEventListener("ad4:profiles-changed",()=>{clearThumbnails();restoreThumbnails()});
 // Keep already fetched previews under their host/profile key. Hide them while
 // another printer is selected, and reuse them if the user switches back.
 document.addEventListener("ad4:printer-selection",hideThumbnailsForSelection);
 addEventListener("pagehide",clearThumbnails);
 $("ad4-file-list").addEventListener("click",async e=>{
  const row=e.target.closest(".ad4-file-row");if(!row||e.target.tagName==="BUTTON")return;
  const name=row.querySelector("strong")?.textContent;if(!name)return;
  let key;
  try{
   const epoch=thumbnailEpoch,printer=identity(await P.api("/session"));key=thumbnailKey(printer,name);
   if(thumbnails.has(key)){await restoreThumbnails();return}
   if(pendingThumbnails.has(key))return;pendingThumbnails.add(key);
   const path=row.dataset.remotePath;if(!path)return; // Server revalidates before M662.
   const blob=await P.api("/tools/preview?file="+encodeURIComponent(path));
   if(identity(await P.api("/session"))!==printer||epoch!==thumbnailEpoch)return;
   thumbnails.set(key,URL.createObjectURL(blob));
   if(thumbnails.size>32){const oldest=thumbnails.keys().next().value;URL.revokeObjectURL(thumbnails.get(oldest));thumbnails.delete(oldest)}
   await restoreThumbnails();
  }catch(e){P.say("Thumbnail unavailable: "+e.message,true)}finally{if(key)pendingThumbnails.delete(key)}
 });
 const hint=document.createElement("p");hint.className="ad4-help";hint.textContent="Tap a stored filename to load its printer thumbnail.";$("ad4-file-list").before(hint);
 if(demo){for(const item of [...section.querySelectorAll("button,input,select"),...advanced.querySelectorAll("button,input")])item.disabled=true}
})();

