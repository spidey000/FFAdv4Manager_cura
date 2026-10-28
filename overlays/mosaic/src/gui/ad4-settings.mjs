/* Mosaic-native settings enhancements. CuraEngine always runs on the server. */
import {active_containers} from "../settings/index.mjs";
import {sections} from "./sidebar.mjs";
import {update_all} from "./actions.mjs";
import {models} from "./viewer/model_viewer.mjs";
import {cura_engine} from "./slicer.mjs";
import {KEY,GROUPS,LEVELS,TIERS,allowed,readLibrary,savePreset,configureCatalog,validate} from "./ad4-presets.mjs";

const $=id=>document.getElementById(id);
const categories=Object.keys(GROUPS);
let selected="Quality",tier="All",nativeCategory="",library={},original={},autoTimer;
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
  if(!name||name.dataset.helpAttached)continue;
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
      if(!input.getAttribute("aria-label")&&!input.getAttribute("aria-labelledby"))
        input.setAttribute("aria-label",(name.textContent||id).trim());
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
 if(group==="All Cura")return true;
 const id=(section.dataset.category_id||"").toLowerCase();
 const label=nativeCategoryLabel(section).toLowerCase();
 return (GROUPS[group]||[]).some(word=>id===word||id.includes(word)||label.includes(word.replaceAll("_"," ")));
}
function populateNativeCategories(){
 const menu=$("ad4-native-category");if(!menu)return;
 const old=menu.value;
 menu.replaceChildren(element("option",{value:""},"Browse native Cura categories…"));
 for(const section of nativeSections()){
  const id=section.dataset.category_id;
  const quantity=section.querySelectorAll(".setting[data-setting_id]").length;
  menu.append(element("option",{value:id},nativeCategoryLabel(section)+" · "+quantity));
 }
 if([...menu.options].some(o=>o.value===old))menu.value=old;
}
function chooseFamily(group){
 selected=group;nativeCategory="";
 const menu=$("ad4-native-category");if(menu)menu.value="";
 for(const button of $("ad4-categories").querySelectorAll("button"))
  button.setAttribute("aria-pressed",String(button.dataset.name===group));
 $("ad4-all-cura").setAttribute("aria-pressed",String(group==="All Cura"));
 filterRows();
}
function filterRows(){
 const search=($("setting-search")?.value||"").trim().toLowerCase();
 const clear=$("ad4-search-clear");if(clear)clear.hidden=!search;
 let visibleCount=0,allCount=0;
 for(const section of nativeSections()){
  const inGroup=search||(!nativeCategory ?
    groupContains(section,selected):section.dataset.category_id===nativeCategory);
  const rows=[...section.querySelectorAll(".setting[data-setting_id]")];
  allCount+=rows.length;
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
   section.style.height="auto";section.style.maxHeight="none";
   if(section.dataset.ad4ManuallyClosed!=="true")section.dataset.closed="false";
  }
 }
 const summary=$("ad4-catalog-count");
 if(summary)summary.textContent="Showing "+visibleCount+" of "+allCount+" native Cura settings";
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
 nav.firstChild?.setAttribute("aria-pressed","true");
}
export function install_ad4_features(){
 if(!$("sidebar")||!active_containers)return;
 configureCatalog(active_containers.definitions.printer,{
  ...active_containers.containers.global.settings,...printer().settings
 });
 library=readLibrary(storage());
 for(const key of new Set([...allowed("process"),...allowed("material")]))original[key]=value(key);
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
 // Display the whole native Cura catalog without hiding an advanced toggle
 // inside profile management.
 const catalogBar=element("div",{id:"ad4-native-catalog-nav"});
 const allCura=element("button",{id:"ad4-all-cura",type:"button","aria-pressed":"false"},"All Cura settings");
 const nativeMenu=element("select",{id:"ad4-native-category","aria-label":"Browse native Cura category"});
 catalogBar.append(allCura,nativeMenu);
 root.append(panel,element("nav",{id:"ad4-categories","aria-label":"Quick Cura filters"}),
  catalogBar,element("nav",{id:"ad4-complexity","aria-label":"Slicing complexity"}),
  element("p",{id:"ad4-catalog-count",role:"status"},"Loading Cura settings…"),
  element("p",{id:"ad4-tuning-empty"},"No parameters for this filter"),
  element("p",{id:"ad4-preset-note",role:"status"}));
 const sidebar=$("sidebar");sidebar.insertBefore(root,$("profile-selector-div"));
 $("profile-selector")?.setAttribute("aria-label","Process profile");
 const searchInput=$("setting-search");searchInput.setAttribute("aria-label","Search all Cura settings");
 const clearSearch=element("button",{id:"ad4-search-clear",type:"button","aria-label":"Clear settings search"},"×");
 clearSearch.hidden=true;searchInput.after(clearSearch);
 clearSearch.addEventListener("click",()=>{searchInput.value="";filterRows();searchInput.focus()});
 tab("ad4-categories",categories,"category",chooseFamily);
 tab("ad4-complexity",LEVELS,"level",name=>tier=name);
 allCura.addEventListener("click",()=>chooseFamily("All Cura"));
 nativeMenu.addEventListener("change",()=>{
  if(!nativeMenu.value){chooseFamily("All Cura");return}
  nativeCategory=nativeMenu.value;selected="All Cura";
  for(const b of $("ad4-categories").querySelectorAll("button"))b.setAttribute("aria-pressed","false");
  allCura.setAttribute("aria-pressed","false");filterRows();
 });
 populateNativeCategories();
 sections.addEventListener("click",event=>{
  const header=event.target.closest(".section-title-container");
  if(!header)return;
  const section=header.closest(".section");
  if(section)section.dataset.ad4ManuallyClosed=String(section.dataset.closed!=="true");
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
 const observer=new MutationObserver(()=>{populateNativeCategories();decorateRows();filterRows()});observer.observe(sections,{childList:true});
 decorateRows();filterRows();
}
