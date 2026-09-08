import test from 'node:test';
import assert from 'node:assert/strict';
import {runWalkForwardBacktest} from '../research/axis-auto-selector/walk-forward.mjs';

function shift(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function makeBundle(count=40){
 const samples=Array.from({length:count},(_,day)=>({
  targetDate:shift('2026-01-01',day),trainingCutoff:shift('2025-12-31',day),sourceSignature:`sig-${day}`,
  rows:Array.from({length:12},(_,i)=>{
   const practical=(11-i)/11;
   const model=((i*7+day*3)%12)/11;
   const strict=((i*5+day*2+1)%12)/11;
   return{
    key:`my|${i+1}`,
    controlRank:12-i,
    controlScore:i/11,
    fixedBonus:0,
    axes:{'practical-v1':practical,'model-v1':model,'strict-v1':strict},
    actualES:1+practical*5,
    actualP4:.05+practical*.9
   };
  })
 }));
 return{schema:'jugest-axis-samples-v1',store:'A',samples};
}
function preOutcomeReceipt(receipt){
 return{
  targetDate:receipt.targetDate,historyThrough:receipt.historyThrough,decision:receipt.decision,
  profileId:receipt.profileId,ensembleKey:receipt.ensembleKey,preOutcomeHash:receipt.preOutcomeHash,
  controlRankedKeys:receipt.controlRankedKeys,shadowRankedKeys:receipt.shadowRankedKeys
 };
}

test('walk-forward uses exact 24-day warm-up and freezes same-day prediction before outcome scoring',async()=>{
 const bundle=makeBundle(40);
 const result=await runWalkForwardBacktest({bundle,warmupDays:24});
 assert.equal(result.schema,'jugest-axis-walk-forward-v1');
 assert.equal(result.store,'A');
 assert.equal(result.warmup.count,24);
 assert.equal(result.receipts.length,16);
 assert.equal(result.receipts[0].targetDate,bundle.samples[24].targetDate);
 assert.equal(result.receipts[0].historyThrough,bundle.samples[23].targetDate);
 assert.equal(result.receipts[0].historyCount,24);
 assert.equal(result.receipts[0].decision,'SHADOW_CHAMPION');
 assert.ok(result.receipts[0].shadowUtility>result.receipts[0].controlUtility);
 assert.equal(result.summary.evaluatedDays,16);
 assert.equal(result.summary.warmupDays,24);
 assert.ok(result.summary.shadowChampionDays>0);
});

test('target outcome poisoning cannot change target profile, ranks, or pre-outcome receipt hash',async()=>{
 const bundle=makeBundle(40),targetIndex=24;
 const original=await runWalkForwardBacktest({bundle,warmupDays:24});
 const poisoned=structuredClone(bundle);
 poisoned.samples[targetIndex].rows.forEach((row,i)=>{row.actualES=6-(i%6);row.actualP4=.99-i*.04});
 const changed=await runWalkForwardBacktest({bundle:poisoned,warmupDays:24});
 assert.deepEqual(preOutcomeReceipt(changed.receipts[0]),preOutcomeReceipt(original.receipts[0]));
 assert.notEqual(changed.receipts[0].shadowUtility,original.receipts[0].shadowUtility);
});

test('future poisoning cannot flow backward into earlier receipts',async()=>{
 const bundle=makeBundle(44),cutoff=bundle.samples[31].targetDate;
 const original=await runWalkForwardBacktest({bundle,warmupDays:24,endDate:cutoff});
 const poisoned=structuredClone(bundle);
 poisoned.samples.forEach(sample=>{if(sample.targetDate>cutoff)sample.rows.forEach(row=>{row.actualES=99;row.actualP4=99;row.axes['practical-v1']=0})});
 const changed=await runWalkForwardBacktest({bundle:poisoned,warmupDays:24,endDate:cutoff});
 assert.deepEqual(changed,original);
});

test('walk-forward report counts control abstention and ensemble changes without treating profile-id churn as a model change',async()=>{
 const bundle=makeBundle(32);
 const result=await runWalkForwardBacktest({bundle,warmupDays:24});
 assert.equal(result.summary.evaluatedDays,8);
 assert.ok(Number.isFinite(result.summary.control.meanUtility));
 assert.ok(Number.isFinite(result.summary.shadow.meanUtility));
 assert.ok(Number.isFinite(result.summary.delta.meanUtility));
 assert.ok(result.summary.ensembleChanges>=0);
 assert.ok(result.summary.ensembleChanges<result.summary.evaluatedDays);
 assert.equal(result.summary.shadowWins+result.summary.controlWins+result.summary.ties,result.summary.evaluatedDays);
});

test('walk-forward rejects wrong schema, unsorted samples, and a store mismatch',async()=>{
 const bundle=makeBundle(30);
 await assert.rejects(()=>runWalkForwardBacktest({bundle:{...bundle,schema:'wrong'}}),/schema/i);
 const unsorted=structuredClone(bundle);[unsorted.samples[1],unsorted.samples[2]]=[unsorted.samples[2],unsorted.samples[1]];
 await assert.rejects(()=>runWalkForwardBacktest({bundle:unsorted}),/chronological|sorted/i);
 await assert.rejects(()=>runWalkForwardBacktest({bundle:{...bundle,store:'B'},store:'A'}),/store/i);
});
