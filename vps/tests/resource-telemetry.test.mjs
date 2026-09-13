import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {captureResourceSnapshot,readRuntimeTelemetry,measureIngest,readIngestTelemetry,__test} from '../src/resource-telemetry.mjs';

test('resource snapshot reports stable non-negative byte metrics',async()=>{
  const snapshot=await captureResourceSnapshot({memoryReader:async()=>({hostTotalMiB:4096,hostAvailableMiB:3072,effectiveLimitMiB:4096,effectiveAvailableMiB:3072,usedRatio:.25,swapUsedMiB:64}),memoryUsage:()=>({rss:200_000_000,heapUsed:50_000_000,heapTotal:100_000_000,external:2_000_000,arrayBuffers:1_000_000}),osModule:{loadavg:()=>[.1,.2,.3],cpus:()=>[{},{}],uptime:()=>12345},clock:()=>new Date('2026-09-13T00:00:00.000Z')});
  assert.equal(snapshot.timestamp,'2026-09-13T00:00:00.000Z');assert.equal(snapshot.system.totalMemoryBytes,4096*1024*1024);assert.equal(snapshot.system.usedMemoryBytes,1024*1024*1024);assert.equal(snapshot.system.cpuCount,2);assert.equal(snapshot.process.rssBytes,200_000_000);
  for(const value of [snapshot.system.totalMemoryBytes,snapshot.system.availableMemoryBytes,snapshot.system.usedMemoryBytes,snapshot.process.rssBytes,snapshot.process.heapUsedBytes])assert.ok(Number.isFinite(value)&&value>=0);
});

test('runtime telemetry reuses scheduler and job-run evidence without changing scheduler behavior',()=>{
  const db=openDatabase(':memory:');migrate(db);const now='2026-09-13T00:00:00.000Z';
  db.prepare(`INSERT INTO jobs(type,priority,idempotency_key,payload_json,size_class,estimated_lease_mib,max_attempts,state,created_at,updated_at) VALUES('DAILY_ANALYSIS',10,'telemetry-fixture','{"storeId":"store-a"}','medium',256,3,'succeeded',?,?)`).run(now,now);
  const jobId=db.prepare('SELECT id FROM jobs').get().id;
  db.prepare(`INSERT INTO job_runs(job_id,attempt,owner,started_at,ended_at,peak_rss_mib,error_class) VALUES(?,1,'test','2026-09-13T00:00:00.000Z','2026-09-13T00:00:02.500Z',321.5,NULL)`).run(jobId);
  db.prepare(`INSERT INTO resource_samples(captured_at,effective_available_mib,used_ratio,swap_used_mib,running_children,queue_depth,decision_json) VALUES(?,2048,.5,0,1,2,'{"pressure":"NORMAL"}')`).run(now);
  db.prepare(`INSERT INTO memory_profiles(job_type,size_class,ewma_peak_mib,samples,updated_at) VALUES('DAILY_ANALYSIS','medium',300,4,?)`).run(now);
  const out=readRuntimeTelemetry(db,{historyLimit:10});assert.equal(out.queue.succeeded,1);assert.equal(out.recentRuns[0].durationMs,2500);assert.equal(out.recentRuns[0].observedPeakRssBytes,Math.round(321.5*1024*1024));assert.equal(out.recentRuns[0].storeId,'store-a');assert.equal(out.latestSchedulerSample.queueDepth,2);assert.equal(out.memoryProfiles[0].samples,4);db.close();
});

test('runtime telemetry exposes bounded per-store task history with scale, RAM, CPU and model metadata',()=>{
  const db=openDatabase(':memory:');migrate(db);const now='2026-09-13T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('store-a','負荷計測店','{}',now,now);
  for(let i=0;i<3;i+=1){
    db.prepare(`INSERT INTO analysis_task_metrics(job_id,store_id,phase,task_kind,task_version,model_fingerprint,store_machine_count,store_size_bucket,day_count,row_count,workload_units,started_at,ended_at,duration_ms,start_rss_mib,end_rss_mib,peak_rss_mib,cpu_ms,status,error_class,details_json)
      VALUES(NULL,'store-a',1,'feature_build','store-features-v1',?,241,'201-300',180,42000,42000,?,?,?,?,?,?,?,'succeeded',NULL,'{}')`)
      .run(`fp-${i}`,`2026-09-13T00:00:0${i}.000Z`,`2026-09-13T00:00:0${i+1}.000Z`,1000+i,80+i,90+i,300+i,500+i);
  }
  const out=readRuntimeTelemetry(db,{historyLimit:2});
  assert.equal(out.taskHistory.length,2,'historyLimit must bound task history');
  assert.equal(out.taskHistory[0].storeName,'負荷計測店');
  assert.equal(out.taskHistory[0].taskKind,'feature_build');
  assert.equal(out.taskHistory[0].storeMachineCount,241);
  assert.equal(out.taskHistory[0].storeSizeBucket,'201-300');
  assert.equal(out.taskHistory[0].rowCount,42000);
  assert.equal(out.taskHistory[0].peakRssBytes,Math.round(302*1024*1024));
  assert.equal(out.taskHistory[0].cpuMs,502);
  assert.equal(out.taskHistory[0].modelFingerprint,'fp-2');
  db.close();
});

test('ingest telemetry records before/after memory and duration without changing operation result',async()=>{
  __test.ingestState.running=0;__test.ingestState.recent.length=0;
  const times=[new Date('2026-09-13T00:00:00.000Z'),new Date('2026-09-13T00:00:00.125Z')];
  const mem=[{rss:1000,heapUsed:400},{rss:1250,heapUsed:460}];
  const result=await measureIngest(async()=>({ok:true}),{storeId:'store-a',date:'2026-09-13',clock:()=>times.shift(),memoryUsage:()=>mem.shift()});
  assert.deepEqual(result,{ok:true});
  const out=readIngestTelemetry();assert.equal(out.running,0);assert.equal(out.recent.length,1);assert.equal(out.recent[0].durationMs,125);assert.equal(out.recent[0].rssDeltaBytes,250);assert.equal(out.recent[0].heapDeltaBytes,60);assert.equal(out.recent[0].success,true);
});

test('ingest telemetry preserves operation error and releases running count',async()=>{
  __test.ingestState.running=0;__test.ingestState.recent.length=0;
  const times=[new Date('2026-09-13T00:00:00.000Z'),new Date('2026-09-13T00:00:00.010Z')];
  const mem=[{rss:1000,heapUsed:400},{rss:900,heapUsed:350}];
  const error=Object.assign(new Error('boom'),{code:'fixture_error'});
  await assert.rejects(()=>measureIngest(async()=>{throw error},{clock:()=>times.shift(),memoryUsage:()=>mem.shift()}),/boom/);
  const out=readIngestTelemetry();assert.equal(out.running,0);assert.equal(out.recent[0].success,false);assert.equal(out.recent[0].errorClass,'fixture_error');assert.equal(out.recent[0].rssDeltaBytes,-100);
});
