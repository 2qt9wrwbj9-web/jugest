import {readDayIntegrity,missingMachineCount} from './ingest/day-integrity.mjs';
import {storeMetadata,canAccessStoreMetadata} from './store-access.mjs';
import {requestStoreAnalysisRefresh} from './analysis/refresh-state.mjs';
import {requestPredictionEvaluation} from './analysis/prediction-refresh-state.mjs';
import {createRelayRuntime} from '../../api/_relay-web.js';
import {createRelayStore} from './relay-store.mjs';
import {withSavepoint} from './sqlite-savepoint.mjs';
import {businessDateAt} from './research/prediction-policy.mjs';

const parse=text=>JSON.parse(text);
const ACTIVE=new Set(['queued','leased','running','retry_wait']);
const operationError=(status,code,message)=>Object.assign(new Error(message),{status,code});
export function mayManageStore(metadata,auth){
 if(metadata.source==='pia-public-ranking-top')return auth.kind==='admin'||(auth.authType==='receiver'&&canAccessStoreMetadata(metadata,auth.channelId,{piaAccessMode:'owner'}));
 return auth.authType==='receiver'&&metadata.collectorChannelId===auth.channelId;
}
export function buildStoreOperations(db,{store,auth,nowIso=new Date().toISOString()}={}){
 const metadata=storeMetadata(store.source_metadata_json),canManage=mayManageStore(metadata,auth);
 const latest=db.prepare('SELECT business_date,quality_status,normalized_payload_hash,updated_at FROM store_days WHERE store_id=? ORDER BY business_date DESC LIMIT 1').get(store.id);
 const checked=latest?readDayIntegrity(db,{storeId:store.id,date:latest.business_date}):null;
 const integrity=checked?.normalizedHash===latest?.normalized_payload_hash?checked:null;
 const attempt=db.prepare('SELECT business_date,decision,check_json,last_seen_at FROM ingest_receipts WHERE store_id=? ORDER BY last_seen_at DESC LIMIT 1').get(store.id);
 const lastAttempt=attempt?{date:attempt.business_date,decision:attempt.decision,at:attempt.last_seen_at,integrity:parse(attempt.check_json),missingMachines:missingMachineCount(parse(attempt.check_json))}:null;
 const accepted=db.prepare("SELECT MAX(last_seen_at) at FROM ingest_receipts WHERE store_id=? AND decision='accepted'").get(store.id);
 const savedAt=db.prepare('SELECT MAX(updated_at) at FROM store_days WHERE store_id=?').get(store.id)?.at;
 const native=metadata.source==='pia-public-ranking-top'?db.prepare('SELECT last_attempt_at,last_success_at,last_result,last_ingested_date FROM source_collector_state WHERE collector_id=?').get(`pia-public:${metadata.publicStoreId??35}`):null;
 const jobs=db.prepare(`SELECT id,type,state,failure_count,max_attempts,updated_at,last_error_class FROM jobs
 WHERE json_extract(payload_json,'$.storeId')=? AND type IN ('DAILY_ANALYSIS','PREDICTION_EVALUATE','SHADOW_PREDICT') ORDER BY id DESC LIMIT 30`).all(store.id);
 const jobByType={};for(const job of jobs)if(!jobByType[job.type])jobByType[job.type]=job;
 const lastAnalysis=db.prepare("SELECT created_at,target_date FROM analysis_receipts WHERE store_id=? ORDER BY id DESC LIMIT 1").get(store.id);
 const history=db.prepare('SELECT business_date,decision,check_json,last_seen_at FROM ingest_receipts WHERE store_id=? ORDER BY last_seen_at DESC LIMIT 20').all(store.id)
  .map(r=>({date:r.business_date,decision:r.decision,at:r.last_seen_at,integrity:parse(r.check_json)}));
 const sourceFailed=native&&['fetch_error','collection_error'].includes(native.last_result);
 const state=sourceFailed?'collection_error':lastAttempt?.decision==='quarantined'?'needs_review':!latest?'not_collected':!integrity?'unverified':integrity.status;
 const retryDate=lastAttempt?.integrity.status!=='complete'?lastAttempt?.date:null;
 const lastCollectedAt=[native?.last_success_at,accepted?.at,savedAt].filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??null;
 return{id:store.id,name:store.name,source:metadata.source??'unknown',state,latestDate:latest?.business_date??null,lastCollectedAt,
  integrity,lastAttempt,missingMachines:missingMachineCount(integrity),
  sourceCollection:native?{lastAttemptAt:native.last_attempt_at,lastSuccessAt:native.last_success_at,result:native.last_result,lastIngestedDate:native.last_ingested_date}:null,
  lastAnalysisAt:lastAnalysis?.created_at??null,lastAnalysisDate:lastAnalysis?.target_date??null,
  jobs:jobByType,history,retryDate,
  canRetry:{analysis:canManage&&Boolean(latest&&integrity?.eligibleForAnalysis),evaluation:canManage,collection:canManage&&metadata.source==='ana-slo-ios-relay'&&Boolean(retryDate)&&retryDate<businessDateAt(nowIso)},
  collectionPolicy:metadata.source==='pia-public-ranking-top'?'取得元の更新を待ち、既存の30分以上の間隔で自動再確認。':'iPhoneショートカットの既存の実行・再試行間隔を維持。再取得は指定した営業日だけ。'};
}
export function buildOperationsOverview(db,{stores,auth,collectorTargets=[],collectorWarning=null,nowIso=new Date().toISOString()}={}){
 const rows=stores.map(store=>buildStoreOperations(db,{store,auth,nowIso}));
 for(const target of collectorTargets.slice(0,100)){
  if(!target||!target.sourceStoreId||!target.shop)continue;
  const collectorTarget={missingDays:Number.isFinite(target.missingDays)?target.missingDays:null,latestDate:target.latestDate||null};
  const saved=rows.find(row=>row.id===target.sourceStoreId);
  if(saved)saved.collectorTarget=collectorTarget;
  else rows.push({id:String(target.sourceStoreId),name:String(target.shop),source:'ana-slo-ios-relay',configuredOnly:true,state:'not_collected',integrity:null,latestDate:null,lastCollectedAt:null,lastAnalysisAt:null,missingMachines:null,jobs:{},canRetry:{},collectorTarget,
   collectionPolicy:'取得対象として登録済み。iPhoneショートカットの次の実行を待っています。保存が確認できるまで正常完了にはしません。'});
 }
 const latest=(key)=>rows.map(r=>r[key]).filter(Boolean).sort().at(-1)??null;
 return{asOf:nowIso,stores:rows,collectorWarning,summary:{targetStores:rows.length,completeStores:rows.filter(r=>r.state==='complete').length,
  pendingStores:rows.filter(r=>r.state!=='complete').length,missingMachines:rows.some(r=>r.missingMachines==null)?null:rows.reduce((n,r)=>n+r.missingMachines,0),
  unknownInventoryStores:rows.filter(r=>r.integrity?.expectedCount==null).length,lastCollectedAt:latest('lastCollectedAt'),lastAnalysisAt:latest('lastAnalysisAt'),
  retryQueued:rows.filter(r=>Object.values(r.jobs).some(j=>ACTIVE.has(j.state))).length}};
}
export async function callOwnedCollector({relayDbPath,auth,token,action,...body}){
 const runtime=createRelayRuntime({createStore:(name,options={})=>createRelayStore(name,{dbPath:relayDbPath,root:options.root??'jugest'})});
 const response=await runtime.default(new Request('http://127.0.0.1/api/relay',{method:'POST',body:JSON.stringify({action,channelId:auth.channelId,receiverToken:token,...body})}));
 const result=await response.json();
 if(!response.ok||result.ok!==true)throw operationError(response.status,result.code??'collector_operation_failed','取得の状態を確認できなかったよ。連携と店舗設定を確認してね。');
 return result;
}
export async function retryStoreOperation(db,{store,auth,kind,date=null,relayDbPath,token,nowIso=new Date().toISOString()}={}){
 const metadata=storeMetadata(store.source_metadata_json);
 if(!mayManageStore(metadata,auth))throw operationError(403,'retry_scope_denied','この店舗の再試行権限がありません。');
 if(!['analysis','evaluation','collection'].includes(kind))throw operationError(400,'bad_retry_kind','再試行する処理を確認してね。');
 if(kind==='collection'){
  if(metadata.source!=='ana-slo-ios-relay'||auth.authType!=='receiver')throw operationError(409,'source_managed_cadence','取得元の更新を既存の間隔で自動確認中です。');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date??'')||!Number.isFinite(Date.parse(date))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date||date>=businessDateAt(nowIso))throw operationError(400,'bad_retry_date','確定済みの営業日を選んでね。');
 }
 const result=withSavepoint(db,'operation_retry',()=>{
  const previous=db.prepare('SELECT requested_at FROM store_operation_retries WHERE store_id=? AND kind=?').get(store.id,kind);
  const cooldown=kind==='collection'?30*60000:5*60000;
  if(previous&&Date.parse(nowIso)-Date.parse(previous.requested_at)<cooldown)throw Object.assign(operationError(429,'retry_cooldown','再試行は登録済みです。間隔を空けて確認してね。'),{retryAfter:Math.ceil((cooldown-(Date.parse(nowIso)-Date.parse(previous.requested_at)))/1000)});
  let job=null;
  if(kind==='analysis'){
   const day=db.prepare("SELECT business_date FROM store_days WHERE store_id=? AND quality_status='valid' ORDER BY business_date DESC LIMIT 1").get(store.id);
   if(!day)throw operationError(409,'analysis_data_unavailable','解析できる保存データがありません。');
   job=requestStoreAnalysisRefresh(db,{storeId:store.id,analysisVersion:'vps-runtime-v1',dirty:true,nowIso}).job;
  }else if(kind==='evaluation')job=requestPredictionEvaluation(db,{storeId:store.id,dirty:true,nowIso}).job;
  db.prepare('INSERT INTO store_operation_retries VALUES(?,?,?,?) ON CONFLICT(store_id,kind) DO UPDATE SET requested_at=excluded.requested_at,job_id=excluded.job_id').run(store.id,kind,nowIso,job?.id??null);
  return{kind,jobId:job?.id??null,queued:true};
 });
 if(kind==='collection'){
  try{await callOwnedCollector({relayDbPath,auth,token,action:'iosCollectorRequeueDate',sourceStoreId:store.id,date});}
  catch(error){db.prepare('DELETE FROM store_operation_retries WHERE store_id=? AND kind=? AND requested_at=?').run(store.id,kind,nowIso);throw error}
  result.date=date;result.message='指定した営業日を取得待ちにしたよ。iPhone側の次の実行で取得する。';
 }
 return result;
}
