import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHistoricalSampleBundle} from '../research/axis-auto-selector/historical-builder.mjs';

function shift(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function makeDays(count=12){
 return Array.from({length:count},(_,dayIndex)=>({
  date:shift('2026-01-01',dayIndex),shop:'A',
  machines:Array.from({length:12},(_,i)=>({machine:'my',tableNo:String(i+1),games:6000,diff:dayIndex*10+i,bb:20,rb:14,truthES:1+(i%6),truthP4:.1+.1*(i%6)}))
 }));
}

test('historical builder reuses already-judged day objects instead of cloning every prediction prefix',()=>{
 let judgedDays=null,predictionCalls=0;
 const runtime={
  normalizeDay(day){return structuredClone(day)},
  ensureExternalJudgedSync(days){judgedDays=days;for(const day of days)for(const row of day.machines){row.expectedSetting=row.truthES;row.p4=row.truthP4}},
  predictStore(store,targetDate,sourceDays){
   predictionCalls+=1;
   assert.equal(sourceDays[0],judgedDays[0]);
   assert.equal(sourceDays.at(-1),judgedDays[sourceDays.length-1]);
   return{rows:Array.from({length:12},(_,i)=>({machine:'my',tableNo:String(i+1),rank:i+1,hybridScore:.9-i*.03,practicalSignal:.8,modelSignal:.5,strictSignal:.4,hybridValidatedBonus:0}))};
  }
 };
 const bundle=buildHistoricalSampleBundle({store:'A',days:makeDays(),runtime,startDate:'2026-01-07',endDate:'2026-01-12'});
 assert.equal(bundle.samples.length,6);
 assert.equal(predictionCalls,6);
});
