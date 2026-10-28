/* Mosaic-native settings enhancements. CuraEngine always runs on the server. */
import {active_containers} from "../settings/index.mjs";
import {sections} from "./sidebar.mjs";
import {update_all} from "./actions.mjs";
import {models} from "./viewer/model_viewer.mjs";
import {cura_engine} from "./slicer.mjs";
import {installSettingHelp,openSettingHelp,helpIcon} from "./ad4-setting-help.mjs";
import {KEY,GROUPS,LEVELS,TIERS,allowed,readLibrary,savePreset,configureCatalog,validate} from "./ad4-presets.mjs";

const $=id=>document.getElementById(id);
const categories=["All",...Object.keys(GROUPS)];
let selected="Quality",tier="All",library={},original={},autoTimer;
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
 $("slice-export-container")?.setAttribute("data-active","false");
 document.dispatchEvent(new Event("ad4:gcode-stale"));
 
 setTimeout(()=>{decorateRows();filterRows()},350);
 reSlice();
}
function capture(type){
 // Save every explicitly overridden Cura setting from the native profile
 // rather than freezing hundreds of inherited/formula-based default values.
 const current={};
 for(const stack of [active_containers.containers.global,printer()]){
  for(const [key,raw] of Object.entries(stack.active_profiles.user.values)){
   if(!allowed(type).has(key))continue;
   try{current[key]=validate(key,raw)}catch{/* omit unsafe/unsupported values */}
  }
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
function dialogHelp(id,trigger){
 const setting=meta(id);
 if(!setting)return;
 openSettingHelp(id,setting,trigger);
}
function decorateRows(){
 for(const row of sections.querySelectorAll(".setting[data-setting_id]")){
  const id=row.dataset.setting_id,name=row.querySelector(".setting-name"),bar=row.querySelector(".setting-bar");
  if(!name||name.dataset.helpAttached)continue;
  name.dataset.helpAttached="1";name.tabIndex=0;name.setAttribute("role","button");name.title="Explain "+name.textContent;
  name.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();dialogHelp(id,name)});
  name.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();dialogHelp(id,name)}});
  if(bar && !bar.querySelector(".ad4-setting-label-wrap")){
    const wrap=element("span",{class:"ad4-setting-label-wrap"});
    name.before(wrap);wrap.append(name);
    const helpButton=element("button",{
      type:"button",class:"ad4-setting-help-trigger",
      "aria-label":"Read help for "+name.textContent.trim(),
      title:"Read detailed SettingsGuide explanation",
      "data-tooltip":"Read setting guide"
    });
    helpIcon(helpButton);
    helpButton.addEventListener("click",event=>{
      event.preventDefault();event.stopPropagation();dialogHelp(id,helpButton);
    });
    wrap.append(helpButton);
  }
  if(bar){
   const reset=element("button",{type:"button",class:"ad4-setting-reset","aria-label":"Reset "+name.textContent},"↺");
   reset.addEventListener("click",()=>{
    if(original[id]===undefined)return;
    applyOverrides({[id]:original[id]});
   });
   bar.append(reset);
    for(const input of row.querySelectorAll("input,select,textarea")){
      if(!input.getAttribute("aria-label")&&!input.getAttribute("aria-labelledby"))
        input.setAttribute("aria-label",(name.textContent||id).trim());
      if(input.matches('input[type="number"]')){
       input.classList.add("ad4-compact-number");
       input.inputMode="decimal";
       input.setAttribute("size","5");
      }
      if(input.matches('input[type="checkbox"]')){
       input.classList.add("ad4-toggle-input");
       input.setAttribute("role","switch");
       input.setAttribute("aria-checked",String(input.checked));
       input.addEventListener("change",()=>input.setAttribute("aria-checked",String(input.checked)));
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
// Native Mosaic already constructs the full Cura hierarchy; preserve it.
function nativeSections(){return [...sections.querySelectorAll(":scope > .section[data-category_id]")]}
function nativeCategoryLabel(section){
 return section.querySelector(".section-title-container .left")?.textContent?.trim()||
        section.dataset.category_id||"Cura";
}
function groupContains(section,group){
 if(group==="All"||group==="All Cura")return true;
 const id=(section.dataset.category_id||"").toLowerCase();
 const label=nativeCategoryLabel(section).toLowerCase();
 return (GROUPS[group]||[]).some(word=>id===word||id.includes(word)||label.includes(word.replaceAll("_"," ")));
}
function chooseFamily(group){
 selected=group;
 for(const button of $("ad4-categories").querySelectorAll("button"))
  button.setAttribute("aria-pressed",String(button.dataset.name===group));
 // All and search expose every original Cura setting without a dropdown.
 filterRows();
}
function filterRows(){
 const search=($("setting-search")?.value||"").trim().toLowerCase();
 const clear=$("ad4-search-clear");if(clear)clear.hidden=!search;
 let visibleCount=0;
 for(const section of nativeSections()){
  const inGroup=Boolean(search)||groupContains(section,selected);
  const rows=[...section.querySelectorAll(".setting[data-setting_id]")];
  let shown=0;
  // Walk from leaves upwards so a nested matching Cura property never
  // disappears when its containing property itself fails the text search.
  for(let index=rows.length-1;index>=0;index--){
   const row=rows[index],id=row.dataset.setting_id;
   const name=row.querySelector(":scope > .setting-bar .setting-name")?.textContent?.toLowerCase()||"";
   const matches=!search||name.includes(search)||id.includes(search);
   const rank=TIERS[id]??2;
   const allowedAtLevel=tier==="All"||tier==="Expert"||
     (tier==="Basic"?rank===0:rank<=2);
   const visibleChild=[...row.querySelectorAll(".setting[data-setting_id]")].some(child=>!child.hidden);
   const show=Boolean(inGroup)&&((matches&&allowedAtLevel)||visibleChild);
   row.hidden=!show;
    // Replace Mosaic's separate native visibility flag with our active category filter.
    row.dataset.should_show=String(show);
   if(show)shown++;
  }
  section.hidden=!shown;
  section.dataset.should_show=String(shown>0);
  // Native section enablement can be stale after Cura resolves settings.
  // Recompute from the real enabled children rather than hiding entire
  // Speed/Travel groups that contain enabled parameters.
  section.dataset.is_enabled=String(rows.some(row=>row.dataset.is_enabled==="true"));
  section.classList.toggle("ad4-single-setting",shown===1);
  if(shown){
   visibleCount+=shown;
   section.style.removeProperty("height");section.style.removeProperty("max-height");
  }
 }
 $("ad4-tuning-empty").hidden=visibleCount>0;
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
 for(const child of nav.children)
  child.setAttribute("aria-pressed",String(parent==="ad4-categories"?
    child.dataset.name===selected:child===nav.firstChild));
}
export function install_ad4_features(){
 if(!$("sidebar")||!active_containers)return;
 configureCatalog(active_containers.definitions.printer,{
  ...active_containers.containers.global.settings,...printer().settings
 });
 library=readLibrary(storage());
 for(const key of new Set([...allowed("process"),...allowed("material")]))original[key]=value(key);
 const root=element("div",{id:"ad4-tuning-controls"});
 const toggle=element("button",{id:"ad4-presets-toggle",type:"button","aria-expanded":"false","aria-controls":"ad4-presets-panel"},"Profiles & filters · Artillery PLA Basic ⌄");
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
 // Full catalog reachable via All and the global setting search.
 root.append(panel,element("nav",{id:"ad4-categories","aria-label":"Cura setting categories"}),
  element("nav",{id:"ad4-complexity","aria-label":"Slicing complexity"}),
  element("p",{id:"ad4-tuning-empty"},"No parameters for this filter"),
  element("p",{id:"ad4-preset-note",role:"status"}));
 const sidebar=$("sidebar");sidebar.insertBefore(root,$("profile-selector-div"));
 const sticky=element("footer",{id:"ad4-settings-footer"});
 const saveButton=element("button",{type:"button",id:"ad4-settings-save"},"Save profile");
 const resetButton=element("button",{type:"button",id:"ad4-settings-reset"},"Reset defaults");
 sticky.append(saveButton,resetButton);sidebar.append(sticky);
 saveButton.addEventListener("click",()=>{
  const type=document.body.dataset.ad4Screen==="filament"?"material":"process";
  const name=prompt("Name this "+type+" profile:");
  if(!name)return;
  $("ad4-preset-type").value=type;
  $("ad4-preset-name").value=name.trim();
  $("ad4-save-preset").click();
 });
 resetButton.addEventListener("click",()=>{
  const type=document.body.dataset.ad4Screen==="filament"?"material":"process";
  if(!confirm("Restore the default "+type+" values?"))return;
  choose(type,"");
 });
 
 const legacy=$("profile-selector-div");
 if(legacy){legacy.hidden=true;legacy.setAttribute("aria-hidden","true")}
 $("profile-selector")?.setAttribute("aria-label","Process profile");
 const searchInput=$("setting-search");searchInput.setAttribute("aria-label","Search all Cura settings");
 const clearSearch=element("button",{id:"ad4-search-clear",type:"button","aria-label":"Clear settings search"},"×");
 clearSearch.hidden=true;searchInput.after(clearSearch);
 clearSearch.addEventListener("click",()=>{searchInput.value="";filterRows();searchInput.focus()});
 tab("ad4-categories",categories,"category",chooseFamily);
 tab("ad4-complexity",LEVELS,"level",name=>tier=name);
 function closeAllGroups(){
  for(const section of nativeSections()){
   section.dataset.closed="true";
   section.style.removeProperty("height");section.style.removeProperty("max-height");
   const header=section.querySelector(".section-title-container");
   if(header){header.setAttribute("role","button");header.tabIndex=0;header.setAttribute("aria-expanded","false")}
  }
 }
 document.addEventListener("ad4:enter-settings",()=>{closeAllGroups();filterRows();});
 sections.addEventListener("keydown",event=>{
  const title=event.target.closest(".section-title-container");
  if(title&&(event.key==="Enter"||event.key===" ")){event.preventDefault();title.click()}
 });
 closeAllGroups();
 sections.addEventListener("click",event=>{
  const header=event.target.closest(".section-title-container");
  if(!header)return;
  const section=header.closest(".section");
  if(section)queueMicrotask(()=>header.setAttribute("aria-expanded",String(section.dataset.closed!=="true")));
 });
 toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));
  toggle.textContent=panel.hidden?"Profiles & filters · Artillery PLA Basic ⌄":"Profiles & filters · Expanded ⌃"});

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
 installSettingHelp();
 const auto=element("label",{id:"ad4-auto-slice-label"},"Auto slice ");
 auto.append(element("input",{id:"ad4-auto-slice",type:"checkbox",tabindex:"-1"}));
 auto.hidden=true;auto.setAttribute("aria-hidden","true");
 const actions=$("slice-button-container");actions?.parentNode?.insertBefore(auto,actions);
 $("setting-search").addEventListener("input",filterRows);
 sections.addEventListener("change",()=>{
  $("slice-export-container")?.setAttribute("data-active","false");
  document.dispatchEvent(new Event("ad4:gcode-stale"));
  
  setTimeout(()=>{decorateRows();filterRows()},360);reSlice()
 });
 $("stl-file")?.addEventListener("change",()=>setTimeout(reSlice,900));
 const observer=new MutationObserver(()=>{decorateRows();filterRows()});observer.observe(sections,{childList:true});
 decorateRows();filterRows();
}
