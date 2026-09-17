import {hashCanonical} from '../../canonical-json.mjs';
import {fingerprintModel} from '../model-search.mjs';
import {buildStoreReadPayload,getActiveStoreModel} from '../store-read-output.mjs';
import {migrateFormalModelStore,persistFormalModelSnapshot} from './formal-model-store.mjs';
import {persistFormalPrediction,loadFormalPrediction} from './formal-prediction-store.mjs';
import {startFormalTrial} from './trial.mjs';
import {createTrialRecord,loadTrialRecord,nextTrialNumber} from './trial-store.mjs';

export const PRE_V2_SCORER_VERSION='pre-v2-score-v1';

function requireDb(db){
  if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('database handle is required');
  return db;
}
function requireText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function requireDate(value,name){const text=requireText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function requireIso(value){const text=requireText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be an ISO timestamp');return text}
function sameSet(a,b){if(a.length!==b.length)return false;const set=new Set(a);return b.every(key=>set.has(key))}
function parseModel(text,label){let model;try{model=JSON.parse(text)}catch{throw new Error(`${label} model JSON is invalid`)}if(!model||typeof model!=='object'||Array.isArray(model))throw new Error(`${label} model is invalid`);return model}
function targetPrediction(role,payload){
  return{
    role,
    modelFingerprint:payload.modelFingerprint,
    targetDate:payload.targetDate,
    sourceFrontierDate:payload.asOfDate,
    rankings:payload.rankings.map(row=>({
      machineKey:String(row.machineKey),
      tableNo:String(row.tableNo),
      machineName:String(row.machineName??''),
      rank:Number(row.rank),
      score:Number(row.score),
    })),
  };
}
function runningTrialRow(db,{storeId,lineageId}){
  return db.prepare(`
    SELECT trial_number
      FROM pre_v2_formal_trials
     WHERE store_id=? AND lineage_id=? AND status='running'
     ORDER BY trial_number DESC
     LIMIT 1
  `).get(storeId,lineageId)??null;
}
function loadResearchChallenger(db,{storeId,fingerprint}){
  const row=db.prepare(`
    SELECT fingerprint,model_json,status
      FROM research_model_registry
     WHERE store_id=? AND fingerprint=?
  `).get(storeId,fingerprint);
  if(!row)throw new Error(`research Challenger model missing: ${fingerprint}`);
  if(row.status!=='research_champion')throw new Error(`research Challenger must be research_champion; got ${row.status}`);
  const model=parseModel(row.model_json,'Challenger');
  if(fingerprintModel(model)!==row.fingerprint)throw new Error('research Challenger fingerprint does not match stored model');
  return Object.freeze({fingerprint:row.fingerprint,model});
}
function requireDays(days,frontierDate){
  if(!Array.isArray(days)||!days.length)throw new TypeError('days are required');
  const eligible=days.filter(day=>day&&String(day.date||'')<=frontierDate).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!eligible.length||String(eligible.at(-1)?.date||'')!==frontierDate)throw new Error('frontierDate must be present as the latest eligible canonical day');
  return eligible;
}
function existingRunningResult(db,{trial,targetDate}){
  const championPrediction=loadFormalPrediction(db,{storeId:trial.storeId,lineageId:trial.lineageId,trialNumber:trial.trialNumber,targetDate,role:'champion'});
  const challengerPrediction=loadFormalPrediction(db,{storeId:trial.storeId,lineageId:trial.lineageId,trialNumber:trial.trialNumber,targetDate,role:'challenger'});
  if(!championPrediction||!challengerPrediction)throw new Error('running formal trial exists but frozen target predictions are incomplete');
  return Object.freeze({
    started:false,
    reason:'already_running',
    targetDate,
    trial:loadTrialRecord(db,{storeId:trial.storeId,lineageId:trial.lineageId,trialNumber:trial.trialNumber}),
    championPrediction,
    challengerPrediction,
  });
}

export function startFormalLiveTrial(db,{
  storeId,
  lineageId,
  challengerFingerprint,
  featureVersion,
  days,
  frontierDate,
  nowIso,
  scorerVersion=PRE_V2_SCORER_VERSION,
}={}){
  requireDb(db);
  migrateFormalModelStore(db);
  const store=requireText(storeId,'storeId');
  const lineage=requireText(lineageId,'lineageId');
  const challengerFp=requireText(challengerFingerprint,'challengerFingerprint');
  const version=requireText(featureVersion,'featureVersion');
  const frontier=requireDate(frontierDate,'frontierDate');
  const at=requireIso(nowIso);
  const scorer=requireText(scorerVersion,'scorerVersion');
  const eligibleDays=requireDays(days,frontier);

  const storeRow=db.prepare('SELECT id FROM stores WHERE id=?').get(store);
  if(!storeRow)throw new Error(`store missing: ${store}`);
  const active=getActiveStoreModel(db,{storeId:store});
  if(!active)throw new Error(`active Champion model missing for store ${store}`);
  if(active.featureVersion!==version)throw new Error(`feature version mismatch: active=${active.featureVersion} requested=${version}`);
  if(fingerprintModel(active.model)!==active.fingerprint)throw new Error('active Champion fingerprint does not match stored model');
  const challenger=loadResearchChallenger(db,{storeId:store,fingerprint:challengerFp});
  if(challenger.fingerprint===active.fingerprint)throw new Error('formal Challenger must be distinct from active Champion');

  const championPayload=buildStoreReadPayload({
    storeId:store,modelFingerprint:active.fingerprint,model:active.model,featureVersion:version,
    frontierDate:frontier,days:eligibleDays,holdoutScore:active.holdoutScore,
  });
  const challengerPayload=buildStoreReadPayload({
    storeId:store,modelFingerprint:challenger.fingerprint,model:challenger.model,featureVersion:version,
    frontierDate:frontier,days:eligibleDays,holdoutScore:null,
  });
  if(championPayload.status!=='ready'||!championPayload.rankings.length)throw new Error('active Champion produced no formal prediction');
  if(challengerPayload.status!=='ready'||!challengerPayload.rankings.length)throw new Error('research Challenger produced no formal prediction');
  if(championPayload.targetDate!==challengerPayload.targetDate)throw new Error('formal prediction target date mismatch');
  const targetDate=championPayload.targetDate;
  const championKeys=championPayload.rankings.map(row=>String(row.machineKey));
  const challengerKeys=challengerPayload.rankings.map(row=>String(row.machineKey));
  if(!sameSet(championKeys,challengerKeys))throw new Error('Champion and Challenger must predict the exact same machine set');
  const machineSetHash=hashCanonical([...championKeys].sort());

  db.exec('BEGIN IMMEDIATE;');
  try{
    const runningRow=runningTrialRow(db,{storeId:store,lineageId:lineage});
    if(runningRow){
      const running=loadTrialRecord(db,{storeId:store,lineageId:lineage,trialNumber:Number(runningRow.trial_number)});
      if(!running)throw new Error('running formal trial disappeared during start');
      const samePair=running.trial.championFingerprint===active.fingerprint&&running.trial.challengerFingerprint===challenger.fingerprint;
      const sameMachineSet=running.trial.machineSetHash===machineSetHash;
      const sameScorer=running.trial.scorerVersion===scorer;
      if(!samePair||!sameMachineSet||!sameScorer)throw new Error('a different running formal trial already exists for this store and lineage');
      const result=existingRunningResult(db,{trial:running.trial,targetDate});
      db.exec('COMMIT;');
      return result;
    }

    const trialNumber=nextTrialNumber(db,{storeId:store,lineageId:lineage});
    const trial=startFormalTrial({
      storeId:store,lineageId:lineage,trialNumber,
      championFingerprint:active.fingerprint,challengerFingerprint:challenger.fingerprint,
      machineSetHash,scorerVersion:scorer,
    });
    const created=createTrialRecord(db,{trial,nowIso:at});
    persistFormalModelSnapshot(db,{trial,role:'champion',model:active.model,nowIso:at});
    persistFormalModelSnapshot(db,{trial,role:'challenger',model:challenger.model,nowIso:at});
    const championSaved=persistFormalPrediction(db,{trial,prediction:targetPrediction('champion',championPayload),nowIso:at});
    const challengerSaved=persistFormalPrediction(db,{trial,prediction:targetPrediction('challenger',challengerPayload),nowIso:at});
    db.exec('COMMIT;');
    return Object.freeze({
      started:true,
      reason:'started',
      targetDate,
      trial:created.row,
      championPrediction:championSaved.row,
      challengerPrediction:challengerSaved.row,
    });
  }catch(error){
    try{db.exec('ROLLBACK;')}catch{}
    throw error;
  }
}

export const __test={sameSet,parseModel,targetPrediction,runningTrialRow,loadResearchChallenger,requireDays};
