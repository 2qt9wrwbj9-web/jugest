import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {claimNextJob,enqueueJob,getJob,markJobRunning} from '../src/queue.mjs';
import {recoverStartupState} from '../src/main.mjs';

test('coordinator startup recovers stale durable work after database reopen',()=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-restart-'));
  const path=join(dir,'jugest.sqlite');
  let db=openDatabase(path);
  try{
    migrate(db);
    const stale=enqueueJob(db,{type:'BACKFILL',priority:40,idempotencyKey:'durable-stale',payload:{store:'A'},sizeClass:'medium',estimatedLeaseMiB:256,maxAttempts:3,createdAtIso:'2026-09-09T00:00:00.000Z'});
    const queued=enqueueJob(db,{type:'DAILY_ANALYSIS',priority:20,idempotencyKey:'durable-queued',payload:{store:'B'},sizeClass:'small',estimatedLeaseMiB:128,maxAttempts:3,createdAtIso:'2026-09-09T00:00:00.000Z'});
    claimNextJob(db,{owner:'old-coordinator',nowIso:'2026-09-09T00:01:00.000Z'});
    markJobRunning(db,{jobId:queued.id,owner:'old-coordinator',nowIso:'2026-09-09T00:01:01.000Z'});
    claimNextJob(db,{owner:'old-coordinator',nowIso:'2026-09-09T00:01:02.000Z'});
    markJobRunning(db,{jobId:stale.id,owner:'old-coordinator',nowIso:'2026-09-09T00:01:03.000Z'});
    db.close();

    db=openDatabase(path);migrate(db);
    const recovered=recoverStartupState({db,now:new Date('2026-09-09T00:20:00.000Z'),staleAfterMs:5*60*1000});
    assert.equal(recovered,2);
    assert.equal(getJob(db,queued.id).state,'retry_wait');
    assert.equal(getJob(db,stale.id).state,'retry_wait');
    assert.deepEqual(getJob(db,queued.id).payload,{store:'B'});
    assert.deepEqual(getJob(db,stale.id).payload,{store:'A'});
  }finally{
    try{db?.close()}catch{}
    rmSync(dir,{recursive:true,force:true});
  }
});
