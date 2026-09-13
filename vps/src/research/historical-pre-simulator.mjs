import {buildWalkForwardDataset,buildLivePredictionRows,splitChronologicalSamples,DATASET_VERSION} from './backtest.mjs';
import {discoverAxes} from './axis-discovery.mjs';
import {baselineModel,evaluateModel,fingerprintModel,scoreSample,searchModels,shouldConverge,MODEL_VERSION} from './model-search.mjs';
import {hashCanonical} from '../canonical-json.mjs';
import {HISTORICAL_REPLAY_VERSION} from './historical-comparison.mjs';

function adaptiveMinSupport(sampleCount){return Math.max(8,Math.min(30,Math.floor(Math.max(1,sampleCount)*.02)))}
function holdoutBetter(a,b){if(!b)return true;for(const key of ['top3Lift','top5Lift','rankCorrelation']){const av=Number(a.score?.[key])||0,bv=Number(b.score?.[key])||0;if(av!==bv)return av>bv}return String(a.fingerprint).localeCompare(String(b.fingerprint))<0}
function freezeRegistry(rows){return Object.freeze(rows.map(row=>Object.freeze({fingerprint:row.fingerprint,model:row.model,generation:Number(row.generation)||0})))}

export function initialHistoricalPreState(){
  const model=baselineModel();
  return Object.freeze({
    replayVersion:HISTORICAL_REPLAY_VERSION,
    model,
    fingerprint:model.fingerprint,
    generation:0,
    seenFingerprints:Object.freeze([model.fingerprint]),
    champions:freezeRegistry([{fingerprint:model.fingerprint,model,generation:0}]),
    frontierDate:null
  });
}

export function evolveHistoricalPreState({storeId,historyDays,state=initialHistoricalPreState(),maxSearchRounds=64}={}){
  const id=String(storeId??'').trim();if(!id)throw new TypeError('storeId is required');
  if(!Number.isInteger(maxSearchRounds)||maxSearchRounds<1)throw new TypeError('maxSearchRounds must be a positive integer');
  const ordered=[...(Array.isArray(historyDays)?historyDays:[])].filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(String(day?.date||''))).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const frontierDate=ordered.at(-1)?.date??null;
  if(!frontierDate)return Object.freeze({state,datasetHash:null,converged:false,reason:'insufficient_data'});
  const dataset=buildWalkForwardDataset({storeId:id,days:ordered,minHistoryDays:4}),split=splitChronologicalSamples(dataset.samples);
  if(!split.train.length||!split.validation.length||!split.holdout.length){
    return Object.freeze({state:Object.freeze({...state,frontierDate}),datasetHash:dataset.inputHash,converged:false,reason:'insufficient_data'});
  }

  let model=state.model??baselineModel(),generation=Number(state.generation)||0,noImproveCount=0;
  const seen=new Set(Array.isArray(state.seenFingerprints)?state.seenFingerprints:[fingerprintModel(model)]);
  const registry=new Map((Array.isArray(state.champions)?state.champions:[]).map(row=>[row.fingerprint,{fingerprint:row.fingerprint,model:row.model,generation:Number(row.generation)||0}]));
  const currentFingerprint=fingerprintModel(model);if(!registry.has(currentFingerprint))registry.set(currentFingerprint,{fingerprint:currentFingerprint,model,generation});seen.add(currentFingerprint);
  const minSupport=adaptiveMinSupport(split.train.length),axes=discoverAxes(split.train,{minSupport,maxAxes:32,fdrQ:.10,foldCount:4,maxPairSeeds:8});

  let converged=false,reason=null;
  for(let round=0;round<maxSearchRounds;round+=1){
    const championFingerprint=fingerprintModel(model),search=searchModels({champion:model,axes,train:split.train,validation:split.validation,round,maxCandidates:128}),best=search.best;
    const proposed=best?.model?.fingerprint??null,repeated=Boolean(proposed&&seen.has(proposed)&&proposed!==championFingerprint);
    if(search.improved&&best?.model&&!repeated&&proposed!==championFingerprint){
      model=best.model;generation+=1;noImproveCount=0;seen.add(proposed);registry.set(proposed,{fingerprint:proposed,model,generation});continue;
    }
    if(proposed&&proposed!==championFingerprint&&!repeated)seen.add(proposed);
    noImproveCount+=1;
    const stop=shouldConverge({seenFingerprints:repeated?new Set([proposed]):new Set(),proposedFingerprint:proposed,noImproveCount});
    if(stop){converged=true;reason=stop.reason;break}
  }

  if(converged){
    let winner=null;
    for(const row of [...registry.values()].sort((a,b)=>a.generation-b.generation||a.fingerprint.localeCompare(b.fingerprint))){
      const candidate={...row,score:evaluateModel(split.holdout,row.model)};
      if(holdoutBetter(candidate,winner))winner=candidate;
    }
    if(winner)model=winner.model;
  }
  const next=Object.freeze({
    replayVersion:HISTORICAL_REPLAY_VERSION,model,fingerprint:fingerprintModel(model),generation,
    seenFingerprints:Object.freeze([...seen].sort()),champions:freezeRegistry([...registry.values()].sort((a,b)=>a.generation-b.generation||a.fingerprint.localeCompare(b.fingerprint))),frontierDate
  });
  return Object.freeze({state:next,datasetHash:dataset.inputHash,converged,reason:converged?reason:'search_round_cap',featureVersion:DATASET_VERSION});
}

export function predictHistoricalPre({storeId,historyDays,targetDate,state,datasetHash=null}={}){
  const id=String(storeId??'').trim(),target=String(targetDate??'').trim();if(!id)throw new TypeError('storeId is required');if(!/^\d{4}-\d{2}-\d{2}$/.test(target))throw new TypeError('targetDate must be YYYY-MM-DD');
  const eligible=[...(Array.isArray(historyDays)?historyDays:[])].filter(day=>String(day?.date||'')<target).sort((a,b)=>String(a.date).localeCompare(String(b.date))),sourceFrontierDate=eligible.at(-1)?.date??null;
  const model=state?.model;if(!model||!sourceFrontierDate)return Object.freeze({available:false,rankings:Object.freeze([]),targetDate:target,sourceFrontierDate});
  const rows=buildLivePredictionRows({storeId:id,days:eligible,targetDate:target});
  const rankings=rows.map(row=>({...row,score:scoreSample(row,model)})).sort((a,b)=>b.score-a.score||String(a.machineKey).localeCompare(String(b.machineKey))).map((row,index)=>Object.freeze({machineKey:row.machineKey,tableNo:row.tableNo,machineName:row.machineName,score:row.score,rank:index+1}));
  const modelFingerprint=fingerprintModel(model),inputHash=hashCanonical({replayVersion:HISTORICAL_REPLAY_VERSION,engineVersion:MODEL_VERSION,featureVersion:DATASET_VERSION,storeId:id,targetDate:target,sourceFrontierDate,modelFingerprint,datasetHash,rows});
  return Object.freeze({available:rankings.length>0,engineVersion:MODEL_VERSION,featureVersion:DATASET_VERSION,modelFingerprint,targetDate:target,sourceFrontierDate,inputHash,rankings:Object.freeze(rankings)});
}

export const __test={adaptiveMinSupport,holdoutBetter};
