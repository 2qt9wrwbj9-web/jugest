import {canonicalJson,hashCanonical} from '../../canonical-json.mjs';

function requireDb(db){
  if(!db||typeof db.prepare!=='function')throw new TypeError('database handle is required');
  return db;
}
function requireText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function requireDate(value,name){const text=requireText(value,name);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${name} must be YYYY-MM-DD`);return text}
function requireTrialNumber(value){const n=Number(value);if(!Number.isInteger(n)||n<1)throw new TypeError('trialNumber must be a positive integer');return n}
function requireIso(value){const text=requireText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be an ISO timestamp');return text}

function trialKey(trial){
  if(!trial||typeof trial!=='object'||Array.isArray(trial))throw new TypeError('trial is required');
  return{
    storeId:requireText(trial.storeId,'trial.storeId'),
    lineageId:requireText(trial.lineageId,'trial.lineageId'),
    trialNumber:requireTrialNumber(trial.trialNumber),
    championFingerprint:requireText(trial.championFingerprint,'trial.championFingerprint'),
    challengerFingerprint:requireText(trial.challengerFingerprint,'trial.challengerFingerprint'),
    machineSetHash:requireText(trial.machineSetHash,'trial.machineSetHash'),
  };
}

function normalizeRankings(rankings){
  if(!Array.isArray(rankings)||!rankings.length)throw new TypeError('prediction.rankings must be a non-empty array');
  const machineKeys=new Set();
  const ranks=new Set();
  const normalized=rankings.map((row,index)=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw new TypeError(`prediction.rankings[${index}] must be an object`);
    const machineKey=requireText(row.machineKey,`prediction.rankings[${index}].machineKey`);
    const tableNo=requireText(row.tableNo,`prediction.rankings[${index}].tableNo`);
    if(machineKey!==tableNo)throw new RangeError(`prediction.rankings[${index}] machineKey must equal tableNo`);
    if(machineKeys.has(machineKey))throw new RangeError(`prediction machine set contains duplicate machineKey ${machineKey}`);
    machineKeys.add(machineKey);
    const rank=Number(row.rank);
    if(!Number.isInteger(rank)||rank<1)throw new RangeError(`prediction.rankings[${index}].rank must be a positive integer`);
    if(ranks.has(rank))throw new RangeError(`prediction rankings contain duplicate rank ${rank}`);
    ranks.add(rank);
    const score=Number(row.score);
    if(!Number.isFinite(score))throw new TypeError(`prediction.rankings[${index}].score must be finite`);
    return Object.freeze({machineKey,tableNo,machineName:String(row.machineName??''),rank,score});
  });
  for(let index=0;index<normalized.length;index+=1){
    if(normalized[index].rank!==index+1)throw new RangeError('prediction rankings must be stored in contiguous rank order starting at 1');
  }
  return normalized;
}

function normalizePrediction(trial,prediction){
  const key=trialKey(trial);
  if(!prediction||typeof prediction!=='object'||Array.isArray(prediction))throw new TypeError('prediction is required');
  const role=requireText(prediction.role,'prediction.role');
  if(role!=='champion'&&role!=='challenger')throw new RangeError('prediction.role must be champion or challenger');
  const modelFingerprint=requireText(prediction.modelFingerprint,'prediction.modelFingerprint');
  const expectedFingerprint=role==='champion'?key.championFingerprint:key.challengerFingerprint;
  if(modelFingerprint!==expectedFingerprint)throw new RangeError(`${role} prediction fingerprint does not match frozen formal trial fingerprint`);
  const targetDate=requireDate(prediction.targetDate,'prediction.targetDate');
  const sourceFrontierDate=requireDate(prediction.sourceFrontierDate,'prediction.sourceFrontierDate');
  if(sourceFrontierDate>=targetDate)throw new RangeError('prediction.sourceFrontierDate must be before targetDate');
  const rankings=normalizeRankings(prediction.rankings);
  const machineSetHash=hashCanonical(rankings.map(row=>row.machineKey).slice().sort());
  return Object.freeze({
    storeId:key.storeId,lineageId:key.lineageId,trialNumber:key.trialNumber,
    targetDate,role,modelFingerprint,sourceFrontierDate,machineSetHash,
    rankings:Object.freeze(rankings),
  });
}

function rowToPrediction(row){
  if(!row)return null;
  return Object.freeze({
    storeId:row.store_id,lineageId:row.lineage_id,trialNumber:Number(row.trial_number),
    targetDate:row.target_date,role:row.role,modelFingerprint:row.model_fingerprint,
    sourceFrontierDate:row.source_frontier_date,machineSetHash:row.machine_set_hash,
    rankings:Object.freeze(JSON.parse(row.rankings_json).map(item=>Object.freeze(item))),
    predictionHash:row.prediction_hash,createdAt:row.created_at,
  });
}

export function loadFormalPrediction(db,{storeId,lineageId,trialNumber,targetDate,role}={}){
  requireDb(db);
  const store=requireText(storeId,'storeId'),lineage=requireText(lineageId,'lineageId'),number=requireTrialNumber(trialNumber),date=requireDate(targetDate,'targetDate'),kind=requireText(role,'role');
  if(kind!=='champion'&&kind!=='challenger')throw new RangeError('role must be champion or challenger');
  return rowToPrediction(db.prepare(`
    SELECT * FROM pre_v2_formal_predictions
     WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=? AND role=?
  `).get(store,lineage,number,date,kind));
}

export function persistFormalPrediction(db,{trial,prediction,nowIso}={}){
  requireDb(db);
  const normalized=normalizePrediction(trial,prediction);
  const createdAt=requireIso(nowIso);
  const rankingsJson=canonicalJson(normalized.rankings);
  const predictionHash=hashCanonical({
    targetDate:normalized.targetDate,role:normalized.role,modelFingerprint:normalized.modelFingerprint,
    sourceFrontierDate:normalized.sourceFrontierDate,machineSetHash:normalized.machineSetHash,rankings:normalized.rankings,
  });
  const result=db.prepare(`
    INSERT OR IGNORE INTO pre_v2_formal_predictions(
      store_id,lineage_id,trial_number,target_date,role,model_fingerprint,
      source_frontier_date,machine_set_hash,rankings_json,prediction_hash,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    normalized.storeId,normalized.lineageId,normalized.trialNumber,normalized.targetDate,normalized.role,
    normalized.modelFingerprint,normalized.sourceFrontierDate,normalized.machineSetHash,rankingsJson,predictionHash,createdAt,
  );
  const loaded=loadFormalPrediction(db,normalized);
  if(Number(result.changes)===1)return Object.freeze({inserted:true,row:loaded});
  if(loaded?.predictionHash===predictionHash)return Object.freeze({inserted:false,row:loaded});
  throw new Error(`formal prediction conflict: ${normalized.storeId}/${normalized.lineageId}/${normalized.trialNumber}/${normalized.targetDate}/${normalized.role}`);
}

export const __test={normalizePrediction,normalizeRankings};
