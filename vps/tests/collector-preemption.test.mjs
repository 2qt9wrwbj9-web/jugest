import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EventEmitter,once} from 'node:events';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {enqueueJob,getJob} from '../src/queue.mjs';
import {loadResourcePolicy} from '../src/config.mjs';
import {CollectorAwareCoordinator} from '../src/collector-aware-coordinator.mjs';
import {createWebServer} from '../src/web-server.mjs';

function dbFixture(){
  const dir=mkdtempSync(path.join(tmpdir(),'jugest-collector-preempt-'));
  const dbPath=path.join(dir,'jugest.sqlite');
  const db=openDatabase(dbPath);migrate(db);
  return {dir,dbPath,db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}
function snapshot(){return {hostTotalMiB:2048,hostAvailableMiB:1400,cgroupLimitMiB:2048,cgroupCurrentMiB:648,effectiveLimitMiB:2048,effectiveAvailableMiB:1400,usedRatio:.32,swapUsedMiB:0}}
function fakeSpawner(){
  const calls=[];const killed=[];
  const spawn=options=>{
    const handle={killed:false,kill(){this.killed=true;killed.push(options.job.id);options.onExit?.(143,'SIGTERM')}};
    calls.push({...options,handle});return handle;
  };
  return {spawn,calls,killed};
}
function deferredSpawner(){
  const calls=[];const killed=[];
  const spawn=options=>{
    const handle=new EventEmitter();
    handle.killed=false;handle.exitCode=null;handle.signalCode=null;
    handle.kill=(signal='SIGTERM')=>{handle.killed=true;killed.push({id:options.job.id,signal});return true};
    handle.finish=(code=143,signal='SIGTERM')=>{handle.exitCode=code;handle.signalCode=signal;handle.emit('exit',code,signal);options.onExit?.(code,signal)};
    calls.push({...options,handle});return handle;
  };
  return {spawn,calls,killed};
}

test('recent Collector activity preempts running historical research and blocks restart',async()=>{
  const f=dbFixture();
  let collectorActive=false;
  try{
    const job=enqueueJob(f.db,{type:'HISTORICAL_COMPARE',priority:80,idempotencyKey:'hist-1',payload:{storeId:'s1',runId:1,targetDate:'2026-09-01'},sizeClass:'large',estimatedLeaseMiB:256,maxAttempts:3,createdAtIso:'2026-09-14T00:00:00.000Z'});
    const sp=fakeSpawner();
    const policy=loadResourcePolicy({maxAnalysisChildren:1});
    const coordinator=new CollectorAwareCoordinator({db:f.db,memoryReader:async()=>snapshot(),spawnChild:sp.spawn,owner:'test',policy,clock:()=>new Date('2026-09-14T00:00:10.000Z'),collectorActivityReader:()=>collectorActive});
    await coordinator.tick();
    assert.equal(sp.calls.length,1);
    assert.equal(getJob(f.db,job.id).state,'running');

    collectorActive=true;
    const during=await coordinator.tick();
    assert.deepEqual(sp.killed,[job.id]);
    assert.equal(getJob(f.db,job.id).state,'retry_wait');
    assert.equal(getJob(f.db,job.id).lastErrorClass,'collector_activity');
    assert.equal(during.started.length,0);

    await coordinator.tick();
    assert.equal(sp.calls.length,1,'research must stay paused while Collector is active');
  }finally{f.cleanup()}
});

test('explicit Collector barrier waits for research exit and blocks a queued research admission immediately',async()=>{
  const f=dbFixture();
  try{
    const first=enqueueJob(f.db,{type:'HISTORICAL_COMPARE',priority:80,idempotencyKey:'hist-barrier-1',payload:{storeId:'s1',runId:1,targetDate:'2026-09-01'},sizeClass:'large',estimatedLeaseMiB:256,maxAttempts:3,createdAtIso:'2026-09-14T00:00:00.000Z'});
    enqueueJob(f.db,{type:'SHADOW_PREDICT',priority:81,idempotencyKey:'shadow-barrier-2',payload:{storeId:'s1'},sizeClass:'large',estimatedLeaseMiB:256,maxAttempts:3,createdAtIso:'2026-09-14T00:00:01.000Z'});
    const sp=deferredSpawner();
    const coordinator=new CollectorAwareCoordinator({db:f.db,memoryReader:async()=>snapshot(),spawnChild:sp.spawn,owner:'barrier-test',policy:loadResourcePolicy({maxAnalysisChildren:1}),clock:()=>new Date('2026-09-14T00:00:10.000Z'),collectorActivityReader:()=>false});
    await coordinator.tick();
    assert.equal(sp.calls.length,1);
    assert.equal(getJob(f.db,first.id).state,'running');
    const failuresBefore=getJob(f.db,first.id).failureCount;

    let resolved=false;
    const barrier=coordinator.enterCollectorBarrier().then(value=>{resolved=true;return value});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(sp.killed.length,1,'barrier must signal the running research child immediately');
    assert.equal(getJob(f.db,first.id).state,'retry_wait','preempted research must be durable before the ACK');
    assert.equal(getJob(f.db,first.id).failureCount,failuresBefore,'Collector preemption must not burn failure budget');
    assert.equal(resolved,false,'barrier must not ACK until the research child actually exits');

    const tick=coordinator.tick();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(sp.calls.length,1,'a concurrent scheduler tick must not admit queued research while barrier is active');

    sp.calls[0].handle.finish();
    const [result,during]=await Promise.all([barrier,tick]);
    assert.equal(result.collectorActive,true);
    assert.equal(during.collectorActive,true);
    assert.equal(resolved,true);
  }finally{f.cleanup()}
});

test('explicit Collector barrier does not preempt DAILY_ANALYSIS',async()=>{
  const f=dbFixture();
  try{
    const daily=enqueueJob(f.db,{type:'DAILY_ANALYSIS',priority:1,idempotencyKey:'daily-barrier',payload:{storeId:'s1'},sizeClass:'large',estimatedLeaseMiB:256,maxAttempts:3,createdAtIso:'2026-09-14T00:00:00.000Z'});
    const sp=deferredSpawner();
    const coordinator=new CollectorAwareCoordinator({db:f.db,memoryReader:async()=>snapshot(),spawnChild:sp.spawn,owner:'daily-test',policy:loadResourcePolicy({maxAnalysisChildren:1}),clock:()=>new Date('2026-09-14T00:00:10.000Z'),collectorActivityReader:()=>false});
    await coordinator.tick();
    const result=await coordinator.enterCollectorBarrier();
    assert.equal(getJob(f.db,daily.id).state,'running');
    assert.deepEqual(sp.killed,[]);
    assert.deepEqual(result.cancelled,[]);
  }finally{f.cleanup()}
});

function yesterdayJst(){const d=new Date(Date.now()+9*60*60*1000);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function slashDate(date){const [y,m,d]=date.split('-');return `${y}/${+m}/${+d}`}
const tableText=`\n全データ一覧\n機種名\n台番号\nG数\n差枚\nBB\nRB\nART\n合成確率\nBB確率\nRB確率\nART確率\nマイジャグラーV\n601\n2,727\n-94\n11\n7\n0\n1/151.5\n1/247.9\n1/389.6\n1/0.0\n機種別データピックアップ\n`;
async function call(base,body){const response=await fetch(`${base}/api/relay`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});let json=null;try{json=await response.json()}catch{}return {status:response.status,json}}
async function waitUntil(predicate,{timeoutMs=1000}={}){const started=Date.now();while(Date.now()-started<timeoutMs){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}throw new Error('condition timeout')}

test('PushV2 records recent Collector activity before background research can compete',async t=>{
  const root=mkdtempSync(path.join(tmpdir(),'jugest-collector-marker-'));
  writeFileSync(path.join(root,'index.html'),'<!doctype html><title>fixture</title>');
  const relayDbPath=path.join(root,'relay.sqlite'),canonicalDbPath=path.join(root,'jugest.sqlite'),rawRoot=path.join(root,'raw');
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${server.address().port}`,date=yesterdayJst(),shop='通常店';
  const created=await call(base,{action:'createIosCollector'});assert.equal(created.status,200);
  const target=await call(base,{action:'iosCollectorTargetUpsert',channelId:created.json.channelId,receiverToken:created.json.receiverToken,url:`https://ana-slo.com/${date}-%E9%80%9A%E5%B8%B8%E5%BA%97-data/`,startDate:date,priority:2,enabled:true});assert.equal(target.json.ok,true);
  const next=await call(base,{action:'iosCollectorNextV2',collectorKey:created.json.collectorKey});assert.equal(next.json.state,'RUN');
  const pushed=await call(base,{action:'iosCollectorPushV2',collectorKey:created.json.collectorKey,jobToken:next.json.jobToken,text:`${slashDate(date)}\n${shop}\n${tableText}`,fetchUrl:next.json.url});assert.equal(pushed.status,200);

  const marker=`${canonicalDbPath}.collector-activity`;
  assert.equal(existsSync(marker),true,'Push must touch the cross-process Collector activity marker');
  const until=Number(readFileSync(marker,'utf8').trim());
  assert.ok(Number.isFinite(until)&&until>Date.now(),'Collector marker must remain active briefly after Push begins');
});

test('PushV2 awaits the synchronous Collector barrier after writing the activity marker',async t=>{
  const root=mkdtempSync(path.join(tmpdir(),'jugest-collector-barrier-'));
  writeFileSync(path.join(root,'index.html'),'<!doctype html><title>fixture</title>');
  const relayDbPath=path.join(root,'relay.sqlite'),canonicalDbPath=path.join(root,'jugest.sqlite'),rawRoot=path.join(root,'raw');
  let barrierEntered=false,releaseBarrier;
  const barrierPromise=new Promise(resolve=>{releaseBarrier=resolve});
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot,enterCollectorBarrier:async()=>{barrierEntered=true;await barrierPromise;return {ok:true}}});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(root,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${server.address().port}`,date=yesterdayJst(),shop='通常店';
  const created=await call(base,{action:'createIosCollector'});
  await call(base,{action:'iosCollectorTargetUpsert',channelId:created.json.channelId,receiverToken:created.json.receiverToken,url:`https://ana-slo.com/${date}-%E9%80%9A%E5%B8%B8%E5%BA%97-data/`,startDate:date,priority:2,enabled:true});
  const next=await call(base,{action:'iosCollectorNextV2',collectorKey:created.json.collectorKey});
  let pushSettled=false;
  const push=call(base,{action:'iosCollectorPushV2',collectorKey:created.json.collectorKey,jobToken:next.json.jobToken,text:`${slashDate(date)}\n${shop}\n${tableText}`,fetchUrl:next.json.url}).then(value=>{pushSettled=true;return value});
  await waitUntil(()=>barrierEntered);
  assert.equal(existsSync(`${canonicalDbPath}.collector-activity`),true,'activity marker must be durable before barrier entry');
  assert.equal(pushSettled,false,'Push must not continue to Relay/canonical acknowledgement before barrier release');
  releaseBarrier();
  const result=await push;
  assert.equal(result.status,200);
});
