import test from'node:test';import assert from'node:assert/strict';
import{fixture,args}from'./v9-fixture.mjs';import{enqueueDailyPipeline,advanceDailyPipelines}from'../lib/analysis/daily-pipeline.mjs';
test('daily bridge deduplicates reception and crash after child acceptance recovers stable children/outboxes',async()=>{const f=await fixture();try{const o={...f,...args,enabled:true};const a=await enqueueDailyPipeline(o),b=await enqueueDailyPipeline(o);assert.equal(a.parent_id,b.parent_id);await f.db.prepare("UPDATE sites_analysis_jobs SET state='succeeded' WHERE id=?").bind(a.parent_id).run();await assert.rejects(advanceDailyPipelines({...o,onStage:s=>{if(s==='daily:feature-accepted')throw Error('stopped')}}));await advanceDailyPipelines(o);await advanceDailyPipelines(o);const row=await f.db.prepare('SELECT * FROM sites_daily_runs').first();assert.ok(row.feature_id&&row.pre_id);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_analysis_jobs').first()).n,3);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_analysis_dispatch').first()).n,3);await f.db.prepare("UPDATE sites_analysis_jobs SET state='succeeded'").run();await advanceDailyPipelines(o);assert.equal((await f.db.prepare('SELECT state FROM sites_daily_runs').first()).state,'completed')}finally{await f.mf.dispose()}});
test('new daily frontier supersedes old continuation without deleting its history',async()=>{const f=await fixture();try{const old=await enqueueDailyPipeline({...f,...args,targetDate:'2026-02-18'});await enqueueDailyPipeline({...f,...args});await advanceDailyPipelines({...f,enabled:true});assert.equal((await f.db.prepare('SELECT state FROM sites_daily_runs WHERE parent_id=?').bind(old.parent_id).first()).state,'superseded');assert.ok(await f.db.prepare('SELECT id FROM sites_analysis_jobs WHERE id=?').bind(old.parent_id).first())}finally{await f.mf.dispose()}});
test('daily continuation is opt-in and never enables an unverified scheduler by default',async()=>{const f=await fixture();try{const a=await enqueueDailyPipeline({...f,...args});await f.db.prepare("UPDATE sites_analysis_jobs SET state='succeeded' WHERE id=?").bind(a.parent_id).run();assert.deepEqual(await advanceDailyPipelines(f),[]);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_analysis_jobs').first()).n,1)}finally{await f.mf.dispose()}});

// These tests exercise real local D1 acceptance/outbox transactions. Parent
// success is supplied deliberately: this is not a full daily-analysis proof.
async function succeedParent(f,row){await f.db.prepare("UPDATE sites_analysis_jobs SET state='succeeded' WHERE id=?").bind(row.parent_id).run()}
async function countJobs(f){return(await f.db.prepare('SELECT COUNT(*) n FROM sites_analysis_jobs').first()).n}

test('older daily reception cannot replace the current analysis head after a newer day was accepted',async()=>{
 const f=await fixture();try{
  const latest=await enqueueDailyPipeline({...f,...args});
  await assert.rejects(enqueueDailyPipeline({...f,...args,targetDate:'2026-02-18'}),{code:'daily_frontier_changed'});
  assert.equal(await countJobs(f),1);
  assert.equal((await f.db.prepare("SELECT latest_job_id FROM sites_analysis_heads WHERE kind='store-analysis'").first()).latest_job_id,latest.parent_id);
 }finally{await f.mf.dispose()}
});

test('new day between reception read and acceptance rolls back stale root and its outbox',async()=>{
 const f=await fixture();try{
  await assert.rejects(enqueueDailyPipeline({...f,...args,onStage:async stage=>{
   if(stage==='daily:before-parent-accept')await enqueueDailyPipeline({...f,...args,targetDate:'2026-02-20'});
  }}),{code:'daily_frontier_changed'});
  assert.equal(await countJobs(f),1);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_daily_runs').first()).n,1);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_analysis_dispatch').first()).n,1);
 }finally{await f.mf.dispose()}
});

test('new day after feature acceptance prevents stale PRE acceptance and retains accepted history',async()=>{
 const f=await fixture();try{
  const old=await enqueueDailyPipeline({...f,...args});await succeedParent(f,old);
  await advanceDailyPipelines({...f,enabled:true,onStage:async stage=>{
   if(stage==='daily:feature-accepted')await enqueueDailyPipeline({...f,...args,targetDate:'2026-02-20'});
  }});
  const row=await f.db.prepare('SELECT * FROM sites_daily_runs WHERE parent_id=?').bind(old.parent_id).first();
  assert.equal(row.state,'superseded');assert.equal(await countJobs(f),3);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM sites_analysis_jobs WHERE kind='formal-pre'").first()).n,0);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_analysis_dispatch').first()).n,3);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_daily_fences').first()).n,0);
 }finally{await f.mf.dispose()}
});

test('new day immediately before child transaction prevents stale feature and PRE acceptance',async()=>{
 const f=await fixture();try{
  const old=await enqueueDailyPipeline({...f,...args});await succeedParent(f,old);
  await advanceDailyPipelines({...f,enabled:true,onStage:async stage=>{
   if(stage==='daily:before-feature-accept')await enqueueDailyPipeline({...f,...args,targetDate:'2026-02-20'});
  }});
  assert.equal(await countJobs(f),2);
  assert.equal((await f.db.prepare('SELECT state FROM sites_daily_runs WHERE parent_id=?').bind(old.parent_id).first()).state,'superseded');
 }finally{await f.mf.dispose()}
});

test('concurrent continuation cannot resurrect a superseded run while publishing child links',async()=>{
 const f=await fixture();try{
  const old=await enqueueDailyPipeline({...f,...args});await succeedParent(f,old);
  await advanceDailyPipelines({...f,enabled:true,onStage:async stage=>{
   if(stage==='daily:pre-accepted'){
    await enqueueDailyPipeline({...f,...args,targetDate:'2026-02-20'});
    await advanceDailyPipelines({...f,enabled:true});
   }
  }});
  assert.equal((await f.db.prepare('SELECT state FROM sites_daily_runs WHERE parent_id=?').bind(old.parent_id).first()).state,'superseded');
  assert.equal(await countJobs(f),4);
 }finally{await f.mf.dispose()}
});

test('response loss after root registration retries the same durable run without reopening terminal state',async()=>{
 const f=await fixture();try{
  await assert.rejects(enqueueDailyPipeline({...f,...args,onStage:stage=>{if(stage==='daily:parent-accepted')throw Error('response lost')}}),/response lost/);
  const a=await enqueueDailyPipeline({...f,...args});assert.equal(await countJobs(f),1);
  await f.db.prepare("UPDATE sites_daily_runs SET state='completed' WHERE parent_id=?").bind(a.parent_id).run();
  assert.equal((await enqueueDailyPipeline({...f,...args})).state,'completed');
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_analysis_dispatch').first()).n,1);
 }finally{await f.mf.dispose()}
});

test('daily registration failure rolls back the root job, head and durable outbox together',async()=>{
 const f=await fixture();try{
  await f.db.prepare("CREATE TRIGGER reject_daily_run BEFORE INSERT ON sites_daily_runs BEGIN SELECT RAISE(ABORT,'injected_daily_registration_failure'); END").run();
  await assert.rejects(enqueueDailyPipeline({...f,...args}),/injected_daily_registration_failure/);
  for(const table of ['sites_analysis_jobs','sites_analysis_heads','sites_analysis_dispatch','sites_research_cycle_jobs','sites_daily_runs','sites_daily_fences'])assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0,table);
  await f.db.prepare('DROP TRIGGER reject_daily_run').run();
  assert.ok((await enqueueDailyPipeline({...f,...args})).parent_id);
 }finally{await f.mf.dispose()}
});

test('simultaneous daily receptions share one root, run and outbox',async()=>{
 const f=await fixture();try{
  const rows=await Promise.all(Array.from({length:6},()=>enqueueDailyPipeline({...f,...args})));
  assert.equal(new Set(rows.map(r=>r.parent_id)).size,1);
  for(const table of ['sites_analysis_jobs','sites_analysis_heads','sites_analysis_dispatch','sites_research_cycle_jobs','sites_daily_runs'])assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,1,table);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM sites_daily_fences').first()).n,0);
 }finally{await f.mf.dispose()}
});

test('older reception on a second channel cannot regress the store-wide latest analysis',async()=>{
 const f=await fixture();try{
  const latest=await enqueueDailyPipeline({...f,...args,channelId:'first'});
  await assert.rejects(enqueueDailyPipeline({...f,...args,channelId:'second',targetDate:'2026-02-18'}),{code:'daily_frontier_changed'});
  assert.equal(await countJobs(f),1);
  assert.equal((await f.db.prepare("SELECT latest_job_id FROM sites_analysis_heads WHERE kind='store-analysis'").first()).latest_job_id,latest.parent_id);
 }finally{await f.mf.dispose()}
});

test('newer reception on another channel fences an in-flight older continuation',async()=>{
 const f=await fixture();try{
  const old=await enqueueDailyPipeline({...f,...args,channelId:'first'});await succeedParent(f,old);
  await advanceDailyPipelines({...f,enabled:true,onStage:async stage=>{
   if(stage==='daily:feature-accepted')await enqueueDailyPipeline({...f,...args,channelId:'second',targetDate:'2026-02-20'});
  }});
  assert.equal((await f.db.prepare('SELECT state FROM sites_daily_runs WHERE parent_id=?').bind(old.parent_id).first()).state,'superseded');
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM sites_analysis_jobs WHERE kind='formal-pre'").first()).n,0);
 }finally{await f.mf.dispose()}
});
