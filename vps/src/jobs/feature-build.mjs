import path from 'node:path';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {loadStoreDays} from '../analysis/store-data.mjs';
import {deriveStoreMachineCount} from '../analysis/task-metrics.mjs';
import {getFeatureRefreshState,completeFeatureRefresh} from '../analysis/feature-refresh-state.mjs';
import {buildStoreFeatureRows,persistStoreFeatureRows} from '../research/feature-builder.mjs';
import {hashCanonical} from '../canonical-json.mjs';

const MIB=1024*1024;
const DEFAULT_DB='/var/lib/jugest/jugest.sqlite';
let peakRssMiB=process.memoryUsage().rss/MIB;
let startedAt=null;
let startRssMiB=null;
let cpuStart=null;
let taskMeta=null;
let heartbeat=null;

function maxResourceRssMiB(){const value=Number(process.resourceUsage?.().maxRSS);return Number.isFinite(value)&&value>=0?value/1024:0}
function sample(){peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());process.send?.({type:'heartbeat',rssMiB:peakRssMiB})}
function finishMetrics(){
  const endedAt=new Date().toISOString();
  const endRssMiB=process.memoryUsage().rss/MIB;
  peakRssMiB=Math.max(peakRssMiB,endRssMiB,maxResourceRssMiB());
  const cpu=cpuStart?process.cpuUsage(cpuStart):{user:0,system:0};
  return {endedAt,durationMs:startedAt?Math.max(0,Date.parse(endedAt)-Date.parse(startedAt)):0,endRssMiB,peakRssMiB,cpuMs:(Number(cpu.user||0)+Number(cpu.system||0))/1000};
}
function announce(meta){taskMeta=Object.freeze(meta);process.send?.({type:'task_start',taskMeta})}
function fallbackMeta(descriptor){
  return {phase:1,taskKind:'feature_build',taskVersion:String(descriptor?.payload?.featureVersion||'store-features-v1'),modelFingerprint:null,storeId:String(descriptor?.payload?.storeId||''),storeMachineCount:0,dayCount:0,rowCount:0,workloadUnits:0,startedAt,startRssMiB,details:{machineCountMethod:'unknown'}};
}

async function main(){
  const encoded=process.argv[2];
  if(!encoded)throw new Error('missing job descriptor');
  const descriptor=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(descriptor.type!=='FEATURE_BUILD')throw new Error(`unsupported job type: ${descriptor.type}`);
  const storeId=String(descriptor.payload?.storeId||'').trim();
  const featureVersion=String(descriptor.payload?.featureVersion||'').trim();
  const targetGeneration=Number(descriptor.payload?.generation);
  if(!storeId||!featureVersion||!Number.isInteger(targetGeneration))throw new Error('invalid FEATURE_BUILD descriptor');
  startedAt=new Date().toISOString();
  startRssMiB=process.memoryUsage().rss/MIB;
  cpuStart=process.cpuUsage();
  const dbPath=path.resolve(process.env.JUGEST_DB_PATH||DEFAULT_DB);
  const db=openDatabase(dbPath);
  try{
    migrate(db);
    const refresh=getFeatureRefreshState(db,{storeId,featureVersion});
    if(!refresh)throw Object.assign(new Error('feature refresh state is missing'),{code:'feature_refresh_state_missing'});
    if(refresh.activeJobId!==descriptor.id)throw Object.assign(new Error('feature job is stale'),{code:'stale_feature_job'});
    sample();
    heartbeat=setInterval(sample,4000);heartbeat.unref?.();
    const loaded=loadStoreDays(db,storeId,{limit:180});
    const latest=loaded.days.at(-1)?.date??'';
    if(!latest)throw Object.assign(new Error('canonical store has no valid days'),{code:'no_canonical_days'});
    const rowCount=loaded.days.reduce((sum,day)=>sum+(Array.isArray(day.machines)?day.machines.length:0),0);
    const scale=deriveStoreMachineCount(loaded.days);
    announce({phase:1,taskKind:'feature_build',taskVersion:featureVersion,modelFingerprint:null,storeId,storeMachineCount:scale.count,dayCount:loaded.days.length,rowCount,workloadUnits:rowCount,startedAt,startRssMiB,details:{machineCountMethod:scale.method,asOfDate:latest}});
    const rows=buildStoreFeatureRows({storeId,days:loaded.days,featureVersion,asOfDate:latest});
    persistStoreFeatureRows(db,rows,{updatedAt:new Date().toISOString()});
    const completion=completeFeatureRefresh(db,{storeId,featureVersion,jobId:descriptor.id,targetGeneration,frontierDate:latest,nowIso:new Date().toISOString()});
    sample();
    process.send?.({type:'complete',status:'built',peakRssMiB,taskMetrics:finishMetrics(),rowCount:rows.length,resultHash:hashCanonical({storeId,featureVersion,asOfDate:latest,rows}),targetGeneration,followupJobId:completion.job?.id??null});
  }finally{
    if(heartbeat)clearInterval(heartbeat);
    try{db.close()}catch{}
  }
}

main().then(()=>process.exit(0)).catch(error=>{
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());
  if(!taskMeta&&startedAt){
    try{
      const encoded=process.argv[2];
      const descriptor=encoded?JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')):null;
      announce(fallbackMeta(descriptor));
    }catch{}
  }
  process.send?.({type:'error',peakRssMiB,taskMetrics:finishMetrics(),errorClass:error?.code||'feature_build_error',message:String(error?.message??error)},()=>process.exit(1));
  if(!process.connected)process.exit(1);
});
