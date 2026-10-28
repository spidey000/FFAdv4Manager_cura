/** AD4 Studio's one icon package. Locally bundled, tree-shaken Lucide v1.62.0 (ISC). */
import { createElement, Box, Wrench, Disc3, Printer, Settings, Folder, Camera, Move,
 Layers, RotateCw, Maximize2, FolderPlus, Trash, Upload, Send, ChevronDown, Clock,
 Save, Download, Info, Lock, LockOpen, SlidersHorizontal, RotateCcw, Ruler,
 FileUp, Scan, File, Check, X, RefreshCw, Plus, Minus, Play, Pause } from "lucide";
const ICONS={cube:Box,box:Box,wrench:Wrench,filament:Disc3,printer:Printer,gear:Settings,
 file:Folder,camera:Camera,orient:RotateCw,move:Move,rotate:RotateCw,scale:Maximize2,
 layers:Layers,plus:Plus,arrow:Send,back:RotateCcw,chevron:ChevronDown,clock:Clock,
 upload:Upload,send:Send,sliders:SlidersHorizontal,trash:Trash,"folder-plus":FolderPlus,
 download:Download,save:Save,info:Info,lock:Lock,unlock:LockOpen,ruler:Ruler,
 scan:Scan,"file-up":FileUp,check:Check,x:X,refresh:RefreshCw,minus:Minus,
 play:Play,pause:Pause};
const ACTIONS={"ad4-v3-open-model":"folder-plus","ad4-v3-remove-model":"trash",
 "ad4-v3-demo":"box","ad4-v3-show-layers":"layers","ad4-v3-export":"download",
 "ad4-v3-send":"upload","ad4-v3-print":"send","ad4-v3-run-slice":"layers",
 "ad4-upload":"upload","ad4-send-print":"send","ad4-snapshot":"camera",
 "ad4-live-toggle":"camera","ad4-timelapse-start":"play","ad4-timelapse-stop":"pause",
 "ad4-refresh":"refresh"};
export function install_ad4_icon_pack(){
 const svg=name=>{
  const el=createElement(ICONS[name]||Info);
  el.setAttribute("aria-hidden","true");
  el.setAttribute("class","ad4-icon-svg");
  el.setAttribute("stroke-width","1.85");
  return el.outerHTML;
 };
 const hydrate=(container=document)=>{
  for(const span of container.querySelectorAll("[data-ad4-icon]")){
   if(span.firstElementChild?.tagName?.toLowerCase()!=="svg")
    span.innerHTML=svg(span.dataset.ad4Icon);
  }
  for(const [id,name] of Object.entries(ACTIONS)){
   const button=document.getElementById(id);
   if(!button||button.querySelector("[data-ad4-icon]"))continue;
   const span=document.createElement("span");span.className="ad4-lucide ad4-action-icon";
   span.dataset.ad4Icon=name;span.innerHTML=svg(name);button.prepend(span);
  }
 };
 globalThis.AD4Icons={svg,hydrate};
 document.dispatchEvent(new Event("ad4:icons-ready"));hydrate();
}
