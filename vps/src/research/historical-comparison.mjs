import {canonicalJson,hashCanonical} from '../canonical-json.mjs';
import {runExistingStorePlan} from '../analysis/runtime-adapter.mjs';
import {initialHistoricalPreState,evolveHistoricalPreState,predictHistoricalPre} from './historical-pre-simulator.mjs';
import {SCORER_VERSION,OUTCOME_PROXY_VERSION,WIN_EPSILON,scorePredictionRows} from './live-comparison.mjs';

export const HISTORICAL_REPLAY_VERSION='historical-shadow-v3';
const WARMUP_DAYS=7;

function requiredText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function validIso(value,name='nowIso'){const text=requiredText(value,name);if(!Number.isFinite(Date.parse(text)))throw new TypeError(`${name} must be ISO date-time`);return text}
function validDate(value,name='date'){const text=requiredText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function safeJson(text,fallback=null){try{return JSON.parse(text)}catch{return fallback}}
function tableKey(machine,index){return String(machine?.tableNo??machine?.table_no??machine?.machineKey??machine?.machine_key??index)}

function normalizeDays(days,{throughDate=null}={}){
  const limit=throughDate==null?null:validDate(throughDate,'snapshotLastDate');
  return [...(Array.isArray(days)?days:[])]
    .filter(day=>day&&/^\d{4}-\d{2}-\d{2}$/.test(String(day.date||''))&&(!limit||String(day.date)<=limit))
    .map(day=>({date:String(day.date),machines:[...(Array.isArray(day.machines)?day.machines:[])].map((machine,index)=>({...machine,__historicalTableKey:tableKey(machine,index)})).sort((a,b)=>a.__historicalTableKey.localeCompare(b.__historicalTableKey)).map(({__historicalTableKey,...machine})=>machine)}))
    .sort((a,b)=>a.date.localeCompare(b.date));
}

export function computeHistoricalSnapshotIdentity(days,{snapshotLastDate}={}){
  const last=validDate(snapshotLastDate,'snapshotLastDate'),normalized=normalizeDays(days,{throughDate:last});
  return hashCanonical({replayVersion:HISTORICAL_REPLAY_VERSION,snapshotLastDate:last,days:normalized});
}

function runFromDb(row){if(!row)return null;return Object.freeze({id:Number(row.id),storeId:row.store_id,replayVersion:row.replay_version,historyIdentity:row.history_identity,snapshotFirstDate:row.snapshot_first_date??null,snapshotLastDate:row.snapshot_last_date??null,nextTargetDate:row.next_target_date??null,state:row.state,totalCandidates:Number(row.total_candidates)||0,processedCount:Number(row.processed_count)||0,scoredCount:Number(row.scored_count)||0,excludedCount:Number(row.excluded_count)||0,preState:safeJson(row.pre_state_json,{})||{},preFingerprint:row.pre_fingerprint||'',preFrontierDate:row.pre_frontier_date??null,refreshPending:Number(row.refresh_pending)||0,lastError:row.last_error??null,createdAt:row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at??null})}
function dayFromDb(row){if(!row)return null;return Object.freeze({runId:Number(row.run_id),storeId:row.store_id,targetDate:row.target_date,prePrediction:safeJson(row.pre_prediction_json,null),currentPrediction:safeJson(row.current_prediction_json,null),prePredictionHash:row.pre_prediction_hash??null,currentPredictionHash:row.current_prediction_hash??null,outcomeInputHash:row.outcome_input_hash??null,preMetrics:safeJson(row.pre_metrics_json,null),currentMetrics:safeJson(row.current_metrics_json,null),winner:row.winner??null,excludedReason:row.excluded_reason??null,preFingerprint:row.pre_fingerprint??null,preFeatureVersion:row.pre_feature_version??null,preFrontierDate:row.pre_frontier_date??null,scorerVersion:row.scorer_version,createdAt:row.created_at})}

export function getHistoricalComparisonRun(db,{storeId,runId=null}={}){
  if(!db?.prepare)throw new TypeError('db is required');const id=requiredText(storeId,'storeId');
  if(runId!=null){if(!Number.isInteger(Number(runId))||Number(runId)<1)throw new TypeError('runId must be a positive integer');return runFromDb(db.prepare('SELECT * FROM historical_comparison_runs WHERE store_id=? AND id=?').get(id,Number(runId)))}
  return runFromDb(db.prepare("SELECT * FROM historical_comparison_runs WHERE store_id=? AND replay_version=? AND state<>'stale' ORDER BY id DESC LIMIT 1").get(id,HISTORICAL_REPLAY_VERSION));
}

export function markHistoricalRunStale(db,{runId,nowIso,reason='history_identity_changed'}={}){
  if(!db?.prepare)throw new TypeError('db is required');const id=Number(runId),at=validIso(nowIso);if(!Number.isInteger(id)||id<1)throw new TypeError('runId must be a positive integer');
  db.prepare("UPDATE historical_comparison_runs SET state='stale',last_error=?,updated_at=? WHERE id=? AND state<>'stale'").run(String(reason||'history_identity_changed'),at,id);return runFromDb(db.prepare('SELECT * FROM historical_comparison_runs WHERE id=?').get(id));
}

export function persistHistoricalRunSnapshot(db,{runId,days}={}){
  if(!db?.prepare)throw new TypeError('db is required');const rid=Number(runId);if(!Number.isInteger(rid)||rid<1)throw new TypeError('runId must be a positive integer');
  const ordered=normalizeDays(days);const insert=db.prepare('INSERT OR IGNORE INTO historical_comparison_snapshot_days(run_id,business_date,payload_json,payload_hash) VALUES(?,?,?,?)');
  for(const day of ordered){const payload=canonicalJson(day);insert.run(rid,day.date,payload,hashCanonical(day))}
  return ordered.length;
}

export function loadHistoricalRunSnapshot(db,{runId}={}){
  if(!db?.prepare)throw new TypeError('db is required');const rid=Number(runId);if(!Number.isInteger(rid)||rid<1)throw new TypeError('runId must be a positive integer');
  return db.prepare('SELECT business_date,payload_json FROM historical_comparison_snapshot_days WHERE run_id=? ORDER BY business_date').all(rid).map(row=>{
    const parsed=safeJson(row.payload_json,null);return parsed&&parsed.date?parsed:{date:row.business_date,machines:[]};
  });
}

function createHistoricalRun(db,{storeId,days,nowIso}){
  const ordered=normalizeDays(days);if(!ordered.length)throw new TypeError('days are required');
  const first=ordered[0].date,last=ordered.at(-1).date,identity=computeHistoricalSnapshotIdentity(ordered,{snapshotLastDate:last});
  const existing=runFromDb(db.prepare('SELECT * FROM historical_comparison_runs WHERE store_id=? AND replay_version=? AND history_identity=?').get(storeId,HISTORICAL_REPLAY_VERSION,identity));if(existing)return existing;
  const preState=initialHistoricalPreState(),total=Math.max(0,ordered.length-WARMUP_DAYS),next=total?ordered[WARMUP_DAYS].date:null,state=total?'queued':'complete';
  const create=()=>{
    db.prepare(`INSERT INTO historical_comparison_runs(store_id,replay_version,history_identity,snapshot_first_date,snapshot_last_date,next_target_date,state,total_candidates,processed_count,scored_count,excluded_count,pre_state_json,pre_fingerprint,pre_frontier_date,refresh_pending,last_error,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,?,?,0,0,0,?,?,NULL,0,NULL,?,?,?)`).run(storeId,HISTORICAL_REPLAY_VERSION,identity,first,last,next,state,total,canonicalJson(preState),preState.fingerprint,nowIso,nowIso,state==='complete'?nowIso:null);
    const row=db.prepare('SELECT * FROM historical_comparison_runs WHERE store_id=? AND replay_version=? AND history_identity=?').get(storeId,HISTORICAL_REPLAY_VERSION,identity);
    persistHistoricalRunSnapshot(db,{runId:row.id,days:ordered});
    return runFromDb(row);
  };
  return typeof db.transaction==='function'?db.transaction(create)():create();
}

function setRefreshPending(db,{runId,nowIso}){
  db.prepare("UPDATE historical_comparison_runs SET refresh_pending=1,updated_at=? WHERE id=? AND state IN ('queued','running','complete')").run(nowIso,runId);
  return runFromDb(db.prepare('SELECT * FROM historical_comparison_runs WHERE id=?').get(runId));
}

export function ensureHistoricalComparisonRun(db,{storeId,days,nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');const id=requiredText(storeId,'storeId'),at=validIso(nowIso),ordered=normalizeDays(days);if(!ordered.length)throw new TypeError('days are required');
  const active=getHistoricalComparisonRun(db,{storeId:id});
  if(!active)return createHistoricalRun(db,{storeId:id,days:ordered,nowIso:at});
  const frozen=loadHistoricalRunSnapshot(db,{runId:active.id});
  if(!frozen.length){markHistoricalRunStale(db,{runId:active.id,nowIso:at,reason:'legacy_run_without_snapshot'});return createHistoricalRun(db,{storeId:id,days:ordered,nowIso:at})}
  const identity=computeHistoricalSnapshotIdentity(ordered,{snapshotLastDate:active.snapshotLastDate});
  if(active.state==='queued'||active.state==='running'){
    if(identity!==active.historyIdentity)return setRefreshPending(db,{runId:active.id,nowIso:at});
    return active;
  }
  if(active.state==='complete'){
    if(active.refreshPending||identity!==active.historyIdentity)return createHistoricalRun(db,{storeId:id,days:ordered,nowIso:at});
    return active;
  }
  return createHistoricalRun(db,{storeId:id,days:ordered,nowIso:at});
}

export function persistHistoricalComparisonDay(db,{runId,storeId,targetDate,prePrediction=null,currentPrediction=null,outcomeInputHash=null,preMetrics=null,currentMetrics=null,winner=null,excludedReason=null,preState={},scorerVersion,createdAt}={}){
  if(!db?.prepare)throw new TypeError('db is required');const rid=Number(runId),sid=requiredText(storeId,'storeId'),target=validDate(targetDate,'targetDate'),scorer=requiredText(scorerVersion,'scorerVersion'),at=validIso(createdAt,'createdAt');if(!Number.isInteger(rid)||rid<1)throw new TypeError('runId must be a positive integer');
  const run=db.prepare('SELECT store_id FROM historical_comparison_runs WHERE id=?').get(rid);if(!run)throw new Error('historical run missing');if(run.store_id!==sid)throw new Error('historical run store mismatch');if(winner!=null&&!['pre_research','current_shadow','tie'].includes(String(winner)))throw new TypeError('winner is invalid');
  const preJson=prePrediction==null?null:canonicalJson(prePrediction),currentJson=currentPrediction==null?null:canonicalJson(currentPrediction);
  const result=db.prepare(`INSERT OR IGNORE INTO historical_comparison_days(run_id,store_id,target_date,pre_prediction_json,current_prediction_json,pre_prediction_hash,current_prediction_hash,outcome_input_hash,pre_metrics_json,current_metrics_json,winner,excluded_reason,pre_fingerprint,pre_feature_version,pre_frontier_date,scorer_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(rid,sid,target,preJson,currentJson,prePrediction==null?null:hashCanonical(prePrediction),currentPrediction==null?null:hashCanonical(currentPrediction),outcomeInputHash==null?null:String(outcomeInputHash),preMetrics==null?null:canonicalJson(preMetrics),currentMetrics==null?null:canonicalJson(currentMetrics),winner==null?null:String(winner),excludedReason==null?null:String(excludedReason),String(preState?.fingerprint??prePrediction?.modelFingerprint??'')||null,preState?.featureVersion==null?(prePrediction?.featureVersion==null?null:String(prePrediction.featureVersion)):String(preState.featureVersion),preState?.frontierDate==null?(prePrediction?.sourceFrontierDate==null?null:String(prePrediction.sourceFrontierDate)):String(preState.frontierDate),scorer,at);
  return Object.freeze({inserted:Number(result.changes||0)>0,row:dayFromDb(db.prepare('SELECT * FROM historical_comparison_days WHERE run_id=? AND target_date=?').get(rid,target))});
}

export function advanceHistoricalCursor(db,{runId,nextTargetDate=null,processedDelta=1,scoredDelta=0,excludedDelta=0,preState,nowIso}={}){
  if(!db?.prepare)throw new TypeError('db is required');const rid=Number(runId),at=validIso(nowIso);if(!Number.isInteger(rid)||rid<1)throw new TypeError('runId must be a positive integer');const next=nextTargetDate==null?null:validDate(nextTargetDate,'nextTargetDate');if(!preState||typeof preState!=='object')throw new TypeError('preState is required');const state=next?'running':'complete';
  db.prepare(`UPDATE historical_comparison_runs SET next_target_date=?,state=?,processed_count=processed_count+?,scored_count=scored_count+?,excluded_count=excluded_count+?,pre_state_json=?,pre_fingerprint=?,pre_frontier_date=?,updated_at=?,completed_at=? WHERE id=? AND state<>'stale'`).run(next,state,Math.max(0,Math.trunc(Number(processedDelta)||0)),Math.max(0,Math.trunc(Number(scoredDelta)||0)),Math.max(0,Math.trunc(Number(excludedDelta)||0)),canonicalJson(preState),String(preState.fingerprint||''),preState.frontierDate==null?null:String(preState.frontierDate),at,state==='complete'?at:null,rid);
  return runFromDb(db.prepare('SELECT * FROM historical_comparison_runs WHERE id=?').get(rid));
}

export function markHistoricalRunComplete(db,{runId,nowIso}={}){if(!db?.prepare)throw new TypeError('db is required');const rid=Number(runId),at=validIso(nowIso);if(!Number.isInteger(rid)||rid<1)throw new TypeError('runId must be a positive integer');db.prepare("UPDATE historical_comparison_runs SET state='complete',next_target_date=NULL,updated_at=?,completed_at=? WHERE id=? AND state<>'stale'").run(at,at,rid);return runFromDb(db.prepare('SELECT * FROM historical_comparison_runs WHERE id=?').get(rid))}

function normalizedOutcomeRows(targetDay){return (targetDay?.machines||[]).flatMap((machine,index)=>{const raw=machine?.diff;if(raw===null||raw===undefined||raw==='')return [];const outcomeScore=Number(raw);return Number.isFinite(outcomeScore)?[{machineKey:tableKey(machine,index),outcomeScore}]:[]}).sort((a,b)=>a.machineKey.localeCompare(b.machineKey))}
function winnerFromMetrics(pre,current){const delta=Number(pre?.quality||0)-Number(current?.quality||0);if(Math.abs(delta)<=WIN_EPSILON)return 'tie';return delta>0?'pre_research':'current_shadow'}

export async function compareHistoricalTarget({rootDir,storeId,shop,days,targetDate,preState=initialHistoricalPreState()}={}){
  const sid=requiredText(storeId,'storeId'),storeName=requiredText(shop,'shop'),target=validDate(targetDate,'targetDate'),ordered=normalizeDays(days),historyDays=ordered.filter(day=>day.date<target),targetDay=ordered.find(day=>day.date===target)||null;
  const base={storeId:sid,targetDate:target,winner:null,preScore:null,currentScore:null,prePrediction:null,currentPrediction:null,preState,scorerVersion:SCORER_VERSION};
  if(historyDays.length<WARMUP_DAYS)return Object.freeze({...base,excludedReason:'insufficient_history'});

  const evolved=evolveHistoricalPreState({storeId:sid,historyDays,state:preState});
  let prePrediction=null;if(evolved.converged)prePrediction=predictHistoricalPre({storeId:sid,historyDays,targetDate:target,state:evolved.state,datasetHash:evolved.datasetHash});
  let currentPrediction=null,currentError=null;
  try{currentPrediction=await runExistingStorePlan({rootDir,shop:storeName,sourceStoreId:sid,days:historyDays.slice(-400),targetDate:target})}catch(error){currentError=String(error?.code||error?.message||error)}
  const nextState=Object.freeze({...evolved.state,featureVersion:evolved.featureVersion??evolved.state?.featureVersion??null});
  if(!evolved.converged)return Object.freeze({...base,preState:nextState,currentPrediction,currentError,excludedReason:evolved.reason==='insufficient_data'?'pre_insufficient_research_data':'pre_cycle_incomplete'});
  if(!prePrediction?.available||!prePrediction.rankings?.length)return Object.freeze({...base,preState:nextState,currentPrediction,currentError,excludedReason:'missing_pre_research'});
  if(!currentPrediction?.rankings?.length)return Object.freeze({...base,preState:nextState,prePrediction,currentPrediction,currentError,excludedReason:'missing_current_shadow'});
  const outcomeRows=normalizedOutcomeRows(targetDay);if(!outcomeRows.length)return Object.freeze({...base,preState:nextState,prePrediction,currentPrediction,excludedReason:'missing_outcome'});
  const outcomeInputHash=hashCanonical({outcomeProxyVersion:OUTCOME_PROXY_VERSION,storeId:sid,targetDate:target,outcomeRows});
  const preMetrics=scorePredictionRows({predictionRows:prePrediction.rankings,outcomeRows}),currentMetrics=scorePredictionRows({predictionRows:currentPrediction.rankings,outcomeRows});
  const preScore=Object.freeze({outcomeInputHash,metrics:preMetrics}),currentScore=Object.freeze({outcomeInputHash,metrics:currentMetrics});
  return Object.freeze({...base,preState:nextState,prePrediction,currentPrediction,outcomeInputHash,preScore,currentScore,winner:winnerFromMetrics(preMetrics,currentMetrics),excludedReason:null});
}

export const __test={WARMUP_DAYS,normalizeDays,runFromDb,dayFromDb,normalizedOutcomeRows,winnerFromMetrics};
