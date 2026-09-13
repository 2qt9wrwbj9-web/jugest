import path from 'node:path';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {loadStoreDays} from '../analysis/store-data.mjs';
import {deriveStoreMachineCount} from '../analysis/task-metrics.mjs';
import {getFeatureRefreshState,completeFeatureRefresh} from '../analysis/feature-refresh-state.mjs';
import {ensureResearchCycle} from '../analysis/research-cycle.mjs';
import {buildStoreFeatureRows,persistStoreFeatureRows} from '../research/feature-builder.mjs';
import {refreshActiveStoreReadSnapshot} from '../research/store-read-output.mjs';
import {hashCanonical} from '../canonical-json.mjs';

const MIB=1024*1024;
const DEFAULT_DB='/var/lib/jugest/jugest.sqlite';
let peakRssMiB=process.memoryUsage().rss/MIB;
let startedAt=null,startRssMiB=null,cpuStart=null,taskMeta=null,heartbeat=null,announced=false;

function maxResourceRssMiB(){const value=Number(process.resourceUsage?.().maxRSS);return Number.isFinite(value)&&value>=0?value/1024:0}
function sample(){peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());process.send?.({type:'heartbeat',rssMiB:peakRssMiB})}
function announce(meta){taskMeta=Object.freeze(meta);if(!announced){announced=true;process.send?.({type:'task_start',taskMeta})}}
function finishMetrics(){
  const endedAt=new Date().toISOString(),endRssMiB=process.memoryUsage().rss/MIB;peakRssMiB=Math.max(peakRssMiB,endRssMiB,maxResourceRssMiB());
  const cpu=cpuStart?process.cpuUsage(cpuStart):{user:0,system:0};
  return {phase:taskMeta?.phase??1,taskKind:taskMeta?.taskKind??'feature_build',taskVersion:taskMeta?.taskVersion??'store-features-v1',modelFingerprint:taskMeta?.modelFingerprint??null,storeId:taskMeta?.storeId??'',storeMachineCount:Number(taskMeta?.storeMachineCount)||0,dayCount:Number(taskMeta?.dayCount)||0,rowCount:Number(taskMeta?.rowCount)||0,workloadUnits:Number(taskMeta?.workloadUnits)||0,startedAt,endedAt,durationMs:startedAt?Math.max(0,Date.parse(endedAt)-Date.parse(startedAt)):0,startRssMiB,endRssMiB,peakRssMiB,cpuMs:(Number(cpu.user||0)+Number(cpu.system||0))/1000,details:taskMeta?.details??{}};
}
function fallbackMeta(descriptor){return {phase:1,taskKind:'feature_build',taskVersion:String(descriptor?.payload?.featureVersion||'store-features-v1'),modelFingerprint:null,storeId:String(descriptor?.payload?.storeId||''),storeMachineCount:0,dayCount:0,rowCount:0,workloadUnits:0,startedAt,startRssMiB,details:{machineCountMethod:'unknown',asOfDate:String(descriptor?.payload?.targetFrontierDate||'')}}}

async function main(){
  const encoded=process.argv[2];if(!encoded)throw new Error('missing job descriptor');
  const descriptor=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  if(descriptor.type!=='FEATURE_BUILD')throw new Error(`unsupported job type: ${descriptor.type}`);
  const storeId=String(descriptor.payload?.storeId||'').trim(),featureVersion=String(descriptor.payload?.featureVersion||'').trim(),targetFrontierDate=String(descriptor.payload?.targetFrontierDate||'').trim();
  if(!storeId||!featureVersion||!/^\d{4}-\d{2}-\d{2}$/.test(targetFrontierDate))throw new Error('invalid FEATURE_BUILD descriptor');
  startedAt=new Date().toISOString();startRssMiB=process.memoryUsage().rss/MIB;cpuStart=process.cpuUsage();
  const dbPath=path.resolve(process.env.JUGEST_DB_PATH||DEFAULT_DB),db=openDatabase(dbPath);
  try{
    migrate(db);
    const refresh=getFeatureRefreshState(db,{storeId,featureVersion});
    if(!refresh)throw Object.assign(new Error('feature refresh state is missing'),{code:'feature_refresh_state_missing'});
    if(refresh.activeJobId!==descriptor.id)throw Object.assign(new Error('feature job is stale'),{code:'stale_feature_job'});
    sample();heartbeat=setInterval(sample,4000);heartbeat.unref?.();
    const loaded=loadStoreDays(db,storeId,{limit:180});
    const eligible=loaded.days.filter(day=>String(day?.date||'')<=targetFrontierDate);
    const asOfDate=eligible.at(-1)?.date??'';
    if(!asOfDate)throw Object.assign(new Error('canonical store has no valid days at requested frontier'),{code:'no_canonical_days'});
    const rowCount=eligible.reduce((sum,day)=>sum+(Array.isArray(day.machines)?day.machines.length:0),0),scale=deriveStoreMachineCount(eligible);
    announce({phase:1,taskKind:'feature_build',taskVersion:featureVersion,modelFingerprint:null,storeId,storeMachineCount:scale.count,dayCount:eligible.length,rowCount,workloadUnits:rowCount,startedAt,startRssMiB,details:{machineCountMethod:scale.method,asOfDate}});
    const rows=buildStoreFeatureRows({storeId,days:eligible,featureVersion,asOfDate});
    persistStoreFeatureRows(db,rows,{updatedAt:new Date().toISOString()});
    const resultHash=hashCanonical({storeId,featureVersion,asOfDate,rows});
    const completion=completeFeatureRefresh(db,{storeId,featureVersion,jobId:descriptor.id,completedFrontierDate:asOfDate,nowIso:new Date().toISOString()});
    // Publish only the newest requested frontier; a stale build yields to its queued follow-up.
    const storeRead=completion.job?null:refreshActiveStoreReadSnapshot(db,{storeId,days:eligible,frontierDate:asOfDate,nowIso:new Date().toISOString()});
    const research=completion.job?null:ensureResearchCycle(db,{storeId,featureVersion,frontierDate:asOfDate,nowIso:new Date().toISOString()});
    sample();
    process.send?.({type:'complete',status:'built',peakRssMiB,taskMetrics:finishMetrics(),featureRowCount:rows.length,rowCount:rows.length,resultHash,followupJobId:completion.job?.id??null,researchJobId:research?.job?.id??null,storeReadTargetDate:storeRead?.targetDate??null});
  }finally{if(heartbeat)clearInterval(heartbeat);try{db.close()}catch{}}
}

main().then(()=>process.exit(0)).catch(error=>{
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB,maxResourceRssMiB());
  if(!taskMeta&&startedAt){try{const encoded=process.argv[2];const descriptor=encoded?JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')):null;announce(fallbackMeta(descriptor))}catch{}}
  process.send?.({type:'error',peakRssMiB,taskMetrics:finishMetrics(),errorClass:error?.code||'feature_build_error',message:String(error?.message??error)},()=>process.exit(1));
  if(!process.connected)process.exit(1);
});
