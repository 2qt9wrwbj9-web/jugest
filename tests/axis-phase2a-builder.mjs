import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHistoricalSampleBundle} from '../research/axis-auto-selector/historical-builder.mjs';

function shift(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function makeDays(count=32){
 return Array.from({length:count},(_,dayIndex)=>({
  date:shift('2026-01-01',dayIndex),shop:'A',createdAt:1000+dayIndex,updatedAt:1000+dayIndex,
  machines:Array.from({length:12},(_,i)=>({machine:'my',tableNo:String(i+1),games:6000+i*10,diff:dayIndex*10+i,bb:20+i%3,rb:14+i%4,truthES:1+((dayIndex+i)%6),truthP4:.05+((dayIndex+i)%6)*.15}))
 }))
}
function fakeRuntime(spy=[]){
 return{
  normalizeDay(day){return structuredClone(day)},
  ensureExternalJudgedSync(days){for(const day of days)for(const row of day.machines||[]){row.expectedSetting=row.truthES;row.p4=row.truthP4}},
  predictStore(store,targetDate,sourceDays){
   spy.push({store,targetDate,dates:sourceDays.map(d=>d.date)});
   if(sourceDays.length<5)return null;
   return{rows:Array.from({length:12},(_,i)=>({
    machine:'my',tableNo:String(i+1),rank:i+1,hybridScore:.95-i*.05,
    practicalSignal:.95-i*.04,modelSignal:.2+i*.03,strictSignal:.8-i*.02,hybridValidatedBonus:i===0?.03:0
   }))};
  }
 };
}

function preOutcome(sample){
 return{
  targetDate:sample.targetDate,trainingCutoff:sample.trainingCutoff,sourceSignature:sample.sourceSignature,
  rows:sample.rows.map(({actualES,actualP4,...row})=>row)
 };
}

test('historical builder gives prediction runtime only dates strictly before each target',()=>{
 const calls=[];
 const bundle=buildHistoricalSampleBundle({store:'A',days:makeDays(),runtime:fakeRuntime(calls),startDate:'2026-01-08',endDate:'2026-01-15'});
 assert.equal(bundle.schema,'jugest-axis-samples-v1');
 assert.equal(bundle.store,'A');
 assert.ok(bundle.samples.length>0);
 for(const call of calls){
  assert.ok(call.dates.length>=5);
  assert.ok(call.dates.every(date=>date<call.targetDate),`${call.targetDate} received only prior history`);
 }
 for(const sample of bundle.samples){
  assert.ok(sample.trainingCutoff<sample.targetDate);
  assert.equal(sample.rows.length,12);
  assert.ok(sample.rows.every(row=>Number.isFinite(row.actualES)&&Number.isFinite(row.actualP4)));
 }
});

test('historical builder judges normalized store history once and reuses judged snapshots',()=>{
 const runtime=fakeRuntime(),judge=runtime.ensureExternalJudgedSync.bind(runtime);let judgeCalls=0;
 runtime.ensureExternalJudgedSync=(days,store)=>{judgeCalls+=1;return judge(days,store)};
 const bundle=buildHistoricalSampleBundle({store:'A',days:makeDays(),runtime,startDate:'2026-01-08',endDate:'2026-01-15'});
 assert.ok(bundle.samples.length>0);
 assert.equal(judgeCalls,1);
});

test('target outcome poisoning changes outcome only, never that target pre-outcome snapshot',()=>{
 const days=makeDays(),target='2026-01-12';
 const original=buildHistoricalSampleBundle({store:'A',days,runtime:fakeRuntime(),startDate:target,endDate:target});
 const poisoned=structuredClone(days);
 const targetDay=poisoned.find(day=>day.date===target);
 targetDay.machines.forEach((row,i)=>{row.truthES=6-(i%6);row.truthP4=.99-i*.03});
 const changed=buildHistoricalSampleBundle({store:'A',days:poisoned,runtime:fakeRuntime(),startDate:target,endDate:target});
 assert.deepEqual(preOutcome(changed.samples[0]),preOutcome(original.samples[0]));
 assert.notDeepEqual(changed.samples[0].rows.map(r=>[r.actualES,r.actualP4]),original.samples[0].rows.map(r=>[r.actualES,r.actualP4]));
});

test('future poisoning cannot change already-built historical samples',()=>{
 const days=makeDays(),cutoff='2026-01-18';
 const original=buildHistoricalSampleBundle({store:'A',days,runtime:fakeRuntime(),startDate:'2026-01-08',endDate:cutoff});
 const poisoned=structuredClone(days);
 for(const day of poisoned)if(day.date>cutoff){day.machines.forEach(row=>{row.games=999999;row.diff=-999999;row.truthES=6;row.truthP4=1})}
 const changed=buildHistoricalSampleBundle({store:'A',days:poisoned,runtime:fakeRuntime(),startDate:'2026-01-08',endDate:cutoff});
 assert.deepEqual(changed.samples,original.samples);
});

test('historical builder rejects duplicate store dates and store mismatch',()=>{
 const days=makeDays();
 assert.throws(()=>buildHistoricalSampleBundle({store:'B',days,runtime:fakeRuntime()}),/store B/i);
 assert.throws(()=>buildHistoricalSampleBundle({store:'A',days:[...days,structuredClone(days[0])],runtime:fakeRuntime()}),/duplicate/i);
});
