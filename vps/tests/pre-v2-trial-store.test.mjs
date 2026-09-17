import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {applyFormalDay,startFormalTrial} from '../src/research/pre-v2/trial.mjs';
import {
  appendTrialDay,
  createTrialRecord,
  loadTrialRecord,
  nextTrialNumber,
  saveTrialState,
} from '../src/research/pre-v2/trial-store.mjs';

function seedStore(db){
  const now='2026-09-17T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('store-a','PRE v2 test store','{}',now,now);
}

function newTrial(db,overrides={}){
  const lineageId=overrides.lineageId??'lineage-a';
  const trialNumber=overrides.trialNumber??nextTrialNumber(db,{storeId:'store-a',lineageId});
  return startFormalTrial({
    storeId:'store-a',
    lineageId,
    trialNumber,
    championFingerprint:'champion-1',
    challengerFingerprint:'challenger-1',
    machineSetHash:'machines-v1',
    scorerVersion:'pre-v2-score-v1',
    ...overrides,
  });
}

test('migration creates PRE v2 formal trial and append-only day tables',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);
    const trial=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pre_v2_formal_trials'").get();
    const day=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pre_v2_formal_trial_days'").get();
    assert.equal(trial?.name,'pre_v2_formal_trials');
    assert.equal(day?.name,'pre_v2_formal_trial_days');
  }finally{db.close()}
});

test('creating a formal trial consumes its lineage trial number and round-trips exact state',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    assert.equal(nextTrialNumber(db,{storeId:'store-a',lineageId:'lineage-a'}),1);
    const trial=newTrial(db);
    const created=createTrialRecord(db,{trial,nowIso:'2026-09-17T01:00:00.000Z'});
    assert.equal(created.inserted,true);
    assert.equal(nextTrialNumber(db,{storeId:'store-a',lineageId:'lineage-a'}),2);
    const loaded=loadTrialRecord(db,{storeId:'store-a',lineageId:'lineage-a',trialNumber:1});
    assert.deepEqual(loaded.trial,trial);
    assert.equal(loaded.startedAt,'2026-09-17T01:00:00.000Z');
    assert.equal(loaded.stateHash,created.row.stateHash);

    const replay=createTrialRecord(db,{trial,nowIso:'2026-09-17T01:01:00.000Z'});
    assert.equal(replay.inserted,false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trials').get().n,1);
  }finally{db.close()}
});

test('same trial identity with different frozen metadata fails closed',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const trial=newTrial(db);
    createTrialRecord(db,{trial,nowIso:'2026-09-17T01:00:00.000Z'});
    const conflict={...trial,challengerFingerprint:'different-challenger'};
    assert.throws(()=>createTrialRecord(db,{trial:conflict,nowIso:'2026-09-17T01:01:00.000Z'}),/conflict/i);
  }finally{db.close()}
});

test('appendTrialDay atomically appends evidence and advances persisted current state',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const before=newTrial(db);
    createTrialRecord(db,{trial:before,nowIso:'2026-09-17T01:00:00.000Z'});
    const day={targetDate:'2026-10-01',top10Delta:0.2,top5Delta:0.1,top10Informative:true,top5Informative:true};
    const after=applyFormalDay(before,day);
    const committed=appendTrialDay(db,{trial:after,day,nowIso:'2026-10-02T00:01:00.000Z'});
    assert.equal(committed.inserted,true);
    assert.deepEqual(loadTrialRecord(db,{storeId:'store-a',lineageId:'lineage-a',trialNumber:1}).trial,after);
    const storedDay=db.prepare('SELECT * FROM pre_v2_formal_trial_days WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=?').get('store-a','lineage-a',1,'2026-10-01');
    assert.equal(storedDay.top10_delta,0.2);
    assert.equal(storedDay.top5_delta,0.1);
    assert.equal(storedDay.top10_informative,1);
    assert.equal(storedDay.top5_informative,1);
    assert.ok(JSON.parse(storedDay.evidence_json).top10);
  }finally{db.close()}
});

test('identical append retry is idempotent while conflicting replay fails closed',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const before=newTrial(db);
    createTrialRecord(db,{trial:before,nowIso:'2026-09-17T01:00:00.000Z'});
    const day={targetDate:'2026-10-01',top10Delta:0.2,top5Delta:0.1};
    const after=applyFormalDay(before,day);
    assert.equal(appendTrialDay(db,{trial:after,day,nowIso:'2026-10-02T00:01:00.000Z'}).inserted,true);
    assert.equal(appendTrialDay(db,{trial:after,day,nowIso:'2026-10-02T00:02:00.000Z'}).inserted,false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,1);
    assert.throws(()=>appendTrialDay(db,{trial:after,day:{...day,top10Delta:0.3},nowIso:'2026-10-02T00:03:00.000Z'}),/conflict/i);
  }finally{db.close()}
});

test('append refuses skipped/stale state transitions instead of silently losing evidence',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const before=newTrial(db);
    createTrialRecord(db,{trial:before,nowIso:'2026-09-17T01:00:00.000Z'});
    const day1={targetDate:'2026-10-01',top10Delta:0.1,top5Delta:0};
    const after1=applyFormalDay(before,day1);
    const day2={targetDate:'2026-10-02',top10Delta:0.1,top5Delta:0};
    const after2=applyFormalDay(after1,day2);
    assert.throws(()=>appendTrialDay(db,{trial:after2,day:day2,nowIso:'2026-10-03T00:00:00.000Z'}),/transition/i);
  }finally{db.close()}
});

test('saveTrialState uses optimistic state hash and rejects stale writers',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seedStore(db);
    const trial=newTrial(db);
    const created=createTrialRecord(db,{trial,nowIso:'2026-09-17T01:00:00.000Z'});
    const saved=saveTrialState(db,{trial,expectedStateHash:created.row.stateHash,nowIso:'2026-09-17T01:05:00.000Z'});
    assert.equal(saved.updated,true);
    assert.throws(()=>saveTrialState(db,{trial,expectedStateHash:'stale-hash',nowIso:'2026-09-17T01:06:00.000Z'}),/stale/i);
  }finally{db.close()}
});
