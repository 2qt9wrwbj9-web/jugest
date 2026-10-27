// Exact pure ranking and SQLite persistence helpers from the frozen BACKTEST worker.
import{scoreSample}from'../../upstream/vps/src/research/model-search.mjs';
import{canonicalJson}from'../../upstream/vps/src/canonical-json.mjs';
function rankSplit(rows,model){
  const byDate=new Map();for(const row of rows){if(!byDate.has(row.targetDate))byDate.set(row.targetDate,[]);byDate.get(row.targetDate).push(row)}
  const ranked=[];for(const targetDate of [...byDate.keys()].sort()){const day=[...byDate.get(targetDate)].map(row=>({...row,predictionScore:scoreSample(row,model)})).sort((a,b)=>b.predictionScore-a.predictionScore||a.machineKey.localeCompare(b.machineKey));day.forEach((row,index)=>ranked.push({...row,rank:index+1}))}return ranked;
}
function persistSplit(db,{storeId,modelFingerprint,model,featureVersion,splitKind,rows,score,inputHash,createdAt}){
  if(!rows.length)return null;
  const dates=[...new Set(rows.map(row=>row.targetDate))].sort(),fromDate=dates[0],toDate=dates.at(-1);
  let existing=db.prepare(`SELECT id FROM backtest_runs WHERE store_id=? AND model_fingerprint=? AND feature_version=? AND split_kind=? AND input_hash=? LIMIT 1`).get(storeId,modelFingerprint,featureVersion,splitKind,inputHash);
  let runId;
  if(existing){runId=Number(existing.id);db.prepare('DELETE FROM backtest_predictions WHERE run_id=?').run(runId);db.prepare(`UPDATE backtest_runs SET model_json=?,from_date=?,to_date=?,prediction_count=?,score_json=?,created_at=? WHERE id=?`).run(canonicalJson(model),fromDate,toDate,rows.length,canonicalJson(score),createdAt,runId)}
  else{const out=db.prepare(`INSERT INTO backtest_runs(store_id,model_fingerprint,model_json,feature_version,split_kind,from_date,to_date,prediction_count,score_json,input_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(storeId,modelFingerprint,canonicalJson(model),featureVersion,splitKind,fromDate,toDate,rows.length,canonicalJson(score),inputHash,createdAt);runId=Number(out.lastInsertRowid)}
  const insert=db.prepare('INSERT INTO backtest_predictions(run_id,target_date,machine_key,rank,score,outcome_score,details_json) VALUES(?,?,?,?,?,?,?)');
  for(const row of rankSplit(rows,model))insert.run(runId,row.targetDate,row.machineKey,row.rank,row.predictionScore,row.outcomeScore,canonicalJson({strong:Boolean(row.strong),outcomeProxyVersion:row.outcomeProxyVersion}));
  return runId;
}

export{rankSplit,persistSplit};
