import {runExistingStoreDayJudgement} from '../../analysis/runtime-adapter.mjs';
import {buildStoreReadPayload} from '../store-read-output.mjs';
import {scoreFormalTargetDay} from './formal-evaluation.mjs';
import {loadFormalModelSnapshot,migrateFormalModelStore} from './formal-model-store.mjs';
import {loadFormalPrediction,persistFormalPrediction} from './formal-prediction-store.mjs';
import {loadTrialRecord,migratePreV2TrialStore} from './trial-store.mjs';
import {operationalTargetDate,isProspectivePrediction,sameCandidateSet,createRunClock} from '../prediction-policy.mjs';
import {loadEvaluationDay,saveEvaluationState,readEvaluationState,evaluationInputVersion} from '../evaluation-state.mjs';

function requireDb(db){if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('database handle is required');return db}
function requireText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function requireDate(value,name){const text=requireText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function nextDate(date){const d=new Date(`${requireDate(date,'date')}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}

function canonicalDaysThrough(days,throughDate){
  if(!Array.isArray(days)||!days.length)throw new TypeError('days are required');
  const through=requireDate(throughDate,'throughDate');
  const filtered=days.filter(day=>day&&String(day.date||'')<=through).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!filtered.length||String(filtered.at(-1)?.date||'')!==through)throw new Error(`throughDate is not present in canonical days: ${through}`);
  return filtered;
}
function reloadCanonicalDays(db,storeId,days){
  const dayStmt=db.prepare('SELECT source_hash,normalized_payload_hash,created_at,updated_at FROM store_days WHERE store_id=? AND business_date=?');
  const rowStmt=db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key');
  return days.map(day=>{const saved=dayStmt.get(storeId,day.date);return saved?{...day,sourceHash:saved.source_hash,normalizedHash:saved.normalized_payload_hash,observedAt:saved.created_at,updatedAt:saved.updated_at,machines:rowStmt.all(storeId,day.date).map(r=>JSON.parse(r.payload_json))}:day});
}

function runningTrial(db,{storeId,lineageId}){
  const row=db.prepare(`
    SELECT trial_number FROM pre_v2_formal_trials
     WHERE store_id=? AND lineage_id=? AND status='running'
     ORDER BY trial_number DESC LIMIT 1
  `).get(storeId,lineageId);
  return row?loadTrialRecord(db,{storeId,lineageId,trialNumber:Number(row.trial_number)}):null;
}

function outstandingPredictionTarget(db,{storeId,lineageId,trialNumber,lastTargetDate=null}){
  const rows=db.prepare(`
    SELECT target_date,COUNT(*) AS n
      FROM pre_v2_formal_predictions
     WHERE store_id=? AND lineage_id=? AND trial_number=?
       AND (? IS NULL OR target_date>?)
     GROUP BY target_date
     ORDER BY target_date ASC
  `).all(storeId,lineageId,trialNumber,lastTargetDate,lastTargetDate);
  if(!rows.length)return null;
  if(rows.length!==1)throw new Error('formal trial has multiple outstanding prediction targets');
  if(Number(rows[0].n)!==2)throw new Error(`formal trial has incomplete prediction pair for ${rows[0].target_date}`);
  return String(rows[0].target_date);
}

function storeIdentity(db,storeId){
  const row=db.prepare('SELECT id,name FROM stores WHERE id=?').get(storeId);
  if(!row)throw new Error(`store not found: ${storeId}`);
  return{storeId:String(row.id),shop:requireText(row.name,'store.name')};
}

function predictionFromPayload({payload,role,modelFingerprint,sourceFrontierDate}){
  if(!payload||payload.status!=='ready'||!Array.isArray(payload.rankings)||!payload.rankings.length)throw new Error(`${role} formal prediction is unavailable`);
  return{
    role,
    modelFingerprint,
    targetDate:payload.targetDate,
    sourceFrontierDate,
    rankings:payload.rankings,
  };
}

function sameMachineSet(a,b){
  const aa=a.map(row=>String(row.machineKey)).sort();
  const bb=b.map(row=>String(row.machineKey)).sort();
  return aa.length===bb.length&&aa.every((value,index)=>value===bb[index]);
}

function freezeNextPredictionPair(db,{record,days,frontierDate,nowIso,targetDate=null,clock=null}){
  const trial=record.trial;
  const key={storeId:trial.storeId,lineageId:trial.lineageId,trialNumber:trial.trialNumber};
  const champion=loadFormalModelSnapshot(db,{...key,role:'champion'});
  const challenger=loadFormalModelSnapshot(db,{...key,role:'challenger'});
  if(!champion||!challenger)throw new Error('formal model snapshots are incomplete');
  if(champion.featureVersion!==challenger.featureVersion)throw new Error('formal model feature version mismatch');

  let championPayload,challengerPayload,createdAt=nowIso;
  for(let attempt=0;attempt<3;attempt++){
  championPayload=buildStoreReadPayload({
    storeId:trial.storeId,modelFingerprint:champion.modelFingerprint,model:champion.model,
    featureVersion:champion.featureVersion,frontierDate,days,
    targetDate,
  });
  challengerPayload=buildStoreReadPayload({
    storeId:trial.storeId,modelFingerprint:challenger.modelFingerprint,model:challenger.model,
    featureVersion:challenger.featureVersion,frontierDate,days,
    targetDate,
  });
  if(!clock)break;
  createdAt=clock();const future=operationalTargetDate({frontierDate,nowIso:createdAt});
  if(future===targetDate)break;
  targetDate=future;if(attempt===2)throw new Error('formal prediction deadline changed repeatedly');
  }
  if(championPayload.targetDate!==challengerPayload.targetDate)throw new Error('formal prediction target mismatch');
  if(!sameMachineSet(championPayload.rankings,challengerPayload.rankings))throw new Error('formal Champion and Challenger must rank the exact same machine set for each target day');

  const championPrediction=predictionFromPayload({payload:championPayload,role:'champion',modelFingerprint:champion.modelFingerprint,sourceFrontierDate:frontierDate});
  const challengerPrediction=predictionFromPayload({payload:challengerPayload,role:'challenger',modelFingerprint:challenger.modelFingerprint,sourceFrontierDate:frontierDate});

  db.exec('BEGIN IMMEDIATE;');
  try{
    if(clock){createdAt=clock();if(!isProspectivePrediction({targetDate:championPayload.targetDate,sourceFrontierDate:frontierDate,createdAt}))throw new Error('formal prospective prediction deadline passed while acquiring storage')}
    const savedChampion=persistFormalPrediction(db,{trial,prediction:championPrediction,nowIso:createdAt});
    const savedChallenger=persistFormalPrediction(db,{trial,prediction:challengerPrediction,nowIso:createdAt});
    if(clock&&!isProspectivePrediction({targetDate:championPayload.targetDate,sourceFrontierDate:frontierDate,createdAt:clock()}))throw new Error('formal prospective prediction deadline passed before commit');
    db.exec('COMMIT;');
    return{targetDate:championPayload.targetDate,championPrediction:savedChampion.row,challengerPrediction:savedChallenger.row};
  }catch(error){
    try{db.exec('ROLLBACK;')}catch{}
    throw error;
  }
}

export async function advanceFormalLiveTrialDay(db,{
  storeId,
  lineageId='pre-v2-live',
  days,
  throughDate,
  rootDir,
  nowIso=new Date().toISOString(),
  judgementRunner=runExistingStoreDayJudgement,
  operational=false,
}={}){
  requireDb(db);
  const store=requireText(storeId,'storeId'),lineage=requireText(lineageId,'lineageId'),through=requireDate(throughDate,'throughDate');
  const canonical=canonicalDaysThrough(days,through);
  const clock=createRunClock(nowIso);
  migratePreV2TrialStore(db);migrateFormalModelStore(db);

  let record=runningTrial(db,{storeId:store,lineageId:lineage});
  if(!record)return Object.freeze({reason:'no_running_trial',scoredTargetDate:null,nextTargetDate:null,trial:null});

  const key={storeId:store,lineageId:lineage,trialNumber:record.trial.trialNumber};
  const series=`formal:${lineage}:${key.trialNumber}`;
  if(operational){
    // Evidence has its own existing atomic transaction. Recover the publication
    // marker if the worker died after that transaction and before marking complete.
    const interrupted=db.prepare(`SELECT e.target_date,e.details_json
      FROM prediction_evaluation_state e JOIN pre_v2_formal_trial_days t
      ON t.store_id=e.store_id AND t.target_date=e.target_date AND t.lineage_id=? AND t.trial_number=?
      WHERE e.store_id=? AND e.series=? AND e.state='evaluating'`).all(lineage,key.trialNumber,store,series);
    for(const row of interrupted){
      const same=JSON.parse(row.details_json).inputVersion===evaluationInputVersion(db,{storeId:store,targetDate:row.target_date});
      db.prepare(`UPDATE prediction_evaluation_state SET state=?,reason=?,updated_at=? WHERE store_id=? AND target_date=? AND series=?`)
        .run(same?'complete':'corrected',same?null:'formal_outcome_corrected',clock(),store,row.target_date,series);
    }
    const processed=db.prepare('SELECT target_date FROM pre_v2_formal_trial_days WHERE store_id=? AND lineage_id=? AND trial_number=? ORDER BY target_date').all(store,lineage,key.trialNumber);
    for(const row of processed){
      const pair=['champion','challenger'].map(role=>loadFormalPrediction(db,{...key,targetDate:row.target_date,role}));
      const marker=readEvaluationState(db,{storeId:store,targetDate:row.target_date,series});
      const reason=pair.some(p=>!p||!isProspectivePrediction(p))?'historical_prediction':!marker?'legacy_evaluation_unverified':marker.state==='complete'&&marker.details.inputVersion!==evaluationInputVersion(db,{storeId:store,targetDate:row.target_date})?'formal_outcome_corrected':null;
      if(reason){saveEvaluationState(db,{storeId:store,targetDate:row.target_date,series,state:reason==='formal_outcome_corrected'?'corrected':'historical',reason,nowIso:clock()});return{reason,scoredTargetDate:null,nextTargetDate:null,trial:record}}
      if(marker.state==='historical')return{reason:marker.reason,scoredTargetDate:null,nextTargetDate:null,trial:record};
    }
    if(db.prepare("SELECT 1 FROM prediction_evaluation_state WHERE store_id=? AND series=? AND state='corrected'").get(store,series))return{reason:'formal_outcome_corrected',scoredTargetDate:null,nextTargetDate:null,trial:record};
  }
  const pending=outstandingPredictionTarget(db,{...key,lastTargetDate:record.trial.lastTargetDate??null});
  if(pending&&pending>through){
    return Object.freeze({reason:'waiting_for_target',scoredTargetDate:null,nextTargetDate:pending,trial:record});
  }

  let scoredTargetDate=null;
  if(pending){
    let outcome=null;
    if(operational){
      outcome=loadEvaluationDay(db,{storeId:store,targetDate:pending,nowIso});
      const predictions=['champion','challenger'].map(role=>loadFormalPrediction(db,{...key,targetDate:pending,role}));
      const reason=predictions.some(p=>!isProspectivePrediction(p))?'historical_prediction':outcome.state!=='ready'?outcome.reason:
        predictions.some(p=>!sameCandidateSet(p.rankings,outcome.machines))?'machine_identity_changed':null;
      if(reason){saveEvaluationState(db,{storeId:store,targetDate:pending,series,state:reason==='historical_prediction'?'historical':outcome.state==='waiting_result'?'waiting_result':'data_insufficient',reason,normalizedHash:outcome.day?.normalized_payload_hash,nowIso});return{reason,scoredTargetDate:null,nextTargetDate:pending,trial:record}}
    }
    const eligible=canonical.filter(day=>String(day.date||'')<=pending);
    const truthDays=operational?reloadCanonicalDays(db,store,eligible):eligible;
    if(!truthDays.some(day=>String(day.date||'')===pending))throw new Error(`frozen formal target is missing from canonical days: ${pending}`);
    const identity=storeIdentity(db,store);
    const judged=await judgementRunner({rootDir,shop:identity.shop,sourceStoreId:identity.storeId,days:truthDays,targetDate:pending});
    if(!judged||String(judged.date||'')!==pending||!Array.isArray(judged.rows))throw new Error(`formal judgement runner did not return exact target ${pending}`);
    if(operational){
      const byKey=new Map(outcome.machines.map(row=>[String(row.tableNo??row.table_no),row]));
      const matching=judged.rows.length===outcome.machines.length&&new Set(judged.rows.map(row=>String(row.tableNo))).size===judged.rows.length&&judged.rows.every(row=>byKey.get(String(row.tableNo))?.machine===row.machine);
      const reason=evaluationInputVersion(db,{storeId:store,targetDate:pending})!==outcome.inputVersion?'outcome_changed_during_evaluation':!matching?'judged_machine_identity_changed':null;
      if(reason){saveEvaluationState(db,{storeId:store,targetDate:pending,series,state:'data_insufficient',reason,nowIso});return{reason,scoredTargetDate:null,nextTargetDate:pending,trial:record}}
      saveEvaluationState(db,{storeId:store,targetDate:pending,series,state:'evaluating',normalizedHash:outcome.day.normalized_payload_hash,outcomeHash:outcome.outcomeInputHash,details:{inputVersion:outcome.inputVersion},nowIso:clock()});
    }
    // Keep the protected scorer/transaction implementation unchanged. Its actual
    // write-lock acquisition is the last safe point to verify the outcome version.
    const scoringDb=operational?{
      prepare:db.prepare.bind(db),
      exec(sql){
        const result=db.exec(sql);
        if(/^\s*BEGIN IMMEDIATE\s*;?\s*$/i.test(sql)&&evaluationInputVersion(db,{storeId:store,targetDate:pending})!==outcome.inputVersion){
          db.exec('ROLLBACK;');throw Object.assign(new Error('outcome changed while acquiring formal storage'),{code:'formal_outcome_changed_before_commit'});
        }
        return result;
      }
    }:db;
    let scored;
    try{scored=scoreFormalTargetDay(scoringDb,{...key,targetDate:pending,judgedRows:judged.rows,nowIso:operational?clock():nowIso})}
    catch(error){
      if(error.code!=='formal_outcome_changed_before_commit')throw error;
      saveEvaluationState(db,{storeId:store,targetDate:pending,series,state:'data_insufficient',reason:'outcome_changed_during_evaluation',nowIso:clock()});
      return{reason:'outcome_changed_during_evaluation',scoredTargetDate:null,nextTargetDate:pending,trial:record};
    }
    if(operational)saveEvaluationState(db,{storeId:store,targetDate:pending,series,state:'complete',normalizedHash:outcome.day.normalized_payload_hash,outcomeHash:outcome.outcomeInputHash,details:{inputVersion:outcome.inputVersion},nowIso:clock()});
    record=scored.trial;
    scoredTargetDate=pending;
    if(record.trial.status!=='running'){
      return Object.freeze({reason:record.trial.status,scoredTargetDate,nextTargetDate:null,trial:record});
    }
  }

  const stillPending=outstandingPredictionTarget(db,{...key,lastTargetDate:record.trial.lastTargetDate??null});
  if(stillPending){
    return Object.freeze({reason:'waiting_for_target',scoredTargetDate,nextTargetDate:stillPending,trial:record});
  }

  const completedAt=operational?clock():nowIso;
  const next=operational?operationalTargetDate({frontierDate:through,nowIso:completedAt}):nextDate(through);
  const frozen=freezeNextPredictionPair(db,{record,days:operational?reloadCanonicalDays(db,store,canonical):canonical,frontierDate:through,nowIso:completedAt,targetDate:next,clock:operational?clock:null});
  if(!operational&&frozen.targetDate!==next)throw new Error(`formal next target mismatch: expected ${next}, got ${frozen.targetDate}`);
  return Object.freeze({reason:scoredTargetDate?'advanced':'prediction_frozen',scoredTargetDate,nextTargetDate:frozen.targetDate,trial:record});
}

export const __test={canonicalDaysThrough,outstandingPredictionTarget,freezeNextPredictionPair,nextDate};
