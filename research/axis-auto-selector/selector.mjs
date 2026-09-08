import {evaluatePeriod,splitChronologically} from './evaluator.mjs';

const EPSILON=1e-12;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const freeze=value=>Object.freeze(value);

export const FALLBACK_AXIS_WEIGHTS=freeze({
  'practical-v1':.55,
  'model-v1':.30,
  'strict-v1':.15
});

export const DEFAULT_SELECTOR_CONFIG=freeze({
  maxActiveAxes:4,
  minEvaluatedDays:24,
  minTrainDays:12,
  minValidationDays:6,
  minHoldoutDays:6,
  split:freeze({train:.50,validation:.25,holdout:.25}),
  weightStep:.10,
  minAxisAvailability:.80,
  validationMinAdvantage:.005,
  holdoutMinAdvantage:.002,
  holdoutMinWinRate:.55,
  maxCandidateEnsembles:25000
});

function configWithDefaults(config={}){
  return freeze({...DEFAULT_SELECTOR_CONFIG,...config,split:freeze({...DEFAULT_SELECTOR_CONFIG.split,...(config.split||{})})});
}

function own(object,key){return Object.prototype.hasOwnProperty.call(object,key);}
function normalized(entries){
  const sum=entries.reduce((s,[,v])=>s+v,0);
  if(!(sum>0))return null;
  return Object.fromEntries(entries.map(([id,v])=>[id,v/sum]));
}
function candidateKey(candidate){return candidate.axisIds.join('|')+'@'+candidate.axisIds.map(id=>candidate.weights[id].toFixed(12)).join(',');}
function combinations(items,size,start=0,prefix=[],out=[]){
  if(prefix.length===size){out.push([...prefix]);return out;}
  for(let i=start;i<=items.length-(size-prefix.length);i++){
    prefix.push(items[i]);
    combinations(items,size,i+1,prefix,out);
    prefix.pop();
  }
  return out;
}
function compositions(total,parts,prefix=[],out=[]){
  if(parts===1){if(total>=1)out.push([...prefix,total]);return out;}
  for(let units=1;units<=total-(parts-1);units++)compositions(total-units,parts-1,[...prefix,units],out);
  return out;
}
function withinCaps(axisIds,weights,byId,registry){
  const groupTotals=new Map();
  for(const id of axisIds){
    const axis=byId.get(id),weight=weights[id];
    if(weight>axis.maxWeight+EPSILON)return false;
    groupTotals.set(axis.correlationGroup,(groupTotals.get(axis.correlationGroup)||0)+weight);
  }
  for(const [group,total] of groupTotals){
    const cap=registry.groupCap(group);
    if(cap!==null&&cap!==undefined&&total>cap+EPSILON)return false;
  }
  return true;
}

export function generateCandidates({registry,availability={},config=DEFAULT_SELECTOR_CONFIG}){
  if(!registry||typeof registry.approved!=='function'||typeof registry.groupCap!=='function')throw new TypeError('axis registry is required');
  const cfg=configWithDefaults(config);
  if(!finite(cfg.weightStep)||cfg.weightStep<=0||cfg.weightStep>1)throw new RangeError('weightStep must be in (0,1]');
  const units=Math.round(1/cfg.weightStep);
  if(Math.abs(units*cfg.weightStep-1)>EPSILON)throw new RangeError('weightStep must divide 1 exactly');
  const seenSources=new Set(),eligible=[];
  for(const axis of registry.approved()){
    if((availability[axis.id]??0)+EPSILON<cfg.minAxisAvailability)continue;
    if(seenSources.has(axis.sourceId))continue;
    seenSources.add(axis.sourceId);
    eligible.push(axis);
  }
  const byId=new Map(eligible.map(a=>[a.id,a]));
  const candidates=[];
  const maxSize=Math.min(cfg.maxActiveAxes,eligible.length,units);
  for(let size=1;size<=maxSize;size++){
    for(const subset of combinations(eligible,size)){
      const axisIds=subset.map(a=>a.id);
      for(const parts of compositions(units,size)){
        const weights=Object.fromEntries(axisIds.map((id,i)=>[id,parts[i]*cfg.weightStep]));
        if(!withinCaps(axisIds,weights,byId,registry))continue;
        candidates.push(freeze({axisIds:freeze([...axisIds]),weights:freeze(weights)}));
        if(candidates.length>cfg.maxCandidateEnsembles){
          throw new RangeError(`candidate limit ${cfg.maxCandidateEnsembles} exceeded before scoring`);
        }
      }
    }
  }
  return freeze(candidates);
}

function availabilityFromTrain(train,registry){
  const approved=registry.approved();
  const availableDays=Object.create(null);
  for(const axis of approved)availableDays[axis.id]=0;
  for(const sample of train){
    for(const axis of approved){
      let validRows=0;
      for(const row of sample.rows){
        if(finite(row.actualES)&&finite(row.actualP4)&&finite(row.axes?.[axis.id]))validRows+=1;
      }
      if(validRows>=10)availableDays[axis.id]+=1;
    }
  }
  return freeze(Object.fromEntries(approved.map(axis=>[axis.id,train.length?availableDays[axis.id]/train.length:0])));
}

function controlSamples(samples){
  return samples.map(sample=>({...sample,rows:sample.rows.map(row=>({
    ...row,fixedBonus:0,axes:{'__current-control-rank':-row.controlRank}
  }))}));
}
function evaluateControl(samples){return evaluatePeriod(controlSamples(samples),{'__current-control-rank':1});}
function scoreOrNegInf(summary){return finite(summary?.score)?summary.score:-Infinity;}
function periodBundle(samples,weights){return evaluatePeriod(samples,weights);}
function gateAdvantage(candidate,control,fallback,minAdvantage){
  const cs=scoreOrNegInf(candidate),reference=Math.max(scoreOrNegInf(control),scoreOrNegInf(fallback));
  return finite(cs)&&cs>=reference+minAdvantage-EPSILON;
}

export function shrinkSelectedWeights(rawWeights,{sampleCount,advantage,fallback=FALLBACK_AXIS_WEIGHTS}={}){
  const entries=Object.entries(rawWeights).filter(([,v])=>finite(v)&&v>0);
  if(!entries.length)throw new TypeError('rawWeights must contain positive finite weights');
  const raw=normalized(entries);
  const targetEntries=entries.map(([id])=>[id,own(fallback,id)&&finite(fallback[id])&&fallback[id]>0?fallback[id]:0]);
  const target=normalized(targetEntries);
  if(!target)return freeze({weights:freeze({...raw}),shrink:1,support:1,advantageFactor:1,reason:'no_fallback_overlap'});
  const support=clamp((sampleCount-4)/8,.25,.75);
  const advantageFactor=clamp((advantage+.01)/.05,.20,1);
  const shrink=support*advantageFactor;
  const mixed=Object.fromEntries(entries.map(([id])=>[id,target[id]*(1-shrink)+raw[id]*shrink]));
  return freeze({weights:freeze(normalized(Object.entries(mixed))),shrink,support,advantageFactor,reason:'shrunk_to_fallback'});
}

function emptyResult(reason,extra={}){
  return freeze({decision:'CONTROL',reasons:freeze([reason]),candidateCount:0,holdoutEvaluations:0,selectedAxisIds:freeze([]),...extra});
}
function betterCandidate(candidate,score,best){
  if(!best||score>best.score+EPSILON)return true;
  if(Math.abs(score-best.score)>EPSILON)return false;
  if(candidate.axisIds.length!==best.candidate.axisIds.length)return candidate.axisIds.length<best.candidate.axisIds.length;
  return candidateKey(candidate)<candidateKey(best.candidate);
}

export function selectShadowEnsemble({samples,registry,control=null,fallback=FALLBACK_AXIS_WEIGHTS,config=DEFAULT_SELECTOR_CONFIG}){
  const cfg=configWithDefaults(config);
  const split=splitChronologically(samples,cfg);
  if(!split.ok)return emptyResult(split.reason,{split});
  const availability=availabilityFromTrain(split.train,registry);
  let candidates;
  try{candidates=generateCandidates({registry,availability,config:cfg});}
  catch(error){if(error instanceof RangeError&&/candidate limit/i.test(error.message))return emptyResult('candidate_cap_exceeded',{availability,error:error.message,split});throw error;}
  const sourceSeen=new Set(),eligibleAxisIds=[];
  for(const axis of registry.approved())if((availability[axis.id]??0)+EPSILON>=cfg.minAxisAvailability&&!sourceSeen.has(axis.sourceId)){
    sourceSeen.add(axis.sourceId);
    eligibleAxisIds.push(axis.id);
  }
  if(!candidates.length)return emptyResult('no_eligible_candidates',{availability,eligibleAxisIds:freeze(eligibleAxisIds),split});

  let best=null;
  for(const candidate of candidates){
    const train=periodBundle(split.train,candidate.weights);
    const score=scoreOrNegInf(train);
    if(betterCandidate(candidate,score,best)){
      best={candidate,train,score};
    }
  }
  if(!best||!finite(best.train.score))return emptyResult('no_train_score',{availability,eligibleAxisIds:freeze(eligibleAxisIds),candidateCount:candidates.length,split});

  const controlEvaluate=control?.evaluatePeriod||evaluateControl;
  const validationCandidate=periodBundle(split.validation,best.candidate.weights);
  const validationControl=controlEvaluate(split.validation);
  const validationFallback=periodBundle(split.validation,fallback);
  const validation=freeze({candidate:validationCandidate,control:validationControl,fallback:validationFallback});
  if(!gateAdvantage(validationCandidate,validationControl,validationFallback,cfg.validationMinAdvantage)){
    return freeze({decision:'CONTROL',reasons:freeze(['validation_advantage_below_threshold']),candidateCount:candidates.length,holdoutEvaluations:0,
      availability,eligibleAxisIds:freeze(eligibleAxisIds),selectedAxisIds:best.candidate.axisIds,rawWeights:best.candidate.weights,
      train:best.train,validation,split});
  }

  const reference=Math.max(scoreOrNegInf(validationControl),scoreOrNegInf(validationFallback));
  const validationAdvantage=validationCandidate.score-reference;
  const shrunk=shrinkSelectedWeights(best.candidate.weights,{sampleCount:split.train.length,advantage:validationAdvantage,fallback});
  let holdoutEvaluations=0;
  holdoutEvaluations+=1;
  const holdoutCandidate=periodBundle(split.holdout,shrunk.weights);
  const holdoutControl=controlEvaluate(split.holdout);
  const holdoutFallback=periodBundle(split.holdout,fallback);
  const holdout=freeze({candidate:holdoutCandidate,control:holdoutControl,fallback:holdoutFallback});
  const holdoutPass=gateAdvantage(holdoutCandidate,holdoutControl,holdoutFallback,cfg.holdoutMinAdvantage)
    &&holdoutCandidate.n>=cfg.minHoldoutDays
    &&holdoutCandidate.winRate+EPSILON>=cfg.holdoutMinWinRate;
  const common={candidateCount:candidates.length,holdoutEvaluations,availability,eligibleAxisIds:freeze(eligibleAxisIds),
    selectedAxisIds:best.candidate.axisIds,rawWeights:best.candidate.weights,weights:shrunk.weights,shrink:shrunk,
    train:best.train,validation,holdout,split};
  if(!holdoutPass){
    const reasons=[];
    if(!gateAdvantage(holdoutCandidate,holdoutControl,holdoutFallback,cfg.holdoutMinAdvantage))reasons.push('holdout_advantage_below_threshold');
    if(holdoutCandidate.n<cfg.minHoldoutDays)reasons.push('holdout_insufficient_days');
    if(holdoutCandidate.winRate+EPSILON<cfg.holdoutMinWinRate)reasons.push('holdout_win_rate_below_threshold');
    return freeze({decision:'CONTROL',reasons:freeze(reasons),...common});
  }
  return freeze({decision:'SHADOW_CHAMPION',reasons:freeze(['all_gates_passed']),...common});
}
