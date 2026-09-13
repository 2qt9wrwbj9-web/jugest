import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {baselineModel} from '../src/research/model-search.mjs';
import {initialHistoricalPreState} from '../src/research/historical-pre-simulator.mjs';
import {compareHistoricalTarget} from '../src/research/historical-comparison.mjs';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

function isoDay(index){return new Date(Date.UTC(2026,0,1)+index*86400000).toISOString().slice(0,10)}
function makeDays(count){
  return Array.from({length:count},(_,index)=>({date:isoDay(index),machines:[
    {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'102',games:5000+index*17,bb:19+(index%5),rb:16+(index%6),diff:(index%4===0?1000:-120)+index*9},
    {machine:'fk',category:'juggler',sourceMachineName:'ファンキージャグラー2',tableNo:'101',games:5200+index*11,bb:20+(index%4),rb:14+(index%5),diff:(index%3===0?650:-200)+index*7}
  ]}));
}
function poisonOnlyDatesAfter(days,targetDate){
  return structuredClone(days).map(day=>day.date>targetDate?{...day,machines:day.machines.map((machine,index)=>({...machine,diff:index?999999:-999999,bb:index?999:1,rb:index?999:1,games:99999}))}:day);
}

test('historical PRE starts from baseline and carries no live registry state',()=>{
  const state=initialHistoricalPreState();
  assert.equal(state.generation,0);
  assert.equal(state.fingerprint,baselineModel().fingerprint);
  assert.deepEqual(state.seenFingerprints,[baselineModel().fingerprint]);
});

test('future poisoning cannot change an earlier historical PRE prediction',async()=>{
  const days=makeDays(70),targetDate=days[55].date;
  const a=await compareHistoricalTarget({rootDir:ROOT,storeId:'store-a',shop:'解析テスト店',days,targetDate,preState:initialHistoricalPreState()});
  const b=await compareHistoricalTarget({rootDir:ROOT,storeId:'store-a',shop:'解析テスト店',days:poisonOnlyDatesAfter(days,targetDate),targetDate,preState:initialHistoricalPreState()});
  assert.ok(a.prePrediction?.rankings?.length>0);
  assert.deepEqual(a.prePrediction.rankings,b.prePrediction.rankings);
  assert.equal(a.prePrediction.inputHash,b.prePrediction.inputHash);
});

test('both historical engines predict strictly before target and share one outcome hash',async()=>{
  const days=makeDays(70),targetDate=days[55].date;
  const result=await compareHistoricalTarget({rootDir:ROOT,storeId:'store-a',shop:'解析テスト店',days,targetDate,preState:initialHistoricalPreState()});
  assert.equal(result.targetDate,targetDate);
  assert.ok(result.prePrediction?.sourceFrontierDate<targetDate);
  assert.ok(result.currentPrediction?.sourceFrontierDate<targetDate);
  assert.equal(result.excludedReason,null);
  assert.equal(result.preScore.outcomeInputHash,result.currentScore.outcomeInputHash);
  assert.ok(['pre_research','current_shadow','tie'].includes(result.winner));
});

test('seven days is only a warmup floor and does not force an invalid current prediction into scoring',async()=>{
  const days=makeDays(56),state=initialHistoricalPreState();
  const early=await compareHistoricalTarget({rootDir:ROOT,storeId:'store-a',shop:'解析テスト店',days,targetDate:days[7].date,preState:state});
  assert.ok(early.excludedReason,'the warmup floor alone must not guarantee a scored comparison');
  const mature=await compareHistoricalTarget({rootDir:ROOT,storeId:'store-a',shop:'解析テスト店',days,targetDate:days[55].date,preState:state});
  assert.equal(mature.excludedReason,null,'the fixture should become valid once both engines have enough history');
}
