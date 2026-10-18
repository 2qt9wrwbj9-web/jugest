import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAllocationService,principalFamilySize} from '../src/allocation/service.mjs';
import {captureAllocationLikelihoods} from '../src/allocation/likelihoods.mjs';
import '../../store-day-allocation.js';
const rootDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function snapshot(hash='input-a'){
  return {ok:true,store:{id:'s',name:'店舗',source_metadata_json:'private'},date:'2026-10-16',snapshot:{inputHash:hash,rosterHash:'roster-a',rawArtifactPath:'/secret/raw',parserVersion:'v1'},roster:{status:'verified',nInstalled:6},quality:{reasons:[]},unsupported:[{machineName:'未対応',tableNo:'7'}],groups:[
    {machine:'my',machineName:'マイ',nInstalled:2,nObserved:2,eligible:true,reasons:[],rows:[1,2].map(n=>({id:String(n),tableNo:String(n),machine:'my',eligible:true,input:{games:5000,bb:20,rb:20,diff:null},provenance:{rawPath:'/secret/raw'}}))},
    {machine:'my6',machineName:'マイ6',nInstalled:3,nObserved:2,eligible:false,reasons:['missing_rows'],rows:[]},
    {machine:'im',machineName:'アイム',nInstalled:1,nObserved:1,eligible:true,reasons:[],rows:[{id:'6',tableNo:'6',machine:'im',eligible:true,input:{games:0,bb:0,rb:0,diff:0}}]}
  ]};
}
const fakeCalculate=async({groups,familySize,detail})=>groups.map(group=>({machine:group.machine,result:{ok:true,version:'test',n:group.rows.length,bands:[],familySize,detail:detail?.machine===group.machine?detail:null,strongEnabled:false},rows:group.rows.map(r=>({...r,individual:null}))}));
test('principal declarations reserve the full store before exclusions and deduplicate equal counts',()=>{
  assert.equal(principalFamilySize(snapshot().groups),18);
  assert.equal(principalFamilySize([{nInstalled:null,nObserved:1}]),9);
});
test('service keeps held groups, exact store/day and fixed scope under detail; caches only same hashes',async()=>{
  let version='a',calls=0;
  const service=createAllocationService({rootDir,loadSnapshot:async args=>{assert.equal(args.storeId,'s');assert.equal(args.date,'2026-10-16');return snapshot(version)},calculate:async args=>{calls++;return fakeCalculate(args)}});
  const args={storeId:'s',date:'2026-10-16'};
  const report=await service.analyzeStoreDay(args);
  assert.equal(report.familySize,18);assert.equal(report.groups.length,3);assert.equal(report.groups[1].result,null);
  assert.equal(report.strongEnabled,false);assert.equal(report.groups[1].eligible,false);
  assert.ok(!JSON.stringify(report).includes('/secret'));assert.ok(!JSON.stringify(report).includes('source_metadata_json'));
  report.groups[0].machineName='tamper';
  assert.notEqual((await service.analyzeStoreDay(args)).groups[0].machineName,'tamper');assert.equal(calls,1);
  const detailed=await service.analyzeStoreDay({...args,detail:{machine:'my',band:'456',kind:'exact',count:1}});
  assert.equal(detailed.familySize,18);assert.equal(detailed.groups.length,3);assert.equal(detailed.groups[0].result.detail.kind,'exact');
  version='b';assert.equal((await service.analyzeStoreDay(args)).snapshot.inputHash,'b');assert.equal(calls,3);
  service.close();
});
test('missing exact day is returned as unavailable; invalid counts never reach the calculator',async()=>{
  let calls=0;
  const missing=createAllocationService({rootDir,loadSnapshot:async()=>({ok:false,code:'day_not_found'}),calculate:async()=>{calls++}});
  assert.equal((await missing.analyzeStoreDay({storeId:'s',date:'2026-10-16'})).code,'day_not_found');assert.equal(calls,0);missing.close();
  const service=createAllocationService({rootDir,loadSnapshot:async()=>snapshot(),calculate:async()=>{calls++;return []}});
  await assert.rejects(service.analyzeStoreDay({storeId:'s',date:'2026-10-16',detail:{machine:'my',band:'456',kind:'exact',count:3}}),/bad_count/);
  await assert.rejects(service.analyzeStoreDay({storeId:'s',date:'2026-02-30'}),/bad_date/);service.close();
});
test('real worker returns all bands and preserves a real zero without touching a DB',async()=>{
  const sample=snapshot();sample.groups=[sample.groups[0],sample.groups[2]];
  const service=createAllocationService({rootDir,loadSnapshot:async()=>sample});
  try{
    const r=await service.analyzeStoreDay({storeId:'s',date:'2026-10-16',detail:{machine:'my',band:'456',kind:'exact',count:1}});
    assert.equal(r.groups[0].result.bands.length,3);assert.equal(r.groups[0].rows[0].individual.ok,true);
    assert.ok(r.groups[1].result.bands[0].distribution.every(p=>Math.abs(p-.5)<1e-12));
    assert.equal(r.groups[1].rows[0].individual,null);
    assert.equal(r.groups[0].result.detail.kind,'exact');
  }finally{service.close()}
});
test('read-only principals reuse current saved results but cannot start missing calculations',async()=>{
  let calls=0,version='a';
  const service=createAllocationService({rootDir,loadSnapshot:async()=>snapshot(version),calculate:async args=>{calls++;return fakeCalculate(args)}});
  const args={storeId:'s',date:'2026-10-16'};
  try{
    assert.equal((await service.analyzeStoreDay({...args,allowCompute:false})).code,'allocation_result_not_ready');assert.equal(calls,0);
    await service.analyzeStoreDay(args);
    assert.equal((await service.analyzeStoreDay({...args,allowCompute:false})).ok,true);assert.equal(calls,1);
    assert.equal((await service.analyzeStoreDay({...args,allowCompute:false,detail:{machine:'my',band:'456',kind:'exact',count:1}})).code,'allocation_result_not_ready');assert.equal(calls,1);
    version='b';assert.equal((await service.analyzeStoreDay({...args,allowCompute:false})).code,'allocation_result_not_ready');assert.equal(calls,1);
  }finally{service.close()}
});
test('concurrent admission is bounded before raw reads and cancellation prevents calculation',async()=>{
  let release,loads=0,calls=0;
  const pending=new Promise(resolve=>{release=resolve});
  const service=createAllocationService({rootDir,maxRequests:1,loadSnapshot:async()=>{loads++;await pending;return snapshot()},calculate:async args=>{calls++;return fakeCalculate(args)}});
  const controller=new AbortController(),args={storeId:'s',date:'2026-10-16'};
  try{
    const first=service.analyzeStoreDay({...args,signal:controller.signal});
    await assert.rejects(service.analyzeStoreDay(args),error=>error.code==='allocation_busy');assert.equal(loads,1);
    controller.abort();release();await assert.rejects(first,error=>error.code==='allocation_aborted');assert.equal(calls,0);
  }finally{release();service.close()}
});
test('result cache failure is separate from a successful computation',async()=>{
  const broken={get(){throw new Error('unavailable')},set(){throw new Error('disk full')}};
  const service=createAllocationService({rootDir,loadSnapshot:async()=>snapshot(),calculate:fakeCalculate,resultStore:broken});
  try{const r=await service.analyzeStoreDay({storeId:'s',date:'2026-10-16'});assert.equal(r.ok,true);assert.equal(r.cacheWarning,'result_cache_unavailable')}finally{service.close()}
});
test('existing difference allocation is a separate approximate reference with no e-value declaration',async()=>{
  const sample=snapshot();sample.groups=[sample.groups[0]];
  sample.groups[0].rows[0].input.diff=1500;sample.groups[0].rows[1].input.diff=-1000;sample.groups[0].diffN=2;
  const captured=await captureAllocationLikelihoods({rootDir,rows:sample.groups[0].rows});
  const expected=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows:captured.rows.map(({bonusLogs,...row})=>row),familySize:6,detail:{band:'456',kind:'exact',count:1}});
  const bonus=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows:captured.rows,familySize:6});
  const service=createAllocationService({rootDir,loadSnapshot:async()=>sample});
  try{
    const r=await service.analyzeStoreDay({storeId:'s',date:'2026-10-16',detail:{machine:'my',band:'456',kind:'exact',count:1}}),g=r.groups[0];
    assert.deepEqual(g.result.bands[0].distribution,bonus.bands[0].distribution);
    const ref=g.differenceReference;assert.equal(ref.available,true);assert.equal(ref.reverseDiffN,2);assert.equal(ref.approximate,true);
    assert.deepEqual(ref.result.bands[0].distribution,expected.bands[0].distribution);
    assert.notDeepEqual(ref.result.bands[0].distribution,g.result.bands[0].distribution);
    for(const band of ref.result.bands)for(const event of band.events){assert.equal(event.logEValue,null);assert.equal(event.logNullMaximum,null);assert.equal(event.modelPass,false);assert.equal(event.strongEnabled,false);assert.equal(event.eRegistered,false)}
    assert.equal(ref.result.detail.logEValue,null);assert.deepEqual(ref.result.detail.rows[0].conditionalQ,expected.detail.rows[0].conditionalQ);
  }finally{service.close()}
});
test('a failed group is held explicitly while other complete groups remain available',async()=>{
  const sample=snapshot();sample.groups=[sample.groups[0],{...sample.groups[2],rows:[{...sample.groups[2].rows[0],machine:'unknown'}]}];
  const service=createAllocationService({rootDir,loadSnapshot:async()=>sample});
  try{
    const r=await service.analyzeStoreDay({storeId:'s',date:'2026-10-16'});
    assert.equal(r.ok,true);assert.equal(r.groups[0].result.ok,true);
    assert.equal(r.groups[1].eligible,false);assert.equal(r.groups[1].result,null);
    assert.ok(r.groups[1].reasons.includes('calculation_failed'));assert.equal(r.quality.status,'partial');assert.equal(r.completed,false);
  }finally{service.close()}
});
test('owner retries transient calculation failures while saved readers retain the partial report',async()=>{
  let calls=0;
  const service=createAllocationService({rootDir,loadSnapshot:async()=>snapshot(),calculate:async args=>{
    calls++;
    const results=await fakeCalculate(args);
    return calls===1?results.map((item,index)=>index===0?{machine:item.machine,errorCode:'calculation_failed',result:null,rows:[]}:item):results;
  }});
  const args={storeId:'s',date:'2026-10-16'};
  try{
    const first=await service.analyzeStoreDay(args);
    assert.equal(first.groups[0].result,null);assert.ok(first.groups[0].reasons.includes('calculation_failed'));
    const saved=await service.analyzeStoreDay({...args,allowCompute:false});
    assert.equal(saved.groups[0].result,null);assert.equal(calls,1);
    const retried=await service.analyzeStoreDay(args);
    assert.equal(calls,2);assert.equal(retried.groups[0].result?.ok,true);
    assert.ok(!retried.groups[0].reasons.includes('calculation_failed'));
    const recovered=await service.analyzeStoreDay({...args,allowCompute:false});
    assert.equal(recovered.groups[0].result?.ok,true);assert.equal(calls,2);
  }finally{service.close()}
});
