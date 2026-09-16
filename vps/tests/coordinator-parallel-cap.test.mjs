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

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-parallel-cap-'));
  const db=openDatabase(join(dir,'db.sqlite'));migrate(db);
  return {db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

function enqueue(db,key,{type='BACKTEST',priority=50,lease=200,sizeClass='large'}={}){
  return enqueueJob(db,{type,priority,idempotencyKey:key,payload:{storeId:key},sizeClass,estimatedLeaseMiB:lease,maxAttempts:3,createdAtIso:'2026-09-16T00:00:00.000Z'});
}

function fakeSpawner(){
  const calls=[];
  return {calls,spawn(options){calls.push(options);return {kill(){}}}};
}

function snapshot({limit=2048,used=300}={}){
  const available=limit-used;
  return {hostTotalMiB:limit,hostAvailableMiB:available,cgroupLimitMiB:limit,cgroupCurrentMiB:used,effectiveLimitMiB:limit,effectiveAvailableMiB:available,usedRatio:used/limit,swapUsedMiB:0};
}

test('default resource policy caps projected VPS use at 1700 MiB',()=>{
  assert.equal(loadResourcePolicy().maxProjectedUsedMiB,1700);
});

test('daily analysis and research can run together when projected RAM fits',async()=>{
  const f=fixture();
  try{
    const daily=enqueue(f.db,'daily',{type:'DAILY_ANALYSIS',priority:20,lease:200,sizeClass:'small'});
    const research=enqueue(f.db,'research',{type:'BACKTEST',priority:50,lease:200});
    const sp=fakeSpawner();
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>snapshot({used:300}),spawnChild:sp.spawn,owner:'test',clock:()=>new Date('2026-09-16T00:00:10.000Z')});
    const result=await coordinator.tick();
    assert.equal(sp.calls.length,2);
    assert.deepEqual(result.started.map(row=>row.type),['DAILY_ANALYSIS','BACKTEST']);
    assert.equal(getJob(f.db,daily.id).state,'running');
    assert.equal(getJob(f.db,research.id).state,'running');
  }finally{f.cleanup()}
});

test('multiple research children can run together when projected RAM fits',async()=>{
  const f=fixture();
  try{
    enqueue(f.db,'backtest',{type:'BACKTEST',priority:50,lease:250});
    enqueue(f.db,'model',{type:'MODEL_SEARCH',priority:60,lease:250});
    const sp=fakeSpawner();
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>snapshot({used:300}),spawnChild:sp.spawn,owner:'test',clock:()=>new Date('2026-09-16T00:00:10.000Z')});
    const result=await coordinator.tick();
    assert.equal(sp.calls.length,2);
    assert.deepEqual(result.started.map(row=>row.type),['BACKTEST','MODEL_SEARCH']);
  }finally{f.cleanup()}
});

test('scheduler stops admitting children before projected VPS use exceeds 1700 MiB',async()=>{
  const f=fixture();
  try{
    enqueue(f.db,'a',{type:'BACKTEST',priority:50,lease:300});
    enqueue(f.db,'b',{type:'BACKTEST',priority:51,lease:300});
    enqueue(f.db,'c',{type:'BACKTEST',priority:52,lease:300});
    const sp=fakeSpawner();
    const policy=loadResourcePolicy({hardReserveMiB:100,emergencyReserveMiB:50});
    const coordinator=new Coordinator({db:f.db,memoryReader:async()=>snapshot({used:1000}),spawnChild:sp.spawn,owner:'test',policy,maxResearchChildren:3,clock:()=>new Date('2026-09-16T00:00:10.000Z')});
    const result=await coordinator.tick();
    assert.equal(sp.calls.length,2);
    assert.deepEqual(result.started.map(row=>row.leaseMiB),[300,300]);
    assert.equal(getJob(f.db,3).state,'queued');
  }finally{f.cleanup()}
});
