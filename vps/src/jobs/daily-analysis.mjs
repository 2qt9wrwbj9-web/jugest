import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {executeDailyAnalysis} from '../analysis/daily-analysis.mjs';

const MIB=1024*1024;
const DEFAULT_DB='/var/lib/jugest/jugest.sqlite';
const DEFAULT_ROOT=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)));
let peakRssMiB=process.memoryUsage().rss/MIB;
let startedAt=null;
let startRssMiB=null;
let cpuStart=null;
let taskMeta=null;

function maxResourceRssMiB(){
  const value=Number(process.resourceUsage?.().maxRSS);
  return Number.isFinite(value)&&value>=0?value/1024:0;
}

function sample(){
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());
  process.send?.({type:'heartbeat',rssMiB:peakRssMiB});
}

function startMeasurement(storeId){
  startedAt=new Date().toISOString();
  startRssMiB=process.memoryUsage().rss/MIB;
  cpuStart=process.cpuUsage();
  peakRssMiB=Math.max(peakRssMiB,startRssMiB,maxResourceRssMiB());
  taskMeta={
    phase:1,
    taskKind:'daily_analysis',
    taskVersion:'vps-runtime-v1',
    modelFingerprint:null,
    storeId:String(storeId||''),
    storeMachineCount:0,
    dayCount:0,
    rowCount:0,
    workloadUnits:0,
    startedAt,
    startRssMiB,
    details:{machineCountMethod:'unknown'}
  };
}

function announceWorkload(workload={}){
  taskMeta={...taskMeta,
    storeId:String(workload.storeId||taskMeta?.storeId||''),
    storeMachineCount:Number(workload.storeMachineCount)||0,
    dayCount:Number(workload.dayCount)||0,
    rowCount:Number(workload.rowCount)||0,
    workloadUnits:Number(workload.rowCount)||0,
    details:{machineCountMethod:String(workload.machineCountMethod||'unknown'),businessDate:String(workload.businessDate||'')}
  };
  process.send?.({type:'task_start',taskMeta});
}

function ensureTaskStart(){
  if(!taskMeta)return;
  process.send?.({type:'task_start',taskMeta});
}

function finishMetrics(){
  const endedAt=new Date().toISOString();
  const endRssMiB=process.memoryUsage().rss/MIB;
  peakRssMiB=Math.max(peakRssMiB,endRssMiB,maxResourceRssMiB());
  const cpu=cpuStart?process.cpuUsage(cpuStart):{user:0,system:0};
  return {
    endedAt,
    durationMs:startedAt?Math.max(0,Date.parse(endedAt)-Date.parse(startedAt)):0,
    endRssMiB,
    peakRssMiB,
    cpuMs:(Number(cpu.user||0)+Number(cpu.system||0))/1000
  };
}

async function main(){
  const encoded=process.argv[2];
  if(!encoded)throw new Error('missing job descriptor');
  const descriptor=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(descriptor.type!=='DAILY_ANALYSIS')throw new Error(`unsupported job type: ${descriptor.type}`);
  startMeasurement(descriptor.payload?.storeId);
  const dbPath=path.resolve(process.env.JUGEST_DB_PATH||DEFAULT_DB);
  const rootDir=path.resolve(process.env.JUGEST_WEB_ROOT||DEFAULT_ROOT);
  const db=openDatabase(dbPath);
  let heartbeat;
  try{
    migrate(db);
    sample();
    heartbeat=setInterval(sample,4000);
    heartbeat.unref?.();
    const out=await executeDailyAnalysis({db,job:descriptor,rootDir,onWorkload:announceWorkload});
    if(!taskMeta?.dayCount&&out?.dayCount!=null)announceWorkload(out);
    sample();
    process.send?.({
      type:'complete',
      peakRssMiB,
      taskMetrics:finishMetrics(),
      resultHash:out.outputHash,
      status:out.status,
      targetGeneration:out.targetGeneration,
      followupJobId:out.followupJobId,
      featureJobId:out.featureJobId
    });
  }finally{
    if(heartbeat)clearInterval(heartbeat);
    try{db.close()}catch{}
  }
}

main().then(()=>process.exit(0)).catch(error=>{
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());
  if(taskMeta)ensureTaskStart();
  process.send?.({
    type:'error',
    peakRssMiB,
    taskMetrics:finishMetrics(),
    errorClass:error?.code||'daily_analysis_error',
    message:String(error?.message??error)
  },()=>process.exit(1));
  if(!process.connected)process.exit(1);
});
