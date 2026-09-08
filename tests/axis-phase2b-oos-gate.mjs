import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_OOS_GATE_CONFIG,evaluateOperationalGate} from '../research/axis-auto-selector/oos-gate.mjs';

function shift(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function close(actual,expected,epsilon=1e-12){assert.ok(Math.abs(actual-expected)<=epsilon,`expected ${actual} to be within ${epsilon} of ${expected}`)}
function receipt(i,{store='A',ensembleKey='E1',delta=.01,selectorDecision='SHADOW_CHAMPION'}={}){
 return{
  store,targetDate:shift('2026-01-01',i),selectorDecision,ensembleKey,
  utilityDelta:delta,preOutcomeHash:`hash-${store}-${ensembleKey}-${i}`,
  gate:{stateAfter:'BLOCKED'}
 };
}
function evaluate({priorReceipts=[],ensembleKey='E1',selectorDecision='SHADOW_CHAMPION',previousState='BLOCKED',targetDate='2026-04-01',store='A',config}={}){
 return evaluateOperationalGate({store,targetDate,ensembleKey,selectorDecision,priorReceipts,previousState,config});
}

test('defaults are frozen at the Phase2B research contract',()=>{
 assert.deepEqual(DEFAULT_OOS_GATE_CONFIG,{minEvidenceDays:12,windowEligibleDays:24,releaseScore:.002,keepScore:0,uncertaintyPenalty:.12});
 assert.equal(Object.isFrozen(DEFAULT_OOS_GATE_CONFIG),true);
});

test('cold start blocks until exact store and ensemble have 12 prior eligible receipts',()=>{
 const prior=Array.from({length:11},(_,i)=>receipt(i));
 const result=evaluate({priorReceipts:prior});
 assert.equal(result.operationalDecision,'CONTROL');
 assert.equal(result.stateBefore,'BLOCKED');
 assert.equal(result.stateAfter,'BLOCKED');
 assert.equal(result.reason,'oos_insufficient_evidence');
 assert.equal(result.evidenceCount,11);
 assert.deepEqual(result.evidenceDates,prior.map(item=>item.targetDate));
});

test('other ensemble and other store evidence is never borrowed',()=>{
 const prior=[
  ...Array.from({length:11},(_,i)=>receipt(i)),
  receipt(11,{ensembleKey:'E2'}),
  receipt(12,{store:'B'})
 ];
 const result=evaluate({priorReceipts:prior});
 assert.equal(result.evidenceCount,11);
 assert.equal(result.operationalDecision,'CONTROL');
 assert.equal(result.reason,'oos_insufficient_evidence');
});

test('blocked ensemble releases after 12 positive exact-ensemble OOS deltas',()=>{
 const prior=Array.from({length:12},(_,i)=>receipt(i,{delta:.01}));
 const result=evaluate({priorReceipts:prior,previousState:'BLOCKED'});
 assert.equal(result.operationalDecision,'SHADOW_CHAMPION');
 assert.equal(result.stateAfter,'ALLOWED');
 assert.equal(result.reason,'oos_gate_released');
 assert.equal(result.evidenceCount,12);
 close(result.meanDelta,.01);
 close(result.sdDelta,0);
 close(result.oosScore,.01);
});

test('allowed ensemble stays allowed at positive score below release threshold',()=>{
 const prior=Array.from({length:12},(_,i)=>receipt(i,{delta:.001}));
 const result=evaluate({priorReceipts:prior,previousState:'ALLOWED'});
 close(result.oosScore,.001);
 assert.ok(result.oosScore<DEFAULT_OOS_GATE_CONFIG.releaseScore);
 assert.equal(result.operationalDecision,'SHADOW_CHAMPION');
 assert.equal(result.stateAfter,'ALLOWED');
 assert.equal(result.reason,'oos_gate_kept');
});

test('allowed ensemble blocks when its conservative OOS score turns negative',()=>{
 const prior=Array.from({length:12},(_,i)=>receipt(i,{delta:-.002}));
 const result=evaluate({priorReceipts:prior,previousState:'ALLOWED'});
 assert.equal(result.operationalDecision,'CONTROL');
 assert.equal(result.stateAfter,'BLOCKED');
 assert.equal(result.reason,'oos_gate_blocked');
 assert.ok(result.oosScore<0);
});

test('blocked ensemble can recover when its rolling exact-ensemble evidence improves',()=>{
 const prior=Array.from({length:24},(_,i)=>receipt(i,{delta:.006}));
 const result=evaluate({priorReceipts:prior,previousState:'BLOCKED'});
 assert.equal(result.operationalDecision,'SHADOW_CHAMPION');
 assert.equal(result.stateAfter,'ALLOWED');
 assert.equal(result.reason,'oos_gate_released');
});

test('only latest 24 exact-ensemble receipts enter the rolling score',()=>{
 const oldBad=Array.from({length:12},(_,i)=>receipt(i,{delta:-.1}));
 const recentGood=Array.from({length:24},(_,i)=>receipt(i+12,{delta:.01}));
 const result=evaluate({priorReceipts:[...oldBad,...recentGood],previousState:'BLOCKED'});
 assert.equal(result.evidenceCount,24);
 assert.deepEqual(result.evidenceDates,recentGood.map(item=>item.targetDate));
 close(result.meanDelta,.01);
 assert.equal(result.operationalDecision,'SHADOW_CHAMPION');
});

test('selector CONTROL can never be promoted and carries its exact-ensemble state',()=>{
 const prior=Array.from({length:24},(_,i)=>receipt(i,{delta:.1}));
 const result=evaluate({priorReceipts:prior,selectorDecision:'CONTROL',previousState:'ALLOWED'});
 assert.equal(result.operationalDecision,'CONTROL');
 assert.equal(result.stateBefore,'ALLOWED');
 assert.equal(result.stateAfter,'ALLOWED');
 assert.equal(result.reason,'selector_control');
});

test('same-store current or future receipts fail chronology closed',()=>{
 const prior=[receipt(0),receipt(1)];
 assert.throws(()=>evaluate({priorReceipts:prior,targetDate:prior[1].targetDate}),/prior|target|chronolog/i);
});

test('malformed exact-ensemble eligible evidence fails closed instead of being skipped',()=>{
 const prior=Array.from({length:12},(_,i)=>receipt(i));
 delete prior[5].utilityDelta;
 assert.throws(()=>evaluate({priorReceipts:prior}),/utilityDelta/i);
 const badHash=Array.from({length:12},(_,i)=>receipt(i));
 badHash[4].preOutcomeHash='';
 assert.throws(()=>evaluate({priorReceipts:badHash}),/preOutcomeHash/i);
});

test('invalid config, state, dates, or identifiers are rejected deterministically',()=>{
 assert.throws(()=>evaluate({ensembleKey:''}),/ensembleKey/i);
 assert.throws(()=>evaluate({store:''}),/store/i);
 assert.throws(()=>evaluate({targetDate:'bad'}),/targetDate/i);
 assert.throws(()=>evaluate({previousState:'MAYBE'}),/state/i);
 assert.throws(()=>evaluate({config:{...DEFAULT_OOS_GATE_CONFIG,minEvidenceDays:0}}),/minEvidenceDays/i);
 assert.throws(()=>evaluate({config:{...DEFAULT_OOS_GATE_CONFIG,windowEligibleDays:11}}),/windowEligibleDays/i);
 assert.throws(()=>evaluate({config:{...DEFAULT_OOS_GATE_CONFIG,releaseScore:-1}}),/releaseScore/i);
});

test('result and evidence arrays are deeply frozen',()=>{
 const result=evaluate({priorReceipts:Array.from({length:12},(_,i)=>receipt(i))});
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.evidenceDates),true);
});
