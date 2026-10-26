import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CATEGORIES,LEVELS,FIELDS,validateField,readLibrary,saveProfile,CUSTOM_PROFILE_KEY} from './curaSettingsData.js';
import './cura-settings.css';
const store=()=>{try{return localStorage}catch{return null}};
export default function CuraSettingsDrawer({frameRef,onClose,onChanged,autoSlice}){
 const [values,setValues]=useState({}),[defaults,setDefaults]=useState({}),[descs,setDescs]=useState({});
 const [category,setCategory]=useState('Quality'),[level,setLevel]=useState('All');
 const [expanded,setExpanded]=useState(false),[search,setSearch]=useState('');
 const [help,setHelp]=useState(null),[note,setNote]=useState('');
 const [lib,setLib]=useState(()=>readLibrary(store())),[process,setProcess]=useState(''),[material,setMaterial]=useState('');
 const [saveType,setSaveType]=useState(''),[profileName,setProfileName]=useState('');
 const [drafts,setDrafts]=useState({});
 const debounce=useRef(null);
 useEffect(()=>{
   const sync=()=>{
    let slicer;try{slicer=frameRef.current?.contentWindow?.slicer}catch{return}
    if(!slicer?.getOption)return;
    const vals={},labels={};
    for(const field of FIELDS){try{
      const v=slicer.getOption(field.key);
      if(['number','string','boolean'].includes(typeof v)&&v!==null)vals[field.key]=v;
      const d=slicer.getOptionDescriptor?.(field.key);
      if(d)labels[field.key]={label:d.label,description:d.description};
    }catch{/* option absent on this Cura definition */}}
    setValues(old=>Object.keys(old).length?old:vals);
    setDefaults(old=>Object.keys(old).length?old:vals);
    setDescs(labels);
   };
   sync();const interval=setInterval(sync,1500);
   return ()=>{clearInterval(interval);clearTimeout(debounce.current)};
 },[frameRef]);
 useEffect(()=>{const listener=e=>{if(e.key==='Escape'){help?setHelp(null):onClose()}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener)},[help,onClose]);
 const shown=useMemo(()=>FIELDS.filter(f=>f.category===category&&(level==='All'||f.level<LEVELS.indexOf(level))&&(f.label.toLowerCase().includes(search.toLowerCase())||f.key.includes(search.toLowerCase()))),[category,level,search]);
 const write=(field,raw)=>{
  try{
   const value=validateField(field,raw),win=frameRef.current?.contentWindow;
   if(!win?.slicer?.setOption)throw Error('Cura settings are not ready');
   win.slicer.setOption(field.key,value);win.ffadv4LastGcode=null;onChanged();
   setValues(old=>({...old,[field.key]:value}));
   setDrafts(old=>{const next={...old};delete next[field.key];return next});setNote('');
   clearTimeout(debounce.current);
   if(autoSlice&&win.stage?.slice)debounce.current=setTimeout(()=>{try{win.stage.slice()}catch{}},900);
  }catch(e){setNote(e.message)}
 };
 const apply=(type,name)=>{
  const selected=lib[type].find(x=>x.name===name);
  const target=selected?.settings || defaults;
  for(const field of FIELDS)if(((type==='material')===(field.category==='Material')) && field.key in target)write(field,target[field.key]);
  setNote('Applied profile '+name+'. Re-slice before sending.');
 };
 const save=(type,name,replace=false)=>{
  try{
   const updated=saveProfile(lib,type,name,values,replace);
   const persistence=store();if(!persistence)throw Error('Browser storage is unavailable');
   persistence.setItem(CUSTOM_PROFILE_KEY,JSON.stringify(updated));
   setLib(updated);setSaveType('');setProfileName('');
   if(type==='material')setMaterial(name);else setProcess(name);
   setNote('Saved '+name+' locally in this browser.');
  }catch(e){setNote(e.message)}
 };
 const remove=(type,name)=>{
  if(!window.confirm('Delete profile '+name+'?'))return;
  const updated={...lib,[type]:lib[type].filter(p=>p.name!==name)};
  try{store()?.setItem(CUSTOM_PROFILE_KEY,JSON.stringify(updated));setLib(updated);
   type==='material'?setMaterial(''):setProcess('');setNote('Deleted '+name)}
  catch{setNote('Browser storage unavailable')}
 };
 return <div className="cura-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <aside role="dialog" aria-modal="true" aria-label="Cura settings" className="cura-drawer">
   <header className="cura-drawer-header"><div><strong>Slicing settings</strong><small>FlashForge Adventurer 4 · 0.4 mm</small></div><button onClick={onClose} aria-label="Close">×</button></header>
   <button className="cura-profile-toggle" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}><span><strong>Profiles &amp; filters</strong><small>{expanded?'Expanded · Process, material & search':'Artillery PLA Basic · Custom presets'}</small></span><span>{expanded?'⌃':'⌄'}</span></button>
   {expanded&&<section className="cura-profile-panel">
    <p><strong>Printer:</strong> FlashForge Adventurer 4</p>
    <div className="cura-pickers">
     <label>Process<select value={process} onChange={e=>{setProcess(e.target.value);apply('process',e.target.value)}}><option value="">Conservative quality · 0.20 mm</option>{lib.process.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
     <label>Material<select value={material} onChange={e=>{setMaterial(e.target.value);apply('material',e.target.value)}}><option value="">Artillery PLA Basic</option>{lib.material.map(p=><option key={p.name}>{p.name}</option>)}</select></label>
    </div>
    <div className="cura-profile-buttons"><button onClick={()=>setSaveType('process')}>+ Save process</button><button onClick={()=>setSaveType('material')}>+ Save material</button></div>
    {saveType&&<div className="cura-profile-buttons"><input aria-label="New preset name" value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Profile name"/><button onClick={()=>save(saveType,profileName.trim())}>Save</button><button onClick={()=>setSaveType('')}>Cancel</button></div>}
    <div className="cura-profile-buttons">{process&&<><button onClick={()=>save('process',process,true)}>Update process</button><button onClick={()=>remove('process',process)}>Delete process</button></>}{material&&<><button onClick={()=>save('material',material,true)}>Update material</button><button onClick={()=>remove('material',material)}>Delete material</button></>}</div>
    <input type="search" aria-label="Search parameters" placeholder="Search parameters..." value={search} onChange={e=>setSearch(e.target.value)}/>
   </section>}
   <nav className="cura-category-tabs" aria-label="Categories">{CATEGORIES.map(c=><button key={c} aria-pressed={category===c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</nav>
   <nav className="cura-level-tabs" aria-label="Complexity">{LEVELS.map(l=><button key={l} aria-pressed={level===l} className={level===l?'active':''} onClick={()=>setLevel(l)}>{l}</button>)}</nav>
   <section className="cura-field-list">
    {!Object.keys(values).length&&<p>Waiting for Cura settings to load…</p>}
    {shown.map(field=>{
     const value=field.key in values?values[field.key]:field.fallback;
     const def=field.key in defaults?defaults[field.key]:field.fallback;
     const modified=String(value)!==String(def);
     return <div key={field.key} className="cura-field-row">
      <button className="cura-field-name" title={'Explain '+field.label} onClick={()=>setHelp(field)}>{field.label}</button>
      <div className="cura-field-editor">{field.type==='boolean'?<input aria-label={field.label} type="checkbox" checked={Boolean(value)} onChange={e=>write(field,e.target.checked)}/>:<input aria-label={field.label} type="number" min={field.min} max={field.max} step={field.step}
         value={field.key in drafts?drafts[field.key]:value}
         onChange={e=>setDrafts(old=>({...old,[field.key]:e.target.value}))}
         onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
         onBlur={e=>{if(field.key in drafts){write(field,e.target.value);setDrafts(old=>{const next={...old};delete next[field.key];return next})}}}/>}<small>{field.unit==='bool'?'':field.unit}</small></div>
      <button className={'cura-field-reset'+(modified?' modified':'')} disabled={!modified} title={modified?'Reset to preset':'Already at preset'} onClick={()=>write(field,def)} aria-label={'Reset '+field.label}>↺</button>
     </div>
    })}
   </section>
   {note&&<p className="cura-drawer-note" role="status">{note}</p>}
   <footer className="cura-drawer-footer"><small>Settings apply to CuraEngine. Presets are browser-local. Re-slice before upload.</small><button onClick={onClose}>Done</button></footer>
   {help&&<div className="cura-help-cover" onMouseDown={e=>{if(e.target===e.currentTarget)setHelp(null)}}><div className="cura-help" role="dialog" aria-modal="true"><button onClick={()=>setHelp(null)} aria-label="Close explanation">×</button><h3>{descs[help.key]?.label||help.label}</h3><p>{descs[help.key]?.description||help.help}</p><small>{help.key}</small></div></div>}
  </aside>
 </div>
}
