import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreDay,evaluatePeriod,splitChronologically,validatePointInTimeSamples,sourceSignature
} from '../research/axis-auto-selector/evaluator.mjs';

const weights={'practical-v1':.55,'model-v1':.30,'strict-v1':.15};
const adapt=row=>({
  key:row.key,
  controlRank:1,
  controlScore:0,
  fixedBonus:row.hybridValidatedBonus??0,
  axes:{
    'practical-v1':row.practicalSignal,
    'model-v1':row.modelSignal,
    'strict-v1':row.strictSignal
  },
  actualES:row.actualES,
  actualP4:row.actualP4
});

function tieRows(){
  const keys=['台10','台2','台1','台12','台11','台3','台20','台4','台30','台5','台21','台6'];
  return keys.map((key,index)=>adapt({
    key,practicalSignal:.5,modelSignal:.5,strictSignal:.5,hybridValidatedBonus:0,
    actualES:1+(12-index)*.4,actualP4:.08+(12-index)*.065
  }));
}

function bonusRows(){
  return Array.from({length:12},(_,index)=>adapt({
    key:`bonus-${index+1}`,
    practicalSignal:index===0?.95:index===1?.20:.82-index*.035,
    modelSignal:index===0?.95:index===1?.20:.76-index*.025,
    strictSignal:index===0?.95:index===1?.20:.70-index*.018,
    hybridValidatedBonus:index===0?.18:index===1?1.05:(index===7?.04:0),
    actualES:index===0?1.2:index===1?5.9:2.1+(index%5)*.65,
    actualP4:index===0?.08:index===1?.94:.18+(index%5)*.14
  }));
}

function date(i){return `2026-04-${String(i+1).padStart(2,'0')}`;}
function sample(i,rows=tieRows()){
  return{
    targetDate:date(i),
    trainingCutoff:i===0?'2026-03-31':date(i-1),
    sourceSignature:`source-${i}`,
    rows
  };
}

test('scoreDay reproduces captured current utility semantics for numeric key ties',()=>{
  const day=scoreDay(tieRows(),weights);
  assert.ok(day);
  assert.equal(day.rankedKeys.slice(0,6).join(','),'台1,台2,台3,台4,台5,台6');
  assert.ok(Math.abs(day.utility-.568716)<1e-12);
  assert.ok(Math.abs(day.top3.es-1.1333333333333333)<1e-12);
  assert.ok(Math.abs(day.top3.p4-.1841666666666667)<1e-12);
});

test('scoreDay preserves the current raw fixed bonus outside normalized axis weights',()=>{
  const day=scoreDay(bonusRows(),weights);
  assert.ok(day);
  assert.ok(Math.abs(day.utility-.2051119999999998)<1e-12);
  assert.equal(day.rankedKeys[0],'bonus-2');
});

test('evaluatePeriod applies current stability penalty and win-rate adjustment',()=>{
  const positive=sample(0,tieRows());
  const negativeRows=tieRows().map((row,index)=>({...row,actualES:7-row.actualES,actualP4:1-row.actualP4,key:`n-${index+1}`}));
  const negative={...sample(1,negativeRows),sourceSignature:'negative'};
  const out=evaluatePeriod([positive,negative],weights);
  const utils=[scoreDay(positive.rows,weights).utility,scoreDay(negative.rows,weights).utility];
  const mean=(utils[0]+utils[1])/2;
  const sd=Math.sqrt(utils.reduce((sum,x)=>sum+(x-mean)**2,0)/2);
  const winRate=utils.filter(x=>x>0).length/2;
  const expected=mean-.12*sd/Math.sqrt(2)+.035*(winRate-.5);
  assert.ok(Math.abs(out.mean-mean)<1e-12);
  assert.ok(Math.abs(out.sd-sd)<1e-12);
  assert.equal(out.winRate,winRate);
  assert.ok(Math.abs(out.score-expected)<1e-12);
  assert.equal(out.n,2);
});

test('point-in-time validation rejects duplicate, unsorted, future and non-finite outcome samples',()=>{
  assert.throws(()=>validatePointInTimeSamples([sample(1),sample(0)]),/sorted|chronological/i);
  assert.throws(()=>validatePointInTimeSamples([sample(0),{...sample(1),targetDate:sample(0).targetDate,trainingCutoff:'2026-03-30'}]),/duplicate/i);
  assert.throws(()=>validatePointInTimeSamples([{...sample(0),trainingCutoff:sample(0).targetDate}]),/trainingCutoff/i);
  const bad=sample(0);bad.rows[0]={...bad.rows[0],actualES:Infinity};
  assert.throws(()=>validatePointInTimeSamples([bad]),/actualES/i);
});

test('validation snapshots and deep-freezes samples instead of exposing mutable input',()=>{
  const input=[sample(0)];
  const validated=validatePointInTimeSamples(input);
  const original=validated[0].rows[0].axes['practical-v1'];
  input[0].rows[0].axes['practical-v1']=.123;
  assert.equal(validated[0].rows[0].axes['practical-v1'],original);
  assert.ok(Object.isFrozen(validated));
  assert.ok(Object.isFrozen(validated[0]));
  assert.ok(Object.isFrozen(validated[0].rows));
  assert.ok(Object.isFrozen(validated[0].rows[0].axes));
});

test('pre-outcome source signature is immune to target outcome poisoning but sensitive to signals',()=>{
  const samples=[sample(0),sample(1)];
  const before=sourceSignature(samples);
  const poisoned=structuredClone(samples);
  poisoned[0].rows[0].actualES=999;
  poisoned[0].rows[0].actualP4=0;
  assert.equal(sourceSignature(poisoned),before);
  poisoned[0].rows[0].axes['practical-v1']+=.01;
  assert.notEqual(sourceSignature(poisoned),before);
});

test('chronological split uses exact 12/6/6 default allocation for 24 days',()=>{
  const samples=Array.from({length:24},(_,i)=>sample(i));
  const split=splitChronologically(samples,{
    minEvaluatedDays:24,minTrainDays:12,minValidationDays:6,minHoldoutDays:6,
    split:{train:.5,validation:.25,holdout:.25}
  });
  assert.equal(split.ok,true);
  assert.equal(split.train.length,12);
  assert.equal(split.validation.length,6);
  assert.equal(split.holdout.length,6);
  assert.ok(split.train.at(-1).targetDate<split.validation[0].targetDate);
  assert.ok(split.validation.at(-1).targetDate<split.holdout[0].targetDate);
});

test('chronological split abstains explicitly when minimum history is unavailable',()=>{
  const samples=Array.from({length:23},(_,i)=>sample(i));
  const split=splitChronologically(samples,{
    minEvaluatedDays:24,minTrainDays:12,minValidationDays:6,minHoldoutDays:6,
    split:{train:.5,validation:.25,holdout:.25}
  });
  assert.equal(split.ok,false);
  assert.equal(split.reason,'insufficient_history');
});
