const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function controller(machine,recording){
 const nodes=new Map();let mode='ready';
 function el(id){if(!nodes.has(id))nodes.set(id,{id,disabled:false,open:false,dataset:{},value:'10',handlers:{},textContent:'',
  addEventListener(n,f){(this.handlers[n]??=[]).push(f)},setAttribute(){},removeAttribute(){},pause(){},load(){},replaceChildren(){},append(){},showModal(){this.open=true},
  click(){if(!this.disabled)for(const f of this.handlers.click??[])f({})}});return nodes.get(id)}
 const context={document:{getElementById:el,createElement:()=>el('generated'),addEventListener(){}},URL,URLSearchParams,encodeURIComponent,
  setInterval:()=>1,clearInterval(){},confirm:()=>true,fetch:async url=>{
   const value=url.endsWith('/status')?machine:url.endsWith('/timelapse')?recording:[];
   if(value instanceof Error)throw value;
   return {ok:true,headers:{get:()=> 'application/json'},json:async()=>value};
  }};
 context.globalThis=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync('overlays/mosaic/public/ad4-manager.js','utf8'),context);
 return {el,context,refresh:()=>vm.runInContext('refresh()',context)};
}
(async()=>{
 const idle=controller({machine_status:'READY'},{running:false,encoding:false});await idle.refresh();
 assert.equal(idle.el('ad4-timelapse-stop').disabled,true);
 assert.equal(idle.el('ad4-timelapse-start').disabled,false);
 const recording=controller({machine_status:'READY'},{running:true,encoding:false});await recording.refresh();
 assert.equal(recording.el('ad4-timelapse-start').disabled,true);
 const offline=controller(new Error('offline'),{running:true,encoding:false});await offline.refresh();
 assert.equal(offline.el('ad4-timelapse-stop').disabled,false,'server recording can stop while printer is offline');
 const paused=controller({machine_status:'PAUSED'},{running:false,encoding:false});await paused.refresh();
 assert.equal(paused.el('ad4-send-print').disabled,true);
 idle.el('ad4-open-manager').click();
 assert.equal(idle.el('ad4-upload').disabled,true);
 await idle.context.AD4Printer.upload(false);
 assert.match(idle.el('ad4-manager-status').textContent,/Slice a model/,'shared action runs after opening, despite disabled DOM button');
 console.log('Manager action/state regression checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
