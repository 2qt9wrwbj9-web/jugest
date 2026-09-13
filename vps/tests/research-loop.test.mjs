import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {buildWalkForwardDataset,splitChronologicalSamples} from '../src/research/backtest.mjs';
import {discoverAxes} from '../src/research/axis-discovery.mjs';
import {baselineModel,evaluateModel,fingerprintModel,searchModels,shouldConverge} from '../src/research/model-search.mjs';
import {ensureResearchCycle,recordBacktestCompletion,recordModelSearchCompletion,getResearchLoop} from '../src/analysis/research-cycle.mjs';

function machine(tableNo,{name='マイジャグラーV',games=5000,bb=20,rb=18,diff=0}={}){return {tableNo,sourceMachineName:name,games,bb,rb,diff}}
function makeDays(count=24){
  const days=[];
  for(let d=1;d<=count;d+=1){
    const date=`2026-08-${String(d).padStart(2,'0')}`;
    const machines=[];
    for(let n=101;n<=110;n+=1){
      const strong=String(n).endsWith('7');
      machines.push(machine(String(n),{games:4800+d*7,bb:18+(strong?5:0),rb:16+(strong?6:0),diff:(strong?1400:-150)+((d%3)-1)*30}));
    }
    days.push({date,machines});
  }
  return days;
}

const DAYS=makeDays();

test('walk-forward dataset never lets future-day changes alter an earlier prediction row',()=>{
  const a=buildWalkForwardDataset({storeId:'s1',days:DAYS,minHistoryDays:4});
  const target=a.samples.find(x=>x.targetDate==='2026-08-10'&&x.machineKey==='107');
  assert.ok(target);
  const poisoned=DAYS.map(day=>day.date>'2026-08-10'?{...day,machines:day.machines.map(m=>({...m,diff:999999,bb:999,rb:999}))}:day);
  const b=buildWalkForwardDataset({storeId:'s1',days:poisoned,minHistoryDays:4});
  const same=b.samples.find(x=>x.targetDate==='2026-08-10'&&x.machineKey==='107');
  assert.deepEqual(target.features,same.features);
  assert.equal(target.outcomeScore,same.outcomeScore);
});

test('chronological split is 60/20/20 and keeps holdout strictly last',()=>{
  const dataset=buildWalkForwardDataset({storeId:'s1',days:DAYS,minHistoryDays:4});
  const split=splitChronologicalSamples(dataset.samples);
  const dates=[...new Set(dataset.samples.map(x=>x.targetDate))];
  assert.equal(split.trainDates.length,Math.floor(dates.length*.6));
  assert.equal(split.validationDates.length,Math.floor(dates.length*.2));
  assert.equal(split.holdoutDates.length,dates.length-split.trainDates.length-split.validationDates.length);
  assert.ok(split.trainDates.at(-1)<split.validationDates[0]);
  assert.ok(split.validationDates.at(-1)<split.holdoutDates[0]);
});

test('axis discovery compares strong versus weak rows and finds stable table-tail signal with FDR/fold guards',()=>{
  const dataset=buildWalkForwardDataset({storeId:'s1',days:DAYS,minHistoryDays:4});
  const {train}=splitChronologicalSamples(dataset.samples);
  const axes=discoverAxes(train,{minSupport:8,maxAxes:24,fdrQ:.10,foldCount:4});
  assert.ok(axes.length>0);
  assert.ok(axes.some(axis=>axis.predicates.some(p=>p.field==='table_last_digit'&&p.op==='eq'&&p.value==='7')));
  assert.ok(axes.every(axis=>axis.support>=8));
  assert.ok(axes.every(axis=>axis.fdrAccepted===true));
  assert.ok(axes.every(axis=>axis.foldPassRate>=.75));
});

test('model search uses validation to beat baseline and fingerprints exact weighted axes deterministically',()=>{
  const dataset=buildWalkForwardDataset({storeId:'s1',days:DAYS,minHistoryDays:4});
  const split=splitChronologicalSamples(dataset.samples);
  const champion=baselineModel();
  const axes=discoverAxes(split.train,{minSupport:8,maxAxes:24,fdrQ:.10,foldCount:4});
  const result=searchModels({champion,axes,train:split.train,validation:split.validation,round:0,maxCandidates:96});
  assert.ok(result.best);
  assert.equal(result.improved,true);
  assert.ok(result.best.validation.top3Lift>evaluateModel(split.validation,champion).top3Lift);
  assert.match(result.best.model.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(result.best.model.fingerprint,fingerprintModel(result.best.model));
});

test('convergence detects an exact weighted-model repeat or five consecutive no-improvement rounds',()=>{
  const model={version:'store-read-model-v1',axes:[{id:'a',weight:.6},{id:'b',weight:.4}]};
  const fp=fingerprintModel(model);
  assert.equal(shouldConverge({seenFingerprints:new Set([fp]),proposedFingerprint:fp,noImproveCount:0}).reason,'repeat');
  assert.equal(shouldConverge({seenFingerprints:new Set(),proposedFingerprint:'other',noImproveCount:5}).reason,'no_improvement');
  assert.equal(shouldConverge({seenFingerprints:new Set(),proposedFingerprint:'other',noImproveCount:4}),null);
});

test('research cycle persists a champion and schedules BACKTEST -> MODEL_SEARCH -> next BACKTEST without touching production math',()=>{
  const db=openDatabase(':memory:');migrate(db);const now='2026-09-13T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',now,now);
  const started=ensureResearchCycle(db,{storeId:'s1',featureVersion:'store-features-v1',frontierDate:'2026-09-12',nowIso:now});
  assert.equal(started.job.type,'BACKTEST');
  assert.equal(started.job.priority,50);
  const champion=db.prepare("SELECT * FROM research_model_registry WHERE store_id='s1' AND status='research_champion'").get();
  assert.ok(champion);
  const afterBacktest=recordBacktestCompletion(db,{storeId:'s1',frontierDate:'2026-09-12',modelFingerprint:champion.fingerprint,nowIso:'2026-09-13T00:00:01.000Z'});
  assert.equal(afterBacktest.job.type,'MODEL_SEARCH');
  assert.equal(afterBacktest.job.priority,60);
  const nextModel={version:'store-read-model-v1',axes:[{id:'tail7',predicates:[{field:'table_last_digit',op:'eq',value:'7'}],weight:1}]};
  const promoted=recordModelSearchCompletion(db,{storeId:'s1',frontierDate:'2026-09-12',championFingerprint:champion.fingerprint,candidateModel:nextModel,improved:true,validationScore:2,nowIso:'2026-09-13T00:00:02.000Z'});
  assert.equal(promoted.job.type,'BACKTEST');
  assert.equal(getResearchLoop(db,{storeId:'s1'}).generation,1);
  const active=db.prepare("SELECT fingerprint FROM research_model_registry WHERE store_id='s1' AND status='research_champion'").get();
  assert.equal(active.fingerprint,fingerprintModel(nextModel));
  db.close();
});
