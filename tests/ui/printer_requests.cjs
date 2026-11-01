const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const document=new EventTarget();document.hidden=false;
let clock=1000,calls=[],replies=[];
const context={document,DOMException,AbortController,setTimeout,clearTimeout,
 Date:{now:()=>clock},fetch:(url,options)=>{
  calls.push({url,options});
  return new Promise((resolve,reject)=>{
   replies.push(value=>resolve({ok:true,headers:{get:()=> 'application/json'},json:async()=>value}));
   options.signal?.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});
  });
 }};
context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('overlays/mosaic/public/ad4-requests.js','utf8'),context);
const api=context.AD4Requests;
(async()=>{
 const reads=Array.from({length:50},()=>api.request('./api/printer/status'));
 assert.equal(calls.length,1,'50 readers must share one HTTP request');
 replies.shift()({machine_status:'READY'});
 await Promise.all(reads);
 await api.request('./api/printer/status');assert.equal(calls.length,1,'reuse a recent status');
 clock+=2000;
 const forced=api.request('./api/printer/status',{force:true});
 assert.equal(calls.length,2);assert.equal(calls[1].options.headers['X-AD4-Refresh'],'1');
 replies.shift()({machine_status:'IDLE'});await forced;
 const a=new AbortController(),b=new AbortController();
 const cancelled=api.request('./api/printer/current-job',{signal:a.signal});
 const remaining=api.request('./api/printer/current-job',{signal:b.signal});
 const underlying=calls.at(-1).options.signal;
 a.abort();await assert.rejects(cancelled,{name:'AbortError'});
 assert.equal(underlying.aborted,false,'one viewer cannot abort another reader');
 replies.shift()({active:true});assert.equal((await remaining).active,true);
 const hidden=api.request('./api/printer/diagnostics?kind=info');
 document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
 await assert.rejects(hidden,{name:'AbortError'});
 replies.shift();document.hidden=false;
 const post=api.request('./api/printer/actions',{method:'POST',body:'{}'});
 replies.shift()({detail:'ok'});await post;
 const refreshed=api.request('./api/printer/status');
 replies.shift()({machine_status:'READY'});await refreshed;
 assert.equal(calls.filter(c=>c.options.method==='POST').length,1,'mutations are never replayed');
 console.log('Shared reads, TTL, explicit refresh, independent cancellation and mutation invalidation passed');
})().catch(error=>{console.error(error);process.exitCode=1});
