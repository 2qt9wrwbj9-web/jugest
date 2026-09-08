import {availableParallelism,totalmem} from 'node:os';
import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {bootJugestResearchRuntime} from './jugest-headless.mjs';
import {buildHistoricalSampleBundle} from './historical-builder.mjs';

const MB=1048576;
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const deepFreeze=value=>{
 if(value===null||typeof value!=='object'||Object.isFrozen(value))return value;
 for(const key of Reflect.ownKeys(value))deepFreeze(value[key]);
 return Object.freeze(value);
};
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function positiveInt(value,name){if(!Number.isInteger(value)||value<1)throw new TypeError(`${name} must be a positive integer`);return value}
function positiveNumber(value,name){if(typeof value!=='number'||!Number.isFinite(value)||value<=0)throw new TypeError(`${name} must be a positive finite number`);return value}

export function planParallelism({requested='auto',cpuCount=availableParallelism(),rowCount=0,targetCount=1,memoryBudgetMB=1024,maxWorkers=3}={}){
 positiveInt(cpuCount,'cpuCount');
 if(!Number.isInteger(rowCount)||rowCount<0)throw new TypeError('rowCount must be a non-negative integer');
 if(!Number.isInteger(targetCount)||targetCount<0)throw new TypeError('targetCount must be a non-negative integer');
 positiveNumber(memoryBudgetMB,'memoryBudgetMB');positiveInt(maxWorkers,'maxWorkers');
 let requestedCount=null;
 if(requested!=='auto'){
  const n=typeof requested==='string'?Number(requested):requested;
  requestedCount=positiveInt(n,'requested workers');
 }
 const cpuCap=Math.max(1,Math.min(maxWorkers,Math.max(1,cpuCount-1)));
 // Measured research-runtime heap is around 200 MiB even for modest stores; reserve extra headroom as history grows.
 const estimatedWorkerMB=200+rowCount*.0027;
 const memoryCap=Math.max(1,Math.floor(memoryBudgetMB/estimatedWorkerMB));
 const targetCap=Math.max(1,targetCount||1);
 let workers=Math.min(cpuCap,memoryCap,targetCap,requestedCount??Infinity);
 if(requestedCount===null){
  // Worker boot has real cost. Avoid spawning more workers than roughly one per eight targets on short replays.
  const autoWorkCap=Math.max(1,Math.ceil(targetCount/8));
  workers=Math.min(workers,autoWorkCap);
 }
 return deepFreeze({workers:Math.max(1,workers),cpuCap,memoryCap,targetCap,estimatedWorkerMB,memoryBudgetMB,maxWorkers,requested:requestedCount??'auto'});
}

export function partitionTargetIndices(indices,workers,{costs=null}={}){
 if(!Array.isArray(indices))throw new TypeError('indices must be an array');positiveInt(workers,'workers');
 if(indices.some((value,index)=>!Number.isInteger(value)||(index>0&&value<=indices[index-1])))throw new TypeError('indices must be strictly increasing integers');
 if(indices.length===0)return deepFreeze([]);
 const count=Math.min(workers,indices.length);
 if(costs===null){
  const base=Math.floor(indices.length/count),extra=indices.length%count,chunks=[];let offset=0;
  for(let i=0;i<count;i+=1){const size=base+(i<extra?1:0);chunks.push(indices.slice(offset,offset+size));offset+=size;}
  return deepFreeze(chunks);
 }
 if(!Array.isArray(costs)||costs.length!==indices.length||costs.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<=0))throw new TypeError('costs must contain one positive finite value per index');
 const n=indices.length,prefix=[0];for(const value of costs)prefix.push(prefix.at(-1)+value);
 const dp=Array.from({length:count+1},()=>Array(n+1).fill(Infinity)),cut=Array.from({length:count+1},()=>Array(n+1).fill(-1));dp[0][0]=0;
 for(let parts=1;parts<=count;parts++)for(let i=parts;i<=n;i++)for(let j=parts-1;j<i;j++){
  const score=Math.max(dp[parts-1][j],prefix[i]-prefix[j]);
  if(score<dp[parts][i]-1e-9||(Math.abs(score-dp[parts][i])<=1e-9&&j>cut[parts][i])){dp[parts][i]=score;cut[parts][i]=j;}
 }
 const bounds=[n];let i=n;for(let parts=count;parts>0;parts--){i=cut[parts][i];bounds.push(i)}bounds.reverse();
 return deepFreeze(Array.from({length:count},(_,part)=>indices.slice(bounds[part],bounds[part+1])));
}

function orderedStoreDays(days,store){
 if(!Array.isArray(days))throw new TypeError('days must be an array');
 if(typeof store!=='string'||store.trim()==='')throw new TypeError('store must be a non-empty string');
 const selected=days.filter(day=>isRecord(day)&&day.shop===store).map(day=>structuredClone(day)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 if(selected.length===0)throw new TypeError(`store ${store} has no history days`);
 const seen=new Set();
 for(let i=0;i<selected.length;i+=1){
  const day=selected[i];
  if(!validDate(day.date))throw new TypeError(`day ${i} date must be a valid YYYY-MM-DD date`);
  if(!Array.isArray(day.machines))throw new TypeError(`day ${day.date} machines must be an array`);
  if(seen.has(day.date))throw new TypeError(`duplicate store date: ${day.date}`);seen.add(day.date);
 }
 return selected;
}
function defaultMemoryBudgetMB(){
 // Research runner only: default to a <=1 GiB pool and leave most machine memory to the OS/JUGEST shell.
 const totalMB=totalmem()/MB;
 return Math.max(512,Math.min(1024,totalMB*.35));
}
function runWorker(workerData){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./historical-worker.mjs',import.meta.url),{workerData});
  let settled=false;
  worker.once('message',message=>{
   if(settled)return;settled=true;
   const finish=async()=>{
    try{await worker.terminate()}catch{}
    if(message?.ok)return resolve(message);
    const error=new Error(message?.error?.message||'historical worker failed');error.name=message?.error?.name||'Error';error.stack=message?.error?.stack||error.stack;reject(error);
   };
   finish().catch(reject);
  });
  worker.once('error',error=>{if(settled)return;settled=true;reject(error)});
  worker.once('exit',code=>{if(!settled&&code!==0){settled=true;reject(new Error(`historical worker exited with code ${code}`))}});
 });
}
async function runPerTargetQueue({indices,limit,run}){
 const results=new Array(indices.length);let cursor=0;
 const lane=async()=>{
  while(true){
   const position=cursor++;if(position>=indices.length)return;
   results[position]=await run(indices[position],position);
  }
 };
 await Promise.all(Array.from({length:Math.min(limit,indices.length)},()=>lane()));
 return results;
}

export async function buildHistoricalSampleBundleParallel({store,days,startDate=null,endDate=null,minPriorDays=1,workers='auto',memoryBudgetMB=defaultMemoryBudgetMB(),maxWorkers=3,rootDir=process.cwd(),cpuCount=availableParallelism()}={}){
 const started=performance.now();
 if(startDate!==null&&!validDate(startDate))throw new TypeError('startDate must be a valid YYYY-MM-DD date');
 if(endDate!==null&&!validDate(endDate))throw new TypeError('endDate must be a valid YYYY-MM-DD date');
 if(startDate&&endDate&&startDate>endDate)throw new RangeError('startDate must not be after endDate');
 positiveInt(minPriorDays,'minPriorDays');
 const selected=orderedStoreDays(days,store),rowCount=selected.reduce((sum,day)=>sum+day.machines.length,0);
 const targetIndices=selected.map((_,index)=>index).filter(index=>(!startDate||selected[index].date>=startDate)&&(!endDate||selected[index].date<=endDate));
 const plan=planParallelism({requested:workers,cpuCount,rowCount,targetCount:targetIndices.length,memoryBudgetMB,maxWorkers});
 if(targetIndices.length<=1){
  const runtime=await bootJugestResearchRuntime({rootDir});
  const bundle=buildHistoricalSampleBundle({store,days:selected,runtime,startDate,endDate,minPriorDays});
  return deepFreeze({...bundle,buildAudit:{...bundle.buildAudit,execution:{mode:'sequential',workers:1,workerLifecycle:'single-target',tasks:targetIndices.length,elapsedMs:performance.now()-started,rowCount,targetCount:targetIndices.length,plan}}});
 }
 const results=await runPerTargetQueue({
  indices:targetIndices,limit:plan.workers,
  run:async index=>{
   const targetDate=selected[index].date;
   const result=await runWorker({store,days:selected.slice(0,index+1),startDate:targetDate,endDate:targetDate,minPriorDays,rootDir});
   return{result,index};
  }
 });
 const samples=[],skipped=[],chunkAudit=[];
 for(const entry of results){
  const {result,index}=entry,targetDate=selected[index].date;
  samples.push(...result.bundle.samples);skipped.push(...result.bundle.buildAudit.skipped);
  chunkAudit.push({startDate:targetDate,endDate:targetDate,targetCount:1,builtSamples:result.bundle.samples.length,skipped:result.bundle.buildAudit.skipped.length,...result.metrics});
 }
 samples.sort((a,b)=>a.targetDate.localeCompare(b.targetDate));skipped.sort((a,b)=>String(a.targetDate).localeCompare(String(b.targetDate))||String(a.reason).localeCompare(String(b.reason)));
 return deepFreeze({
  schema:'jugest-axis-samples-v1',store,
  source:{kind:'current-jugest-v4PredictStore',pointInTime:true,outcomeProxy:'external expectedSetting/p4'},
  range:{startDate:startDate??selected[0].date,endDate:endDate??selected.at(-1).date,availableDays:selected.length},
  samples,
  buildAudit:{builtSamples:samples.length,skipped,execution:{mode:'parallel',workers:plan.workers,workerLifecycle:'per-target',tasks:targetIndices.length,elapsedMs:performance.now()-started,rowCount,targetCount:targetIndices.length,plan,chunks:chunkAudit}}
 });
}
