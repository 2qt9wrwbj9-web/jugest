import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {migrate} from '../src/schema.mjs';
import {captureResourceSnapshot,readRuntimeTelemetry} from '../src/resource-telemetry.mjs';

test('resource snapshot reports stable non-negative byte metrics',async()=>{
  const snapshot=await captureResourceSnapshot({
    memoryReader:async()=>({hostTotalMiB:4096,hostAvailableMiB:3072,effectiveLimitMiB:4096,effectiveAvailableMiB:3072,usedRatio:.25,swapUsedMiB:64}),
    memoryUsage:()=>({rss:200_000_000,heapUsed:50_000_000,heapTotal:100_000_000,external:2_000_000,arrayBuffers:1_000_000}),
    osModule:{loadavg:()=>[.1,.2,.3],cpus:()=>[{},{}],uptime:()=>12345},
    clock:()=>new Date('2026-09-13T00:00:00.000Z')
  });
  assert.equal(snapshot.timestamp,'2026-09-13T00:00:00.000Z');
  assert.equal(snapshot.system.totalMemoryBytes,4096*1024*1024);
  assert.equal(snapshot.system.usedMemoryBytes,1024*1024*1024);
  assert.equal(snapshot.system.cpuCount,2);
  assert.equal(snapshot.process.rssBytes,200_000_000);
  for(const value of [snapshot.system.totalMemoryBytes,snapshot.system.availableMemoryBytes,snapshot.system.usedMemoryBytes,snapshot.process.rssBytes,snapshot.process.heapUsedBytes])assert.ok(Number.isFinite(value)&&value>=0);
});

test('runtime telemetry reuses scheduler and job-run evidence without changing scheduler behavior',()=>{
  const db=new Database(':memory:');migrate(db);
  const now='2026-09-13T00:00:00.000Z';
  db.prepare(`INSERT INTO jobs(type,priority,idempotency_key,payload_json,size_class,estimated_lease_mib,max_attempts,state,created_at,updated_at) VALUES('DAILY_ANALYSIS',10,'telemetry-fixture','{"storeId":"store-a"}','medium',256,3,'succeeded',?,?)`).run(now,now);
  const jobId=db.prepare('SELECT id FROM jobs').get().id;
  db.prepare(`INSERT INTO job_runs(job_id,attempt,owner,started_at,ended_at,peak_rss_mib,error_class) VALUES(?,1,'test','2026-09-13T00:00:00.000Z','2026-09-13T00:00:02.500Z',321.5,NULL)`).run(jobId);
  db.prepare(`INSERT INTO resource_samples(captured_at,effective_available_mib,used_ratio,swap_used_mib,running_children,queue_depth,decision_json) VALUES(?,2048,.5,0,1,2,'{"pressure":"NORMAL"}')`).run(now);
  db.prepare(`INSERT INTO memory_profiles(job_type,size_class,ewma_peak_mib,samples,updated_at) VALUES('DAILY_ANALYSIS','medium',300,4,?)`).run(now);
  const out=readRuntimeTelemetry(db,{historyLimit:10});
  assert.equal(out.queue.succeeded,1);
  assert.equal(out.recentRuns[0].durationMs,2500);
  assert.equal(out.recentRuns[0].observedPeakRssBytes,Math.round(321.5*1024*1024));
  assert.equal(out.recentRuns[0].storeId,'store-a');
  assert.equal(out.latestSchedulerSample.queueDepth,2);
  assert.equal(out.memoryProfiles[0].samples,4);
  db.close();
});
