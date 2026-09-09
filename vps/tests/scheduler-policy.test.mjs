import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RESOURCE_POLICY} from '../src/config.mjs';
import {estimateLeaseMiB,deriveHeapLimitMiB,canAdmit,updateEwmaPeakMiB,selectEmergencyVictims} from '../src/scheduler-policy.mjs';

test('lease estimate uses 25 percent safety margin and floor',()=>{
  assert.equal(estimateLeaseMiB({persistedEwmaMiB:200,configuredFloorMiB:128}),250);
  assert.equal(estimateLeaseMiB({persistedEwmaMiB:80,configuredFloorMiB:128}),128);
  assert.equal(estimateLeaseMiB({persistedEwmaMiB:null,configuredFloorMiB:160}),160);
});

test('heap limit leaves native headroom and clamps safely',()=>{
  assert.equal(deriveHeapLimitMiB(400),260);
  assert.equal(deriveHeapLimitMiB(100),96);
  assert.equal(deriveHeapLimitMiB(2000),768);
});

test('admission protects hard reserve before starting another child',()=>{
  assert.deepEqual(canAdmit({snapshot:{usedRatio:.60,effectiveAvailableMiB:700},policy:DEFAULT_RESOURCE_POLICY,runningCount:1,leaseMiB:400,priority:20}),{admit:false,reason:'hard_reserve',pressure:'NORMAL'});
  assert.deepEqual(canAdmit({snapshot:{usedRatio:.60,effectiveAvailableMiB:900},policy:DEFAULT_RESOURCE_POLICY,runningCount:1,leaseMiB:400,priority:20}),{admit:true,reason:'fits',pressure:'NORMAL'});
});

test('pause and emergency bands stop admission regardless of apparent fit',()=>{
  assert.equal(canAdmit({snapshot:{usedRatio:.83,effectiveAvailableMiB:900},policy:DEFAULT_RESOURCE_POLICY,runningCount:0,leaseMiB:100,priority:20}).reason,'pressure_pause');
  assert.equal(canAdmit({snapshot:{usedRatio:.89,effectiveAvailableMiB:900},policy:DEFAULT_RESOURCE_POLICY,runningCount:0,leaseMiB:100,priority:20}).reason,'emergency_pressure');
  assert.equal(canAdmit({snapshot:{usedRatio:.50,effectiveAvailableMiB:219},policy:DEFAULT_RESOURCE_POLICY,runningCount:0,leaseMiB:50,priority:20}).reason,'emergency_pressure');
});

test('caution still fills unused RAM when lease clearly preserves reserve',()=>{
  const yes=canAdmit({snapshot:{usedRatio:.75,effectiveAvailableMiB:800},policy:DEFAULT_RESOURCE_POLICY,runningCount:1,leaseMiB:400,priority:50});
  assert.deepEqual(yes,{admit:true,reason:'fits_caution',pressure:'CAUTION'});
});

test('maximum child count is a hard ceiling',()=>{
  const result=canAdmit({snapshot:{usedRatio:.20,effectiveAvailableMiB:1500},policy:DEFAULT_RESOURCE_POLICY,runningCount:3,leaseMiB:100,priority:20});
  assert.deepEqual(result,{admit:false,reason:'max_children',pressure:'NORMAL'});
});

test('EWMA peak update is deterministic',()=>{
  assert.equal(updateEwmaPeakMiB(null,300),300);
  assert.equal(updateEwmaPeakMiB(300,500),360);
  assert.equal(updateEwmaPeakMiB(360,300),342);
});

test('emergency victims choose research before backfill and never daily work',()=>{
  const children=[
    {id:1,type:'BACKFILL',startedAt:'b'},
    {id:2,type:'DAILY_ANALYSIS',startedAt:'a'},
    {id:3,type:'RESEARCH',startedAt:'c'},
    {id:4,type:'RESEARCH',startedAt:'d'}
  ];
  assert.deepEqual(selectEmergencyVictims(children).map(x=>x.id),[3,4,1]);
});
