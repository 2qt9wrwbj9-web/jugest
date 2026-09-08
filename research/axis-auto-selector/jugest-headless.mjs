import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

function memoryStorage(seed={}){
 const map=new Map(Object.entries(seed));
 return{map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),idb:new Map()};
}
function makeElement(){
 return{style:{},dataset:{},children:[],innerHTML:'',listeners:new Map(),append(...x){this.children.push(...x)},addEventListener(k,f){this.listeners.set(k,f)},removeEventListener(k){this.listeners.delete(k)},querySelector(){return null},querySelectorAll(){return[]},setAttribute(){},getBoundingClientRect(){return{width:390}}};
}
function read(root,file){return fs.readFileSync(path.join(root,file),'utf8')}

export async function bootJugestResearchRuntime({rootDir=process.cwd()}={}){
 const storage=memoryStorage(),listeners=new Map(),timers=new Map(),classes=new Map();let timerId=0;
 const indexedDB={open(){
  const request={};setImmediate(()=>{
   request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){
    const tx={};tx.objectStore=()=>({
     get(key){const req={};setImmediate(()=>{req.result=storage.idb.get(key);req.onsuccess?.();tx.oncomplete?.()});return req},
     put(value,key){setImmediate(()=>{storage.idb.set(key,structuredClone(value));tx.oncomplete?.()})},
     delete(key){setImmediate(()=>{storage.idb.delete(key);tx.oncomplete?.()})}
    });return tx;
   }};request.onsuccess?.();
  });return request;
 }};
 const ctx={indexedDB,console,URL,Blob,Response,Request,AbortController,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,structuredClone,atob,btoa,
  localStorage:storage,navigator:{onLine:true},location:{href:'http://localhost/',origin:'http://localhost',protocol:'http:',search:'',reload(){}},
  document:{hidden:false,visibilityState:'visible',createElement:makeElement,getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],body:makeElement(),addEventListener(k,f){listeners.set(`document:${k}`,f)},removeEventListener(k){listeners.delete(`document:${k}`)}},
  setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},setInterval(fn,ms){timers.set(++timerId,{fn,ms,interval:true});return timerId},clearInterval(id){timers.delete(id)},requestAnimationFrame:fn=>fn(),
  addEventListener(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},removeEventListener(k,f){listeners.get(k)?.delete(f)},
  history:{pushState(){},replaceState(){}},confirm:()=>true,fetch:async()=>{throw new Error('Unexpected network in research runtime')},
  HTMLElement:class{constructor(){this.isConnected=true}attachShadow(){this.shadowRoot=makeElement()}},customElements:{get:key=>classes.get(key),define:(key,value)=>classes.set(key,value)}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
 for(const file of ['hanahana-judge.js','missing-inference.js','core-v510.js'])vm.runInContext(read(rootDir,file),ctx,{filename:file});
 const html=read(rootDir,'index.html');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())vm.runInContext(match[1],ctx,{filename:'index-inline.js'});
 vm.runInContext(read(rootDir,'sync-core.js'),ctx,{filename:'sync-core.js'});
 for(let i=0;i<12;i+=1)await new Promise(resolve=>setImmediate(resolve));
 if(!ctx.V4_TEST)throw new Error('JUGEST V4_TEST bridge is unavailable');
 const api=ctx.V4_TEST;
 for(const method of ['normalizeDay','ensureExternalJudgedSync','predictStore'])if(typeof api[method]!=='function')throw new Error(`JUGEST V4_TEST.${method} is unavailable`);
 return Object.freeze({
  normalizeDay:day=>api.normalizeDay(day),
  ensureExternalJudgedSync:(days,store)=>api.ensureExternalJudgedSync(days,store),
  predictStore:(store,targetDate,sourceDays,options)=>api.predictStore(store,targetDate,sourceDays,options),
  raw:api
 });
}
