import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

function memoryStorage(seed={}){
  const map=new Map(Object.entries(seed));
  return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),clear:()=>map.clear()};
}

function makeElement(){
  return {style:{},dataset:{},children:[],innerHTML:'',value:'',checked:false,listeners:new Map(),append(...items){this.children.push(...items)},appendChild(item){this.children.push(item);return item},addEventListener(type,fn){this.listeners.set(type,fn)},removeEventListener(type){this.listeners.delete(type)},querySelector(){return null},querySelectorAll(){return []},closest(){return null},setAttribute(){},removeAttribute(){},getAttribute(){return null},hasAttribute(){return false},getBoundingClientRect(){return {width:390,height:844,top:0,left:0,right:390,bottom:844}},focus(){},blur(){},remove(){}};
}

function plain(value){return JSON.parse(JSON.stringify(value))}
function mustFunction(value,name){if(typeof value!=="function")throw new Error(`JUGEST runtime missing ${name}`);return value}
function validTargetDate(value){const text=String(value??'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError('targetDate must be YYYY-MM-DD');return text}

async function bootRuntime(rootDir){
  const root=path.resolve(rootDir);
  const listeners=new Map(),intervals=new Map(),classes=new Map();
  let intervalId=0;
  const localStorage=memoryStorage();
  const location={protocol:'data:',href:'data:text/html,jugest-vps-runtime',origin:'null',search:'',reload(){}};
  const document={hidden:false,visibilityState:'visible',createElement:()=>makeElement(),getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],body:makeElement(),documentElement:makeElement(),addEventListener(type,fn){listeners.set(`document:${type}`,fn)},removeEventListener(type){listeners.delete(`document:${type}`)}};
  const ctx={
    console,URL,URLSearchParams,Blob,Response,Request,Headers,AbortController,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,crypto:webcrypto,structuredClone,atob,btoa,
    CompressionStream:globalThis.CompressionStream,DecompressionStream:globalThis.DecompressionStream,ReadableStream:globalThis.ReadableStream,TransformStream:globalThis.TransformStream,
    localStorage,location,document,navigator:{onLine:false,storage:{estimate:async()=>({usage:0,quota:0})}},performance:globalThis.performance,
    setTimeout:(fn,ms=0,...args)=>globalThis.setTimeout(fn,ms,...args),clearTimeout:id=>globalThis.clearTimeout(id),
    setInterval(fn,ms=0){intervals.set(++intervalId,{fn,ms});return intervalId},clearInterval(id){intervals.delete(id)},
    requestAnimationFrame:fn=>globalThis.setTimeout(()=>fn(Date.now()),0),cancelAnimationFrame:id=>globalThis.clearTimeout(id),queueMicrotask,
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
    history:{pushState(){},replaceState(){}},alert(){},confirm:()=>true,prompt:()=>null,fetch:async()=>{throw new Error('Unexpected network access from VPS analysis runtime')},
    HTMLElement:class {constructor(){this.isConnected=true}attachShadow(){this.shadowRoot=makeElement();return this.shadowRoot}},customElements:{get:key=>classes.get(key),define:(key,value)=>classes.set(key,value)}
  };
  ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);

  for(const name of ['hanahana-judge.js','missing-inference.js','core-v510.js']){
    vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx,{filename:name});
  }
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    const source=match[1];
    if(source.trim())vm.runInContext(source,ctx,{filename:'index-inline.js'});
  }
  for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
  const bridge=ctx.JUGEST_CORE_BRIDGE;
  if(!bridge||typeof bridge!=='object')throw new Error('JUGEST core bridge did not boot');
  return {ctx,bridge};
}

function validateImportArgs({rootDir,shop,sourceStoreId,days}){
  const name=String(shop??'').trim();
  const storeId=String(sourceStoreId??name).trim();
  if(!rootDir)throw new TypeError('rootDir is required');
  if(!name)throw new TypeError('shop is required');
  if(!storeId)throw new TypeError('sourceStoreId is required');
  if(!Array.isArray(days)||!days.length)throw new TypeError('days are required');
  if(days.length>400)throw new RangeError('headless import supports at most 400 days');
  return {name,storeId};
}

async function bootImportedRuntime({rootDir,shop,sourceStoreId,days}){
  const {name,storeId}=validateImportArgs({rootDir,shop,sourceStoreId,days});
  const {bridge}=await bootRuntime(rootDir);
  const previewExternalJson=mustFunction(bridge.previewExternalJson,'previewExternalJson');
  const saveExternalJsonPreview=mustFunction(bridge.saveExternalJsonPreview,'saveExternalJsonPreview');
  const payload={
    format:'juggler-external-import-bulk',version:7,source:'ana-slo',sourceStoreId:storeId,shop:name,
    requestedDays:days.length,capturedAt:new Date().toISOString(),days:plain(days)
  };
  const checked=await previewExternalJson(JSON.stringify(payload));
  if(!checked?.preview)throw new Error('JUGEST runtime rejected canonical store payload');
  await saveExternalJsonPreview(checked.preview);
  return {bridge,name,storeId};
}

export async function runExistingStoreAnalysis({rootDir,shop,sourceStoreId,days,options={}}={}){
  const {bridge,name}=await bootImportedRuntime({rootDir,shop,sourceStoreId,days});
  const runStoreAnalysis=mustFunction(bridge.runStoreAnalysis,'runStoreAnalysis');
  const result=await runStoreAnalysis(name,options);
  if(!result||result.error)throw new Error(result?.error||'JUGEST store analysis returned no result');
  return plain(result);
}

export async function runExistingStorePlan({rootDir,shop,sourceStoreId,days,targetDate}={}){
  const target=validTargetDate(targetDate);
  if(!Array.isArray(days))throw new TypeError('days are required');
  const history=days.filter(day=>day&&String(day.date||'')<target).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!history.length)throw new TypeError('history before targetDate is required');
  const sourceFrontierDate=String(history.at(-1)?.date||'');
  const {bridge,name}=await bootImportedRuntime({rootDir,shop,sourceStoreId,days:history});
  const getTodayPlan=mustFunction(bridge.getTodayPlan,'getTodayPlan');
  const result=await getTodayPlan(name,target,{});
  if(!result||result.error)throw new Error(result?.error||'JUGEST current store plan returned no result');
  const candidates=Array.isArray(result.candidates)?result.candidates:[];
  const rankings=candidates.map((row,index)=>{
    const tableNo=String(row?.tableNo??'').trim();
    if(!tableNo)return null;
    const rank=index+1,aimScore=Number(row?.aimScore);
    return Object.freeze({machineKey:tableNo,tableNo,machineName:String(row?.machineName||row?.machine||'unknown'),rank,score:Number.isFinite(aimScore)?aimScore:-rank});
  }).filter(Boolean);
  return Object.freeze({shop:name,targetDate:target,sourceFrontierDate,available:result.available!==false&&rankings.length>0,rankings:Object.freeze(rankings)});
}

export const __test={validTargetDate,bootImportedRuntime};
