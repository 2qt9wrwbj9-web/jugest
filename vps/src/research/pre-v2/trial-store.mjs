import {canonicalJson,hashCanonical} from '../../canonical-json.mjs';
import {applyFormalDay} from './trial.mjs';

function requireDb(db){
  if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('database handle is required');
  return db;
}

function requireText(value,name){
  const text=String(value??'').trim();
  if(!text)throw new TypeError(`${name} must be a non-empty string`);
  return text;
}

function requireTrialNumber(value){
  const number=Number(value);
  if(!Number.isInteger(number)||number<1)throw new TypeError('trialNumber must be a positive integer');
  return number;
}

function requireIsoTimestamp(value,name='nowIso'){
  const text=requireText(value,name);
  const millis=Date.parse(text);
  if(!Number.isFinite(millis))throw new TypeError(`${name} must be a valid ISO timestamp`);
  return text;
}

function requireDelta(value,name){
  const number=Number(value);
  if(!Number.isFinite(number))throw new TypeError(`${name} must be finite`);
  if(number<-1||number>1)throw new RangeError(`${name} must be in [-1, 1]`);
  return number;
}

function normalizeDay(day){
  if(!day||typeof day!=='object'||Array.isArray(day))throw new TypeError('day must be an object');
  const targetDate=requireText(day.targetDate,'targetDate');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))throw new TypeError('targetDate must use YYYY-MM-DD');
  const top10Delta=requireDelta(day.top10Delta,'top10Delta');
  const top5Delta=requireDelta(day.top5Delta,'top5Delta');
  const top10Informative=day.top10Informative===undefined?true:day.top10Informative;
  const top5Informative=day.top5Informative===undefined?true:day.top5Informative;
  if(typeof top10Informative!=='boolean')throw new TypeError('top10Informative must be boolean');
  if(typeof top5Informative!=='boolean')throw new TypeError('top5Informative must be boolean');
  return{targetDate,top10Delta,top5Delta,top10Informative,top5Informative};
}

function requireTrialShape(trial){
  if(!trial||typeof trial!=='object'||Array.isArray(trial))throw new TypeError('trial must be an object');
  for(const [field,label] of [
    ['version','trial.version'],
    ['storeId','trial.storeId'],
    ['lineageId','trial.lineageId'],
    ['championFingerprint','trial.championFingerprint'],
    ['challengerFingerprint','trial.challengerFingerprint'],
    ['machineSetHash','trial.machineSetHash'],
    ['scorerVersion','trial.scorerVersion'],
    ['status','trial.status'],
    ['decision','trial.decision'],
  ])requireText(trial[field],label);
  requireTrialNumber(trial.trialNumber);
  if(!trial.top10||!trial.top5Degradation)throw new TypeError('trial sequential states are required');
  requireText(trial.top10.version,'trial.top10.version');
  if(trial.top5Degradation.version!==trial.top10.version)throw new RangeError('Top10 and Top5 sequential versions must match');
  for(const field of ['promotionAlpha','safetyAlpha']){
    const value=Number(trial[field]);
    if(!Number.isFinite(value)||value<=0||value>=1)throw new TypeError(`${field} must be in (0,1)`);
  }
  return trial;
}

function rowToRecord(row){
  if(!row)return null;
  return{
    trial:JSON.parse(row.state_json),
    stateHash:row.state_hash,
    startedAt:row.started_at,
    updatedAt:row.updated_at,
    decisionAt:row.decision_at??null,
    decisionTargetDate:row.decision_target_date??null,
  };
}

function trialKey(trial){
  return{
    storeId:requireText(trial.storeId,'trial.storeId'),
    lineageId:requireText(trial.lineageId,'trial.lineageId'),
    trialNumber:requireTrialNumber(trial.trialNumber),
  };
}

function sameImmutableIdentity(a,b){
  return a.storeId===b.storeId
    &&a.lineageId===b.lineageId
    &&a.trialNumber===b.trialNumber
    &&a.version===b.version
    &&a.scorerVersion===b.scorerVersion
    &&a.top10?.version===b.top10?.version
    &&a.championFingerprint===b.championFingerprint
    &&a.challengerFingerprint===b.challengerFingerprint
    &&a.machineSetHash===b.machineSetHash
    &&Number(a.promotionAlpha)===Number(b.promotionAlpha)
    &&Number(a.safetyAlpha)===Number(b.safetyAlpha);
}

function evidenceForTrial(trial){
  return{
    status:trial.status,
    decision:trial.decision,
    decisionTargetDate:trial.decisionTargetDate??null,
    top10:trial.top10,
    top5Degradation:trial.top5Degradation,
  };
}

function updateTrialRow(db,{trial,expectedStateHash,nowIso}){
  const key=trialKey(trial);
  const stateJson=canonicalJson(trial);
  const stateHash=hashCanonical(trial);
  const current=loadTrialRecord(db,key);
  if(!current)throw new Error(`formal trial not found: ${key.storeId}/${key.lineageId}/${key.trialNumber}`);
  if(current.stateHash!==expectedStateHash)throw new Error('stale formal trial state writer');
  if(!sameImmutableIdentity(current.trial,trial))throw new Error('formal trial immutable metadata conflict');
  const decisionAt=trial.status==='running'?current.decisionAt:(current.decisionAt??nowIso);
  const result=db.prepare(`
    UPDATE pre_v2_formal_trials
       SET status=?,decision=?,state_json=?,state_hash=?,updated_at=?,decision_at=?,decision_target_date=?
     WHERE store_id=? AND lineage_id=? AND trial_number=? AND state_hash=?
  `).run(
    trial.status,
    trial.decision,
    stateJson,
    stateHash,
    nowIso,
    decisionAt,
    trial.decisionTargetDate??null,
    key.storeId,
    key.lineageId,
    key.trialNumber,
    expectedStateHash,
  );
  if(Number(result.changes)!==1)throw new Error('stale formal trial state writer');
  return{updated:true,row:loadTrialRecord(db,key)};
}

export function migratePreV2TrialStore(db){
  requireDb(db).exec(`
    CREATE TABLE IF NOT EXISTS pre_v2_formal_trials (
      store_id TEXT NOT NULL,
      lineage_id TEXT NOT NULL,
      trial_number INTEGER NOT NULL CHECK(trial_number>=1),
      trial_version TEXT NOT NULL,
      scorer_version TEXT NOT NULL,
      sequential_version TEXT NOT NULL,
      promotion_alpha REAL NOT NULL,
      safety_alpha REAL NOT NULL,
      champion_fingerprint TEXT NOT NULL,
      challenger_fingerprint TEXT NOT NULL,
      machine_set_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running','promoted','blocked')),
      decision TEXT NOT NULL,
      state_json TEXT NOT NULL,
      state_hash TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decision_at TEXT,
      decision_target_date TEXT,
      PRIMARY KEY(store_id,lineage_id,trial_number),
      FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS pre_v2_formal_trials_store_status_idx
      ON pre_v2_formal_trials(store_id,status,lineage_id,trial_number DESC);

    CREATE TABLE IF NOT EXISTS pre_v2_formal_predictions (
      store_id TEXT NOT NULL,
      lineage_id TEXT NOT NULL,
      trial_number INTEGER NOT NULL,
      target_date TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('champion','challenger')),
      model_fingerprint TEXT NOT NULL,
      source_frontier_date TEXT NOT NULL,
      machine_set_hash TEXT NOT NULL,
      rankings_json TEXT NOT NULL,
      prediction_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(store_id,lineage_id,trial_number,target_date,role),
      FOREIGN KEY(store_id,lineage_id,trial_number)
        REFERENCES pre_v2_formal_trials(store_id,lineage_id,trial_number) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS pre_v2_formal_predictions_store_date_idx
      ON pre_v2_formal_predictions(store_id,target_date,lineage_id,trial_number,role);

    CREATE TABLE IF NOT EXISTS pre_v2_formal_trial_days (
      store_id TEXT NOT NULL,
      lineage_id TEXT NOT NULL,
      trial_number INTEGER NOT NULL,
      target_date TEXT NOT NULL,
      top10_delta REAL NOT NULL CHECK(top10_delta>=-1 AND top10_delta<=1),
      top5_delta REAL NOT NULL CHECK(top5_delta>=-1 AND top5_delta<=1),
      top10_informative INTEGER NOT NULL CHECK(top10_informative IN (0,1)),
      top5_informative INTEGER NOT NULL CHECK(top5_informative IN (0,1)),
      top10_log_e REAL NOT NULL,
      top10_max_log_e REAL NOT NULL,
      top5_degradation_log_e REAL NOT NULL,
      top5_degradation_max_log_e REAL NOT NULL,
      evidence_json TEXT NOT NULL,
      evidence_hash TEXT NOT NULL,
      state_hash_after TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(store_id,lineage_id,trial_number,target_date),
      FOREIGN KEY(store_id,lineage_id,trial_number)
        REFERENCES pre_v2_formal_trials(store_id,lineage_id,trial_number) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS pre_v2_formal_trial_days_store_date_idx
      ON pre_v2_formal_trial_days(store_id,target_date,lineage_id,trial_number);
  `);
}

export function nextTrialNumber(db,{storeId,lineageId}={}){
  requireDb(db);
  const store=requireText(storeId,'storeId');
  const lineage=requireText(lineageId,'lineageId');
  const row=db.prepare(`
    SELECT COALESCE(MAX(trial_number),0)+1 AS next_number
      FROM pre_v2_formal_trials
     WHERE store_id=? AND lineage_id=?
  `).get(store,lineage);
  return Number(row.next_number);
}

export function loadTrialRecord(db,{storeId,lineageId,trialNumber}={}){
  requireDb(db);
  const store=requireText(storeId,'storeId');
  const lineage=requireText(lineageId,'lineageId');
  const number=requireTrialNumber(trialNumber);
  return rowToRecord(db.prepare(`
    SELECT * FROM pre_v2_formal_trials
     WHERE store_id=? AND lineage_id=? AND trial_number=?
  `).get(store,lineage,number));
}

export function createTrialRecord(db,{trial,nowIso}={}){
  requireDb(db);
  requireTrialShape(trial);
  const now=requireIsoTimestamp(nowIso);
  const key=trialKey(trial);
  const stateJson=canonicalJson(trial);
  const stateHash=hashCanonical(trial);
  const result=db.prepare(`
    INSERT OR IGNORE INTO pre_v2_formal_trials(
      store_id,lineage_id,trial_number,trial_version,scorer_version,sequential_version,
      promotion_alpha,safety_alpha,champion_fingerprint,challenger_fingerprint,machine_set_hash,
      status,decision,state_json,state_hash,started_at,updated_at,decision_at,decision_target_date
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    key.storeId,key.lineageId,key.trialNumber,trial.version,trial.scorerVersion,trial.top10.version,
    trial.promotionAlpha,trial.safetyAlpha,trial.championFingerprint,trial.challengerFingerprint,trial.machineSetHash,
    trial.status,trial.decision,stateJson,stateHash,now,now,
    trial.status==='running'?null:now,trial.decisionTargetDate??null,
  );
  if(Number(result.changes)===1)return{inserted:true,row:loadTrialRecord(db,key)};
  const existing=loadTrialRecord(db,key);
  if(existing?.stateHash===stateHash&&sameImmutableIdentity(existing.trial,trial))return{inserted:false,row:existing};
  throw new Error(`formal trial identity conflict: ${key.storeId}/${key.lineageId}/${key.trialNumber}`);
}

export function saveTrialState(db,{trial,expectedStateHash,nowIso}={}){
  requireDb(db);
  requireTrialShape(trial);
  const expected=requireText(expectedStateHash,'expectedStateHash');
  const now=requireIsoTimestamp(nowIso);
  const key=trialKey(trial);
  const current=loadTrialRecord(db,key);
  if(!current)throw new Error(`formal trial not found: ${key.storeId}/${key.lineageId}/${key.trialNumber}`);
  if(current.stateHash!==expected)throw new Error('stale formal trial state writer');
  if(hashCanonical(trial)!==current.stateHash){
    throw new Error('formal evidence changes must be persisted through appendTrialDay');
  }
  return updateTrialRow(db,{trial,expectedStateHash:expected,nowIso:now});
}

export function appendTrialDay(db,{trial,day,nowIso}={}){
  requireDb(db);
  requireTrialShape(trial);
  const normalizedDay=normalizeDay(day);
  const now=requireIsoTimestamp(nowIso);
  const key=trialKey(trial);
  if(trial.lastTargetDate!==normalizedDay.targetDate)throw new Error('formal trial transition conflict: target date does not match resulting state');
  const stateHashAfter=hashCanonical(trial);

  db.exec('BEGIN IMMEDIATE;');
  try{
    const duplicate=db.prepare(`
      SELECT * FROM pre_v2_formal_trial_days
       WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=?
    `).get(key.storeId,key.lineageId,key.trialNumber,normalizedDay.targetDate);
    if(duplicate){
      const exact=Number(duplicate.top10_delta)===normalizedDay.top10Delta
        &&Number(duplicate.top5_delta)===normalizedDay.top5Delta
        &&Number(duplicate.top10_informative)===(normalizedDay.top10Informative?1:0)
        &&Number(duplicate.top5_informative)===(normalizedDay.top5Informative?1:0)
        &&duplicate.state_hash_after===stateHashAfter;
      if(!exact)throw new Error(`formal trial day replay conflict: ${normalizedDay.targetDate}`);
      db.exec('COMMIT;');
      return{inserted:false,row:duplicate};
    }

    const current=loadTrialRecord(db,key);
    if(!current)throw new Error(`formal trial not found: ${key.storeId}/${key.lineageId}/${key.trialNumber}`);
    if(!sameImmutableIdentity(current.trial,trial))throw new Error('formal trial immutable metadata conflict');

    let recomputed;
    try{
      recomputed=applyFormalDay(current.trial,normalizedDay);
    }catch(error){
      throw new Error(`formal trial transition conflict: ${error?.message??error}`);
    }
    if(hashCanonical(recomputed)!==stateHashAfter)throw new Error('formal trial transition conflict: supplied resulting state is not the exact next state');

    const evidence=evidenceForTrial(trial);
    const evidenceJson=canonicalJson(evidence);
    const evidenceHash=hashCanonical(evidence);
    db.prepare(`
      INSERT INTO pre_v2_formal_trial_days(
        store_id,lineage_id,trial_number,target_date,
        top10_delta,top5_delta,top10_informative,top5_informative,
        top10_log_e,top10_max_log_e,top5_degradation_log_e,top5_degradation_max_log_e,
        evidence_json,evidence_hash,state_hash_after,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      key.storeId,key.lineageId,key.trialNumber,normalizedDay.targetDate,
      normalizedDay.top10Delta,normalizedDay.top5Delta,
      normalizedDay.top10Informative?1:0,normalizedDay.top5Informative?1:0,
      trial.top10.logE,trial.top10.maxLogE,trial.top5Degradation.logE,trial.top5Degradation.maxLogE,
      evidenceJson,evidenceHash,stateHashAfter,now,
    );

    const saved=updateTrialRow(db,{trial,expectedStateHash:current.stateHash,nowIso:now});
    db.exec('COMMIT;');
    return{inserted:true,row:db.prepare(`
      SELECT * FROM pre_v2_formal_trial_days
       WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=?
    `).get(key.storeId,key.lineageId,key.trialNumber,normalizedDay.targetDate),trial:saved.row};
  }catch(error){
    try{db.exec('ROLLBACK;')}catch{}
    throw error;
  }
}
