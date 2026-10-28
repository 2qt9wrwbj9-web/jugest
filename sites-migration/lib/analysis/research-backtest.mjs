import{stageBacktestRows}from'./backtest-staging.mjs';
import{buildWalkForwardDataset,splitChronologicalSamples}from'./generated-research-dataset.mjs';
import{baselineModel,evaluateModel,fingerprintModel}from'../../upstream/vps/src/research/model-search.mjs';
import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
import{rankSplit}from'./generated-backtest-kernel.mjs';
import{openFrozenStoreHistory}from'./input-snapshot.mjs';
const failure=code=>Object.assign(Error(code),{code});
export function researchRequestStatements({db,storeId,targetDate,key,at}){
 const model=baselineModel();return[
  db.prepare(`INSERT OR IGNORE INTO research_model_registry(store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at) SELECT ?,?,?,NULL,0,'research_champion',NULL,NULL,'{}',?,? WHERE EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE idempotency_key=? AND target_date=?) AND EXISTS(SELECT 1 FROM store_feature_snapshots WHERE store_id=? AND as_of_date<=?) AND NOT EXISTS(SELECT 1 FROM research_model_registry WHERE store_id=? AND status='research_champion')`).bind(storeId,fingerprintModel(model),canonicalJson(model),at,at,key,targetDate,storeId,targetDate,storeId),
  db.prepare(`INSERT INTO sites_research_job_inputs(job_id,input_hash,model_json,model_fingerprint,feature_version,frontier_date,created_at) SELECT j.id,'',r.model_json,r.fingerprint,'store-features-v1',?,? FROM sites_analysis_jobs j JOIN research_model_registry r ON r.store_id=j.store_id WHERE j.idempotency_key=? AND j.target_date=? AND r.status='research_champion' ORDER BY r.generation DESC,r.updated_at DESC LIMIT 1 ON CONFLICT(job_id) DO NOTHING`).bind(targetDate,at,key,targetDate)
 ];
}
export async function freezeResearchModel({db,bucket,job,snapshot,now=Date.now}){
 const old=await db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first();if(old?.input_hash){if(old.input_hash!==snapshot.inputHash)throw failure('research_input_mismatch');return old}
 const input=await openFrozenStoreHistory({bucket,manifestKey:snapshot.manifestKey});let frontier='';for await(const day of input.days)if(day.date<=job.target_date)frontier=day.date;
 const feature=await db.prepare("SELECT j.id FROM sites_analysis_jobs j JOIN sites_analysis_heads h ON h.completed_job_id=j.id WHERE h.store_id=? AND h.kind='feature-build' AND j.input_hash=? AND j.state='succeeded' AND EXISTS(SELECT 1 FROM store_feature_snapshots f WHERE f.store_id=j.store_id AND f.as_of_date=? AND f.feature_version='store-features-v1')").bind(job.store_id,snapshot.inputHash,frontier).first();
 if(!feature)throw failure('research_features_required');
 if(old){await db.prepare("UPDATE sites_research_job_inputs SET input_hash=?,frontier_date=? WHERE job_id=? AND input_hash='' AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>?)").bind(snapshot.inputHash,frontier,job.id,job.id,job.lease_owner,job.attempts,now()).run();return db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first()}
 const model=baselineModel(),at=new Date(now()).toISOString();
 // Same initial champion as ensureResearchCycle; this does not activate a model
 // for live predictions or run the unported search/promotion/holdout workflow.
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO research_model_registry(store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at) SELECT ?,?,?,NULL,0,'research_champion',NULL,NULL,'{}',?,? WHERE NOT EXISTS(SELECT 1 FROM research_model_registry WHERE store_id=? AND status='research_champion') AND EXISTS(SELECT 1 FROM sites_analysis_jobs WHERE id=? AND lease_owner=? AND attempts=? AND state='running' AND lease_until>?)`).bind(job.store_id,fingerprintModel(model),canonicalJson(model),at,at,job.store_id,job.id,job.lease_owner,job.attempts,now()),
  db.prepare(`INSERT INTO sites_research_job_inputs(job_id,input_hash,model_json,model_fingerprint,feature_version,frontier_date,created_at) SELECT j.id,?,r.model_json,r.fingerprint,'store-features-v1',?,? FROM sites_analysis_jobs j JOIN research_model_registry r ON r.store_id=j.store_id WHERE j.id=? AND j.lease_owner=? AND j.attempts=? AND j.state='running' AND j.lease_until>? AND r.status='research_champion' ORDER BY r.generation DESC,r.updated_at DESC LIMIT 1 ON CONFLICT(job_id) DO NOTHING`).bind(snapshot.inputHash,frontier,at,job.id,job.lease_owner,job.attempts,now())
 ]);
 const saved=await db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first();if(!saved)throw failure('research_model_not_fixed');return saved;
}
export async function runFrozenResearchBacktest({db,bucket,job,manifestKey,onStage=()=>{}}){
 const fixed=await db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first();if(!fixed||fixed.input_hash!==job.input_hash)throw failure('research_input_mismatch');
 const model=JSON.parse(fixed.model_json);if(fingerprintModel(model)!==fixed.model_fingerprint)throw failure('research_model_hash_mismatch');
 const input=await openFrozenStoreHistory({bucket,manifestKey}),days=[];for await(const day of input.days)if(day.date<=fixed.frontier_date)days.push(day);
 onStage('research:dataset-begin');const dataset=buildWalkForwardDataset({storeId:job.store_id,days,minHistoryDays:4}),split=splitChronologicalSamples(dataset.samples);onStage('research:dataset-complete');
 const base={storeId:job.store_id,modelFingerprint:fixed.model_fingerprint,model,featureVersion:fixed.feature_version,frontierDate:fixed.frontier_date,datasetHash:dataset.inputHash,datasetVersion:dataset.datasetVersion,outcomeProxyVersion:dataset.outcomeProxyVersion,holdoutSealed:true,holdoutDates:[...split.holdoutDates]};
 if(!split.train.length||!split.validation.length||!split.holdout.length)return{analysis:{...base,status:'insufficient_data',splits:[],sourceResultHash:hashCanonical({storeId:job.store_id,modelFingerprint:fixed.model_fingerprint,status:'insufficient_data',inputHash:dataset.inputHash})},inputHash:input.inputHash};
 const trainScore=evaluateModel(split.train,model),validationScore=evaluateModel(split.validation,model);onStage('research:evaluation-complete');
 const splits=[['train',split.train,trainScore,split.trainDates],['validation',split.validation,validationScore,split.validationDates]].map(([splitKind,rows,score,dates])=>({splitKind,fromDate:dates[0],toDate:dates.at(-1),score,inputHash:hashCanonical({dataset:dataset.inputHash,split:splitKind,dates}),rows:rankSplit(rows,model).map(r=>({targetDate:r.targetDate,machineKey:r.machineKey,rank:r.rank,score:r.predictionScore,outcomeScore:r.outcomeScore,details:{strong:Boolean(r.strong),outcomeProxyVersion:r.outcomeProxyVersion}}))}));
 return{analysis:{...base,status:'backtested',trainScore,validationScore,splits,sourceResultHash:hashCanonical({storeId:job.store_id,modelFingerprint:fixed.model_fingerprint,datasetHash:dataset.inputHash,trainScore,validationScore})},inputHash:input.inputHash};
}
export async function researchBacktestWrites({db,job,feature,key,at,now=Date.now,onStage=()=>{}}){
 const fixed=await db.prepare('SELECT * FROM sites_research_job_inputs WHERE job_id=?').bind(job.id).first();
 if(!fixed||feature.storeId!==job.store_id||feature.modelFingerprint!==fixed.model_fingerprint||fingerprintModel(feature.model)!==fixed.model_fingerprint||feature.frontierDate!==fixed.frontier_date||feature.featureVersion!==fixed.feature_version||feature.holdoutSealed!==true||!['backtested','insufficient_data'].includes(feature.status))throw failure('research_result_invalid');
 const staged=await stageBacktestRows({db,job,feature,now,onStage});
 const statements=[],owned="EXISTS(SELECT 1 FROM sites_analysis_jobs j WHERE j.id=? AND j.state='succeeded' AND j.result_key=? AND j.attempts=?)",own=[job.id,key,job.attempts];
 for(const part of feature.splits){
  if(!['train','validation'].includes(part.splitKind)||!Array.isArray(part.rows))throw failure('research_result_invalid');
  const identity=[job.store_id,feature.modelFingerprint,feature.featureVersion,part.splitKind,part.inputHash],where='store_id=? AND model_fingerprint=? AND feature_version=? AND split_kind=? AND input_hash=?';
  statements.push(db.prepare(`INSERT OR IGNORE INTO backtest_runs(store_id,model_fingerprint,model_json,feature_version,split_kind,from_date,to_date,prediction_count,score_json,input_hash,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${owned}`).bind(job.store_id,feature.modelFingerprint,canonicalJson(feature.model),feature.featureVersion,part.splitKind,part.fromDate,part.toDate,part.rows.length,canonicalJson(part.score),part.inputHash,at,...own));
  statements.push(db.prepare(`INSERT INTO sites_backtest_publications(run_id,job_id) SELECT id,? FROM backtest_runs WHERE ${where} AND ${owned} ON CONFLICT(run_id) DO UPDATE SET job_id=excluded.job_id WHERE excluded.job_id>sites_backtest_publications.job_id`).bind(job.id,...identity,...own));
  const publish=`${owned} AND EXISTS(SELECT 1 FROM sites_backtest_publications p WHERE p.run_id=(SELECT id FROM backtest_runs WHERE ${where}) AND p.job_id=?)`,bind=[...own,...identity,job.id];
  statements.push(db.prepare(`UPDATE backtest_runs SET model_json=?,from_date=?,to_date=?,prediction_count=?,score_json=?,created_at=? WHERE ${where} AND ${publish}`).bind(canonicalJson(feature.model),part.fromDate,part.toDate,part.rows.length,canonicalJson(part.score),at,...identity,...bind));
  statements.push(db.prepare(`DELETE FROM backtest_predictions WHERE run_id=(SELECT id FROM backtest_runs WHERE ${where}) AND ${publish}`).bind(...identity,...bind));
  if(staged)statements.push(db.prepare(`INSERT INTO backtest_predictions(run_id,target_date,machine_key,rank,score,outcome_score,details_json) SELECT (SELECT id FROM backtest_runs WHERE ${where}),target_date,machine_key,rank,score,outcome_score,details_json FROM sites_backtest_stage_rows WHERE job_id=? AND split_kind=? AND ${publish} ORDER BY ordinal`).bind(...identity,job.id,part.splitKind,...bind));
  else for(const row of part.rows)statements.push(db.prepare(`INSERT INTO backtest_predictions(run_id,target_date,machine_key,rank,score,outcome_score,details_json) SELECT (SELECT id FROM backtest_runs WHERE ${where}),?,?,?,?,?,? WHERE ${publish}`).bind(...identity,row.targetDate,row.machineKey,row.rank,row.score,row.outcomeScore,canonicalJson(row.details),...bind));
 }
 if(staged)statements.push(db.prepare(`DELETE FROM sites_backtest_stage_rows WHERE job_id=? AND ${owned}`).bind(job.id,...own),db.prepare(`DELETE FROM sites_backtest_stage_parts WHERE job_id=? AND ${owned}`).bind(job.id,...own));
 return statements;
}
