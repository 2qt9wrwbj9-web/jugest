import os from 'node:os';
import {readMemorySnapshot} from './memory.mjs';

const MIB=1024*1024;
const toBytes=value=>Number.isFinite(value)?Math.max(0,Math.round(value)):0;
const mibToBytes=value=>toBytes(Number(value)*MIB);

function processSnapshot(memoryUsage=process.memoryUsage(),now=new Date()){
  return Object.freeze({timestamp:now.toISOString(),pid:process.pid,nodeVersion:process.version,uptimeSeconds:Math.max(0,process.uptime()),rssBytes:toBytes(memoryUsage.rss),heapUsedBytes:toBytes(memoryUsage.heapUsed),heapTotalBytes:toBytes(memoryUsage.heapTotal),externalBytes:toBytes(memoryUsage.external),arrayBuffersBytes:toBytes(memoryUsage.arrayBuffers)});
}

export async function captureResourceSnapshot({memoryReader=readMemorySnapshot,osModule=os,memoryUsage=()=>process.memoryUsage(),clock=()=>new Date()}={}){
  const memory=await memoryReader(),proc=processSnapshot(memoryUsage(),clock());
  const totalBytes=mibToBytes(memory.hostTotalMiB),availableBytes=mibToBytes(memory.hostAvailableMiB);
  return Object.freeze({timestamp:proc.timestamp,system:Object.freeze({totalMemoryBytes:totalBytes,availableMemoryBytes:availableBytes,usedMemoryBytes:Math.max(0,totalBytes-availableBytes),effectiveLimitBytes:mibToBytes(memory.effectiveLimitMiB),effectiveAvailableBytes:mibToBytes(memory.effectiveAvailableMiB),usedRatio:Number.isFinite(memory.usedRatio)?Math.min(1,Math.max(0,memory.usedRatio)):0,swapUsedBytes:mibToBytes(memory.swapUsedMiB),loadAverage:(osModule.loadavg?.()||[0,0,0]).map(value=>Number.isFinite(value)?Math.max(0,value):0),cpuCount:Array.isArray(osModule.cpus?.())?osModule.cpus().length:0,uptimeSeconds:Math.max(0,Number(osModule.uptime?.())||0)}),process:proc});
}

function safeJson(text,fallback={}){try{return JSON.parse(text)}catch{return fallback}}
function durationMs(start,end){const a=Date.parse(start||''),b=Date.parse(end||'');return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,b-a):null}

export function readRuntimeTelemetry(db,{historyLimit=50}={}){
  const limit=Math.min(100,Math.max(1,Math.trunc(Number(historyLimit)||50))),counts={queued:0,running:0,succeeded:0,failed:0};
  for(const row of db.prepare('SELECT state,COUNT(*) AS n FROM jobs GROUP BY state').all()){
    const n=Number(row.n)||0;
    if(row.state==='queued'||row.state==='retry_wait'||row.state==='leased')counts.queued+=n;else if(row.state==='running')counts.running+=n;else if(row.state==='succeeded')counts.succeeded+=n;else if(row.state==='failed'||row.state==='cancelled')counts.failed+=n;
  }
  const recentRuns=db.prepare(`SELECT r.id,r.job_id,r.attempt,r.started_at,r.ended_at,r.peak_rss_mib,r.error_class,j.type,j.payload_json FROM job_runs r JOIN jobs j ON j.id=r.job_id ORDER BY r.id DESC LIMIT ?`).all(limit).map(row=>{const payload=safeJson(row.payload_json,{});return {runId:row.id,jobId:row.job_id,attempt:row.attempt,type:row.type,storeId:String(payload.storeId||payload.store_id||''),startedAt:row.started_at,endedAt:row.ended_at,durationMs:durationMs(row.started_at,row.ended_at),observedPeakRssBytes:row.peak_rss_mib==null?null:mibToBytes(row.peak_rss_mib),success:row.ended_at?row.error_class==null:null,errorClass:row.error_class??null};});
  const latest=db.prepare(`SELECT captured_at,effective_available_mib,used_ratio,swap_used_mib,running_children,queue_depth,decision_json FROM resource_samples ORDER BY id DESC LIMIT 1`).get();
  const memoryProfiles=db.prepare('SELECT job_type,size_class,ewma_peak_mib,samples,updated_at FROM memory_profiles ORDER BY updated_at DESC').all().map(row=>({jobType:row.job_type,sizeClass:row.size_class,ewmaPeakRssBytes:mibToBytes(row.ewma_peak_mib),samples:Number(row.samples)||0,updatedAt:row.updated_at}));
  return Object.freeze({queue:Object.freeze(counts),recentRuns,latestSchedulerSample:latest?{capturedAt:latest.captured_at,effectiveAvailableBytes:mibToBytes(latest.effective_available_mib),usedRatio:Number(latest.used_ratio)||0,swapUsedBytes:mibToBytes(latest.swap_used_mib),runningChildren:Number(latest.running_children)||0,queueDepth:Number(latest.queue_depth)||0,decision:safeJson(latest.decision_json,{})}:null,memoryProfiles});
}

export async function buildResourceStatus(db,options={}){return Object.freeze({...await captureResourceSnapshot(options),analysis:readRuntimeTelemetry(db,options)});}
export const __test={mibToBytes,processSnapshot,durationMs};
