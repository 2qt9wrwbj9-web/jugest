import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {enqueueJob,getJob} from '../src/queue.mjs';
import {Coordinator} from '../src/coordinator.mjs';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-daily-cap-'));
  const db=openDatabase(join(dir,'db.sqlite'));migrate(db);
  return {db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}
function daily(db,key){return enqueueJob(db,{type:'DAILY_ANALYSIS',priority:20,idempotencyKey:key,payload:{},sizeClass:'medium',estimatedLeaseMiB:200,maxAttempts:3,createdAtIso:'2026-09-11T00:00:00.000Z'})}
const memory=async()=>({hostTotalMiB:2048,hostAvailableMiB:1600,cgroupLimitMiB:2048,cgroupCurrentMiB:448,effectiveLimitMiB:2048,effectiveAvailableMiB:1600,usedRatio:448/2048,swapUsedMiB:0});

test('coordinator starts at most one DAILY_ANALYSIS child even when memory and global child slots allow more',async()=>{
  const f=fixture();
  try{
    const a=daily(f.db,'daily-a'),b=daily(f.db,'daily-b');
    const calls=[];
    const coordinator=new Coordinator({
      db:f.db,
      memoryReader:memory,
      owner:'daily-cap',
      clock:()=>new Date('2026-09-11T00:01:00.000Z'),
      spawnChild:options=>{calls.push(options);return {kill(){}}}
    });
    const result=await coordinator.tick();
    assert.equal(calls.length,1);
    assert.equal(result.started.length,1);
    assert.equal(getJob(f.db,a.id).state,'running');
    assert.equal(getJob(f.db,b.id).state,'queued');
  }finally{f.cleanup()}
});
