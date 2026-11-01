const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function controller(machine,recording){
 const nodes=new Map(),calls=[];let mode='ready';
 function el(id){if(!nodes.has(id))nodes.set(id,{id,disabled:false,open:false,dataset:{},value:'10',handlers:{},textContent:'',
  addEventListener(n,f){(this.handlers[n]??=[]).push(f)},setAttribute(){},removeAttribute(){},pause(){},load(){},replaceChildren(){},append(){},show(){this.open=true},showModal(){this.open=true},
  click(){if(!this.disabled)for(const f of this.handlers.click??[])f({})}});return nodes.get(id)}
 const context={document:{getElementById:el,createElement:()=>el('generated'),addEventListener(){}},URL,URLSearchParams,encodeURIComponent,
  setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},confirm:()=>true,fetch:async url=>{
   calls.push(url);
   const value=url.endsWith('/status')?machine:url.endsWith('/current-job')?(machine instanceof Error?machine:{status:machine}):url.endsWith('/timelapse')?recording:[];
   if(value instanceof Error)throw value;
   return {ok:true,headers:{get:()=> 'application/json'},json:async()=>value};
  }};
 context.globalThis=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync('overlays/mosaic/public/ad4-manager.js','utf8'),context);
 return {el,context,calls,setMachine:value=>{machine=value},refresh:()=>vm.runInContext('refresh()',context)};
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
 const partial=controller({machine_status:null,connection_status:'partial',status_available:false,ready_to_print:false,progress_percent:98},{running:false,encoding:false});await partial.refresh();
 assert.equal(partial.el('ad4-send-print').disabled,true);
 assert.match(partial.el('ad4-machine').textContent,/Partial response/);
 const heating=controller({machine_status:'HEATING',ready_to_print:false},{running:false,encoding:false});await heating.refresh();
 assert.equal(heating.el('ad4-send-print').disabled,true);
 assert.equal(idle.el('ad4-send-print').disabled,false);
 const selective=controller({machine_status:'READY'},{running:false,encoding:false});
 await selective.refresh();await selective.refresh();
 assert.equal(selective.calls.filter(url=>url.includes('/files')).length,0,'status refresh does not reload files');
 assert.equal(selective.calls.filter(url=>url.endsWith('/timelapse')).length,1,'inactive recording needs no periodic reload');
 selective.el('ad4-v3-printer-page').dataset.printerView='files';
 await selective.context.AD4Printer.loadVisibleData();
 assert.equal(selective.calls.filter(url=>url.includes('/files')).length,1);
 assert.equal(selective.calls.filter(url=>url.endsWith('/profiles')||url.endsWith('/timelapses')).length,0,'hidden resources are not fetched');
 const live=controller({machine_status:'READY'},{running:false,encoding:false});await live.refresh();
 live.el('ad4-manager').dataset.liveViewing='true';
 const liveReads=live.calls.filter(url=>url.endsWith('/status')).length;
 await live.refresh();assert.equal(live.calls.filter(url=>url.endsWith('/status')).length,liveReads,'fresh live samples need no extra status poll');
 vm.runInContext('lastPrinterReceivedAt=Date.now()-11000',live.context);
 await live.refresh();assert.equal(live.calls.filter(url=>url.endsWith('/status')).length,liveReads+1,'expired live samples resume status reads');
 live.setMachine(new Error('backend unreachable'));
 await assert.rejects(live.context.AD4Printer.api('/current-job'));
 assert.equal(live.el('ad4-send-print').disabled,true,'a failed live read must immediately disable hardware actions');
 assert.match(live.el('ad4-machine').textContent,/unavailable/i);
 const preview=controller({machine_status:'READY'},{running:false,encoding:false});
 preview.context.__AD4_STATIC_PREVIEW__=true;
 await preview.context.AD4Printer.loadVisibleData();
 await assert.rejects(preview.context.AD4Printer.api('/status'));
 assert.equal(preview.calls.length,0,'public preview navigation cannot request printer endpoints');
 idle.el('ad4-open-manager').click();
 assert.equal(idle.el('ad4-upload').disabled,true);
 await idle.context.AD4Printer.upload(false);
 assert.match(idle.el('ad4-manager-status').textContent,/Slice a model/,'shared action runs after opening, despite disabled DOM button');
 console.log('Manager action/state regression checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
