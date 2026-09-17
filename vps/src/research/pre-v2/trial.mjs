import {
  alphaForTrial,
  createSequentialState,
  promotionEvidence,
  safetyEvidence,
  updateSequentialState,
} from './sequential.mjs';

export const PRE_V2_TRIAL_VERSION='pre-v2-formal-trial-v1';
export const PRE_V2_SAFETY_ALPHA=0.05;

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

function requireIsoDate(value){
  const text=requireText(value,'targetDate');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new TypeError('targetDate must use YYYY-MM-DD');
  const parsed=new Date(`${text}T00:00:00Z`);
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==text)throw new RangeError(`invalid targetDate: ${text}`);
  return text;
}

function requireBoolean(value,name,defaultValue=true){
  if(value===undefined)return defaultValue;
  if(typeof value!=='boolean')throw new TypeError(`${name} must be boolean`);
  return value;
}

function requireDelta(value,name){
  const number=Number(value);
  if(!Number.isFinite(number))throw new TypeError(`${name} must be finite`);
  if(number<-1||number>1)throw new RangeError(`${name} must be in [-1, 1]`);
  return number;
}

function validateTrial(trial){
  if(!trial||typeof trial!=='object'||Array.isArray(trial))throw new TypeError('formal trial must be an object');
  if(trial.version!==PRE_V2_TRIAL_VERSION)throw new RangeError(`unsupported formal trial version: ${trial.version}`);
  if(!['running','promoted','blocked'].includes(trial.status))throw new RangeError(`invalid formal trial status: ${trial.status}`);
  requireTrialNumber(trial.trialNumber);
  requireText(trial.storeId,'storeId');
  requireText(trial.lineageId,'lineageId');
  requireText(trial.championFingerprint,'championFingerprint');
  requireText(trial.challengerFingerprint,'challengerFingerprint');
  requireText(trial.machineSetHash,'machineSetHash');
  requireText(trial.scorerVersion,'scorerVersion');
  if(!Number.isInteger(trial.daysProcessed)||trial.daysProcessed<0)throw new RangeError('daysProcessed must be a nonnegative integer');
  if(!Number.isInteger(trial.nonInformativeTop10Days)||trial.nonInformativeTop10Days<0)throw new RangeError('nonInformativeTop10Days must be a nonnegative integer');
  if(!Number.isInteger(trial.nonInformativeTop5Days)||trial.nonInformativeTop5Days<0)throw new RangeError('nonInformativeTop5Days must be a nonnegative integer');
  return trial;
}

export function startFormalTrial({
  storeId,
  lineageId,
  trialNumber,
  championFingerprint,
  challengerFingerprint,
  machineSetHash,
  scorerVersion,
  safetyAlpha=PRE_V2_SAFETY_ALPHA,
}={}){
  const k=requireTrialNumber(trialNumber);
  const safety=Number(safetyAlpha);
  if(!Number.isFinite(safety)||safety<=0||safety>=1)throw new TypeError('safetyAlpha must be finite and strictly between 0 and 1');
  return{
    version:PRE_V2_TRIAL_VERSION,
    storeId:requireText(storeId,'storeId'),
    lineageId:requireText(lineageId,'lineageId'),
    trialNumber:k,
    championFingerprint:requireText(championFingerprint,'championFingerprint'),
    challengerFingerprint:requireText(challengerFingerprint,'challengerFingerprint'),
    machineSetHash:requireText(machineSetHash,'machineSetHash'),
    scorerVersion:requireText(scorerVersion,'scorerVersion'),
    promotionAlpha:alphaForTrial(k),
    safetyAlpha:safety,
    status:'running',
    decision:'pending',
    daysProcessed:0,
    nonInformativeTop10Days:0,
    nonInformativeTop5Days:0,
    lastTargetDate:null,
    decisionTargetDate:null,
    top10:createSequentialState(),
    top5Degradation:createSequentialState(),
  };
}

export function formalTrialDecision(inputTrial){
  const trial=validateTrial(inputTrial);
  const top10=promotionEvidence(trial.top10,trial.promotionAlpha);
  const top5Degradation=safetyEvidence(trial.top5Degradation,trial.safetyAlpha);
  let decision='pending';
  if(trial.status==='blocked'||top5Degradation.crossed)decision='block_top5_degradation';
  else if(trial.status==='promoted'||top10.crossed)decision='promote';
  return Object.freeze({
    decision,
    status:trial.status,
    targetDate:trial.decisionTargetDate,
    top10,
    top5Degradation,
  });
}

export function applyFormalDay(inputTrial,{
  targetDate,
  top10Delta,
  top5Delta,
  top10Informative=true,
  top5Informative=true,
}={}){
  const trial=validateTrial(inputTrial);
  if(trial.status!=='running')throw new RangeError(`formal trial is not running; status=${trial.status}`);

  const date=requireIsoDate(targetDate);
  if(trial.lastTargetDate!==null&&date<=trial.lastTargetDate){
    throw new RangeError(`formal target dates must be strictly increasing; got ${date} after ${trial.lastTargetDate}`);
  }

  const d10=requireDelta(top10Delta,'top10Delta');
  const d5=requireDelta(top5Delta,'top5Delta');
  const informative10=requireBoolean(top10Informative,'top10Informative');
  const informative5=requireBoolean(top5Informative,'top5Informative');
  if(!informative10&&Math.abs(d10)>1e-15)throw new RangeError('non-informative Top10 day must use formal delta 0');
  if(!informative5&&Math.abs(d5)>1e-15)throw new RangeError('non-informative Top5 day must use formal delta 0');

  const top10=updateSequentialState(trial.top10,d10);
  const top5Degradation=updateSequentialState(trial.top5Degradation,-d5);
  const top10Evidence=promotionEvidence(top10,trial.promotionAlpha);
  const top5Evidence=safetyEvidence(top5Degradation,trial.safetyAlpha);

  let status='running';
  let decision='pending';
  let decisionTargetDate=null;
  // Safety is evaluated first so a same-day Top5 degradation crossing vetoes promotion.
  if(top5Evidence.crossed){
    status='blocked';
    decision='block_top5_degradation';
    decisionTargetDate=date;
  }else if(top10Evidence.crossed){
    status='promoted';
    decision='promote';
    decisionTargetDate=date;
  }

  return{
    ...trial,
    status,
    decision,
    daysProcessed:trial.daysProcessed+1,
    nonInformativeTop10Days:trial.nonInformativeTop10Days+(informative10?0:1),
    nonInformativeTop5Days:trial.nonInformativeTop5Days+(informative5?0:1),
    lastTargetDate:date,
    decisionTargetDate,
    top10,
    top5Degradation,
  };
}
