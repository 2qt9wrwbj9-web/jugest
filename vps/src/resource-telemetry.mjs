import os from 'node:os';
import {readMemorySnapshot} from './memory.mjs';
import {DEFAULT_RESOURCE_POLICY} from './config.mjs';

const MIB=1024*1024;
const INGEST_HISTORY_LIMIT=50;
const PENDING_JOB_LIMIT=20;
const DEFAULT_HISTORY_LIMIT=20;
const MAX_HISTORY_LIMIT=50;
const toBytes=value=>Number.isFinite(value)?Math.max(0,Math.round(value)):0;
const mibToBytes=value=>toBytes(Number(value)*MIB);
const ingestState={running:0,recent:[]};

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

export async function measureIngest(operation,{storeId='',date='',memoryUsage=()=>process.memoryUsage(),clock=()=>new Date()}={}){
  if(typeof operation!=='function')throw new TypeError('operation must be a function');
  const startedAt=clock().toISOString(),start=memoryUsage();ingestState.running+=1;
  let success=false,errorClass=null;
  try{const result=await operation();success=true;return result}
  catch(error){errorClass=String(error?.code||error?.name||'ingest_error');throw error}
  finally{
    const endedAt=clock().toISOString(),end=memoryUsage();ingestState.running=Math.max(0,ingestState.running-1);
    try{
      ingestState.recent.unshift(Object.freeze({storeId:String(storeId||''),date:String(date||''),startedAt,endedAt,durationMs:durationMs(startedAt,endedAt),startRssBytes:toBytes(start?.rss),endRssBytes:toBytes(end?.rss),rssDeltaBytes:toBytes(end?.rss)-toBytes(start?.rss),startHeapUsedBytes:toBytes(start?.heapUsed),endHeapUsedBytes:toBytes(end?.heapUsed),heapDeltaBytes:toBytes(end?.heapUsed)-toBytes(start?.heapUsed),success,errorClass}));
      if(ingestState.recent.length>INGEST_HISTORY_LIMIT)ingestState.recent.length=INGEST_HISTORY_LIMIT;
    }catch{}
  }
}

export function readIngestTelemetry(){return Object.freeze({running:ingestState.running,recent:[...ingestState.recent]})}
function emptyQueueByState(){return {queued:0,retryWait:0,leased:0,running:0,succeeded:0,failed:0,cancelled:0}}
function incrementQueueState(target,state,n){if(state==='retry_wait')target.retryWait+=n;else if(Object.hasOwn(target,state))target[state]+=n}

export function readRuntimeTelemetry(db,{historyLimit=DEFAULT_HISTORY_LIMIT}={}){
  const limit=Math.min(MAX_HISTORY_LIMIT,Math.max(1,Math.trunc(Number(historyLimit)||DEFAULT_HISTORY_LIMIT))),counts={queued:0,running:0,succeeded:0,failed:0},queueByState=emptyQueueByState();
  for(const row of db.prepare('SELECT state,COUNT(*) AS n FROM jobs GROUP BY state').all()){
    const n=Number(row.n)||0;incrementQueueState(queueByState,row.state,n);
    if(row.state==='queued'||row.state==='retry_wait'||row.state==='leased')counts.queued+=n;else if(row.state==='running')counts.running+=n;else if(row.state==='succeeded')counts.succeeded+=n;else if(row.state==='failed'||row.state==='cancelled')counts.failed+=n;
  }
  const pendingJobs=db.prepare(`SELECT id,type,priority,payload_json,state,estimated_lease_mib,available_at,heartbeat_at,last_error_class,last_error_message,created_at,updated_at FROM jobs WHERE state IN ('queued','retry_wait','leased','running') ORDER BY priority ASC,id ASC LIMIT ?`).all(PENDING_JOB_LIMIT).map(row=>{const payload=safeJson(row.payload_json,{});return {jobId:row.id,type:row.type,priority:row.priority,state:row.state,storeId:String(payload.storeId||payload.store_id||''),estimatedLeaseMiB:Number(row.estimated_lease_mib)||0,availableAt:row.available_at??null,heartbeatAt:row.heartbeat_at??null,lastErrorClass:row.last_error_class??null,lastErrorMessage:row.last_error_message??null,createdAt:row.created_at,updatedAt:row.updated_at}});
  const recentRuns=db.prepare(`SELECT r.id,r.job_id,r.attempt,r.started_at,r.ended_at,r.peak_rss_mib,r.error_class,j.type,j.payload_json FROM job_runs r JOIN jobs j ON j.id=r.job_id ORDER BY r.id DESC LIMIT ?`).all(limit).map(row=>{const payload=safeJson(row.payload_json,{});return {runId:row.id,jobId:row.job_id,attempt:row.attempt,type:row.type,storeId:String(payload.storeId||payload.store_id||''),startedAt:row.started_at,endedAt:row.ended_at,durationMs:durationMs(row.started_at,row.ended_at),observedPeakRssBytes:row.peak_rss_mib==null?null:mibToBytes(row.peak_rss_mib),success:row.ended_at?row.error_class==null:null,errorClass:row.error_class??null}});
  const taskHistory=db.prepare(`SELECT m.id,m.job_id,m.store_id,s.name AS store_name,m.phase,m.task_kind,m.task_version,m.model_fingerprint,m.store_machine_count,m.store_size_bucket,m.day_count,m.row_count,m.workload_units,m.started_at,m.ended_at,m.duration_ms,m.start_rss_mib,m.end_rss_mib,m.peak_rss_mib,m.cpu_ms,m.status,m.error_class,m.details_json FROM analysis_task_metrics m LEFT JOIN stores s ON s.id=m.store_id ORDER BY m.id DESC LIMIT ?`).all(limit).map(row=>Object.freeze({
    metricId:Number(row.id),jobId:row.job_id==null?null:Number(row.job_id),storeId:String(row.store_id||''),storeName:String(row.store_name||row.store_id||''),phase:Number(row.phase)||0,taskKind:String(row.task_kind||''),taskVersion:String(row.task_version||''),modelFingerprint:row.model_fingerprint??null,storeMachineCount:Number(row.store_machine_count)||0,storeSizeBucket:String(row.store_size_bucket||''),dayCount:Number(row.day_count)||0,rowCount:Number(row.row_count)||0,workloadUnits:Number(row.workload_units)||0,startedAt:row.started_at,endedAt:row.ended_at,durationMs:Number(row.duration_ms)||0,startRssBytes:row.start_rss_mib==null?null:mibToBytes(row.start_rss_mib),endRssBytes:row.end_rss_mib==null?null:mibToBytes(row.end_rss_mib),peakRssBytes:row.peak_rss_mib==null?null:mibToBytes(row.peak_rss_mib),cpuMs:row.cpu_ms==null?null:Number(row.cpu_ms),status:String(row.status||''),errorClass:row.error_class??null,details:safeJson(row.details_json,{})
  }));
  const latest=db.prepare(`SELECT captured_at,effective_available_mib,used_ratio,swap_used_mib,running_children,queue_depth,decision_json FROM resource_samples ORDER BY id DESC LIMIT 1`).get();
  const memoryProfiles=db.prepare('SELECT job_type,size_class,ewma_peak_mib,samples,updated_at FROM memory_profiles ORDER BY updated_at DESC').all().map(row=>({jobType:row.job_type,sizeClass:row.size_class,ewmaPeakRssBytes:mibToBytes(row.ewma_peak_mib),samples:Number(row.samples)||0,updatedAt:row.updated_at}));
  return Object.freeze({queue:Object.freeze(counts),queueByState:Object.freeze(queueByState),pendingJobs,recentRuns,taskHistory,latestSchedulerSample:latest?{capturedAt:latest.captured_at,effectiveAvailableBytes:mibToBytes(latest.effective_available_mib),usedRatio:Number(latest.used_ratio)||0,swapUsedBytes:mibToBytes(latest.swap_used_mib),runningChildren:Number(latest.running_children)||0,queueDepth:Number(latest.queue_depth)||0,decision:safeJson(latest.decision_json,{})}:null,memoryProfiles});
}

function schedulerHealth(runtime,atIso){
  const nowMs=Date.parse(atIso||''),latest=runtime.latestSchedulerSample,by=runtime.queueByState||emptyQueueByState();
  const sampleMs=latest?Date.parse(latest.capturedAt||''):NaN,sampleAgeMs=Number.isFinite(nowMs)&&Number.isFinite(sampleMs)?Math.max(0,nowMs-sampleMs):null;
  const retryReady=(runtime.pendingJobs||[]).some(job=>job.state==='retry_wait'&&(!job.availableAt||!Number.isFinite(Date.parse(job.availableAt))||Date.parse(job.availableAt)<=nowMs));
  const readyWork=by.queued>0||by.leased>0||by.running>0||retryReady,pressure=String(latest?.decision?.pressure||''),staleAfterMs=Math.max(10000,Number(DEFAULT_RESOURCE_POLICY.sampleIntervalMs||2000)*5);
  let code='idle';
  if(by.running>0)code='running';else if(by.leased>0)code='leased_not_running';else if(!latest&&readyWork)code='no_scheduler_sample';else if(sampleAgeMs!==null&&sampleAgeMs>staleAfterMs&&readyWork)code='scheduler_stale';else if(pressure==='EMERGENCY')code='memory_emergency';else if(pressure==='PAUSE')code='memory_pause';else if(by.queued>0||retryReady)code='ready_not_running';else if(by.retryWait>0)code='retry_wait';
  return Object.freeze({code,sampleAgeMs,staleAfterMs,readyWork,pressure:pressure||null});
}

export async function buildResourceStatus(db,options={}){const snapshot=await captureResourceSnapshot(options),runtime=readRuntimeTelemetry(db,options);return Object.freeze({...snapshot,analysis:Object.freeze({...runtime,schedulerHealth:schedulerHealth(runtime,snapshot.timestamp)}),ingest:readIngestTelemetry()})}
export const __test={mibToBytes,processSnapshot,durationMs,ingestState,schedulerHealth,DEFAULT_HISTORY_LIMIT,MAX_HISTORY_LIMIT};
