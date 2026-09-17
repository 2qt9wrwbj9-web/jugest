import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {hashCanonical} from '../src/canonical-json.mjs';
import {startFormalTrial} from '../src/research/pre-v2/trial.mjs';
import {createTrialRecord,migratePreV2TrialStore} from '../src/research/pre-v2/trial-store.mjs';
import {loadFormalPrediction,persistFormalPrediction} from '../src/research/pre-v2/formal-prediction-store.mjs';

function setup(){
  const db=openDatabase(':memory:');
  migrate(db);migratePreV2TrialStore(db);
  const now='2026-09-17T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','並走テスト店','{}',now,now);
  const machineKeys=['101','102'];
  const trial=startFormalTrial({
    storeId:'s1',lineageId:'lineage-a',trialNumber:1,
    championFingerprint:'champion-fp',challengerFingerprint:'challenger-fp',
    machineSetHash:hashCanonical(machineKeys.slice().sort()),scorerVersion:'pre-v2-score-v1',
  });
  createTrialRecord(db,{trial,nowIso:now});
  return{db,trial,machineKeys};
}

function prediction(role,fingerprint){return{
  role,modelFingerprint:fingerprint,targetDate:'2026-09-18',sourceFrontierDate:'2026-09-17',
  rankings:[
    {machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:2},
    {machineKey:'102',tableNo:'102',machineName:'ファンキージャグラー2',rank:2,score:1},
  ],
}}

test('formal prediction migration creates immutable champion/challenger prediction storage',()=>{
  const {db}=setup();
  try{
    const row=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pre_v2_formal_predictions'").get();
    assert.equal(row?.name,'pre_v2_formal_predictions');
  }finally{db.close()}
});

test('formal champion prediction round-trips and identical retry is idempotent',()=>{
  const {db,trial}=setup();
  try{
    const input=prediction('champion',trial.championFingerprint);
    const first=persistFormalPrediction(db,{trial,prediction:input,nowIso:'2026-09-17T12:00:00.000Z'});
    const second=persistFormalPrediction(db,{trial,prediction:input,nowIso:'2026-09-17T12:01:00.000Z'});
    assert.equal(first.inserted,true);
    assert.equal(second.inserted,false);
    const loaded=loadFormalPrediction(db,{storeId:'s1',lineageId:'lineage-a',trialNumber:1,targetDate:'2026-09-18',role:'champion'});
    assert.equal(loaded.modelFingerprint,'champion-fp');
    assert.deepEqual(loaded.rankings.map(row=>row.machineKey),['101','102']);
    assert.equal(loaded.machineSetHash,trial.machineSetHash);
  }finally{db.close()}
});

test('formal prediction allows a later-day roster change but still rejects wrong fingerprint, duplicate ranks, and conflicting replay',()=>{
  const {db,trial}=setup();
  try{
    assert.throws(()=>persistFormalPrediction(db,{trial,prediction:prediction('champion','challenger-fp'),nowIso:'2026-09-17T12:00:00.000Z'}),/fingerprint/i);

    const laterDay={
      role:'champion',modelFingerprint:trial.championFingerprint,targetDate:'2026-09-19',sourceFrontierDate:'2026-09-18',
      rankings:[{machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:2}],
    };
    const changedSet=persistFormalPrediction(db,{trial,prediction:laterDay,nowIso:'2026-09-18T12:00:00.000Z'});
    assert.equal(changedSet.inserted,true);
    assert.equal(changedSet.row.machineSetHash,hashCanonical(['101']));
    assert.notEqual(changedSet.row.machineSetHash,trial.machineSetHash);

    const dup={...prediction('champion',trial.championFingerprint),rankings:[
      {machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:2},
      {machineKey:'102',tableNo:'102',machineName:'ファンキージャグラー2',rank:1,score:1},
    ]};
    assert.throws(()=>persistFormalPrediction(db,{trial,prediction:dup,nowIso:'2026-09-17T12:00:00.000Z'}),/rank/i);
    const input=prediction('champion',trial.championFingerprint);
    persistFormalPrediction(db,{trial,prediction:input,nowIso:'2026-09-17T12:00:00.000Z'});
    const changed={...input,rankings:[...input.rankings].reverse().map((row,index)=>({...row,rank:index+1}))};
    assert.throws(()=>persistFormalPrediction(db,{trial,prediction:changed,nowIso:'2026-09-17T12:02:00.000Z'}),/conflict/i);
  }finally{db.close()}
});
