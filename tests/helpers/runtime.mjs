import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
export function memoryStorage(seed={}){
 const map=new Map(Object.entries(seed));return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
export function makeElement(){return {style:{},dataset:{},children:[],innerHTML:'',listeners:new Map(),append(...x){this.children.push(...x)},addEventListener(k,f){this.listeners.set(k,f)},removeEventListener(k){this.listeners.delete(k)},querySelector(){return null},querySelectorAll(){return []},setAttribute(){},getBoundingClientRect(){return {width:390}}};}
export async function boot({storage=memoryStorage(),fetch=async()=>{throw Error('Unexpected network')},sync=null,loadApp=true}={}){
 const listeners=new Map(),timers=new Map(),classes=new Map();let timerId=0;
 storage.idb ||= new Map();
 const indexedDB={open(){const q={};setImmediate(()=>{q.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={};tx.objectStore=()=>({get(key){const req={};setImmediate(()=>{req.result=storage.idb.get(key);req.onsuccess?.();tx.oncomplete?.()});return req},put(value,key){setImmediate(()=>{if(storage.failIdbWrite){tx.error=Error("IDB write failed");tx.onerror?.();return}storage.idb.set(key,structuredClone(value));tx.oncomplete?.()})},delete(key){setImmediate(()=>{storage.idb.delete(key);tx.oncomplete?.()})}});return tx}};q.onsuccess?.()});return q}};
 const ctx={indexedDB,console,URL,Blob,Response,Request,AbortController,TextEncoder,TextDecoder,Uint8Array,crypto:webcrypto,structuredClone,atob,btoa,
 localStorage:storage,navigator:{onLine:true},location:{href:'http://localhost/',origin:'http://localhost',search:'',reload(){ctx.reloads++}},reloads:0,
 document:{hidden:false,visibilityState:'visible',createElement:makeElement,getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],body:makeElement(),addEventListener(k,f){listeners.set('document:'+k,f)},removeEventListener(k){listeners.delete('document:'+k)}},
 setTimeout(fn,ms=0){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)},setInterval(fn,ms){timers.set(++timerId,{fn,ms,interval:true});return timerId},clearInterval(id){timers.delete(id)},requestAnimationFrame:fn=>fn(),
 addEventListener(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f)},removeEventListener(k,f){listeners.get(k)?.delete(f)},
 history:{pushState(){},replaceState(){}},confirm:()=>true,fetch,
 HTMLElement:class {constructor(){this.isConnected=true}attachShadow(){this.shadowRoot=makeElement()}},customElements:{get:k=>classes.get(k),define:(k,v)=>classes.set(k,v)}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
 for(const f of ['hanahana-judge.js','missing-inference.js','core-v510.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f});
 const html=fs.readFileSync('index.html','utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())vm.runInContext(m[1],ctx,{filename:'index-inline.js'});
 if(sync)ctx.JUGESTDeviceSync=sync;else vm.runInContext(fs.readFileSync('sync-core.js','utf8'),ctx,{filename:'sync-core.js'});
 for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
 let app=null;if(loadApp){vm.runInContext(fs.readFileSync('app-v510.js','utf8'),ctx,{filename:'app-v510.js'});app=new (classes.get('jugest-app'))();}
 return {ctx,app,bridge:ctx.JUGEST_CORE_BRIDGE,storage,listeners,timers,emit(type){for(const f of listeners.get(type)||[])f({type})},async tick(ms){for(const [id,t] of [...timers])if(t.ms===ms){if(!t.interval)timers.delete(id);await t.fn()}await new Promise(r=>setImmediate(r))}};
}
export const plain=x=>JSON.parse(JSON.stringify(x));
export function button(attribute,value=''){return {dataset:{},hasAttribute:k=>k===attribute,getAttribute:k=>k===attribute?value:null,closest(selector){return selector.includes(`[${attribute}`)?this:null}};}
