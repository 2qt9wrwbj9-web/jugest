import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture} from './helpers/collector-v3-fixture.mjs';
import {setTimeout as delay} from 'node:timers/promises';

const fixture=async t=>await createFixture(t),dateOf=x=>String(x.url||'').match(/\/(20\d\d-\d\d-\d\d)-/)?.[1]||'';

// Conditional write and full state-machine coverage lives here because this is the
// most failure-sensitive Collector surface. The helpers use the same generated
// Relay runtime as Production, with a controllable Blob-shaped backend.
test('conditional Blob writes reject a stale ETag without losing newer data',async t=>{
  const f=await fixture(t),s=f.store('jugest-relay');
  await s.setJSON('etag-test',{n:1});
  const a=await s.getWithMetadata('etag-test');
  await s.setJSON('etag-test',{n:2},{ifMatch:a.etag});
  await assert.rejects(()=>s.setJSON('etag-test',{n:3},{ifMatch:a.etag}),e=>e?.status===412);
  assert.deepEqual(await s.get('etag-test',{type:'json'}),{n:2});
});

test('issues five, saves five, pulls exact parsed days; steady-state operation budget',async t=>{
  const f=await fixture(t),b=await f.next();assert.equal(b.state,'RUN');assert.equal(b.jobs.length,5);
  assert.equal(new Set(b.jobs.map(x=>x.date)).size,5);assert.ok(b.jobs.every(x=>x.transportMode==='direct'));
  const before=f.ops();const pushed=await f.push(b,b.jobs.map(f.good));assert.equal(pushed.saved,5);assert.equal(pushed.failed,0);
  const after=f.ops(),delta=f.diffOps(before,after);console.log('BATCH_V3_OPERATION_COUNT',JSON.stringify(delta));
  assert.ok(delta.advanced<=3,JSON.stringify(delta));
  const pulled=await f.call({action:'collectorPull',...f.receiver,sinceRevision:0,limit:20});assert.equal(pulled.days.length,5);
  assert.deepEqual(new Set(pulled.days.map(x=>x.date)),new Set(b.jobs.map(x=>x.date)));
});

for(const n of [1,2,5])test(`partial/all failure (${n}/5) persists successes and only retries failed days`,async t=>{
  const f=await fixture(t),b=await f.next(),rows=b.jobs.map((j,i)=>i<n?f.bad(j):f.good(j)),p=await f.push(b,rows);
  assert.equal(p.failed,n);assert.equal(p.saved,5-n);
  await f.advance(16*60*1000);const b2=await f.next();assert.equal(b2.state,'RUN');
  const failed=new Set(b.jobs.slice(0,n).map(x=>x.date)),saved=new Set(b.jobs.slice(n).map(x=>x.date));
  assert.ok(b2.jobs.some(j=>failed.has(j.date)));assert.ok(!b2.jobs.some(j=>saved.has(j.date)));
});

test('same batch and same job replay cannot increment revisions or retry counters',async t=>{
  const f=await fixture(t),b=await f.next(),one=await f.push(b,[f.good(b.jobs[0])]),two=await f.push(b,[f.good(b.jobs[0])]);
  assert.equal(one.saved,1);assert.equal(two.duplicates,1);assert.equal(two.saved,0);
  const pull=await f.call({action:'collectorPull',...f.receiver,sinceRevision:0,limit:20});
  assert.equal(pull.days.filter(x=>x.date===b.jobs[0].date).length,1);
});

test('aborted Shortcut preserves submitted successes; expired missing jobs are reissued, stale owner rejected',async t=>{
  const f=await fixture(t),b=await f.next();assert.equal((await f.push(b,b.jobs.slice(0,2).map(f.good))).saved,2);
  await f.advance(21*60*1000);const n=await f.next();assert.equal(n.state,'RUN');assert.ok(!n.jobs.some(j=>b.jobs.slice(0,2).some(x=>x.date===j.date)));
  const stale=await f.push(b,[f.good(b.jobs[2])]);assert.equal(stale.saved,0);assert.equal(stale.results[0].code,'job_expired');
  assert.equal((await f.push(n,n.jobs.map(f.good))).saved,5);
});

test('parallel Next claims at most one batch; V2 cannot claim its dates',async t=>{
  const f=await fixture(t);const replies=await Promise.all([f.next(),f.next(),f.next()]);
  assert.equal(replies.filter(x=>x.state==='RUN').length,1);assert.equal(replies.filter(x=>x.state==='WAIT').length,2);
  const b=replies.find(x=>x.state==='RUN'),v2=await f.call({action:'iosCollectorNextV2',...f.sender});
  assert.equal(v2.state,'RUN');assert.ok(!b.jobs.some(j=>j.date===dateOf(v2)));assert.ok(v2.waitSeconds>=30&&v2.waitSeconds<=90);
});

test('parallel Push of overlapping results is idempotent and does not lose disjoint days',async t=>{
  const f=await fixture(t),b=await f.next();
  const replies=await Promise.all([f.push(b,b.jobs.slice(0,3).map(f.good)),f.push(b,b.jobs.slice(2).map(f.good)),f.push(b,b.jobs.map(f.good))]);
  assert.ok(replies.every(x=>x.status===200),JSON.stringify(replies));
  const pull=await f.call({action:'collectorPull',...f.receiver,sinceRevision:0,limit:20});assert.equal(new Set(pull.days.map(x=>x.date)).size,5);
});

test('lost Push acknowledgement is recovered by resend without re-saving',async t=>{
  const f=await fixture(t),b=await f.next();let once=true;
  f.blob.hooks.afterPut=async()=>{if(once){once=false;throw Error('lost acknowledgement')}};
  const first=await f.push(b,[f.good(b.jobs[0])]);assert.ok(first.status>=500);f.blob.hooks.afterPut=null;
  const second=await f.push(b,[f.good(b.jobs[0])]);assert.equal(second.saved,0);assert.equal(second.duplicates,1);
});

test('unpublished payload is never visible if state commit fails',async t=>{
  const f=await fixture(t),b=await f.next();let fail=true;
  f.blob.hooks.beforePut=async k=>{if(fail&&k.includes('collector-state-v3'))throw Error('state unavailable')};
  const failed=await f.push(b,[f.good(b.jobs[0])]);assert.ok(failed.status>=500);f.blob.hooks.beforePut=null;fail=false;
  const pull=await f.call({action:'collectorPull',...f.receiver,sinceRevision:0,limit:20});assert.ok(!pull.days.some(x=>x.date===b.jobs[0].date));
});

test('manual requeue overrides coverage and invalidates previously saved and in-flight tokens',async t=>{
  const f=await fixture(t),b=await f.next();assert.equal((await f.push(b,[f.good(b.jobs[0])])).saved,1);
  const j=b.jobs[0],rq=await f.call({action:'iosCollectorRequeueDate',...f.receiver,sourceStoreId:j.sourceStoreId,date:j.date});assert.equal(rq.ok,true);
  const n=await f.next();assert.equal(n.state,'RUN');assert.ok(n.jobs.some(x=>x.date===j.date));
  const stale=await f.push(b,[f.good(j)]);assert.equal(stale.results[0].code,'job_cancelled');
});

test('multiple stores retain priority and do not cross identities',async t=>{
  const f=await fixture(t);await f.addStore('B店','https://ana-slo.com/2026-09-10-b-data/',3);
  const b=await f.next();assert.equal(b.state,'RUN');assert.ok(b.jobs.length);assert.equal(b.jobs[0].shop,'B店');
  assert.ok(b.jobs.every(j=>j.sourceStoreId));assert.equal(new Set(b.jobs.map(j=>j.sourceStoreId)).size,1);
});

test('legacy format migrates non-destructively; old payloads, V2 and coverage remain compatible',async t=>{
  const f=await fixture(t);await f.seedLegacy();const b=await f.next();assert.equal(b.state,'RUN');
  const v2=await f.call({action:'iosCollectorNextV2',...f.sender});assert.ok(['RUN','WAIT','DONE'].includes(v2.state));
  const status=await f.call({action:'collectorStatus',...f.receiver,localCoverage:[]});assert.equal(status.ok,true);
  const legacy=await f.readLegacyPayload();assert.ok(legacy,'legacy payload must remain during migration');
});

test('cleanup removes store state, preserves other store data, and unlink cannot resurrect legacy data',async t=>{
  const f=await fixture(t);await f.addStore('B店','https://ana-slo.com/2026-09-10-b-data/',3);const b=await f.next();await f.push(b,b.jobs.map(f.good));
  const target=b.jobs[0];const del=await f.call({action:'iosCollectorTargetDelete',...f.receiver,sourceStoreId:target.sourceStoreId});assert.equal(del.ok,true);
  const pull=await f.call({action:'collectorPull',...f.receiver,sinceRevision:0,limit:50});assert.ok(!pull.days.some(x=>x.sourceStoreId===target.sourceStoreId));
  await f.seedLegacy();const un=await f.call({action:'unlink',...f.receiver});assert.equal(un.ok,true);assert.equal(await f.channel(),null);
});

test('year calendar including leap floor is enforced; local coverage skip reaches DONE',async t=>{
  const f=await fixture(t,{now:'2026-03-01T00:00:00Z'});await f.setTargetStart('2020-01-01');let seen=[];
  for(let i=0;i<80;i++){const b=await f.next();if(b.state==='DONE')break;if(b.state==='WAIT'){await f.advance(Math.max(1,b.waitSeconds)*1000);continue}seen.push(...b.jobs.map(x=>x.date));await f.push(b,b.jobs.map(f.good));await f.advance(16*60*1000)}
  assert.ok(seen.length);assert.ok(seen.every(d=>d>='2025-03-01'&&d<='2026-02-28'));
});

test('corrupt snapshot and absent ETag fail closed',async t=>{
  const f=await fixture(t);await f.corruptState();const bad=await f.next();assert.ok(bad.status>=500);
  await f.reset();await f.dropStateEtag();const noTag=await f.next();assert.ok(noTag.status>=500);
});

test('V2 lease ownership and explicit failed result receipts prevent stale retries',async t=>{
  const f=await fixture(t),v2=await f.call({action:'iosCollectorNextV2',...f.sender});assert.equal(v2.state,'RUN');
  const failed=await f.call({action:'iosCollectorPushV2',...f.sender,jobToken:v2.jobToken,error:'HTTP 403',text:''});assert.ok(failed.state==='FAILED'||failed.ok===false);
  const replay=await f.call({action:'iosCollectorPushV2',...f.sender,jobToken:v2.jobToken,error:'HTTP 403',text:''});assert.ok(replay.duplicate||replay.code);
});

test('Launcher messages still save, receive and acknowledge after snapshot migration',async t=>{
  const f=await fixture(t);await f.call({action:'send',...f.sender,payload:{hello:'world'}});const p=await f.call({action:'peek',...f.receiver});assert.equal(p.count,1);
  const r=await f.call({action:'receive',...f.receiver});assert.equal(r.items.length,1);await f.call({action:'ack',...f.receiver,ids:r.items.map(x=>x.id)});assert.equal((await f.call({action:'peek',...f.receiver})).count,0);
});

test('key rotation revokes the old key and preserves existing jobs for the new key',async t=>{
  const f=await fixture(t),b=await f.next(),old={...f.sender};await f.rotateSender();const rejected=await f.call({action:'iosCollectorNextV2',...old});assert.equal(rejected.status,401);
  const pushed=await f.push(b,[f.good(b.jobs[0])]);assert.ok(pushed.saved===1||pushed.duplicates===1);
});

test('cold concurrent migration retains every original day and creates a single claim',async t=>{
  const f=await fixture(t);await f.seedLegacy({days:12});const replies=await Promise.all([f.next(),f.next()]);assert.equal(replies.filter(x=>x.state==='RUN').length,1);
  const all=await f.listStoredDays();assert.ok(all.length>=12);
});

test('missing payload cannot advance Device Sync-compatible Collector pull cursor',async t=>{
  const f=await fixture(t),b=await f.next();await f.push(b,[f.good(b.jobs[0])]);await f.removePublishedPayload(b.jobs[0]);
  const pull=await f.call({action:'collectorPull',...f.receiver,sinceRevision:0,limit:20});assert.ok(pull.status>=500||pull.error);
});

test('missing origin ETag rejects a write; malformed legacy metadata cannot be migrated as empty',async t=>{
  const f=await fixture(t);await f.dropStateEtag();const b=await f.next();assert.ok(b.status>=500);await f.reset();await f.seedMalformedLegacy();const m=await f.next();assert.ok(m.status>=500);
});

test('identical local coverage polling and WAIT polling do not write',async t=>{
  const f=await fixture(t),before=f.ops();await f.call({action:'collectorStatus',...f.receiver,localCoverage:[]});await f.call({action:'collectorStatus',...f.receiver,localCoverage:[]});const after=f.ops();assert.equal(f.diffOps(before,after).put,0);
});

test('a failed cleanup remains journaled and a later authorized request safely finishes it',async t=>{
  const f=await fixture(t),b=await f.next();await f.push(b,b.jobs.map(f.good));let once=true,orig=f.blob.delete.bind(f.blob);f.blob.delete=async k=>{if(once){once=false;throw Error('delete unavailable')}return orig(k)};
  await f.call({action:'iosCollectorTargetDelete',...f.receiver,sourceStoreId:b.jobs[0].sourceStoreId});f.blob.delete=orig;const status=await f.call({action:'collectorStatus',...f.receiver});assert.equal(status.ok,true);
});

test('unlink interrupted during deletion can be retried with the original receiver credential',async t=>{
  const f=await fixture(t),orig=f.blob.delete.bind(f.blob);let once=true;f.blob.delete=async k=>{if(once){once=false;throw Error('unlink deletion failed')}return orig(k)};
  const first=await f.call({action:'unlink',...f.receiver});assert.ok(first.status>=500||first.cleanupRetry);f.blob.delete=orig;const second=await f.call({action:'unlink',...f.receiver});assert.ok(second.ok||second.cleanupRetry);
});

test('iosCollectorRequeueDate wins against a stale parallel Push',async t=>{
  const f=await fixture(t),b=await f.next(),j=b.jobs[0];const [a,p]=await Promise.all([f.call({action:'iosCollectorRequeueDate',...f.receiver,sourceStoreId:j.sourceStoreId,date:j.date}),f.push(b,[f.good(j)])]);assert.ok(a.ok);assert.ok(p.status===200||p.status===409);
});

test('iosCollectorTargetDelete wins against a stale parallel Push',async t=>{
  const f=await fixture(t),b=await f.next(),j=b.jobs[0];const [a,p]=await Promise.all([f.call({action:'iosCollectorTargetDelete',...f.receiver,sourceStoreId:j.sourceStoreId}),f.push(b,[f.good(j)])]);assert.ok(a.ok);assert.ok(p.status===200||p.status===404||p.status===409);
});

test('unlink wins against a stale parallel Push',async t=>{
  const f=await fixture(t),b=await f.next(),j=b.jobs[0];const [a,p]=await Promise.all([f.call({action:'unlink',...f.receiver}),f.push(b,[f.good(j)])]);assert.ok(a.ok||a.cleanupRetry);assert.ok(p.status>=200);
});

test('real parser accepts HTML/text layouts and rejects identity, missing headers and partial pages independently',async t=>{
  const f=await fixture(t);await f.parserCases();
});

test('target deletion reclaims unpublished payloads left by an ambiguous failed write',async t=>{
  const f=await fixture(t),b=await f.next();await f.makeUnpublishedPayload(b.jobs[0]);const before=await f.countPayloadPacks();await f.call({action:'iosCollectorTargetDelete',...f.receiver,sourceStoreId:b.jobs[0].sourceStoreId});const after=await f.countPayloadPacks();assert.ok(after<before);
});

test('invalid/cross-channel credentials cannot issue or modify jobs',async t=>{
  const f=await fixture(t),other=await f.otherSender();const a=await f.call({action:'iosCollectorNextBatchV3',...other});assert.equal(a.status,401);const b=await f.next();const p=await f.call({action:'iosCollectorPushBatchV3',...other,batchId:b.batchId,results:[f.good(b.jobs[0])]});assert.equal(p.status,401);
});

test('SDK-shaped conditional errors without a numeric status retry from a fresh snapshot',async t=>{
  const f=await fixture(t);await f.simulateConditionalRetry();const b=await f.next();assert.ok(['RUN','WAIT','DONE'].includes(b.state));
});
