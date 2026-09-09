import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {enqueueJob,getJob} from '../src/queue.mjs';
import {loadResourcePolicy} from '../src/config.mjs';
import {Coordinator} from '../src/coordinator.mjs';
import {spawnJobChild} from '../src/child-runner.mjs';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-coord-'));
  const db=openDatabase(join(dir,'db.sqlite'));migrate(db);
  return {db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

function enqueue(db,key,{type='RESEARCH',priority=50,lease=200,sizeClass='small',payload={}}={}){
  return enqueueJob(db,{type,priority,idempotencyKey:key,payload,sizeClass,estimatedLeaseMiB:lease,maxAttempts:3,createdAtIso:'2026-09-09T00:00:00.000Z'});
}

function fakeSpawner(){
  const calls=[];const killOrder=[];
  const spawn=options=>{
    const call={...options};
    const handle={
      killed:false,
      kill(){this.killed=true;killOrder.push(options.job.id);options.onExit?.(143,'SIGTERM')}
    };
    call.handle=handle;calls.push(call);return handle;
  };
  return {spawn,calls,killOrder};
}

const normalSnapshot=(available=900)=>({
  hostTotalMiB:2048,hostAvailableMiB:available,cgroupLimitMiB:2048,cgroupCurrentMiB:2048-available,
  effectiveLimitMiB:2048,effectiveAvailableMiB:available,usedRatio:(2048-available)/2048,swapUsedMiB:0
});

test('coordinator fills spare RAM with multiple children but preserves hard reserve',async()=>{
  const f=fixture();
  try{
    enqueue(f.db,'a');enqueue(f.db,'b');enqueue(f.db,'c');
    const sp=fakeSpawner();
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>normalSnapshot(750),spawnChild:sp.spawn,owner:'test',clock:()=>new Date('2026-09-09T00:00:10.000Z')});
    const result=await coordinator.tick();
    assert.equal(sp.calls.length,2);
    assert.deepEqual(result.started.map(x=>x.leaseMiB),[200,200]);
    assert.equal(getJob(f.db,sp.calls[0].job.id).state,'running');
    assert.equal(getJob(f.db,sp.calls[1].job.id).state,'running');
  }finally{f.cleanup()}
});

test('daily work jumps ahead of queued research as soon as a slot is released',async()=>{
  const f=fixture();
  try{
    enqueue(f.db,'research',{type:'RESEARCH',priority:50,lease:200});
    const sp=fakeSpawner();
    const policy=loadResourcePolicy({maxAnalysisChildren:1});
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>normalSnapshot(1000),spawnChild:sp.spawn,owner:'test',policy,clock:()=>new Date('2026-09-09T00:00:10.000Z')});
    await coordinator.tick();
    assert.equal(sp.calls[0].job.type,'RESEARCH');
    enqueue(f.db,'daily',{type:'DAILY_ANALYSIS',priority:20,lease:200});
    await sp.calls[0].onMessage({type:'complete',peakRssMiB:180,resultHash:'r1'});
    assert.equal(sp.calls.length,2);
    assert.equal(sp.calls[1].job.type,'DAILY_ANALYSIS');
  }finally{f.cleanup()}
});

test('emergency pressure cancels research before backfill and preserves daily work',async()=>{
  const f=fixture();
  let snapshot=normalSnapshot(1600);
  try{
    enqueue(f.db,'research',{type:'RESEARCH',priority:50,lease:150});
    enqueue(f.db,'backfill',{type:'BACKFILL',priority:40,lease:150});
    enqueue(f.db,'daily',{type:'DAILY_ANALYSIS',priority:20,lease:150});
    const sp=fakeSpawner();
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>snapshot,spawnChild:sp.spawn,owner:'test',clock:()=>new Date('2026-09-09T00:00:10.000Z')});
    await coordinator.tick();
    assert.equal(sp.calls.length,3);
    snapshot={...normalSnapshot(200),usedRatio:.90,effectiveAvailableMiB:200};
    const result=await coordinator.tick();
    assert.deepEqual(sp.killOrder,[sp.calls.find(x=>x.job.type==='RESEARCH').job.id,sp.calls.find(x=>x.job.type==='BACKFILL').job.id]);
    assert.deepEqual(result.cancelled.map(x=>x.type),['RESEARCH','BACKFILL']);
    assert.equal(sp.calls.find(x=>x.job.type==='DAILY_ANALYSIS').handle.killed,false);
  }finally{f.cleanup()}
});

test('observed peak RSS is learned by job type and size class for future leases',async()=>{
  const f=fixture();
  try{
    enqueue(f.db,'first',{type:'RESEARCH',priority:50,lease:128,sizeClass:'small'});
    const sp=fakeSpawner();
    const policy=loadResourcePolicy({maxAnalysisChildren:1});
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>normalSnapshot(1200),spawnChild:sp.spawn,owner:'test',policy,clock:()=>new Date('2026-09-09T00:00:10.000Z')});
    await coordinator.tick();
    await sp.calls[0].onMessage({type:'complete',peakRssMiB:300,resultHash:'done'});
    enqueue(f.db,'second',{type:'RESEARCH',priority:50,lease:128,sizeClass:'small'});
    await coordinator.tick();
    const second=sp.calls.find(x=>x.job.id!==sp.calls[0].job.id);
    assert.ok(second);
    assert.equal(second.leaseMiB,375);
    const profile=f.db.prepare("SELECT ewma_peak_mib FROM memory_profiles WHERE job_type='RESEARCH' AND size_class='small'").get();
    assert.equal(profile.ewma_peak_mib,300);
  }finally{f.cleanup()}
});

test('child error raises learned lease, releases slot, and leaves durable retry state',async()=>{
  const f=fixture();
  try{
    const job=enqueue(f.db,'fail',{type:'BACKFILL',priority:40,lease:128,sizeClass:'medium'});
    const sp=fakeSpawner();
    const policy=loadResourcePolicy({maxAnalysisChildren:1});
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>normalSnapshot(1200),spawnChild:sp.spawn,owner:'test',policy,clock:()=>new Date('2026-09-09T00:00:10.000Z')});
    await coordinator.tick();
    await sp.calls[0].onMessage({type:'error',peakRssMiB:400,errorClass:'oom',message:'synthetic'});
    const stored=getJob(f.db,job.id);
    assert.equal(stored.state,'retry_wait');
    const profile=f.db.prepare("SELECT ewma_peak_mib FROM memory_profiles WHERE job_type='BACKFILL' AND size_class='medium'").get();
    assert.equal(profile.ewma_peak_mib,400);
    assert.equal(coordinator.runningCount,0);
  }finally{f.cleanup()}
});

test('real disposable synthetic child emits bounded completion protocol',async()=>{
  const workerPath=new URL('../src/jobs/synthetic.mjs',import.meta.url);
  const messages=[];
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('synthetic child timeout')),5000);
    spawnJobChild({
      job:{id:99,type:'RESEARCH',payload:{sleepMs:30,allocateMiB:2,resultSeed:'abc'}},
      leaseMiB:128,heapMiB:96,workerPath,
      onMessage:message=>{messages.push(message);if(message.type==='complete'){clearTimeout(timeout);resolve()}},
      onExit:(code)=>{if(code!==0&&messages.every(x=>x.type!=='complete')){clearTimeout(timeout);reject(new Error(`child exited ${code}`))}}
    });
  });
  const completed=messages.find(x=>x.type==='complete');
  assert.ok(completed);
  assert.equal(typeof completed.peakRssMiB,'number');
  assert.match(completed.resultHash,/^[a-f0-9]{64}$/);
});
