import {buildWalkForwardDataset,splitChronologicalSamples} from './backtest.mjs';
import {evaluateModel,scoreSample} from './model-search.mjs';
import {canonicalJson,hashCanonical} from '../canonical-json.mjs';

function required(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function safeJson(text,fallback={}){try{return JSON.parse(text)}catch{return fallback}}
function rankRows(rows,model){
  const byDate=new Map();for(const row of rows){if(!byDate.has(row.targetDate))byDate.set(row.targetDate,[]);byDate.get(row.targetDate).push(row)}
  const out=[];for(const targetDate of [...byDate.keys()].sort()){const day=[...byDate.get(targetDate)].map(row=>({...row,predictionScore:scoreSample(row,model)})).sort((a,b)=>b.predictionScore-a.predictionScore||a.machineKey.localeCompare(b.machineKey));day.forEach((row,index)=>out.push({...row,rank:index+1}))}return out;
}
function better(a,b){if(!b)return true;for(const key of ['top3Lift','top5Lift','rankCorrelation']){const av=Number(a.score[key])||0,bv=Number(b.score[key])||0;if(av!==bv)return av>bv}return a.fingerprint.localeCompare(b.fingerprint)<0}
function persistHoldoutRun(db,{storeId,fingerprint,model,featureVersion,rows,score,datasetHash,dates,createdAt}){
  const inputHash=hashCanonical({datasetHash,split:'holdout',modelFingerprint:fingerprint,dates});
  const existing=db.prepare(`SELECT id FROM backtest_runs WHERE store_id=? AND model_fingerprint=? AND feature_version=? AND split_kind='holdout' AND input_hash=? LIMIT 1`).get(storeId,fingerprint,featureVersion,inputHash);
  let runId;
  if(existing){runId=Number(existing.id);db.prepare('DELETE FROM backtest_predictions WHERE run_id=?').run(runId);db.prepare('UPDATE backtest_runs SET score_json=?,prediction_count=?,created_at=? WHERE id=?').run(canonicalJson(score),rows.length,createdAt,runId)}
  else{const result=db.prepare(`INSERT INTO backtest_runs(store_id,model_fingerprint,model_json,feature_version,split_kind,from_date,to_date,prediction_count,score_json,input_hash,created_at) VALUES(?,?,?,?,'holdout',?,?,?,?,?,?)`).run(storeId,fingerprint,canonicalJson(model),featureVersion,dates[0]??null,dates.at(-1)??null,rows.length,canonicalJson(score),inputHash,createdAt);runId=Number(result.lastInsertRowid)}
  const insert=db.prepare('INSERT INTO backtest_predictions(run_id,target_date,machine_key,rank,score,outcome_score,details_json) VALUES(?,?,?,?,?,?,?)');
  for(const row of rankRows(rows,model))insert.run(runId,row.targetDate,row.machineKey,row.rank,row.predictionScore,row.outcomeScore,canonicalJson({strong:Boolean(row.strong),outcomeProxyVersion:row.outcomeProxyVersion,sealedHoldout:true}));
  return runId;
}

export function finalizeSealedHoldout(db,{storeId,days,frontierDate,nowIso=new Date().toISOString()}={}){
  if(!db?.prepare||!db?.exec)throw new TypeError('db is required');
  const id=required(storeId,'storeId'),frontier=required(frontierDate,'frontierDate'),at=required(nowIso,'nowIso');
  const loop=db.prepare('SELECT * FROM research_loops WHERE store_id=?').get(id);
  if(!loop)throw Object.assign(new Error('research loop missing'),{code:'research_loop_missing'});
  if(loop.holdout_finalized_at&&loop.holdout_winner_fingerprint)return Object.freeze({winnerFingerprint:loop.holdout_winner_fingerprint,modelsEvaluated:0,holdoutDates:[],alreadyFinalized:true});
  if(loop.state!=='converged')throw Object.assign(new Error('sealed holdout is not unlocked before convergence'),{code:'holdout_not_unsealed'});
  if(loop.frontier_date&&loop.frontier_date!==frontier)throw Object.assign(new Error('holdout frontier is stale'),{code:'holdout_frontier_mismatch'});
  const eligible=[...(Array.isArray(days)?days:[])].filter(day=>String(day?.date||'')<=frontier);
  const dataset=buildWalkForwardDataset({storeId:id,days:eligible,minHistoryDays:4}),split=splitChronologicalSamples(dataset.samples);
  if(!split.holdout.length)throw Object.assign(new Error('sealed holdout has insufficient data'),{code:'holdout_insufficient_data'});
  const models=db.prepare("SELECT fingerprint,model_json,score_json FROM research_model_registry WHERE store_id=? AND status IN ('historical','research_champion') ORDER BY generation ASC,fingerprint ASC").all(id);
  if(!models.length)throw Object.assign(new Error('no historical champions to evaluate'),{code:'holdout_models_missing'});
  const evaluations=models.map(row=>{const model=safeJson(row.model_json,null);if(!model)throw new Error(`invalid model json: ${row.fingerprint}`);return {fingerprint:row.fingerprint,model,previousScores:safeJson(row.score_json,{}),score:evaluateModel(split.holdout,model)}});
  let winner=null;for(const evaluation of evaluations)if(better(evaluation,winner))winner=evaluation;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const evaluation of evaluations){
      persistHoldoutRun(db,{storeId:id,fingerprint:evaluation.fingerprint,model:evaluation.model,featureVersion:loop.feature_version,rows:split.holdout,score:evaluation.score,datasetHash:dataset.inputHash,dates:split.holdoutDates,createdAt:at});
      db.prepare('UPDATE research_model_registry SET holdout_score=?,score_json=?,updated_at=? WHERE store_id=? AND fingerprint=?').run(evaluation.score.top3Lift,canonicalJson({...evaluation.previousScores,holdout:evaluation.score,holdoutDatasetHash:dataset.inputHash}),at,id,evaluation.fingerprint);
    }
    db.prepare("UPDATE research_model_registry SET status='historical',updated_at=? WHERE store_id=? AND status='research_champion'").run(at,id);
    db.prepare("UPDATE research_model_registry SET status='research_champion',updated_at=? WHERE store_id=? AND fingerprint=?").run(at,id,winner.fingerprint);
    db.prepare(`UPDATE research_loops SET current_fingerprint=?,best_fingerprint=?,holdout_finalized_at=?,holdout_winner_fingerprint=?,updated_at=? WHERE store_id=?`).run(winner.fingerprint,winner.fingerprint,at,winner.fingerprint,at,id);
    db.exec('COMMIT');
  }catch(error){try{db.exec('ROLLBACK')}catch{}throw error}
  return Object.freeze({winnerFingerprint:winner.fingerprint,modelsEvaluated:evaluations.length,holdoutDates:Object.freeze([...split.holdoutDates]),alreadyFinalized:false,scores:Object.freeze(evaluations.map(row=>Object.freeze({fingerprint:row.fingerprint,score:row.score})))});
}

export const __test={better,persistHoldoutRun,rankRows};
