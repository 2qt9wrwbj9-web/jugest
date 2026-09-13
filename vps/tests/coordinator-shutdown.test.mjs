import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {enqueueJob,getJob} from '../src/queue.mjs';
import {loadResourcePolicy} from '../src/config.mjs';
import {Coordinator} from '../src/coordinator.mjs';

const snapshot={
  hostTotalMiB:2048,
  hostAvailableMiB:1600,
  cgroupLimitMiB:2048,
  cgroupCurrentMiB:448,
  effectiveLimitMiB:2048,
  effectiveAvailableMiB:1600,
  usedRatio:448/2048,
  swapUsedMiB:0
};

test('coordinator shutdown defers active work and terminates its child',async()=>{
  const db=openDatabase(':memory:');
  migrate(db);
  const job=enqueueJob(db,{
    type:'DAILY_ANALYSIS',
    priority:20,
    idempotencyKey:'shutdown-daily',
    payload:{storeId:'store-a'},
    sizeClass:'medium',
    estimatedLeaseMiB:512,
    maxAttempts:3,
    createdAtIso:'2026-09-13T00:00:00.000Z'
  });
  let killed=0;
  const coordinator=new Coordinator({
    db,
    memoryReader:async()=>snapshot,
    spawnChild:()=>({kill(){killed+=1;}}),
    owner:'test-owner',
    policy:loadResourcePolicy({maxAnalysisChildren:1}),
    clock:()=>new Date('2026-09-13T00:00:10.000Z')
  });

  await coordinator.tick();
  assert.equal(getJob(db,job.id).state,'running');

  const stopped=await coordinator.shutdown();
  assert.equal(stopped,1);
  assert.equal(killed,1);
  assert.equal(coordinator.runningCount,0);
  assert.equal(getJob(db,job.id).state,'retry_wait');
  assert.equal(getJob(db,job.id).lastErrorClass,'coordinator_shutdown');
  db.close();
});
