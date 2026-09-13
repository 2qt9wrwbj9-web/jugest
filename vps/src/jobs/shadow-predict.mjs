import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../db.mjs';
import {migrate} from '../schema.mjs';
import {loadStoreDays} from '../analysis/store-data.mjs';
import {runExistingStorePlan} from '../analysis/runtime-adapter.mjs';
import {completeShadowPrediction,getShadowRefreshState,SHADOW_ENGINE_VERSION} from '../analysis/shadow-refresh-state.mjs';
import {persistLivePrediction} from '../research/live-comparison.mjs';
import {deriveStoreMachineCount} from '../analysis/task-metrics.mjs';
import {hashCanonical} from '../canonical-json.mjs';

function decodeDescriptor(raw){
  if(!raw)throw new TypeError('job descriptor is required');
  let value;
  try{value=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'))}catch{throw new TypeError('invalid job descriptor')}
  if(!Number.isInteger(value?.id)||value?.type!=='SHADOW_PREDICT')throw new TypeError('SHADOW_PREDICT descriptor is required');
  return value;
}
function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validDate(value,name){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function nextDate(date){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function rssMiB(){return process.memoryUsage().rss/(1024*1024)}
function startHeartbeat(){
  const send=()=>process.send?.({type:'heartbeat',rssMiB:rssMiB(),at:new Date().toISOString()});
  send();const timer=setInterval(send,1000);timer.unref?.();return timer;
}

async function main(){
  const descriptor=decodeDescriptor(process.argv[2]),payload=descriptor.payload||{};
  const storeId=requiredText(payload.storeId,'job.payload.storeId');
  const targetFrontierDate=validDate(payload.targetFrontierDate,'job.payload.targetFrontierDate');
  const engineVersion=String(payload.engineVersion||SHADOW_ENGINE_VERSION).trim()||SHADOW_ENGINE_VERSION;
  const dbPath=process.env.JUGEST_DB_PATH||'/var/lib/jugest/jugest.sqlite';
  const rootDir=process.env.JUGEST_WEB_ROOT||fileURLToPath(new URL('../../..',import.meta.url));
  if(!fs.existsSync(rootDir))throw new Error(`JUGEST web root not found: ${rootDir}`);
  const heartbeat=startHeartbeat(),startedAt=Date.now(),startRssMiB=rssMiB(),db=openDatabase(dbPath);
  let peakRssMiB=startRssMiB;
  const samplePeak=setInterval(()=>{peakRssMiB=Math.max(peakRssMiB,rssMiB())},100);samplePeak.unref?.();
  try{
    migrate(db);
    const state=getShadowRefreshState(db,{storeId});
    if(!state)throw Object.assign(new Error('shadow refresh state is missing'),{code:'shadow_refresh_state_missing'});
    if(state.activeJobId!==descriptor.id)throw Object.assign(new Error('shadow job is stale'),{code:'stale_shadow_job'});
    const loaded=loadStoreDays(db,storeId,{limit:180});
    const days=loaded.days.filter(day=>String(day.date||'')<=targetFrontierDate);
    const actualFrontier=String(days.at(-1)?.date||'');
    if(!actualFrontier)throw Object.assign(new Error('canonical store has no valid days'),{code:'no_canonical_days'});
    if(actualFrontier!==targetFrontierDate)throw Object.assign(new Error('requested shadow frontier is not available'),{code:'shadow_frontier_unavailable'});
    const machineScale=deriveStoreMachineCount(days),rowCount=days.reduce((sum,day)=>sum+(Array.isArray(day.machines)?day.machines.length:0),0);
    process.send?.({
      type:'task_start',taskKind:'SHADOW_PREDICT',phase:3,taskVersion:engineVersion,storeId,
      storeMachineCount:machineScale.count,machineCountMethod:machineScale.method,dayCount:days.length,rowCount,workloadUnits:rowCount
    });
    const targetDate=nextDate(actualFrontier);
    const result=await runExistingStorePlan({rootDir,shop:loaded.store.name,sourceStoreId:storeId,days,targetDate});
    const nowIso=new Date().toISOString();
    let status='insufficient_data',prediction=null;
    if(result.available&&Array.isArray(result.rankings)&&result.rankings.length){
      prediction=persistLivePrediction(db,{
        storeId,targetDate,engine:'current_shadow',engineVersion,modelFingerprint:'',featureVersion:null,
        sourceFrontierDate:actualFrontier,
        inputHash:hashCanonical({storeId,targetFrontierDate:actualFrontier,engineVersion,days}),
        rankings:result.rankings,createdAt:nowIso
      });
      status='predicted';
    }
    const completion=completeShadowPrediction(db,{storeId,jobId:descriptor.id,completedFrontierDate:actualFrontier,nowIso});
    peakRssMiB=Math.max(peakRssMiB,rssMiB());
    process.send?.({
      type:'complete',status,storeId,businessDate:actualFrontier,targetDate,
      outputHash:prediction?.row?.payloadHash||hashCanonical({status,storeId,targetDate,engineVersion}),
      followupJobId:completion.job?.id??null,durationMs:Date.now()-startedAt,startRssMiB,peakRssMiB,endRssMiB:rssMiB()
    });
  }finally{
    clearInterval(heartbeat);clearInterval(samplePeak);db.close();
  }
}

main().catch(error=>{
  process.send?.({type:'error',message:String(error?.message||error),errorClass:String(error?.code||error?.name||'shadow_predict_error'),rssMiB:rssMiB()});
  process.exitCode=1;
});
