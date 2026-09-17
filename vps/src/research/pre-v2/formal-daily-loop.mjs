import {runExistingStoreDayJudgement} from '../../analysis/runtime-adapter.mjs';
import {buildStoreReadPayload} from '../store-read-output.mjs';
import {scoreFormalTargetDay} from './formal-evaluation.mjs';
import {loadFormalModelSnapshot,migrateFormalModelStore} from './formal-model-store.mjs';
import {loadFormalPrediction,persistFormalPrediction} from './formal-prediction-store.mjs';
import {loadTrialRecord,migratePreV2TrialStore} from './trial-store.mjs';

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

function freezeNextPredictionPair(db,{record,days,frontierDate,nowIso}){
  const trial=record.trial;
  const key={storeId:trial.storeId,lineageId:trial.lineageId,trialNumber:trial.trialNumber};
  const champion=loadFormalModelSnapshot(db,{...key,role:'champion'});
  const challenger=loadFormalModelSnapshot(db,{...key,role:'challenger'});
  if(!champion||!challenger)throw new Error('formal model snapshots are incomplete');
  if(champion.featureVersion!==challenger.featureVersion)throw new Error('formal model feature version mismatch');

  const championPayload=buildStoreReadPayload({
    storeId:trial.storeId,modelFingerprint:champion.modelFingerprint,model:champion.model,
    featureVersion:champion.featureVersion,frontierDate,days,
  });
  const challengerPayload=buildStoreReadPayload({
    storeId:trial.storeId,modelFingerprint:challenger.modelFingerprint,model:challenger.model,
    featureVersion:challenger.featureVersion,frontierDate,days,
  });
  if(championPayload.targetDate!==challengerPayload.targetDate)throw new Error('formal prediction target mismatch');
  if(!sameMachineSet(championPayload.rankings,challengerPayload.rankings))throw new Error('formal Champion and Challenger must rank the exact same machine set for each target day');

  const championPrediction=predictionFromPayload({payload:championPayload,role:'champion',modelFingerprint:champion.modelFingerprint,sourceFrontierDate:frontierDate});
  const challengerPrediction=predictionFromPayload({payload:challengerPayload,role:'challenger',modelFingerprint:challenger.modelFingerprint,sourceFrontierDate:frontierDate});

  db.exec('BEGIN IMMEDIATE;');
  try{
    const savedChampion=persistFormalPrediction(db,{trial,prediction:championPrediction,nowIso});
    const savedChallenger=persistFormalPrediction(db,{trial,prediction:challengerPrediction,nowIso});
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
}={}){
  requireDb(db);
  const store=requireText(storeId,'storeId'),lineage=requireText(lineageId,'lineageId'),through=requireDate(throughDate,'throughDate');
  const canonical=canonicalDaysThrough(days,through);
  migratePreV2TrialStore(db);migrateFormalModelStore(db);

  let record=runningTrial(db,{storeId:store,lineageId:lineage});
  if(!record)return Object.freeze({reason:'no_running_trial',scoredTargetDate:null,nextTargetDate:null,trial:null});

  const key={storeId:store,lineageId:lineage,trialNumber:record.trial.trialNumber};
  const pending=outstandingPredictionTarget(db,{...key,lastTargetDate:record.trial.lastTargetDate??null});
  if(pending&&pending>through){
    return Object.freeze({reason:'waiting_for_target',scoredTargetDate:null,nextTargetDate:pending,trial:record});
  }

  let scoredTargetDate=null;
  if(pending){
    const truthDays=canonical.filter(day=>String(day.date||'')<=pending);
    if(!truthDays.some(day=>String(day.date||'')===pending))throw new Error(`frozen formal target is missing from canonical days: ${pending}`);
    const identity=storeIdentity(db,store);
    const judged=await judgementRunner({rootDir,shop:identity.shop,sourceStoreId:identity.storeId,days:truthDays,targetDate:pending});
    if(!judged||String(judged.date||'')!==pending||!Array.isArray(judged.rows))throw new Error(`formal judgement runner did not return exact target ${pending}`);
    const scored=scoreFormalTargetDay(db,{...key,targetDate:pending,judgedRows:judged.rows,nowIso});
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

  const next=nextDate(through);
  const frozen=freezeNextPredictionPair(db,{record,days:canonical,frontierDate:through,nowIso});
  if(frozen.targetDate!==next)throw new Error(`formal next target mismatch: expected ${next}, got ${frozen.targetDate}`);
  return Object.freeze({reason:scoredTargetDate?'advanced':'prediction_frozen',scoredTargetDate,nextTargetDate:frozen.targetDate,trial:record});
}

export const __test={canonicalDaysThrough,outstandingPredictionTarget,freezeNextPredictionPair,nextDate};
