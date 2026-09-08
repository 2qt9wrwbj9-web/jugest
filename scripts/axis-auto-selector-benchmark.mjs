#!/usr/bin/env node
import {performance} from 'node:perf_hooks';
import {createAxisRegistry} from '../research/axis-auto-selector/registry.mjs';
import {selectShadowEnsemble,DEFAULT_SELECTOR_CONFIG} from '../research/axis-auto-selector/selector.mjs';

const DAY_MS=86400000;
const ymd=ms=>new Date(ms).toISOString().slice(0,10);

function makeRows(dayIndex){
  return Array.from({length:12},(_,rowIndex)=>{
    const practical=((11-rowIndex)+dayIndex%3)/13;
    const model=((rowIndex*5+dayIndex*2)%13)/12;
    const strict=((rowIndex*3+dayIndex*5+1)%13)/12;
    const latent=.62*practical+.23*model+.15*strict;
    return{
      key:`table-${rowIndex+1}`,
      controlRank:rowIndex+1,
      controlScore:.55*practical+.30*model+.15*strict,
      fixedBonus:(dayIndex+rowIndex)%17===0?.025:0,
      axes:{'practical-v1':practical,'model-v1':model,'strict-v1':strict},
      actualES:1+5*latent,
      actualP4:Math.max(0,Math.min(1,latent))
    };
  });
}

function makeSamples(days){
  const start=Date.parse('2026-01-01T00:00:00Z');
  return Array.from({length:days},(_,dayIndex)=>{
    const target=start+dayIndex*DAY_MS;
    return{
      targetDate:ymd(target),
      trainingCutoff:ymd(target-DAY_MS),
      sourceSignature:`benchmark-${dayIndex}`,
      rows:makeRows(dayIndex)
    };
  });
}

function measure(days){
  const registry=createAxisRegistry();
  const samples=makeSamples(days);
  const before=process.memoryUsage();
  const started=performance.now();
  const result=selectShadowEnsemble({samples,registry});
  const elapsedMs=performance.now()-started;
  const after=process.memoryUsage();
  if((result.candidateCount??0)>DEFAULT_SELECTOR_CONFIG.maxCandidateEnsembles){
    throw new RangeError(`candidate count ${result.candidateCount} exceeds ${DEFAULT_SELECTOR_CONFIG.maxCandidateEnsembles}`);
  }
  return{
    evaluatedDates:days,
    axisCount:registry.approved().length,
    candidateEnsembles:result.candidateCount??0,
    elapsedMs:Number(elapsedMs.toFixed(3)),
    rssBefore:before.rss,
    rssAfter:after.rss,
    heapUsedPeakApprox:Math.max(before.heapUsed,after.heapUsed),
    decision:result.decision,
    selectedAxisCount:result.selectedAxisIds?.length??0,
    holdoutEvaluations:result.holdoutEvaluations??0
  };
}

const report={
  schema:'jugest-axis-shadow-performance-v1',
  node:process.version,
  platform:`${process.platform}-${process.arch}`,
  maxCandidateEnsembles:DEFAULT_SELECTOR_CONFIG.maxCandidateEnsembles,
  measurements:{
    deterministic24:measure(24),
    synthetic180:measure(180)
  }
};
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
