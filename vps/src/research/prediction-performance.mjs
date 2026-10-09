import {isProspectivePrediction,businessDateAt} from './prediction-policy.mjs';
import {evaluationInputVersion} from './evaluation-state.mjs';
import {loadFormalPrediction} from './pre-v2/formal-prediction-store.mjs';
import {missingMachineCount} from '../ingest/day-integrity.mjs';
const ENGINES=['current_shadow','pre_research'],TOP=[1,3,5,10];
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const stratum=row=>`${row.sourceMachineName??row.machineName??row.machine}|${row.games<2000?'low':row.games<5000?'medium':'high'}`;

// Descriptive observation only. Existing ranking/scorer/adoption formulas are unchanged.
export function describePredictionOutcome(rankings,machines){
  const byKey=new Map(machines.map(row=>[String(row.tableNo??row.table_no),row]));
  const storeMean=mean(machines.map(row=>Number(row.diff))),groups=new Map();
  for(const row of machines){const k=stratum(row),xs=groups.get(k)||[];xs.push(Number(row.diff));groups.set(k,xs)}
  const top={};
  for(const k of TOP){
    const selected=rankings.slice(0,k).map(row=>byKey.get(String(row.tableNo))).filter(Boolean),diffs=selected.map(row=>Number(row.diff));
    const avg=mean(diffs),matched=mean(selected.map(row=>mean(groups.get(stratum(row)))));
    top[k]={count:selected.length,requestedCount:k,meanDiff:avg,positiveRate:mean(diffs.map(n=>n>0?1:0)),meanGames:mean(selected.map(row=>Number(row.games))),
      lowActivityCount:selected.filter(row=>row.games<2000).length,storeMean,storeDelta:avg===null?null:avg-storeMean,
      randomMean:storeMean,randomDelta:avg===null?null:avg-storeMean,matchedRandomMean:matched,matchedRandomDelta:avg===null?null:avg-matched};
  }
  return{candidateCount:machines.length,top};
}
function aggregate(rows,engine){
  const values=rows.map(row=>row.performance?.[engine]).filter(Boolean),top={};
  for(const k of TOP){
    const days=values.map(v=>v.top[k]).filter(v=>v?.meanDiff!==null),av=key=>mean(days.map(v=>v[key]).filter(Number.isFinite));
    const xs=days.map(v=>v.meanDiff),avg=mean(xs),variance=xs.length>1?xs.reduce((sum,n)=>sum+(n-avg)**2,0)/(xs.length-1):null;
    const half=variance===null?null:1.96*Math.sqrt(variance/xs.length);
    top[k]={days:days.length,selectedMachines:days.reduce((n,v)=>n+v.count,0),meanDiff:avg,positiveRate:av('positiveRate'),meanGames:av('meanGames'),
      storeDelta:av('storeDelta'),randomDelta:av('randomDelta'),matchedRandomDelta:av('matchedRandomDelta'),
      lowActivityCount:days.reduce((n,v)=>n+v.lowActivityCount,0),meanDiffInterval:half===null?null:[avg-half,avg+half]};
  }
  return{days:values.length,top};
}
export function buildPredictionPerformance(db,{storeId,nowIso=new Date().toISOString()}={}){
  const today=businessDateAt(nowIso);
  const snapshots=db.prepare(`SELECT id,target_date,engine,source_frontier_date,created_at,payload_hash FROM store_prediction_snapshots WHERE store_id=? ORDER BY target_date DESC,created_at,id`).all(storeId);
  const dates=new Map();
  for(const p of snapshots){
    const row=dates.get(p.target_date)||{targetDate:p.target_date,predictions:{}};
    if(!row.predictions[p.engine])row.predictions[p.engine]={id:p.id,createdAt:p.created_at,sourceFrontierDate:p.source_frontier_date,payloadHash:p.payload_hash,
      prospective:isProspectivePrediction({targetDate:p.target_date,sourceFrontierDate:p.source_frontier_date,createdAt:p.created_at})};
    dates.set(p.target_date,row);
  }
  const saved=db.prepare(`SELECT e.*,d.normalized_payload_hash current_hash FROM prediction_evaluation_state e LEFT JOIN store_days d ON d.store_id=e.store_id AND d.business_date=e.target_date WHERE e.store_id=? AND series='live'`).all(storeId);
  const states=new Map(saved.map(r=>[r.target_date,{...r,details:JSON.parse(r.details_json)}]));
  for(const day of db.prepare('SELECT business_date FROM store_days WHERE store_id=? ORDER BY business_date DESC').all(storeId))if(!dates.has(day.business_date))dates.set(day.business_date,{targetDate:day.business_date,predictions:{}});
  const rows=[...dates.values()].sort((a,b)=>b.targetDate.localeCompare(a.targetDate)).map(row=>{
    const e=states.get(row.targetDate),historical=Object.values(row.predictions).some(p=>!p.prospective);
    const changed=e?.state==='complete'&&e.details.inputVersion!==evaluationInputVersion(db,{storeId,targetDate:row.targetDate});
    const state=!Object.keys(row.predictions).length?'not_predicted':changed?'corrected':historical?'historical':e?.state??(row.targetDate>=today?'waiting_result':'not_evaluated');
    const performance=state==='complete'?e.details.performance??{}:{};
    return{...row,state,reason:changed?'outcome_hash_conflict':historical?'historical_prediction':e?.reason??null,
      comparisonReason:e?.details.comparisonReason??null,winner:state==='complete'?e?.details.winner??null:null,performance};
  });
  const closed=rows.filter(row=>row.targetDate<today),periods={};
  for(const [name,n] of [['7',7],['30',30],['90',90],['all',Infinity]]){
    const period=closed.slice(0,n),evaluated=period.filter(row=>Object.keys(row.performance).length),paired=evaluated.filter(row=>row.performance.current_shadow&&row.performance.pre_research);
    periods[name]={businessDays:period.length,fromDate:period.at(-1)?.targetDate??null,throughDate:period[0]?.targetDate??null,predictedDays:period.filter(r=>Object.values(r.predictions).some(p=>p.prospective)).length,
      evaluatedDays:evaluated.length,evaluatedMachines:evaluated.reduce((n,row)=>n+Math.max(...Object.values(row.performance).map(v=>v.candidateCount)),0),
      unavailableDays:period.length-evaluated.length,unavailableRate:period.length?(period.length-evaluated.length)/period.length:null,
      engines:Object.fromEntries(ENGINES.map(engine=>[engine,aggregate(evaluated,engine)])),
      paired:{days:paired.length,newWins:paired.filter(r=>r.winner==='pre_research').length,currentWins:paired.filter(r=>r.winner==='current_shadow').length,ties:paired.filter(r=>r.winner==='tie').length}};
  }
  const formalExists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pre_v2_formal_trials'").get();
  const formal=formalExists?db.prepare(`SELECT lineage_id,trial_number,status,state_json,updated_at FROM pre_v2_formal_trials WHERE store_id=? ORDER BY trial_number DESC LIMIT 10`).all(storeId).map(r=>{
    const series=`formal:${r.lineage_id}:${r.trial_number}`;
    const latest=db.prepare('SELECT state,reason,target_date,updated_at FROM prediction_evaluation_state WHERE store_id=? AND series=? ORDER BY updated_at DESC LIMIT 1').get(storeId,series);
    const held=db.prepare("SELECT state,reason,target_date FROM prediction_evaluation_state WHERE store_id=? AND series=? AND state IN ('historical','corrected','data_insufficient') ORDER BY updated_at DESC LIMIT 1").get(storeId,series);
    // A correction must be visible before the next job, including ended trials.
    // Keep the original evidence and adoption statistics intact; this is read-only.
    const processed=db.prepare(`SELECT t.target_date,e.state,e.reason,e.details_json
      FROM pre_v2_formal_trial_days t LEFT JOIN prediction_evaluation_state e
      ON e.store_id=t.store_id AND e.target_date=t.target_date AND e.series=?
      WHERE t.store_id=? AND t.lineage_id=? AND t.trial_number=? ORDER BY t.target_date DESC`).all(series,storeId,r.lineage_id,r.trial_number);
    let invalid=null,verifiedDays=0;
    for(const day of processed){
      const pair=['champion','challenger'].map(role=>loadFormalPrediction(db,{storeId,lineageId:r.lineage_id,trialNumber:r.trial_number,targetDate:day.target_date,role}));
      const version=day.details_json?JSON.parse(day.details_json).inputVersion:null;
      const reason=pair.some(p=>!p||!isProspectivePrediction(p))?'historical_prediction':!version?'legacy_evaluation_unverified':version!==evaluationInputVersion(db,{storeId,targetDate:day.target_date})?'formal_outcome_corrected':null;
      if(reason)invalid??={target_date:day.target_date,state:reason==='formal_outcome_corrected'?'corrected':'historical',reason};
      else if(day.state==='complete')verifiedDays++;
      else invalid??={target_date:day.target_date,state:day.state??'data_insufficient',reason:day.reason??'formal_publication_pending'};
    }
    const trial=JSON.parse(r.state_json),unverified=Number(trial.daysProcessed??0)>processed.length;
    return{lineageId:r.lineage_id,trialNumber:r.trial_number,status:r.status,trial,verifiedDays,updatedAt:r.updated_at,assessment:invalid??held??(unverified?{state:'historical',reason:'legacy_evaluation_unverified'}:latest??null)};
  }):[];
  const integrity=db.prepare('SELECT check_json FROM store_day_integrity WHERE store_id=? ORDER BY business_date DESC LIMIT 90').all(storeId).map(r=>JSON.parse(r.check_json));
  const known=integrity.filter(c=>c.expectedCount!==null),expected=known.reduce((n,c)=>n+c.expectedCount,0),missing=known.reduce((n,c)=>n+missingMachineCount(c),0);
  const forecasts=db.prepare("SELECT target_date,state,reason,updated_at FROM prediction_evaluation_state WHERE store_id=? AND series='forecast:pre_research' ORDER BY target_date DESC LIMIT 7").all(storeId).map(r=>({targetDate:r.target_date,state:r.state,reason:r.reason,updatedAt:r.updated_at}));
  return{storeId,asOf:nowIso,latestObservedDate:closed[0]?.targetDate??null,policy:'prospective-jst-v1',periods,rows:rows.slice(0,366),formal,forecasts,
    completeness:{observedDays:integrity.length,knownInventoryDays:known.length,unknownInventoryDays:integrity.length-known.length,expectedMachines:expected||null,missingMachines:missing,missingRate:expected?missing/expected:null,unknownDiff:integrity.reduce((n,c)=>n+c.missingFields.diff,0)},
    evidence:'通常成績は実測差枚。正式比較は既存JUGEST推定分布による順位評価（NDCG）。実設定は不明。',
    limitations:['プラス差枚は高設定を意味しない。低稼働ほど推定は不確実。','無作為差は同じ候補台集合から選ぶ場合の期待値。機種・実績稼働帯を揃えた差も参考値。','日ごとの平均を等しく重み付け。区間は日次平均の標準誤差による参考値で、連日相関を補正していない。','訂正日は元の採点を保存し最新集計から除外。正式統計の再採点・自動採用は行わない。']};
}
