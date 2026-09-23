import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as flushAsyncWork} from 'node:timers/promises';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {shouldAttemptPiaCollection,jstClock,startPiaPublicCollectorScheduler} from '../src/collectors/pia-scheduler.mjs';

test('JST scheduler starts a new collection day at midnight and skips completed days',()=>{
  const db=openDatabase(':memory:');migrate(db);
  try{
    assert.deepEqual(jstClock(new Date('2026-09-22T14:59:59.999Z')),{date:'2026-09-22',minutes:1439});
    assert.deepEqual(jstClock(new Date('2026-09-22T15:00:00.000Z')),{date:'2026-09-23',minutes:0});
    db.prepare(`INSERT INTO source_collector_state(collector_id,source_store_id,last_snapshot_date,last_attempt_at,updated_at) VALUES(?,?,?,?,?)`).run('pia-public:35','pia:35','2026-09-22','2026-09-21T21:10:00.000Z','2026-09-21T21:10:00.000Z');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-22T14:59:59.999Z')}).reason,'done_today');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-22T15:00:00.000Z')}).attempt,true);
    db.prepare('UPDATE source_collector_state SET last_snapshot_date=?').run('2026-09-23');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-22T15:05:00.000Z')}).reason,'done_today');
  }finally{db.close()}
});

test('midnight scheduling rolls over month and year boundaries and catches up after restart',()=>{
  const db=openDatabase(':memory:');migrate(db);
  try{
    for(const [instant,date] of [['2026-09-30T15:00:00.000Z','2026-10-01'],['2026-12-31T15:00:00.000Z','2027-01-01'],['2026-09-22T18:17:00.000Z','2026-09-23']]){
      assert.deepEqual(shouldAttemptPiaCollection(db,{now:new Date(instant)}),{attempt:true,reason:'due',jstDate:date});
    }
  }finally{db.close()}
});

test('an explicitly configured collection window is still respected',()=>{
  const db=openDatabase(':memory:');migrate(db);
  try{
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-22T21:09:00.000Z'),targetHour:6,targetMinute:10}).reason,'before_window');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-22T21:10:00.000Z'),targetHour:6,targetMinute:10}).attempt,true);
  }finally{db.close()}
});

test('failed attempt is retried only after cooldown while snapshot date is still old',()=>{
  const db=openDatabase(':memory:');migrate(db);
  try{
    db.prepare(`INSERT INTO source_collector_state(collector_id,source_store_id,last_snapshot_date,last_attempt_at,updated_at) VALUES(?,?,?,?,?)`).run('pia-public:35','pia:35','2026-09-21','2026-09-21T21:10:00.000Z','2026-09-21T21:10:00.000Z');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-21T21:20:00.000Z')}).reason,'cooldown');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-21T21:41:00.000Z')}).attempt,true);
  }finally{db.close()}
});

test('a scheduler started off the five-minute boundary attempts at midnight and stops cleanly',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'jugest-pia-midnight-'));
  const dbPath=join(dir,'db.sqlite'),rawRoot=join(dir,'raw'),db=openDatabase(dbPath);migrate(db);
  db.prepare(`INSERT INTO source_collector_state(collector_id,source_store_id,last_snapshot_date,last_attempt_at,updated_at) VALUES(?,?,?,?,?)`).run('pia-public:35','pia:35','2026-09-22','2026-09-21T21:10:00.000Z','2026-09-21T21:10:00.000Z');
  db.close();
  t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:new Date('2026-09-22T14:57:40.000Z')});
  let requests=0;
  const runtime=startPiaPublicCollectorScheduler({dbPath,rawRoot,fetchImpl:async()=>{requests++;return {ok:false,status:503}}});
  try{
    await flushAsyncWork();
    t.mock.timers.tick(139999);
    await flushAsyncWork();
    assert.equal(requests,0,'no request before midnight for a completed day');
    t.mock.timers.tick(1);
    await flushAsyncWork();
    assert.equal(requests,1,'the first request is due at 00:00, not five minutes after startup');
    const stateDb=openDatabase(dbPath);
    try{
      const state=stateDb.prepare('SELECT last_attempt_at,last_result FROM source_collector_state').get();
      assert.equal(state.last_attempt_at,'2026-09-22T15:00:00.000Z');
      assert.equal(state.last_result,'fetch_error');
    }finally{stateDb.close()}
    t.mock.timers.tick(5*60*1000);
    await flushAsyncWork();
    assert.equal(requests,1,'failed request waits for the retry cooldown');
    runtime.stop();
    t.mock.timers.tick(30*60*1000);
    await flushAsyncWork();
    assert.equal(requests,1,'stopped scheduler must not issue new requests');
  }finally{runtime.stop();t.mock.timers.reset();await rm(dir,{recursive:true,force:true})}
});
