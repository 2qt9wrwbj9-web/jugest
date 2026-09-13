import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {readRuntimeTelemetry,buildResourceStatus} from '../src/resource-telemetry.mjs';

function insertJob(db,{key,state,type='DAILY_ANALYSIS',priority=20,lease=512,availableAt=null,heartbeatAt=null,errorClass=null,errorMessage=null,storeId='store-a',createdAt='2026-09-13T00:00:00.000Z'}){
  db.prepare(`INSERT INTO jobs(type,priority,idempotency_key,payload_json,size_class,estimated_lease_mib,max_attempts,attempts,failure_count,state,lease_owner,heartbeat_at,available_at,last_error_class,last_error_message,created_at,updated_at)
    VALUES(?,?,?,?,?,?,3,0,0,? ,NULL,?,?,?,?,?,?)`).run(type,priority,key,JSON.stringify({storeId}),'medium',lease,state,heartbeatAt,availableAt,errorClass,errorMessage,createdAt,createdAt);
}

test('runtime telemetry exposes exact queue states and pending job details',()=>{
  const db=openDatabase(':memory:');migrate(db);
  insertJob(db,{key:'queued',state:'queued',storeId:'q'});
  insertJob(db,{key:'retry',state:'retry_wait',availableAt:'2026-09-13T00:05:00.000Z',errorClass:'child_error',errorMessage:'boom',storeId:'r'});
  insertJob(db,{key:'leased',state:'leased',heartbeatAt:'2026-09-13T00:00:03.000Z',storeId:'l'});
  insertJob(db,{key:'running',state:'running',heartbeatAt:'2026-09-13T00:00:04.000Z',storeId:'run'});
  const out=readRuntimeTelemetry(db,{historyLimit:10});
  assert.deepEqual(out.queueByState,{queued:1,retryWait:1,leased:1,running:1,succeeded:0,failed:0,cancelled:0});
  assert.equal(out.pendingJobs.length,4);
  const retry=out.pendingJobs.find(job=>job.state==='retry_wait');
  assert.equal(retry.storeId,'r');assert.equal(retry.estimatedLeaseMiB,512);assert.equal(retry.availableAt,'2026-09-13T00:05:00.000Z');assert.equal(retry.lastErrorClass,'child_error');
  db.close();
});

test('resource status flags a stale scheduler sample while work is ready',async()=>{
  const db=openDatabase(':memory:');migrate(db);
  insertJob(db,{key:'queued',state:'queued'});
  db.prepare(`INSERT INTO resource_samples(captured_at,effective_available_mib,used_ratio,swap_used_mib,running_children,queue_depth,decision_json)
    VALUES('2026-09-13T00:00:00.000Z',1500,.2,0,0,1,'{"pressure":"NORMAL"}')`).run();
  const out=await buildResourceStatus(db,{clock:()=>new Date('2026-09-13T00:00:20.000Z'),memoryReader:async()=>({hostTotalMiB:2048,hostAvailableMiB:1600,effectiveLimitMiB:2048,effectiveAvailableMiB:1600,usedRatio:.22,swapUsedMiB:0}),memoryUsage:()=>({rss:80_000_000,heapUsed:20_000_000,heapTotal:30_000_000,external:0,arrayBuffers:0}),osModule:{loadavg:()=>[0,0,0],cpus:()=>[{},{}],uptime:()=>100}});
  assert.equal(out.analysis.schedulerHealth.code,'scheduler_stale');
  assert.equal(out.analysis.schedulerHealth.sampleAgeMs,20000);
  assert.equal(out.analysis.schedulerHealth.readyWork,true);
  db.close();
});
