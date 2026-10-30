// Exact validation/identity/row/evidence helpers extracted from the fixed SQLite trial store.
import{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';
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

function normalizeOutcomeRows(outcomeRows){
  if(outcomeRows===undefined||outcomeRows===null)return null;
  if(!Array.isArray(outcomeRows)||!outcomeRows.length)throw new TypeError('outcomeRows must be a non-empty array when supplied');
  const judgedRowsJson=canonicalJson(outcomeRows);
  return{judgedRowsJson,outcomeHash:hashCanonical(outcomeRows)};
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


export{requireText,requireTrialNumber,requireIsoTimestamp,normalizeDay,normalizeOutcomeRows,requireTrialShape,rowToRecord,trialKey,sameImmutableIdentity,evidenceForTrial};
