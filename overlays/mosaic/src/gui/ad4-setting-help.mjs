/* SettingsGuide help for native Cura settings. Documentation is bundled offline. */
import MarkdownIt from "markdown-it";
import {createIcons, CircleHelp, X, ArrowLeft, ExternalLink} from "lucide";

const docRoot = new URL("settings-guide/articles/", document.baseURI);
const manifestUrl = new URL("settings-guide/index.json", document.baseURI);
const rootUrl = new URL("settings-guide/", document.baseURI);
const sourceUrl = "https://github.com/Ghostkeeper/SettingsGuide";
let indexPromise;
let viewer;

function node(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (value != null) el.textContent = value;
  return el;
}
function icon(container, name) {
  const placeholder = node("i");
  placeholder.setAttribute("data-lucide", name);
  placeholder.setAttribute("aria-hidden", "true");
  container.append(placeholder);
  createIcons({icons:{CircleHelp, X, ArrowLeft, ExternalLink},root:container,attrs:{"stroke-width":2}});
}
function manifest() {
  if (!indexPromise) {
    indexPromise = fetch(manifestUrl).then(response => {
      if (!response.ok) throw Error("Guide catalog unavailable (" + response.status + ")");
      return response.json();
    });
  }
  return indexPromise;
}
function isLocalArticle(url) {
  return url.origin === docRoot.origin && url.pathname.startsWith(docRoot.pathname)
    && url.pathname.endsWith(".md");
}
function isLocalImage(url) {
  return url.origin === docRoot.origin && url.pathname.startsWith(docRoot.pathname)
    && /\.(?:png|jpe?g|gif|webp|svg)$/i.test(url.pathname);
}
const md = new MarkdownIt({html:false, linkify:true, typographer:true});
const defaultImage = md.renderer.rules.image;
let currentUrl = docRoot;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  try {
    const target = new URL(token.attrGet("src"), currentUrl);
    if (!isLocalImage(target)) return "";
    token.attrSet("src", target.href);
    token.attrSet("loading", "lazy");
    token.attrSet("decoding", "async");
    return defaultImage(tokens,idx,options,env,self);
  } catch { return ""; }
};
const defaultLink = md.renderer.rules.link_open || ((tokens,idx,opt,env,self)=>self.renderToken(tokens,idx,opt));
md.renderer.rules.link_open = (tokens,idx,options,env,self) => {
  const token = tokens[idx], raw = token.attrGet("href") || "";
  try {
    const target = new URL(raw, currentUrl);
    if (!["https:","http:","mailto:"].includes(target.protocol)) {
      token.attrSet("href", "#");
    } else if (isLocalArticle(target)) {
      token.attrSet("href", target.href);
      token.attrSet("data-guide-path", decodeURIComponent(target.pathname.slice(docRoot.pathname.length)));
    } else if (target.hash && target.href.split("#")[0] === currentUrl.href.split("#")[0]) {
      token.attrSet("href", target.hash);
    } else {
      token.attrSet("href", target.href);
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
  } catch { token.attrSet("href", "#"); }
  return defaultLink(tokens,idx,options,env,self);
};
function makeViewer() {
  const dialog = node("dialog", "ad4-setting-guide");
  dialog.id="ad4-setting-help";
  dialog.setAttribute("aria-labelledby","ad4-help-heading");
  dialog.setAttribute("aria-describedby","ad4-help-summary");
  const card = node("div","ad4-help-content");
  const header = node("header","ad4-help-header");
  const back = node("button","ad4-help-back");
  back.type="button"; back.title="Back to the setting";back.setAttribute("aria-label","Back to the setting");
  icon(back,"arrow-left");back.hidden=true;
  const titles = node("div","ad4-help-titles");
  const eyebrow=node("small","ad4-help-eyebrow","CURA SETTINGS GUIDE");
  const heading=node("h2","");heading.id="ad4-help-heading";
  const close=node("button","ad4-help-close");
  close.type="button";close.title="Close guide";close.setAttribute("aria-label","Close guide");icon(close,"x");
  titles.append(eyebrow,heading);header.append(back,titles,close);
  const scroll=node("div","ad4-help-scroll");scroll.tabIndex=0;
  const summary=node("p","ad4-help-summary");summary.id="ad4-help-summary";
  const body=node("article","ad4-help-article");
  body.setAttribute("aria-live","polite");
  scroll.append(summary,body);
  const footer=node("footer","ad4-help-footer");
  const source=node("a","", "SettingsGuide by Ghostkeeper");
  source.href=sourceUrl;source.target="_blank";source.rel="noopener noreferrer";
  const license=node("a","", "AGPL-3.0");
  license.href=new URL("LICENSE.md",rootUrl).href;license.target="_blank";license.rel="noopener noreferrer";
  footer.append(source,license);
  card.append(header,scroll,footer);dialog.append(card);document.body.append(dialog);

  const state={dialog,header,heading,summary,body,scroll,back,close,currentId:null,currentPath:null,defaultDescription:"",stack:[],request:0};
  const dismiss=()=>dialog.close();
  close.addEventListener("click",dismiss);
  // Prevent the application's global Escape shortcut from navigating away
  // from Print when the user only wants to dismiss the guide.
  dialog.addEventListener("keydown",event=>{
    if(event.key==="Escape"){
      event.preventDefault();event.stopPropagation();dismiss();
    }
  });
  dialog.addEventListener("cancel",event=>{event.preventDefault();dismiss();});
  dialog.addEventListener("click",event=>{if(event.target===dialog)dismiss();});
  dialog.addEventListener("close",()=>{state.request++;state.stack=[];state.currentPath=null;});
  back.addEventListener("click",()=>{
    const prior=state.stack.pop();
    if(!prior)return;
    void showArticle(state,prior,false);
  });
  body.addEventListener("click",event=>{
    const anchor=event.target.closest?.("a[data-guide-path]");
    if (!anchor) return;
    event.preventDefault();
    const path=anchor.dataset.guidePath;
    if (!/^[a-z0-9_/-]+\.md$/i.test(path)) return;
    if (state.currentPath)state.stack.push(state.currentPath);
    void showArticle(state,path,false);
  });
  return state;
}
function defaultText(state,message) {
  state.body.replaceChildren(node("p","ad4-help-fallback",message));
}
async function showArticle(state,path,initial) {
  const request=++state.request;
  state.currentPath=path;
  state.back.hidden=state.stack.length===0;
  state.scroll.scrollTop=0;
  defaultText(state,"Loading detailed explanation…");
  try {
    const articleUrl = new URL(path,docRoot);
    if(!isLocalArticle(articleUrl))throw Error("Invalid article");
    const response=await fetch(articleUrl);
    if(!response.ok)throw Error("Article unavailable ("+response.status+")");
    const content=await response.text();
    if(state.request!==request||!state.dialog.open)return;
    currentUrl=articleUrl;
    const rendered=md.render(content);
    state.body.innerHTML=rendered; // html:false; URL allowlist applies to images and links
    if(!initial) {
      const heading=state.body.querySelector("h1,h2");
      if(heading)state.heading.textContent=heading.textContent;
    }
  } catch(error) {
    if(state.request!==request||!state.dialog.open)return;
    const message=initial?state.defaultDescription:
      "This linked article is unavailable. Close the guide to return to the settings.";
    defaultText(state,message);
    const warning=node("p","ad4-help-unavailable","Detailed guide content could not be loaded: "+error.message);
    state.body.append(warning);
  }
}
export function installSettingHelp() {
  if(viewer)return viewer;
  viewer=makeViewer();
  return viewer;
}
export function helpIcon(button) { icon(button,"circle-help"); }
export function openSettingHelp(id,setting,trigger) {
  const state=installSettingHelp();
  if(state.dialog.open)state.dialog.close();
  state.currentId=id;state.currentPath=null;state.stack=[];state.request++;
  state.heading.textContent=setting?.label||id;
  state.defaultDescription=setting?.description||setting?.tooltip||"This parameter controls CuraEngine toolpath generation.";
  state.summary.textContent= id + (setting?.unit?" · "+setting.unit:"") + " — " + state.defaultDescription;
  state.body.replaceChildren(node("p","ad4-help-fallback",state.defaultDescription));
  state.back.hidden=true;
  state.scroll.scrollTop=0;
  state.dialog.showModal();
  void manifest().then(index=>{
    if(!state.dialog.open||state.currentId!==id)return;
    const path=index.articles?.[id];
    if(path) return showArticle(state,path,true);
    state.body.append(node("p","ad4-help-unavailable","No extended SettingsGuide article is available for this setting."));
  }).catch(error=>{
    if(state.dialog.open&&state.currentId===id)
      state.body.append(node("p","ad4-help-unavailable","The detailed guide could not be loaded: "+error.message));
  });
}
