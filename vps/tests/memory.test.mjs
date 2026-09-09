import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RESOURCE_POLICY,loadResourcePolicy} from '../src/config.mjs';
import {parseMemInfo,parseCgroupLimit,readMemorySnapshot,classifyPressure} from '../src/memory.mjs';

test('resource policy defaults match the frozen 2 GiB design',()=>{
  assert.deepEqual(DEFAULT_RESOURCE_POLICY,{
    hardReserveMiB:320,
    emergencyReserveMiB:220,
    cautionUsedRatio:0.70,
    pauseUsedRatio:0.82,
    emergencyUsedRatio:0.88,
    maxAnalysisChildren:3,
    sampleIntervalMs:2000,
    emergencyCooldownMs:10000
  });
  assert.equal(Object.isFrozen(DEFAULT_RESOURCE_POLICY),true);
});

test('resource policy validates monotonic pressure bands and reserves',()=>{
  assert.throws(()=>loadResourcePolicy({cautionUsedRatio:.9,pauseUsedRatio:.8}),/pressure/i);
  assert.throws(()=>loadResourcePolicy({hardReserveMiB:200,emergencyReserveMiB:300}),/reserve/i);
  assert.throws(()=>loadResourcePolicy({maxAnalysisChildren:0}),/maxAnalysisChildren/);
  assert.throws(()=>loadResourcePolicy({emergencyCooldownMs:1000}),/emergencyCooldownMs/);
});

test('parseMemInfo converts kernel kB values to MiB',()=>{
  const parsed=parseMemInfo('MemTotal: 2097152 kB\nMemAvailable: 1048576 kB\nSwapTotal: 524288 kB\nSwapFree: 393216 kB\n');
  assert.deepEqual(parsed,{memTotalMiB:2048,memAvailableMiB:1024,swapTotalMiB:512,swapFreeMiB:384,swapUsedMiB:128});
});

test('parseCgroupLimit handles finite bytes and max',()=>{
  assert.equal(parseCgroupLimit('2147483648\n'),2048);
  assert.equal(parseCgroupLimit('max\n'),null);
  assert.throws(()=>parseCgroupLimit('wat'),/cgroup/i);
});

test('effective memory honors the tighter cgroup remainder',async()=>{
  const files=new Map([
    ['/sys/fs/cgroup/memory.current','629145600\n'],
    ['/sys/fs/cgroup/memory.max','2147483648\n'],
    ['/proc/meminfo','MemTotal: 4096000 kB\nMemAvailable: 3072000 kB\nSwapTotal: 1048576 kB\nSwapFree: 1048576 kB\n']
  ]);
  const snapshot=await readMemorySnapshot({readFile:async path=>files.get(path)});
  assert.equal(snapshot.cgroupLimitMiB,2048);
  assert.equal(snapshot.cgroupCurrentMiB,600);
  assert.equal(snapshot.effectiveLimitMiB,2048);
  assert.equal(snapshot.effectiveAvailableMiB,1448);
  assert.equal(snapshot.swapUsedMiB,0);
  assert.ok(Math.abs(snapshot.usedRatio-(600/2048))<1e-12);
});

test('unbounded cgroup falls back to host memory',async()=>{
  const files=new Map([
    ['/sys/fs/cgroup/memory.current','104857600\n'],
    ['/sys/fs/cgroup/memory.max','max\n'],
    ['/proc/meminfo','MemTotal: 2097152 kB\nMemAvailable: 1572864 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n']
  ]);
  const snapshot=await readMemorySnapshot({readFile:async path=>files.get(path)});
  assert.equal(snapshot.cgroupLimitMiB,null);
  assert.equal(snapshot.effectiveLimitMiB,2048);
  assert.equal(snapshot.effectiveAvailableMiB,1536);
  assert.equal(snapshot.usedRatio,.25);
});

test('memory reader tolerates absent cgroup files',async()=>{
  const readFile=async path=>{
    if(path==='/proc/meminfo')return 'MemTotal: 2097152 kB\nMemAvailable: 1048576 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n';
    const error=new Error('missing');error.code='ENOENT';throw error;
  };
  const snapshot=await readMemorySnapshot({readFile});
  assert.equal(snapshot.cgroupLimitMiB,null);
  assert.equal(snapshot.cgroupCurrentMiB,null);
  assert.equal(snapshot.effectiveAvailableMiB,1024);
  assert.equal(snapshot.usedRatio,.5);
});

test('pressure bands pause and emergency correctly',()=>{
  assert.equal(classifyPressure({usedRatio:.69,effectiveAvailableMiB:500},DEFAULT_RESOURCE_POLICY),'NORMAL');
  assert.equal(classifyPressure({usedRatio:.81,effectiveAvailableMiB:500},DEFAULT_RESOURCE_POLICY),'CAUTION');
  assert.equal(classifyPressure({usedRatio:.83,effectiveAvailableMiB:500},DEFAULT_RESOURCE_POLICY),'PAUSE');
  assert.equal(classifyPressure({usedRatio:.89,effectiveAvailableMiB:500},DEFAULT_RESOURCE_POLICY),'EMERGENCY');
  assert.equal(classifyPressure({usedRatio:.50,effectiveAvailableMiB:219},DEFAULT_RESOURCE_POLICY),'EMERGENCY');
});