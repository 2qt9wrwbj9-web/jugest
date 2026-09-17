import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {baselineModel,fingerprintModel} from '../src/research/model-search.mjs';
import {activateStoreModel,registerResearchModel} from '../src/analysis/research-cycle.mjs';
import {migratePreV2TrialStore} from '../src/research/pre-v2/trial-store.mjs';
import {startFormalLiveTrial} from '../src/research/pre-v2/formal-start.mjs';

function days(){
  const out=[];
  for(let d=1;d<=10;d+=1){
    const date=`2026-09-${String(d).padStart(2,'0')}`;
    out.push({date,machines:[
      {tableNo:'101',sourceMachineName:'マイジャグラーV',machine:'my',games:5000,bb:20,rb:18,diff:100+d},
      {tableNo:'102',sourceMachineName:'マイジャグラーV',machine:'my',games:5100,bb:21,rb:17,diff:-50+d},
      {tableNo:'103',sourceMachineName:'マイジャグラーV',machine:'my',games:5200,bb:22,rb:19,diff:250+d},
    ]});
  }
  return out;
}

function candidate(tableNo='103'){
  const model={version:'store-read-model-v1',axes:[{id:`axis-${tableNo}`,predicates:[{field:'table_no',op:'eq',value:tableNo}],weight:1}]};
  return Object.freeze({...model,fingerprint:fingerprintModel(model)});
}

function setup(){
  const db=openDatabase(':memory:');
  migrate(db);migratePreV2TrialStore(db);
  const now='2026-09-10T12:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','正式試験店','{}',now,now);
  const champion=baselineModel();
  activateStoreModel(db,{storeId:'s1',model:champion,featureVersion:'store-feature-v1',frontierDate:'2026-09-10',holdoutScore:1,days:days(),nowIso:now});
  const challenger=candidate('103');
  registerResearchModel(db,{storeId:'s1',model:challenger,status:'research_champion',validationScore:2,nowIso:now});
  return{db,champion,challenger,days:days(),now};
}

test('formal start freezes active Champion and explicit research Challenger for the same next-day machine set',()=>{
  const f=setup();
  try{
    const result=startFormalLiveTrial(f.db,{
      storeId:'s1',lineageId:'pre-v2-live',challengerFingerprint:f.challenger.fingerprint,
      featureVersion:'store-feature-v1',days:f.days,frontierDate:'2026-09-10',nowIso:f.now,
    });
    assert.equal(result.started,true);
    assert.equal(result.trial.trial.trialNumber,1);
    assert.equal(result.trial.trial.championFingerprint,f.champion.fingerprint);
    assert.equal(result.trial.trial.challengerFingerprint,f.challenger.fingerprint);
    assert.equal(result.targetDate,'2026-09-11');
    assert.deepEqual(result.championPrediction.rankings.map(row=>row.machineKey),['101','102','103']);
    assert.deepEqual(result.challengerPrediction.rankings.map(row=>row.machineKey),['103','101','102']);
    assert.equal(result.championPrediction.machineSetHash,result.trial.trial.machineSetHash);
    assert.equal(result.challengerPrediction.machineSetHash,result.trial.trial.machineSetHash);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trials').get().n,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_predictions').get().n,2);
  }finally{f.db.close()}
});

test('formal start is idempotent for the exact same running pair and target',()=>{
  const f=setup();
  try{
    const input={storeId:'s1',lineageId:'pre-v2-live',challengerFingerprint:f.challenger.fingerprint,featureVersion:'store-feature-v1',days:f.days,frontierDate:'2026-09-10',nowIso:f.now};
    const first=startFormalLiveTrial(f.db,input);
    const second=startFormalLiveTrial(f.db,{...input,nowIso:'2026-09-10T12:05:00.000Z'});
    assert.equal(first.started,true);
    assert.equal(second.started,false);
    assert.equal(second.reason,'already_running');
    assert.equal(second.trial.trial.trialNumber,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trials').get().n,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_predictions').get().n,2);
  }finally{f.db.close()}
});

test('a different Challenger cannot silently replace a running formal trial',()=>{
  const f=setup();
  try{
    startFormalLiveTrial(f.db,{storeId:'s1',lineageId:'pre-v2-live',challengerFingerprint:f.challenger.fingerprint,featureVersion:'store-feature-v1',days:f.days,frontierDate:'2026-09-10',nowIso:f.now});
    const other=candidate('102');
    registerResearchModel(f.db,{storeId:'s1',model:other,status:'research_champion',validationScore:3,nowIso:'2026-09-10T12:01:00.000Z'});
    assert.throws(()=>startFormalLiveTrial(f.db,{
      storeId:'s1',lineageId:'pre-v2-live',challengerFingerprint:other.fingerprint,
      featureVersion:'store-feature-v1',days:f.days,frontierDate:'2026-09-10',nowIso:'2026-09-10T12:02:00.000Z',
    }),/already running|running formal trial/i);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trials').get().n,1);
  }finally{f.db.close()}
});

test('formal start fails closed without a valid distinct research Challenger or matching feature version',()=>{
  const f=setup();
  try{
    assert.throws(()=>startFormalLiveTrial(f.db,{storeId:'s1',lineageId:'pre-v2-live',challengerFingerprint:'missing',featureVersion:'store-feature-v1',days:f.days,frontierDate:'2026-09-10',nowIso:f.now}),/challenger.*missing|research.*model/i);
    assert.throws(()=>startFormalLiveTrial(f.db,{storeId:'s1',lineageId:'pre-v2-live',challengerFingerprint:f.challenger.fingerprint,featureVersion:'other-feature-version',days:f.days,frontierDate:'2026-09-10',nowIso:f.now}),/feature version/i);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trials').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_predictions').get().n,0);
  }finally{f.db.close()}
});
