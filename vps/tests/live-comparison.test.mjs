import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';

function seedStore(db){
  const now='2026-09-13T12:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',now,now);
}

function prediction(overrides={}){
  return {
    storeId:'s1',targetDate:'2026-09-14',engine:'pre_research',engineVersion:'store-read-v1',modelFingerprint:'fp-a',featureVersion:'store-features-v1',sourceFrontierDate:'2026-09-13',inputHash:'in-a',createdAt:'2026-09-13T12:00:00.000Z',
    rankings:[
      {machineKey:'107',tableNo:'107',machineName:'マイジャグラーV',score:3,rank:1},
      {machineKey:'103',tableNo:'103',machineName:'マイジャグラーV',score:2,rank:2},
      {machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',score:1,rank:3}
    ],
    ...overrides
  };
}

test('migration creates immutable live prediction and score tables',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);
    const predictionTable=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='store_prediction_snapshots'").get();
    const scoreTable=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='store_prediction_scores'").get();
    assert.equal(predictionTable?.name,'store_prediction_snapshots');
    assert.equal(scoreTable?.name,'store_prediction_scores');
  }finally{db.close()}
});

test('first live prediction is immutable and duplicate identity is idempotent',async()=>{
  const {persistLivePrediction,listLivePredictions}=await import('../src/research/live-comparison.mjs');
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const first=persistLivePrediction(db,prediction());
    const same=persistLivePrediction(db,prediction());
    const changed=persistLivePrediction(db,prediction({rankings:[{machineKey:'999',tableNo:'999',machineName:'別台',score:99,rank:1}]}));
    assert.equal(first.inserted,true);
    assert.equal(same.inserted,false);
    assert.equal(changed.inserted,false);
    const rows=listLivePredictions(db,{storeId:'s1',targetDate:'2026-09-14',engine:'pre_research'});
    assert.equal(rows.length,1);
    assert.equal(rows[0].rankings[0].machineKey,'107');
    assert.equal(rows[0].payloadHash,first.row.payloadHash);
  }finally{db.close()}
});

test('scorer returns deterministic top overlap lift coverage and rank correlation',async()=>{
  const {scorePredictionRows}=await import('../src/research/live-comparison.mjs');
  const metrics=scorePredictionRows({
    predictionRows:prediction().rankings,
    outcomeRows:[
      {machineKey:'103',outcomeScore:3000},
      {machineKey:'107',outcomeScore:2000},
      {machineKey:'101',outcomeScore:1000},
      {machineKey:'105',outcomeScore:0},
      {machineKey:'109',outcomeScore:-500}
    ]
  });
  assert.equal(metrics.machineCount,5);
  assert.equal(metrics.coverage,3/5);
  assert.deepEqual(metrics.top1,{overlap:0,rate:0,lift:0});
  assert.deepEqual(metrics.top3,{overlap:3,rate:1,lift:5/3});
  assert.deepEqual(metrics.top5,{overlap:3,rate:3/5,lift:3/5});
  assert.ok(metrics.rankCorrelation<1&&metrics.rankCorrelation>0);
  assert.equal(metrics.quality,metrics.top3.lift*100+metrics.top5.lift*10+metrics.rankCorrelation);
});
