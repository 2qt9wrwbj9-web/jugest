import {canonicalJson,hashCanonical} from '../../canonical-json.mjs';
import {fingerprintModel} from '../model-search.mjs';

function requireDb(db){if(!db||typeof db.prepare!=='function')throw new TypeError('database handle is required');return db}
function requireText(value,name){const text=String(value??'').trim();if(!text)throw new TypeError(`${name} is required`);return text}
function requireTrialNumber(value){const number=Number(value);if(!Number.isInteger(number)||number<1)throw new TypeError('trialNumber must be a positive integer');return number}
function requireIso(value){const text=requireText(value,'nowIso');if(!Number.isFinite(Date.parse(text)))throw new TypeError('nowIso must be an ISO timestamp');return text}
function requireRole(value){const role=requireText(value,'role');if(role!=='champion'&&role!=='challenger')throw new RangeError('role must be champion or challenger');return role}

function trialKey(trial){
  if(!trial||typeof trial!=='object'||Array.isArray(trial))throw new TypeError('trial is required');
  return{
    storeId:requireText(trial.storeId,'trial.storeId'),
    lineageId:requireText(trial.lineageId,'trial.lineageId'),
    trialNumber:requireTrialNumber(trial.trialNumber),
    championFingerprint:requireText(trial.championFingerprint,'trial.championFingerprint'),
    challengerFingerprint:requireText(trial.challengerFingerprint,'trial.challengerFingerprint'),
  };
}

function rowToSnapshot(row){
  if(!row)return null;
  return Object.freeze({
    storeId:row.store_id,lineageId:row.lineage_id,trialNumber:Number(row.trial_number),role:row.role,
    modelFingerprint:row.model_fingerprint,model:Object.freeze(JSON.parse(row.model_json)),modelHash:row.model_hash,createdAt:row.created_at,
  });
}

export function loadFormalModelSnapshot(db,{storeId,lineageId,trialNumber,role}={}){
  requireDb(db);
  const store=requireText(storeId,'storeId'),lineage=requireText(lineageId,'lineageId'),number=requireTrialNumber(trialNumber),kind=requireRole(role);
  return rowToSnapshot(db.prepare(`
    SELECT * FROM pre_v2_formal_models
     WHERE store_id=? AND lineage_id=? AND trial_number=? AND role=?
  `).get(store,lineage,number,kind));
}

export function persistFormalModelSnapshot(db,{trial,role,model,nowIso}={}){
  requireDb(db);
  const key=trialKey(trial),kind=requireRole(role),createdAt=requireIso(nowIso);
  if(!model||typeof model!=='object'||Array.isArray(model))throw new TypeError('model must be an object');
  const expectedFingerprint=kind==='champion'?key.championFingerprint:key.challengerFingerprint;
  const actualFingerprint=fingerprintModel(model);
  if(actualFingerprint!==expectedFingerprint)throw new Error(`${kind} formal model fingerprint does not match frozen trial fingerprint`);
  const modelJson=canonicalJson(model),modelHash=hashCanonical(model);
  const result=db.prepare(`
    INSERT OR IGNORE INTO pre_v2_formal_models(
      store_id,lineage_id,trial_number,role,model_fingerprint,model_json,model_hash,created_at
    ) VALUES(?,?,?,?,?,?,?,?)
  `).run(key.storeId,key.lineageId,key.trialNumber,kind,expectedFingerprint,modelJson,modelHash,createdAt);
  const loaded=loadFormalModelSnapshot(db,{...key,role:kind});
  if(Number(result.changes)===1)return Object.freeze({inserted:true,row:loaded});
  if(loaded?.modelFingerprint===expectedFingerprint&&loaded?.modelHash===modelHash)return Object.freeze({inserted:false,row:loaded});
  throw new Error(`formal model snapshot conflict: ${key.storeId}/${key.lineageId}/${key.trialNumber}/${kind}`);
}

export const __test={trialKey,rowToSnapshot};
