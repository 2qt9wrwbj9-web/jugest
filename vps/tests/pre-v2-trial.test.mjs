import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFormalDay,
  formalTrialDecision,
  startFormalTrial,
} from '../src/research/pre-v2/trial.mjs';
import {alphaForTrial} from '../src/research/pre-v2/sequential.mjs';

function start(overrides={}){
  return startFormalTrial({
    storeId:'store-a',
    lineageId:'lineage-a',
    trialNumber:1,
    championFingerprint:'champion-1',
    challengerFingerprint:'challenger-1',
    machineSetHash:'machines-v1',
    scorerVersion:'pre-v2-score-v1',
    ...overrides,
  });
}

function dateAt(index){
  return `2026-10-${String(index+1).padStart(2,'0')}`;
}

test('formal trial fixes promotion alpha from the lineage trial number at start',()=>{
  const trial=start({trialNumber:3});
  assert.equal(trial.trialNumber,3);
  assert.equal(trial.promotionAlpha,alphaForTrial(3));
  assert.equal(trial.safetyAlpha,0.05);
  assert.equal(trial.status,'running');
});

test('promotion occurs only after Top10 anytime evidence crosses 1/alpha_k',()=>{
  let trial=start();
  for(let i=0;i<27;i+=1){
    trial=applyFormalDay(trial,{targetDate:dateAt(i),top10Delta:0.4,top5Delta:0});
  }
  assert.equal(formalTrialDecision(trial).decision,'pending');
  trial=applyFormalDay(trial,{targetDate:dateAt(27),top10Delta:0.4,top5Delta:0});
  const decision=formalTrialDecision(trial);
  assert.equal(decision.decision,'promote');
  assert.equal(trial.status,'promoted');
  assert.ok(decision.top10.maxEValue>=1/trial.promotionAlpha);
});

test('Top5 statistically supported degradation vetoes promotion even if Top10 crosses on the same day',()=>{
  let trial=start();
  for(let i=0;i<28;i+=1){
    trial=applyFormalDay(trial,{targetDate:dateAt(i),top10Delta:0.4,top5Delta:-0.4});
    if(trial.status!=='running')break;
  }
  const decision=formalTrialDecision(trial);
  assert.equal(decision.decision,'block_top5_degradation');
  assert.equal(trial.status,'blocked');
  assert.equal(decision.top5Degradation.crossed,true);
});

test('Top5 need not prove equivalence or improvement when no degradation evidence crosses',()=>{
  let trial=start();
  for(let i=0;i<40&&trial.status==='running';i+=1){
    trial=applyFormalDay(trial,{targetDate:dateAt(i),top10Delta:0.4,top5Delta:0});
  }
  assert.equal(trial.status,'promoted');
  assert.equal(formalTrialDecision(trial).top5Degradation.crossed,false);
});

test('non-informative IDCG-zero formal day is kept as zero evidence update, not removed',()=>{
  let trial=start();
  trial=applyFormalDay(trial,{
    targetDate:'2026-10-01',
    top10Delta:0,
    top5Delta:0,
    top10Informative:false,
    top5Informative:false,
  });
  assert.equal(trial.daysProcessed,1);
  assert.equal(trial.nonInformativeTop10Days,1);
  assert.equal(trial.nonInformativeTop5Days,1);
  assert.equal(trial.top10.count,1);
  assert.equal(trial.top5Degradation.count,1);
  assert.equal(trial.top10.cumulativeSum,0);
  assert.equal(trial.top5Degradation.cumulativeSum,0);
});

test('formal target dates must be unique and strictly increasing',()=>{
  let trial=start();
  trial=applyFormalDay(trial,{targetDate:'2026-10-02',top10Delta:0,top5Delta:0});
  assert.throws(()=>applyFormalDay(trial,{targetDate:'2026-10-02',top10Delta:0,top5Delta:0}),/strictly increasing/i);
  assert.throws(()=>applyFormalDay(trial,{targetDate:'2026-10-01',top10Delta:0,top5Delta:0}),/strictly increasing/i);
});

test('completed or blocked formal trial cannot accept more evidence',()=>{
  let promoted=start();
  for(let i=0;i<40&&promoted.status==='running';i+=1){
    promoted=applyFormalDay(promoted,{targetDate:dateAt(i),top10Delta:0.4,top5Delta:0});
  }
  assert.equal(promoted.status,'promoted');
  assert.throws(()=>applyFormalDay(promoted,{targetDate:'2026-11-30',top10Delta:0,top5Delta:0}),/not running/i);

  let blocked=start({challengerFingerprint:'challenger-2'});
  for(let i=0;i<40&&blocked.status==='running';i+=1){
    blocked=applyFormalDay(blocked,{targetDate:dateAt(i),top10Delta:0,top5Delta:-0.5});
  }
  assert.equal(blocked.status,'blocked');
  assert.throws(()=>applyFormalDay(blocked,{targetDate:'2026-11-30',top10Delta:0,top5Delta:0}),/not running/i);
});
