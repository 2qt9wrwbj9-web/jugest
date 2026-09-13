import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {loadStoreDays} from './store-data.mjs';
import {runExistingStoreAnalysis} from './runtime-adapter.mjs';
import {getAnalysisRefreshState,requestStoreAnalysisRefresh} from './refresh-state.mjs';
import {requestStoreFeatureRefresh} from './feature-refresh-state.mjs';
import {deriveStoreMachineCount} from './task-metrics.mjs';

const DEFAULT_OPTIONS=Object.freeze({period:'180',minG:'2000',maxDims:'1',minDays:'4'});
const COMPONENT='store-analysis-default';
const FEATURE_VERSION='store-features-v1';

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function isoTime(value){const text=requiredText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be ISO date-time');return text}
function requireDailyJob(job){
  if(!job||!Number.isInteger(job.id)||job.type!=='DAILY_ANALYSIS')throw new TypeError('DAILY_ANALYSIS job is required');
  const storeId=requiredText(job.payload?.storeId,'job.payload.storeId');
  const analysisVersion=requiredText(job.payload?.analysisVersion,'job.payload.analysisVersion');
  return {storeId,analysisVersion};
}

function upsertSnapshot(db,{storeId,type,version,businessDate,payload,nowIso}){
  const payloadJson=canonicalJson(payload);
  const payloadHash=hashCanonical(payload);
  db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(store_id,snapshot_type,version) DO UPDATE SET
      business_date=excluded.business_date,
      payload_json=excluded.payload_json,
      payload_hash=excluded.payload_hash,
      updated_at=excluded.updated_at`)
    .run(storeId,type,version,businessDate,payloadJson,payloadHash,nowIso);
  return payloadHash;
}

function insertReceiptOnce(db,{storeId,targetDate,component,version,inputHash,outputHash,nowIso}){
  const existing=db.prepare(`SELECT id FROM analysis_receipts
    WHERE store_id=? AND target_date=? AND component=? AND version=? AND input_hash=? AND output_hash=? LIMIT 1`)
    .get(storeId,targetDate,component,version,inputHash,outputHash);
  if(existing)return existing.id;
  const inserted=db.prepare(`INSERT INTO analysis_receipts(store_id,target_date,component,version,input_hash,output_hash,created_at)
    VALUES(?,?,?,?,?,?,?)`).run(storeId,targetDate,component,version,inputHash,outputHash,nowIso);
  return Number(inserted.lastInsertRowid);
}

export async function executeDailyAnalysis({db,job,rootDir,analysisRunner=runExistingStoreAnalysis,nowIso=new Date().toISOString(),onWorkload=null}={}){
  if(!db?.prepare||!db?.exec)throw new TypeError('db is required');
  if(typeof analysisRunner!=='function')throw new TypeError('analysisRunner is required');
  if(onWorkload!==null&&typeof onWorkload!=='function')throw new TypeError('onWorkload must be a function');
  const at=isoTime(nowIso);
  const {storeId,analysisVersion}=requireDailyJob(job);
  const refresh=getAnalysisRefreshState(db,{storeId,analysisVersion});
  if(!refresh)throw Object.assign(new Error('analysis refresh state is missing'),{code:'refresh_state_missing'});
  if(refresh.activeJobId!==job.id)throw Object.assign(new Error('analysis job is stale'),{code:'stale_analysis_job'});
  const targetGeneration=refresh.generation;
  const loaded=loadStoreDays(db,storeId,{limit:180});
  const latest=loaded.days.at(-1)?.date??'';
  if(!latest)throw Object.assign(new Error('canonical store has no valid days'),{code:'no_canonical_days'});
  const rowCount=loaded.days.reduce((sum,day)=>sum+(Array.isArray(day.machines)?day.machines.length:0),0);
  const machineScale=deriveStoreMachineCount(loaded.days);
  onWorkload?.({storeId,storeMachineCount:machineScale.count,machineCountMethod:machineScale.method,dayCount:loaded.days.length,rowCount,businessDate:latest});
  const dataSummary={storeId,shop:loaded.store.name,from:loaded.days[0]?.date??latest,latest,dayCount:loaded.days.length,rowCount,analyzedGeneration:targetGeneration};
  const inputDescriptor={storeId,analysisVersion,options:DEFAULT_OPTIONS,days:loaded.days};
  const inputHash=hashCanonical(inputDescriptor);

  let status='insufficient_data';
  let result=null;
  if(loaded.days.length>=3){
    result=await analysisRunner({rootDir,shop:loaded.store.name,sourceStoreId:storeId,days:loaded.days,options:{...DEFAULT_OPTIONS}});
    if(!result||typeof result!=='object')throw new Error('analysis runner returned no result');
    status='analyzed';
  }

  const outputPayload=status==='analyzed'?result:{status,storeId,shop:loaded.store.name,latest,dayCount:loaded.days.length,rowCount};
  const outputHash=hashCanonical(outputPayload);
  let followupJob=null;
  let featureJob=null;

  db.exec('BEGIN IMMEDIATE');
  try{
    const current=getAnalysisRefreshState(db,{storeId,analysisVersion});
    if(!current)throw new Error('analysis refresh state disappeared');
    if(current.activeJobId!==job.id)throw Object.assign(new Error('analysis job lost active ownership'),{code:'stale_analysis_job'});

    if(status==='analyzed'){
      db.prepare(`INSERT INTO analysis_state(store_id,component,version,frontier_date,state_json,input_hash,updated_at)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(store_id,component,version) DO UPDATE SET frontier_date=excluded.frontier_date,state_json=excluded.state_json,input_hash=excluded.input_hash,updated_at=excluded.updated_at`)
        .run(storeId,COMPONENT,analysisVersion,latest,canonicalJson(result),inputHash,at);
      insertReceiptOnce(db,{storeId,targetDate:latest,component:COMPONENT,version:analysisVersion,inputHash,outputHash,nowIso:at});
      upsertSnapshot(db,{storeId,type:'store-analysis-default',version:analysisVersion,businessDate:latest,payload:result,nowIso:at});
    }

    upsertSnapshot(db,{storeId,type:'store-data-summary',version:analysisVersion,businessDate:latest,payload:dataSummary,nowIso:at});
    upsertSnapshot(db,{storeId,type:'store-latest-status',version:analysisVersion,businessDate:latest,payload:{
      status,storeId,shop:loaded.store.name,businessDate:latest,dayCount:loaded.days.length,rowCount,
      generation:current.generation,completedGeneration:Math.max(current.completedGeneration,targetGeneration),
      analyzedGeneration:targetGeneration,inputHash,outputHash,updatedAt:at
    },nowIso:at});

    db.prepare(`UPDATE analysis_refresh_state SET completed_generation=MAX(completed_generation,?),active_job_id=CASE WHEN active_job_id=? THEN NULL ELSE active_job_id END,updated_at=? WHERE store_id=? AND analysis_version=?`)
      .run(targetGeneration,job.id,at,storeId,analysisVersion);

    followupJob=requestStoreAnalysisRefresh(db,{storeId,analysisVersion,nowIso:at,dirty:false}).job;
    featureJob=requestStoreFeatureRefresh(db,{storeId,featureVersion:FEATURE_VERSION,frontierDate:latest,nowIso:at,dirty:true}).job;
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}

  return {status,storeId,businessDate:latest,dayCount:loaded.days.length,rowCount,storeMachineCount:machineScale.count,machineCountMethod:machineScale.method,targetGeneration,inputHash,outputHash,followupJobId:followupJob?.id??null,featureJobId:featureJob?.id??null};
}

export const __test={DEFAULT_OPTIONS,COMPONENT,FEATURE_VERSION};
