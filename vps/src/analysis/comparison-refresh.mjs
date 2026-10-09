import {scoreLiveComparisonDay} from '../research/live-comparison.mjs';
import {loadEvaluationDay,saveEvaluationState,readEvaluationState,evaluationInputVersion} from '../research/evaluation-state.mjs';
import {listLivePredictions} from '../research/live-comparison.mjs';
import {describePredictionOutcome} from '../research/prediction-performance.mjs';

function loadCanonicalOutcome(db,args){const outcome=loadEvaluationDay(db,args);return outcome.state==='ready'?outcome:null}

export function scoreAvailableComparisonDays(db,{storeId,throughDate,nowIso=new Date().toISOString()}={}){
  if(!db?.prepare||!storeId||!/^\d{4}-\d{2}-\d{2}$/.test(throughDate)||!Number.isFinite(Date.parse(nowIso)))throw new TypeError('db, storeId, throughDate and nowIso are required');
  const targets=db.prepare(`SELECT p.target_date,MAX(p.id) max_id,d.normalized_payload_hash
    FROM store_prediction_snapshots p LEFT JOIN store_days d ON d.store_id=p.store_id AND d.business_date=p.target_date
    WHERE p.store_id=? AND p.target_date<=? GROUP BY p.target_date ORDER BY p.target_date`).all(storeId,throughDate);
  let scored=0,excluded=0;const rows=[];
  for(const target of targets){
    const targetDate=target.target_date,previous=readEvaluationState(db,{storeId,targetDate});
    const inputVersion=evaluationInputVersion(db,{storeId,targetDate});
    if(previous&&['complete','corrected','historical'].includes(previous.state)&&previous.details.inputVersion===inputVersion&&previous.details.lastPredictionId===target.max_id){
      const paired=previous.state==='complete'&&!previous.details.comparisonReason;
      if(paired)scored++;else excluded++;
      rows.push({targetDate,status:paired?'scored':'excluded',reason:previous.reason||previous.details.comparisonReason,cached:true});continue;
    }
    const outcome=loadEvaluationDay(db,{storeId,targetDate,nowIso});
    if(outcome.state!=='ready'){
      saveEvaluationState(db,{storeId,targetDate,state:outcome.state,reason:outcome.reason,normalizedHash:outcome.day?.normalized_payload_hash??null,details:{integrity:outcome.check??null,lastPredictionId:target.max_id},nowIso});
      excluded++;rows.push({targetDate,status:'excluded',reason:outcome.reason});continue;
    }
    const comparison=scoreLiveComparisonDay(db,{storeId,targetDate,outcomeRows:outcome.outcomeRows,outcomeInputHash:outcome.outcomeInputHash,nowIso,operational:true});
    const reason=comparison.excludedReason,hasScore=Object.keys(comparison.scores).length>0;
    const state=reason==='outcome_hash_conflict'?'corrected':reason==='historical_prediction'?'historical':hasScore?'complete':'data_insufficient';
    const performance={};
    if(state==='complete')for(const p of listLivePredictions(db,{storeId,targetDate}))if(comparison.scores[p.engine]?.predictionId===p.id)performance[p.engine]=describePredictionOutcome(p.rankings,outcome.machines);
    saveEvaluationState(db,{storeId,targetDate,state,reason:hasScore?null:reason,normalizedHash:outcome.day.normalized_payload_hash,outcomeHash:outcome.outcomeInputHash,
      details:{lastPredictionId:target.max_id,inputVersion:outcome.inputVersion,comparisonReason:reason,winner:comparison.winner,performance},nowIso});
    if(reason){excluded++;rows.push({targetDate,status:'excluded',reason})}
    else{scored++;rows.push({targetDate,status:'scored',winner:comparison.winner,outcomeInputHash:outcome.outcomeInputHash})}
  }
  return Object.freeze({storeId,throughDate,scored,excluded,rows:Object.freeze(rows)});
}
export const __test={loadCanonicalOutcome};
