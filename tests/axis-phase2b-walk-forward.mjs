import test from 'node:test';
import assert from 'node:assert/strict';
import {createAxisRegistry} from '../research/axis-auto-selector/registry.mjs';
import {runWalkForwardBacktest} from '../research/axis-auto-selector/walk-forward.mjs';

function shift(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
const registry=createAxisRegistry([{
 id:'practical-v1',label:'Practical only',version:1,approved:true,
 sourceId:'jugest-row:practicalSignal',sourceField:'practicalSignal',aliases:[],
 scope:'prediction-row',minHistory:0,availability:'finite-source-value',audit:'Phase2B deterministic fixture',
 correlationGroup:'practical',maxWeight:1
}]);
function makeBundle(count=44){
 const samples=Array.from({length:count},(_,day)=>({
  targetDate:shift('2026-01-01',day),trainingCutoff:shift('2025-12-31',day),sourceSignature:`sig-${day}`,
  rows:Array.from({length:12},(_,i)=>{
   const practical=(11-i)/11;
   return{
    key:`my|${i+1}`,controlRank:12-i,controlScore:i/11,fixedBonus:0,
    axes:{'practical-v1':practical},actualES:1+practical*5,actualP4:.05+practical*.9
   };
  })
 }));
 return{schema:'jugest-axis-samples-v1',store:'A',samples};
}
function preOutcome(receipt){
 return{
  store:receipt.store,targetDate:receipt.targetDate,selectorDecision:receipt.selectorDecision,
  operationalDecision:receipt.operationalDecision,ensembleKey:receipt.ensembleKey,gate:receipt.gate,
  controlRankedKeys:receipt.controlRankedKeys,shadowRankedKeys:receipt.shadowRankedKeys,
  operationalRankedKeys:receipt.operationalRankedKeys,preOutcomeHash:receipt.preOutcomeHash
 };
}

test('Phase2B blocks cold-start Shadow but preserves its frozen counterfactual ranking',async()=>{
 const result=await runWalkForwardBacktest({bundle:makeBundle(40),warmupDays:24,registry});
 const first=result.receipts[0];
 assert.equal(first.decision,'SHADOW_CHAMPION');
 assert.equal(first.selectorDecision,'SHADOW_CHAMPION');
 assert.equal(first.operationalDecision,'CONTROL');
 assert.equal(first.gate.reason,'oos_insufficient_evidence');
 assert.equal(first.gate.evidenceCount,0);
 assert.deepEqual(first.operationalRankedKeys,first.controlRankedKeys);
 assert.notDeepEqual(first.shadowRankedKeys,first.controlRankedKeys);
 assert.equal(first.operationalUtility,first.controlUtility);
 assert.ok(first.shadowUtility>first.controlUtility);
});

test('blocked counterfactual outcomes build exact-ensemble evidence and release the 13th Shadow opportunity',async()=>{
 const result=await runWalkForwardBacktest({bundle:makeBundle(40),warmupDays:24,registry});
 assert.equal(result.receipts.length,16);
 const blocked=result.receipts.slice(0,12);
 assert.ok(blocked.every(receipt=>receipt.selectorDecision==='SHADOW_CHAMPION'&&receipt.operationalDecision==='CONTROL'));
 assert.ok(blocked.every(receipt=>receipt.utilityDelta>0));
 assert.equal(new Set(blocked.map(receipt=>receipt.ensembleKey)).size,1);
 const released=result.receipts[12];
 assert.equal(released.gate.evidenceCount,12);
 assert.deepEqual(released.gate.evidenceDates,blocked.map(receipt=>receipt.targetDate));
 assert.equal(released.gate.stateBefore,'BLOCKED');
 assert.equal(released.gate.stateAfter,'ALLOWED');
 assert.equal(released.gate.reason,'oos_gate_released');
 assert.equal(released.operationalDecision,'SHADOW_CHAMPION');
 assert.deepEqual(released.operationalRankedKeys,released.shadowRankedKeys);
 assert.equal(released.operationalUtility,released.shadowUtility);
});

test('changing current target outcomes cannot change its gate decision, evidence, ranks, or pre-outcome hash',async()=>{
 const bundle=makeBundle(44),targetIndex=36;
 const original=await runWalkForwardBacktest({bundle,warmupDays:24,registry});
 const poisoned=structuredClone(bundle);
 poisoned.samples[targetIndex].rows.forEach((row,i)=>{row.actualES=99-i;row.actualP4=.99-i*.01});
 const changed=await runWalkForwardBacktest({bundle:poisoned,warmupDays:24,registry});
 const receiptIndex=targetIndex-24;
 assert.deepEqual(preOutcome(changed.receipts[receiptIndex]),preOutcome(original.receipts[receiptIndex]));
 assert.notEqual(changed.receipts[receiptIndex].shadowUtility,original.receipts[receiptIndex].shadowUtility);
});

test('future outcome poisoning cannot change earlier Phase2B receipts',async()=>{
 const bundle=makeBundle(44),cutoff=bundle.samples[38].targetDate;
 const original=await runWalkForwardBacktest({bundle,warmupDays:24,registry,endDate:cutoff});
 const poisoned=structuredClone(bundle);
 poisoned.samples.forEach(sample=>{if(sample.targetDate>cutoff)sample.rows.forEach(row=>{row.actualES=999;row.actualP4=999})});
 const changed=await runWalkForwardBacktest({bundle:poisoned,warmupDays:24,registry,endDate:cutoff});
 assert.deepEqual(changed,original);
});

test('Phase2B receipts and gate evidence are deterministic across reruns',async()=>{
 const bundle=makeBundle(40);
 const a=await runWalkForwardBacktest({bundle,warmupDays:24,registry});
 const b=await runWalkForwardBacktest({bundle,warmupDays:24,registry});
 assert.deepEqual(b,a);
});
