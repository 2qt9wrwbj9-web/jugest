import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {
  HISTORICAL_REPLAY_VERSION,
  ensureHistoricalComparisonRun,
  getHistoricalComparisonRun,
  persistHistoricalComparisonDay
} from '../src/research/historical-comparison.mjs';

const T0='2026-09-13T12:00:00.000Z';
const T1='2026-09-13T12:01:00.000Z';
const T2='2026-09-13T12:02:00.000Z';

function makeDays(count){
  const start=Date.parse('2026-01-01T00:00:00Z');
  return Array.from({length:count},(_,index)=>{
    const date=new Date(start+index*86400000).toISOString().slice(0,10);
    return {date,machines:[
      {tableNo:'101',sourceMachineName:'マイジャグラーV',games:5000+index,bb:20,rb:18,diff:index*10},
      {tableNo:'102',sourceMachineName:'マイジャグラーV',games:4800+index,bb:18,rb:16,diff:-index*5}
    ]};
  });
}
function replaceDay(days,date){
  return days.map(day=>day.date===date?{...day,machines:day.machines.map((machine,index)=>index===0?{...machine,diff:Number(machine.diff)+777}:machine)}:day);
}
function seedStore(db){db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',T0,T0)}
function fixtureResult(runId){
  return {
    runId,storeId:'s1',targetDate:'2026-01-10',
    prePrediction:{engineVersion:'store-read-model-v1',modelFingerprint:'fp-pre',featureVersion:'store-features-v1',sourceFrontierDate:'2026-01-09',rankings:[{machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:1}]},
    currentPrediction:{engineVersion:'current-v5',modelFingerprint:'',featureVersion:null,sourceFrontierDate:'2026-01-09',rankings:[{machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:1}]},
    outcomeInputHash:'outcome-hash',preMetrics:{quality:1},currentMetrics:{quality:1},winner:'tie',excludedReason:null,
    preState:{fingerprint:'fp-pre',featureVersion:'store-features-v1',frontierDate:'2026-01-09'},scorerVersion:'pre-shadow-scorer-v1',createdAt:T0
  };
}

test('migration creates historical comparison tables including immutable snapshot rows',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='historical_comparison_runs'").get()?.name,'historical_comparison_runs');
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='historical_comparison_days'").get()?.name,'historical_comparison_days');
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='historical_comparison_snapshot_days'").get()?.name,'historical_comparison_snapshot_days');
  }finally{db.close()}
});

test('active immutable run keeps id and progress when old canonical history changes',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const days60=makeDays(60),newerDay=makeDays(61).at(-1);
    const first=ensureHistoricalComparisonRun(db,{storeId:'s1',days:days60,nowIso:T0});
    assert.equal(first.replayVersion,HISTORICAL_REPLAY_VERSION);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM historical_comparison_snapshot_days WHERE run_id=?').get(first.id).n,60);

    const sameTail=ensureHistoricalComparisonRun(db,{storeId:'s1',days:[...days60,newerDay],nowIso:T1});
    assert.equal(sameTail.id,first.id,'newer live day must not restart or expand the active snapshot');
    assert.equal(sameTail.totalCandidates,first.totalCandidates);

    const sameChanged=ensureHistoricalComparisonRun(db,{storeId:'s1',days:replaceDay(days60,days60[10].date),nowIso:T2});
    assert.equal(sameChanged.id,first.id,'in-range correction must be deferred until current immutable run completes');
    assert.equal(sameChanged.state,first.state);
    assert.equal(sameChanged.totalCandidates,first.totalCandidates);
    assert.equal(getHistoricalComparisonRun(db,{storeId:'s1',runId:first.id}).state,'queued');
    assert.equal(db.prepare('SELECT refresh_pending FROM historical_comparison_runs WHERE id=?').get(first.id).refresh_pending,1);
  }finally{db.close()}
});

test('historical day result is append-once for run plus target date',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const run=ensureHistoricalComparisonRun(db,{storeId:'s1',days:makeDays(60),nowIso:T0});
    assert.equal(persistHistoricalComparisonDay(db,fixtureResult(run.id)).inserted,true);
    assert.equal(persistHistoricalComparisonDay(db,fixtureResult(run.id)).inserted,false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM historical_comparison_days').get().n,1);
  }finally{db.close()}
});
