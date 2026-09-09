import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {enqueueJob,claimNextJob,markJobRunning,heartbeatJob,completeJob,failJob,recoverStaleJobs,getJob} from '../src/queue.mjs';

function makeDb(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-vps-'));
  const path=join(dir,'jugest.sqlite');
  const db=openDatabase(path);
  migrate(db);
  return {db,path,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

function jobInput(overrides={}){
  return {
    type:'RESEARCH',priority:50,idempotencyKey:`key-${Math.random()}`,payload:{x:1},
    sizeClass:'small',estimatedLeaseMiB:128,maxAttempts:3,...overrides
  };
}

test('database initializes WAL and required pragmas plus schema',()=>{
  const f=makeDb();
  try{
    assert.equal(f.db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
    assert.equal(f.db.prepare('PRAGMA synchronous').get().synchronous,1);
    assert.equal(f.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    assert.equal(f.db.prepare('PRAGMA busy_timeout').get().timeout,5000);
    const names=f.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
    for(const name of ['jobs','job_runs','resource_samples','stores','store_days','machine_day_data','analysis_state','analysis_receipts','client_snapshots'])assert.ok(names.includes(name),name);
  }finally{f.cleanup()}
});

test('queue orders by priority then FIFO',()=>{
  const f=makeDb();
  try{
    const r1=enqueueJob(f.db,jobInput({idempotencyKey:'r1',priority:50}));
    const r2=enqueueJob(f.db,jobInput({idempotencyKey:'r2',priority:50}));
    const daily=enqueueJob(f.db,jobInput({type:'DAILY_ANALYSIS',idempotencyKey:'d1',priority:20}));
    const c1=claimNextJob(f.db,{owner:'c1',nowIso:'2026-09-09T00:00:00.000Z'});
    const c2=claimNextJob(f.db,{owner:'c1',nowIso:'2026-09-09T00:00:01.000Z'});
    const c3=claimNextJob(f.db,{owner:'c1',nowIso:'2026-09-09T00:00:02.000Z'});
    assert.equal(c1.id,daily.id);
    assert.equal(c2.id,r1.id);
    assert.equal(c3.id,r2.id);
    assert.equal(c1.state,'leased');
  }finally{f.cleanup()}
});

test('idempotency key returns canonical existing job without duplicating',()=>{
  const f=makeDb();
  try{
    const first=enqueueJob(f.db,jobInput({idempotencyKey:'same',payload:{a:1}}));
    const again=enqueueJob(f.db,jobInput({idempotencyKey:'same',payload:{a:999}}));
    assert.equal(again.id,first.id);
    assert.deepEqual(again.payload,{a:1});
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,1);
  }finally{f.cleanup()}
});

test('claim is atomic across database connections',()=>{
  const f=makeDb();
  let second;
  try{
    enqueueJob(f.db,jobInput({idempotencyKey:'one',priority:10}));
    enqueueJob(f.db,jobInput({idempotencyKey:'two',priority:20}));
    second=openDatabase(f.path);migrate(second);
    const one=claimNextJob(f.db,{owner:'a',nowIso:'2026-09-09T00:00:00.000Z'});
    const two=claimNextJob(second,{owner:'b',nowIso:'2026-09-09T00:00:00.000Z'});
    assert.notEqual(one.id,two.id);
    assert.equal(one.leaseOwner,'a');
    assert.equal(two.leaseOwner,'b');
  }finally{try{second?.close()}catch{}f.cleanup()}
});

test('leased job moves to running, heartbeats, and succeeds',()=>{
  const f=makeDb();
  try{
    const queued=enqueueJob(f.db,jobInput({idempotencyKey:'life'}));
    claimNextJob(f.db,{owner:'c1',nowIso:'2026-09-09T00:00:00.000Z'});
    const running=markJobRunning(f.db,{jobId:queued.id,owner:'c1',nowIso:'2026-09-09T00:00:01.000Z'});
    assert.equal(running.state,'running');
    const beat=heartbeatJob(f.db,{jobId:queued.id,owner:'c1',nowIso:'2026-09-09T00:00:02.000Z'});
    assert.equal(beat.heartbeatAt,'2026-09-09T00:00:02.000Z');
    const done=completeJob(f.db,{jobId:queued.id,owner:'c1',nowIso:'2026-09-09T00:00:03.000Z'});
    assert.equal(done.state,'succeeded');
    assert.equal(done.leaseOwner,null);
  }finally{f.cleanup()}
});

test('failure retries until maxAttempts then fails closed',()=>{
  const f=makeDb();
  try{
    const queued=enqueueJob(f.db,jobInput({idempotencyKey:'retry',maxAttempts:2}));
    claimNextJob(f.db,{owner:'c1',nowIso:'2026-09-09T00:00:00.000Z'});
    markJobRunning(f.db,{jobId:queued.id,owner:'c1',nowIso:'2026-09-09T00:00:01.000Z'});
    const retry=failJob(f.db,{jobId:queued.id,owner:'c1',nowIso:'2026-09-09T00:00:02.000Z',retryAtIso:'2026-09-09T00:01:00.000Z',errorClass:'synthetic',message:'first'});
    assert.equal(retry.state,'retry_wait');
    assert.equal(claimNextJob(f.db,{owner:'c1',nowIso:'2026-09-09T00:00:30.000Z'}),null);
    claimNextJob(f.db,{owner:'c1',nowIso:'2026-09-09T00:01:00.000Z'});
    markJobRunning(f.db,{jobId:queued.id,owner:'c1',nowIso:'2026-09-09T00:01:01.000Z'});
    const failed=failJob(f.db,{jobId:queued.id,owner:'c1',nowIso:'2026-09-09T00:01:02.000Z',retryAtIso:'2026-09-09T00:02:00.000Z',errorClass:'synthetic',message:'second'});
    assert.equal(failed.state,'failed');
    assert.equal(failed.attempts,2);
  }finally{f.cleanup()}
});

test('stale leased/running jobs recover without losing durable data',()=>{
  const f=makeDb();
  try{
    const retryable=enqueueJob(f.db,jobInput({idempotencyKey:'stale-1',maxAttempts:3}));
    const terminal=enqueueJob(f.db,jobInput({idempotencyKey:'stale-2',maxAttempts:1,priority:60}));
    claimNextJob(f.db,{owner:'old',nowIso:'2026-09-09T00:00:00.000Z'});
    markJobRunning(f.db,{jobId:retryable.id,owner:'old',nowIso:'2026-09-09T00:00:01.000Z'});
    claimNextJob(f.db,{owner:'old',nowIso:'2026-09-09T00:00:02.000Z'});
    const recovered=recoverStaleJobs(f.db,{staleBeforeIso:'2026-09-09T00:10:00.000Z',nowIso:'2026-09-09T00:20:00.000Z'});
    assert.equal(recovered,2);
    assert.equal(getJob(f.db,retryable.id).state,'retry_wait');
    assert.equal(getJob(f.db,terminal.id).state,'failed');
  }finally{f.cleanup()}
});
