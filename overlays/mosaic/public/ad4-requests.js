/* Shared read transport. One request per URL; mutations are never retried. */
(() => {
 "use strict";
 const cache=new Map(),pending=new Map();let epoch=0;
 const ttl=url=>/\/status$/.test(url)?1500:/\/current-job$/.test(url)?750:
  /\/(?:session|profiles|timelapses|files)(?:\?|$)/.test(url)?30000:
  /\/timelapse$/.test(url)?2000:/\/tools\/telemetry$/.test(url)?3000:0;
 const abortError=()=>new DOMException("Read cancelled","AbortError");
 function invalidate(){epoch++;cache.clear();for(const item of pending.values())item.controller.abort();pending.clear()}
 function join(item,signal){
  if(signal?.aborted)return Promise.reject(abortError());
  item.users++;
  return new Promise((resolve,reject)=>{
   let done=false;
   const finish=(fn,value)=>{if(done)return;done=true;signal?.removeEventListener("abort",cancel);item.users--;fn(value)};
   const cancel=()=>{finish(reject,abortError());if(!item.users)item.controller.abort()};
   signal?.addEventListener("abort",cancel,{once:true});
   item.promise.then(value=>finish(resolve,value),error=>finish(reject,error));
  });
 }
 async function request(url,options={}){
  const {force=false,...fetchOptions}=options,method=(options.method||"GET").toUpperCase();
  const read=method==="GET",key=String(url),entry=cache.get(key),lifetime=ttl(key);
  if(read&&options.signal?.aborted)throw abortError();
  if(read&&!force&&entry&&Date.now()-entry.at<lifetime)return entry.value;
  if(read&&pending.has(key))return join(pending.get(key),options.signal);
  const mutates=!read&&!/\/tools\/(?:inspect|convert)(?:\?|$)/.test(key);
  if(mutates)invalidate();
  const controller=new AbortController(),generation=epoch;
  const item={controller,users:0,promise:null};
  const timer=read?setTimeout(()=>controller.abort(),15000):null;
  item.promise=(async()=>{
   try{
    const response=await fetch(url,{cache:"no-store",credentials:"same-origin",...fetchOptions,
      headers:{...fetchOptions.headers,...(read&&force?{"X-AD4-Refresh":"1"}:{})},
      signal:read?controller.signal:options.signal});
    const type=response.headers.get("Content-Type")||"";
    const value=type.includes("json")?await response.json():await response.blob();
    if(read&&(generation!==epoch||controller.signal.aborted))throw abortError();
    if(!response.ok){const error=Error(value?.error||"Printer service HTTP "+response.status);error.status=response.status;throw error}
    if(read&&generation===epoch&&lifetime){
     if(cache.size>=32)cache.delete(cache.keys().next().value);
     cache.set(key,{at:Date.now(),value});
    }
    return value;
   }finally{
    if(timer!==null)clearTimeout(timer);
    if(pending.get(key)===item)pending.delete(key);
    if(mutates)invalidate();
   }
  })();
  if(read){pending.set(key,item);return join(item,options.signal)}
  return item.promise;
 }
 document.addEventListener("visibilitychange",()=>{if(document.hidden)invalidate()});
 globalThis.AD4Requests={request,invalidate};
})();
