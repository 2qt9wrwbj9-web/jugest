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
  const {ctx,bridge}=await bootRuntime(rootDir);
  const previewExternalJson=mustFunction(bridge.previewExternalJson,'previewExternalJson');
  const saveExternalJsonPreview=mustFunction(bridge.saveExternalJsonPreview,'saveExternalJsonPreview');
  const payload={
    format:'juggler-external-import-bulk',version:7,source:'ana-slo',sourceStoreId:storeId,shop:name,
    requestedDays:days.length,capturedAt:new Date().toISOString(),days:plain(days)
  };
  const checked=await previewExternalJson(JSON.stringify(payload));
  if(!checked?.preview)throw new Error('JUGEST runtime rejected canonical store payload');
  await saveExternalJsonPreview(checked.preview);
  return {ctx,bridge,name,storeId};
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
  const {ctx,name}=await bootImportedRuntime({rootDir,shop,sourceStoreId,days:history});
  const analyzeStore=mustFunction(ctx.V5_TEST?.analyzeStore,'V5_TEST.analyzeStore');
  const result=await analyzeStore(name,target);
  if(!result?.prediction||!Array.isArray(result.prediction.rows))throw new Error('JUGEST current store ranking returned no result');
  const rankings=Array.from(result.prediction.rows,(row,index)=>{
    const tableNo=String(row?.tableNo??'').trim();
    if(!tableNo)return null;
    const rank=index+1,aimScore=Number(row?.aimScore);
    return Object.freeze({machineKey:tableNo,tableNo,machineName:String(row?.machineName||row?.machine||'unknown'),rank,score:Number.isFinite(aimScore)?aimScore:-rank});
  }).filter(Boolean);
  return Object.freeze({shop:name,targetDate:target,sourceFrontierDate,available:rankings.length>0,rankings:Object.freeze(rankings)});
}

function normalizeMachineToken(value){
  return String(value??'').normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s　]+/g,'').replace(/^マイジャグラー/,'マイジャグ').trim();
}
function machineCatalog(bridge){
  const getJudgeState=mustFunction(bridge?.getJudgeState,'getJudgeState');
  const machines=plain(getJudgeState())?.machines;
  if(!Array.isArray(machines)||!machines.length)throw new Error('JUGEST runtime returned no machine catalog');
  return machines.map((machine,index)=>{
    const key=String(machine?.key??'').trim(),name=String(machine?.name??'').trim();
    if(!key||!name)throw new Error(`JUGEST machine catalog row ${index} is invalid`);
    return Object.freeze({key,name,keyToken:normalizeMachineToken(key),nameToken:normalizeMachineToken(name)});
  });
}
function resolveMachine(value,catalog){
  const raw=String(value??'').trim();
  if(!raw)throw new TypeError('machine is required');
  const token=normalizeMachineToken(raw);
  const found=catalog.find(machine=>machine.key===raw||machine.keyToken===token||machine.nameToken===token);
  if(!found)throw new TypeError(`unknown machine: ${raw}`);
  return found;
}

function normalizedMachineInput(row,index,catalog){
  if(!row||typeof row!=='object')throw new TypeError(`machine row ${index} must be an object`);
  const machine=resolveMachine(row.machine??row.machineKey,catalog);
  const games=Number(row.games),bb=Number(row.bb),rb=Number(row.rb);
  if(!Number.isFinite(games)||games<=0)throw new TypeError(`machine row ${index} games must be > 0`);
  if(!Number.isFinite(bb)||bb<0)throw new TypeError(`machine row ${index} bb must be >= 0`);
  if(!Number.isFinite(rb)||rb<0)throw new TypeError(`machine row ${index} rb must be >= 0`);
  if(bb+rb>games)throw new TypeError(`machine row ${index} bonus count exceeds games`);
  const hasDiff=row.diff!==undefined&&row.diff!==null&&row.diff!=='';
  const diff=hasDiff?Number(row.diff):undefined;
  if(hasDiff&&!Number.isFinite(diff))throw new TypeError(`machine row ${index} diff must be finite`);
  return {tableNo:String(row.tableNo??'').trim(),machineKey:machine.key,machineName:machine.name,games,bb,rb,diff,hasDiff};
}

function protectedJudgementRow(externalJudge,input){
  const raw=plain(externalJudge(input.machineKey,input.games,input.bb,input.rb,input.hasDiff?input.diff:undefined));
  const q=Array.isArray(raw?.q)?raw.q.map(Number):null;
  if(!q||q.length!==6||q.some(value=>!Number.isFinite(value)||value<0))throw new Error('JUGEST protected judgement returned invalid posterior q');
  const total=q.reduce((sum,value)=>sum+value,0);
  if(!Number.isFinite(total)||Math.abs(total-1)>1e-6)throw new Error('JUGEST protected judgement posterior q is not normalized');
  const expectedSetting=q.reduce((sum,value,index)=>sum+value*(index+1),0);
  const result={
    ok:true,tableNo:input.tableNo,machineKey:input.machineKey,machineName:input.machineName,
    input:input.hasDiff?{games:input.games,bb:input.bb,rb:input.rb,diff:input.diff}:{games:input.games,bb:input.bb,rb:input.rb},
    q,expectedSetting,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5],method:String(raw?.method??'')
  };
  for(const key of ['estGrape','grape','grapeInterval','warning'])if(raw?.[key]!==undefined)result[key]=raw[key];
  return Object.freeze(result);
}

export async function runExistingMachineJudgementBatch({rootDir,machines}={}){
  if(!rootDir)throw new TypeError('rootDir is required');
  if(!Array.isArray(machines)||machines.length<1)throw new TypeError('machines must contain at least one row');
  if(machines.length>200)throw new RangeError('machine batch supports at most 200 rows');
  const {ctx,bridge}=await bootRuntime(rootDir);
  const externalJudge=mustFunction(ctx.V4_TEST?.externalJudge,'V4_TEST.externalJudge');
  const catalog=machineCatalog(bridge);
  const rows=machines.map((row,index)=>{
    try{return protectedJudgementRow(externalJudge,normalizedMachineInput(row,index,catalog))}
    catch(error){return Object.freeze({ok:false,tableNo:String(row?.tableNo??'').trim(),machineKey:String(row?.machine??row?.machineKey??'').trim(),error:String(error?.message??error)})}
  });
  const accepted=rows.reduce((count,row)=>count+(row.ok?1:0),0);
  return Object.freeze({accepted,rejected:rows.length-accepted,rows:Object.freeze(rows)});
}

export async function runExistingStoreDayJudgement({rootDir,shop,sourceStoreId,days,targetDate}={}){
  const target=validTargetDate(targetDate);
  if(!Array.isArray(days)||!days.some(day=>String(day?.date||'')===target))throw new TypeError('targetDate must exist in days');
  const {bridge,name}=await bootImportedRuntime({rootDir,shop,sourceStoreId,days});
  const getStoreDay=mustFunction(bridge.getStoreDay,'getStoreDay');
  const result=plain(await getStoreDay(name,target));
  if(!result||result.date!==target||!Array.isArray(result.rows))throw new Error('JUGEST protected day judgement returned no exact target day');
  const rows=result.rows.map((row,index)=>{
    const tableNo=String(row?.tableNo??'').trim();
    if(!tableNo)throw new Error(`JUGEST protected day judgement row ${index} is missing tableNo`);
    const q=Array.isArray(row?.q)?row.q.map(Number):null;
    if(!q||!q.length||q.some(value=>!Number.isFinite(value)))throw new Error(`JUGEST protected day judgement row ${tableNo} is missing posterior q`);
    const expectedSetting=Number(row?.expectedSetting);
    if(!Number.isFinite(expectedSetting))throw new Error(`JUGEST protected day judgement row ${tableNo} is missing expectedSetting`);
    return Object.freeze({...row,tableNo,q:Object.freeze(q),expectedSetting});
  });
  return Object.freeze({shop:name,date:target,rows:Object.freeze(rows)});
}

export const __test={validTargetDate,bootImportedRuntime,normalizeMachineToken,resolveMachine};
