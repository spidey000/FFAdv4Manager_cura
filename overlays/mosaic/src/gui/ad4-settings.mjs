/* Mosaic-native settings enhancements. CuraEngine always runs on the server. */
import {active_containers} from "../settings/index.mjs";
import {sections} from "./sidebar.mjs";
import {update_all} from "./actions.mjs";
import {models} from "./viewer/model_viewer.mjs";
import {cura_engine} from "./slicer.mjs";
import {KEY,GROUPS,LEVELS,TIERS,allowed,readLibrary,savePreset,LIMITS} from "./ad4-presets.mjs";

const $=id=>document.getElementById(id);
const categories=Object.keys(GROUPS);
let selected="Quality",tier="All",native=false,library={},original={},autoTimer;
const printer=()=>active_containers.containers.extruders[0];
const meta=id=>printer().settings[id]||active_containers.containers.global.settings[id];
const value=id=>{try{return printer().resolve_setting(id)}catch{return undefined}};
function storage(){try{return localStorage}catch{return null}}
function element(tag,attrs={},text){
 const e=document.createElement(tag);
 for(const [key,val]of Object.entries(attrs)){if(key==="class")e.className=val;else e.setAttribute(key,val)}
 if(text!==undefined)e.textContent=text;
 return e;
}
function persist(){
 const store=storage();if(!store)throw Error("Browser storage unavailable");
 store.setItem(KEY,JSON.stringify(library));
}
function notice(text){$("ad4-preset-note").textContent=text}
function reSlice(){
 if(!$("ad4-auto-slice")?.checked)return;
 clearTimeout(autoTimer);
 autoTimer=setTimeout(()=>{
  if(cura_engine.active||!Object.keys(models).length)return;
  const button=$("slice-button");if(button&&!button.disabled)button.click();
 },1000);
}
function applyOverrides(values){
 for(const [key,next]of Object.entries(values)){
  const descriptor=meta(key);if(!descriptor)continue;
  const target=descriptor.settable_per_extruder?printer():active_containers.containers.global;
  target.active_profiles.user.values[key]=next;
 }
 update_all(printer());
 setTimeout(()=>{decorateRows();filterRows()},350);
 reSlice();
}
function capture(type){
 const current={};
 for(const key of allowed(type)){
  const v=value(key);
  if(typeof v!=="number"&&typeof v!=="boolean")continue;
  if(LIMITS[key]&&(v<LIMITS[key][0]||v>LIMITS[key][1]))continue;
  current[key]=v;
 }
 return current;
}
function drawPresets(){
 for(const type of ["process","material"]){
  const select=$("ad4-"+type+"-preset"),old=select.value;
  select.replaceChildren(element("option",{value:""},type==="material"?"Artillery PLA Basic":"Conservative · 0.20 mm"));
  for(const p of library[type])select.append(element("option",{value:p.name},p.name));
  if(library[type].some(p=>p.name===old))select.value=old;
 }
}
function choose(type,name){
 const item=library[type].find(p=>p.name===name);
 const values=item?item.values:Object.fromEntries(Object.entries(original).filter(([key])=>allowed(type).has(key)));
 applyOverrides(values);
 notice(item?"Applied "+name+"; re-slice before uploading.":"Restored default "+type+" values.");
}
function dialogHelp(id){
 const setting=meta(id),dialog=$("ad4-setting-help");
 if(!setting||!dialog)return;
 $("ad4-help-heading").textContent=setting.label||id;
 $("ad4-help-description").textContent=setting.description||setting.tooltip||"This option controls CuraEngine toolpath generation.";
 $("ad4-help-id").textContent=id+(setting.unit?" · "+setting.unit:"");
 dialog.showModal();
}
function decorateRows(){
 for(const row of sections.querySelectorAll(".setting[data-setting_id]")){
  const id=row.dataset.setting_id,name=row.querySelector(".setting-name"),bar=row.querySelector(".setting-bar");
  if(!name||name.dataset.helpAttached)return;
  name.dataset.helpAttached="1";name.tabIndex=0;name.setAttribute("role","button");name.title="Explain "+name.textContent;
  name.addEventListener("click",()=>dialogHelp(id));
  name.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();dialogHelp(id)}});
  if(bar){
   const reset=element("button",{type:"button",class:"ad4-setting-reset","aria-label":"Reset "+name.textContent},"↺");
   reset.addEventListener("click",()=>{
    if(original[id]===undefined)return;
    applyOverrides({[id]:original[id]});
   });
   bar.append(reset);
    for(const input of row.querySelectorAll("input,select,textarea")){
      if(!input.getAttribute("aria-label") && !input.getAttribute("aria-labelledby")){
        input.setAttribute("aria-label",(name.textContent||id).trim());
      }
    }
  }
 }
 for(const row of sections.querySelectorAll(".setting[data-setting_id]")){
  const id=row.dataset.setting_id,reset=row.querySelector(".ad4-setting-reset");
  if(!reset)continue;
  const changed=original[id]!==undefined&&JSON.stringify(value(id))!==JSON.stringify(original[id]);
  reset.disabled=!changed;reset.classList.toggle("changed",changed);
  reset.title=changed?"Restore default preset value":"Using default";
 }
}
function filterRows(){
 let count=0;
 const search=($("setting-search")?.value||"").trim().toLowerCase();
  const allCategories=new Set(Object.values(GROUPS).flat());
  $("ad4-search-clear").hidden=!search;
 for(const section of sections.querySelectorAll(".section")){
  let shown=0;
  for(const row of section.querySelectorAll(".setting[data-setting_id]")){
   const id=row.dataset.setting_id;
   const category=row.closest(".section")?.dataset.category_id;
    const included=native||(search?allCategories.has(category):GROUPS[selected].includes(category))&&(
    tier==="All"||(TIERS[id]??3)<LEVELS.indexOf(tier));
   const label=row.querySelector(".setting-name")?.textContent?.toLowerCase()||"";
   const show=included&&(!search||label.includes(search)||id.includes(search));
   row.hidden=!show;if(show)shown++;
  }
  section.hidden=!shown;
   section.classList.toggle("ad4-single-setting",shown===1);
   if(shown){count+=shown;section.dataset.closed="false";section.style.height="auto";section.style.maxHeight="none"}
 }
 $("ad4-tuning-empty").hidden=!!count;
  $("ad4-tuning-empty").textContent=search?"No settings match your search":"No parameters available in this category";
 decorateRows();
}
function tab(parent,labels,key,handler){
 const nav=$(parent);
 for(const label of labels){
  const b=element("button",{type:"button","data-name":label},label);
  b.addEventListener("click",()=>{handler(label);for(const child of nav.children)child.setAttribute("aria-pressed",String(child===b));filterRows()});
  nav.append(b);
 }
 nav.firstChild?.setAttribute("aria-pressed","true");
}
export function install_ad4_features(){
 if(!$("sidebar")||!active_containers)return;
 library=readLibrary(storage());
 for(const keys of Object.values(GROUPS))for(const key of keys)original[key]=value(key);
 const root=element("div",{id:"ad4-tuning-controls"});
 const toggle=element("button",{id:"ad4-presets-toggle",type:"button","aria-expanded":"false"},"Profiles & filters · Artillery PLA Basic ⌄");
 root.append(toggle);
 const panel=element("div",{id:"ad4-presets-panel"});panel.hidden=true;
 const printerName=element("div",{class:"ad4-printer-fixed"},"Printer: FlashForge Adventurer 4");panel.append(printerName);
 for(const type of ["process","material"]){
  const label=element("label",{},type==="material"?"Material":"Process");
  label.append(element("select",{id:"ad4-"+type+"-preset","aria-label":type+" profile"}));panel.append(label);
 }
 const saveRow=element("div",{class:"ad4-preset-row"});
 const kind=element("select",{id:"ad4-preset-type","aria-label":"Profile type"});
 for(const type of ["process","material"])kind.append(element("option",{value:type},type));
 saveRow.append(kind,element("input",{id:"ad4-preset-name",placeholder:"New preset name",maxlength:"49","aria-label":"New preset name"}),
   element("button",{id:"ad4-save-preset",type:"button"},"Save new"));
 panel.append(saveRow);
 const tools=element("div",{class:"ad4-preset-row"});
 tools.append(element("button",{id:"ad4-update-preset",type:"button"},"Update selected"),
   element("button",{id:"ad4-delete-preset",type:"button",class:"ad4-danger-action"},"Delete selected"));panel.append(tools);
 const nativeLabel=element("label",{class:"ad4-native-label"},"Show all native Cura settings ");
 nativeLabel.append(element("input",{id:"ad4-native-toggle",type:"checkbox"}));panel.append(nativeLabel);
 root.append(panel,element("nav",{id:"ad4-categories","aria-label":"Slicing categories"}),
  element("nav",{id:"ad4-complexity","aria-label":"Slicing complexity"}),
  element("p",{id:"ad4-tuning-empty"},"No parameters for this filter"),
  element("p",{id:"ad4-preset-note",role:"status"}));
 const sidebar=$("sidebar");sidebar.insertBefore(root,$("profile-selector-div"));
  $("profile-selector")?.setAttribute("aria-label","Process profile");
  const searchInput=$("setting-search");
  searchInput.setAttribute("aria-label","Search all Cura settings");
  const clearSearch=element("button",{id:"ad4-search-clear",type:"button","aria-label":"Clear settings search"},"×");
  clearSearch.hidden=true;searchInput.after(clearSearch);
  clearSearch.addEventListener("click",()=>{searchInput.value="";filterRows();searchInput.focus()});
 tab("ad4-categories",categories,"category",name=>{selected=name;native=false;$("ad4-native-toggle").checked=false});
 tab("ad4-complexity",LEVELS,"level",name=>tier=name);
 toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));
  toggle.textContent=panel.hidden?"Profiles & filters · Artillery PLA Basic ⌄":"Profiles & filters · Expanded ⌃"});
 $("ad4-native-toggle").addEventListener("change",event=>{native=event.target.checked;filterRows()});
 drawPresets();
 for(const type of ["process","material"])$("ad4-"+type+"-preset").addEventListener("change",e=>choose(type,e.target.value));
 function selectedPreset(){const type=kind.value;return {type,name:$("ad4-"+type+"-preset").value}}
 function save(type,name,replace=false){
  try{
   library=savePreset(library,type,name,capture(type),replace);persist();drawPresets();
   $("ad4-"+type+"-preset").value=name;$("ad4-preset-name").value="";
   notice("Saved "+name+" in this browser.");
  }catch(e){notice(e.message)}
 }
 $("ad4-save-preset").addEventListener("click",()=>save(kind.value,$("ad4-preset-name").value.trim()));
 $("ad4-update-preset").addEventListener("click",()=>{const {type,name}=selectedPreset();
  if(!name){notice("Select a saved preset first");return}save(type,name,true)});
 $("ad4-delete-preset").addEventListener("click",()=>{const {type,name}=selectedPreset();
  if(!name||!confirm("Delete "+name+"?"))return;
  library[type]=library[type].filter(p=>p.name!==name);
  try{persist();drawPresets();$("ad4-"+type+"-preset").value="";notice("Deleted "+name)}
  catch(e){notice(e.message)}
 });
 const help=element("dialog",{id:"ad4-setting-help","aria-labelledby":"ad4-help-heading"});
 const inside=element("div",{class:"ad4-help-content"});
 const close=element("button",{type:"button","aria-label":"Close explanation"},"×");close.addEventListener("click",()=>help.close());
 inside.append(close,element("h3",{id:"ad4-help-heading"}),element("p",{id:"ad4-help-description"}),element("small",{id:"ad4-help-id"}));
 help.append(inside);help.addEventListener("click",e=>{if(e.target===help)help.close()});document.body.append(help);
 const auto=element("label",{id:"ad4-auto-slice-label"},"Auto slice ");
 auto.append(element("input",{id:"ad4-auto-slice",type:"checkbox",tabindex:"-1"}));
  auto.hidden=true;auto.setAttribute("aria-hidden","true");
 const actions=$("slice-button-container");actions?.parentNode?.insertBefore(auto,actions);
 $("setting-search").addEventListener("input",filterRows);
 sections.addEventListener("change",()=>{setTimeout(()=>{decorateRows();filterRows()},360);reSlice()});
 $("stl-file")?.addEventListener("change",()=>setTimeout(reSlice,900));
 const observer=new MutationObserver(()=>{decorateRows();filterRows()});observer.observe(sections,{childList:true});
 decorateRows();filterRows();
}
