import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as relay from '../api/_relay-web.js';
import {instrumentedBlob,samplePage} from './helpers/collector-blob.mjs';

const digest=x=>createHash('sha256').update(x).digest('hex');
const dateOf=j=>j.date||j.url.match(/\/(20\d{2}-\d{2}-\d{2})-/)[1];
async function fixture(t,{shops=1,legacy=false}={}){
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-07T00:00:00Z')});
  const blob=instrumentedBlob();
  assert.equal(typeof relay.createRelayRuntime,'function','production runtime factory must expose the real V3 route for tests');
  const runtime=relay.createRelayRuntime({createStore:()=>blob.s,batch:!legacy});
  const call=async body=>{const r=await runtime.default(new Request('https://preview.invalid/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return{status:r.status,...await r.json()}};
  const creds=await call({action:'createIosCollector'});assert.equal(creds.status,200);
  const receiver={channelId:creds.channelId,receiverToken:creds.receiverToken};
  const sender={collectorKey:creds.collectorKey};const stores=[];
  for(let i=0;i<shops;i++){
    const x=await call({action:'iosCollectorTargetUpsert',...receiver,url:`https://ana-slo.com/2026-09-06-batch-store-${i}-data/`,shop:`batch store ${i}`,startDate:'2026-09-06',priority:i?1:3});
    assert.equal(x.status,200,JSON.stringify(x));stores.push(x.store);
  }
  const next=()=>call({action:'iosCollectorNextBatchV3',...sender});
  const push=(batch,results)=>call({action:'iosCollectorPushBatchV3',...sender,batchId:batch.batchId,results});
  const good=j=>({jobToken:j.jobToken,text:samplePage(dateOf(j),j.shop),fetchUrl:j.url});
  return{blob,call,creds,receiver,sender,stores,next,push,good,advance:(ms=900001)=>t.mock.timers.tick(ms)};
}

test('conditional Blob writes reject a stale ETag without losing newer data',async()=>{
  const b=instrumentedBlob();await b.s.setJSON('cas',{n:1});
  assert.equal(typeof b.s.getWithMetadata,'function');
  const a=await b.s.getWithMetadata('cas');await b.s.setJSON('cas',{n:2},{ifMatch:a.etag});
  await assert.rejects(b.s.setJSON('cas',{n:3},{ifMatch:a.etag}),e=>e.status===412);
  assert.deepEqual(await b.s.get('cas',{type:'json'}),{n:2});
});

test('issues five, saves five, pulls exact parsed days; steady-state operation budget',async t=>{
  const f=await fixture(t);f.blob.reset();const b=await f.next();
  assert.equal(b.state,'RUN');assert.equal(b.jobs.length,5);assert.equal(b.betweenJobsSeconds,2);
  assert.equal(new Set(b.jobs.map(j=>`${j.sourceStoreId}/${j.date}`)).size,5);
  const p=await f.push(b,b.jobs.map(f.good));assert.equal(p.saved,5);assert.equal(p.failed,0);
  const counts=f.blob.counts();assert.deepEqual(counts,{get:2,put:3,list:0,delete:0,advanced:3});
  const pull=await f.call({action:'collectorPull',...f.receiver,sinceRevision:0});
  assert.equal(pull.items.length,5);assert.equal(pull.nextRevision,5);
  assert.equal(pull.items[0].day.machines[0].games,2727);assert.equal(pull.items[0].day.machines[0].rb,7);
  console.log('BATCH_V3_OPERATION_COUNT',JSON.stringify(counts));
});

for(const failed of [1,2,5])test(`partial/all failure (${failed}/5) persists successes and only retries failed days`,async t=>{
  const f=await fixture(t),b=await f.next();
  const p=await f.push(b,b.jobs.map((j,i)=>i<failed?{jobToken:j.jobToken,error:'network_error'}:f.good(j)));
  assert.equal(p.saved,5-failed);assert.equal(p.failed,failed);
  assert.equal((await f.call({action:'collectorPull',...f.receiver})).items.length,5-failed);
  f.advance();const n=await f.next();assert.equal(n.state,'RUN');
  for(const j of b.jobs.slice(0,failed))assert.ok(n.jobs.some(x=>x.date===j.date));
  for(const j of b.jobs.slice(failed))assert.ok(!n.jobs.some(x=>x.date===j.date));
});

test('same batch and same job replay cannot increment revisions or retry counters',async t=>{
  const f=await fixture(t),b=await f.next(),rows=b.jobs.map(f.good);
  const p=await f.push(b,[rows[0],rows[0],...rows.slice(1)]);assert.equal(p.status,400);
  assert.equal((await f.push(b,rows)).saved,5);f.blob.reset();
  const replay=await f.push(b,rows);assert.equal(replay.duplicates,5);assert.equal(f.blob.counts().put,0);
  const once=await f.push(b,[rows[0],rows[0]]);assert.equal(once.duplicates,2);
  assert.equal((await f.call({action:'collectorPull',...f.receiver})).serverRevision,5);
});

test('aborted Shortcut preserves submitted successes; expired missing jobs are reissued, stale owner rejected',async t=>{
  const f=await fixture(t),b=await f.next();assert.equal((await f.push(b,b.jobs.slice(0,2).map(f.good))).saved,2);
  assert.equal((await f.next()).state,'WAIT');f.advance(20*60000+1);
  const n=await f.next();assert.ok(n.jobs.some(x=>x.date===b.jobs[2].date));
  assert.ok(!n.jobs.some(x=>x.date===b.jobs[0].date));
  const stale=await f.push(b,[f.good(b.jobs[2])]);assert.equal(stale.saved,0);assert.equal(stale.results[0].code,'job_expired');
  assert.equal((await f.push(n,n.jobs.map(f.good))).saved,5);
});

test('parallel Next claims at most one batch; V2 cannot claim its dates',async t=>{
  const f=await fixture(t);const replies=await Promise.all([f.next(),f.next(),f.next()]);
  assert.equal(replies.filter(x=>x.state==='RUN').length,1);assert.equal(replies.filter(x=>x.state==='WAIT').length,2);
  const b=replies.find(x=>x.state==='RUN'),v2=await f.call({action:'iosCollectorNextV2',...f.sender});
  assert.equal(v2.state,'RUN');assert.ok(!b.jobs.some(j=>j.date===dateOf(v2)));assert.ok(v2.waitSeconds<=30);
});

test('parallel Push of overlapping results is idempotent and does not lose disjoint days',async t=>{
  const f=await fixture(t),b=await f.next();
  const replies=await Promise.all([f.push(b,b.jobs.slice(0,3).map(f.good)),f.push(b,b.jobs.slice(2).map(f.good)),f.push(b,b.jobs.map(f.good))]);
  assert.ok(replies.every(x=>x.status===200),JSON.stringify(replies));
  const pull=await f.call({action:'collectorPull',...f.receiver});assert.equal(pull.items.length,5);assert.equal(pull.serverRevision,5);
});

test('lost Push acknowledgement is recovered by resend without re-saving',async t=>{
  const f=await fixture(t),b=await f.next();let fail=true;
  f.blob.hooks.afterPut=path=>{if(fail&&path.includes('collector-state-v3/')){fail=false;throw new Error('lost acknowledgement')}};
  assert.equal((await f.push(b,b.jobs.map(f.good))).status,500);f.blob.hooks.afterPut=null;f.blob.reset();
  const r=await f.push(b,b.jobs.map(f.good));assert.equal(r.duplicates,5);assert.equal(f.blob.counts().put,0);
});

test('unpublished payload is never visible if state commit fails',async t=>{
  const f=await fixture(t),b=await f.next();
  f.blob.hooks.beforePut=path=>{if(path.includes('collector-state-v3/'))throw new Error('state unavailable')};
  assert.equal((await f.push(b,b.jobs.map(f.good))).status,500);f.blob.hooks.beforePut=null;
  assert.equal((await f.call({action:'collectorPull',...f.receiver})).items.length,0);
  assert.equal((await f.push(b,b.jobs.map(f.good))).saved,5);
});

test('manual requeue overrides coverage and invalidates previously saved and in-flight tokens',async t=>{
  const f=await fixture(t),b=await f.next();await f.push(b,b.jobs.map(f.good));
  const j=b.jobs[0];assert.equal((await f.call({action:'iosCollectorRequeueDate',...f.receiver,sourceStoreId:j.sourceStoreId,date:j.date})).ok,true);
  const old=await f.push(b,[f.good(j)]);assert.equal(old.saved,0);assert.equal(old.results[0].code,'job_cancelled');
  f.advance();const n=await f.next();assert.equal(n.jobs[0].date,j.date);assert.equal((await f.push(n,n.jobs.map(f.good))).saved,5);
});

test('multiple stores retain priority and do not cross identities',async t=>{
  const f=await fixture(t,{shops:3}),b=await f.next();
  assert.equal(b.jobs[0].sourceStoreId,f.stores[0].sourceStoreId);assert.equal(new Set(b.jobs.map(j=>j.sourceStoreId)).size,3);
  const rows=b.jobs.map(f.good);rows[2].text=samplePage('2020-01-01','unrelated store');
  const p=await f.push(b,rows);assert.equal(p.saved,4);assert.equal(p.results[2].code,'page_identity');
});

test('legacy format migrates non-destructively; old payloads, V2 and coverage remain compatible',async t=>{
  const f=await fixture(t,{legacy:true});
  const n=await f.call({action:'iosCollectorNextV2',...f.sender});
  assert.equal((await f.call({action:'iosCollectorPushV2',...f.sender,jobToken:n.jobToken,text:samplePage(dateOf(n),f.stores[0].shop)})).state,'SAVED');
  const old=new Map(f.blob.db),runtime=relay.createRelayRuntime({createStore:()=>f.blob.s});
  const call=async body=>{const r=await runtime.default(new Request('https://preview.invalid/api/relay',{method:'POST',body:JSON.stringify(body)}));return{status:r.status,...await r.json()}};
  const b=await call({action:'iosCollectorNextBatchV3',...f.sender});assert.equal(b.jobs.length,5);assert.ok(!b.jobs.some(j=>j.date===dateOf(n)));
  for(const [k,v] of old)assert.deepEqual(f.blob.db.get(k),v,'migration must retain original blobs');
  assert.equal((await call({action:'collectorPull',...f.receiver})).items.length,1);
  const v2=await call({action:'iosCollectorNextV2',...f.sender});assert.equal(v2.state,'RUN');
  assert.equal((await call({action:'iosCollectorPushV2',...f.sender,jobToken:v2.jobToken,text:samplePage(dateOf(v2),f.stores[0].shop)})).state,'SAVED');
});

test('cleanup removes store state, preserves other store data, and unlink cannot resurrect legacy data',async t=>{
  const f=await fixture(t,{shops:2}),b=await f.next();await f.push(b,b.jobs.map(f.good));
  const id=f.stores[0].sourceStoreId;
  assert.equal((await f.call({action:'iosCollectorTargetDelete',...f.receiver,sourceStoreId:id})).ok,true);
  const pull=await f.call({action:'collectorPull',...f.receiver});assert.ok(pull.items.length>0);assert.ok(pull.items.every(x=>x.sourceStoreId!==id));
  const root=JSON.parse([...f.blob.db.values()].find(v=>v.pathname.includes('collector-state-v3/')).text);
  assert.ok(!JSON.stringify(root).includes(id));
  assert.equal((await f.call({action:'unlink',...f.receiver})).ok,true);
  assert.equal((await f.next()).status,401);assert.equal((await f.call({action:'collectorPull',...f.receiver})).status,401);
  assert.equal([...f.blob.db.keys()].filter(k=>k.includes('collector-pack-v3/')).length,0);
});

test('year calendar including leap floor is enforced; local coverage skip reaches DONE',async t=>{
  const f=await fixture(t);t.mock.timers.setTime(new Date('2024-03-01T00:00:00Z').getTime());
  const days=[];for(let d=new Date('2023-02-28T00:00:00Z');d<=new Date('2024-02-29T00:00:00Z');d.setUTCDate(d.getUTCDate()+1))days.push(d.toISOString().slice(0,10));
  assert.equal(days.length,367);
  await f.call({action:'collectorStatus',...f.receiver,localCoverage:[{sourceStoreId:f.stores[0].sourceStoreId,dates:days.slice(1)}]});
  const n=await f.next();assert.equal(n.jobs.length,1);assert.equal(n.jobs[0].date,'2023-02-28');
  await f.push(n,n.jobs.map(f.good));f.advance();assert.equal((await f.next()).state,'DONE');
});

test('corrupt snapshot and absent ETag fail closed',async t=>{
  const f=await fixture(t);const k=[...f.blob.db.keys()].find(k=>k.includes('collector-state-v3/'));
  const rec=f.blob.db.get(k);rec.text='{broken';assert.equal((await f.next()).status,500);
  assert.equal(rec.text,'{broken');
});

test('V2 lease ownership and explicit failed result receipts prevent stale retries',async t=>{
  const f=await fixture(t),b=await f.next();const failure={jobToken:b.jobs[0].jobToken,error:'network_error'};
  assert.equal((await f.push(b,[failure])).failed,1);f.blob.reset();
  assert.equal((await f.push(b,[failure])).duplicates,1);assert.equal(f.blob.counts().put,0);
  const j=b.jobs[1],lk=`ios-lease/${f.creds.channelId}/${digest(j.sourceStoreId).slice(0,24)}/${j.date}`;
  const rootPath=[...f.blob.db.keys()].find(k=>k.includes('collector-state-v3/'));
  const stored=f.blob.db.get(rootPath),state=JSON.parse(stored.text);state.values[lk].jobTokenHash='another-owner';stored.text=JSON.stringify(state);
  const p=await f.push(b,[f.good(j)]);assert.equal(p.results[0].code,'lease_conflict');assert.equal(p.saved,0);
});

test('Launcher messages still save, receive and acknowledge after snapshot migration',async t=>{
  const f=await fixture(t),senderToken=f.creds.collectorKey.split('.')[1];
  const sent=await f.call({action:'send',channelId:f.creds.channelId,senderToken,payload:{format:'juggler-external-import-bulk',shop:'message store',days:[{date:'2026-09-06',machines:[]}]}});
  assert.equal(sent.ok,true);
  const got=await f.call({action:'receive',...f.receiver});assert.equal(got.message?.messageId,sent.messageId);
  assert.equal((await f.call({action:'ack',...f.receiver,messageId:sent.messageId})).ok,true);
  assert.equal((await f.call({action:'receive',...f.receiver})).message,null);
});

test('key rotation revokes the old key and preserves existing jobs for the new key',async t=>{
  const f=await fixture(t),b=await f.next(),rotated=await f.call({action:'rotateIosCollectorKey',...f.receiver});
  assert.equal(rotated.ok,true);assert.equal((await f.push(b,b.jobs.map(f.good))).status,401);
  const saved=await f.call({action:'iosCollectorPushBatchV3',collectorKey:rotated.collectorKey,batchId:b.batchId,results:b.jobs.map(f.good)});
  assert.equal(saved.saved,5);assert.equal((await f.call({action:'pairStatus',...f.receiver})).linked,true);
});

test('cold concurrent migration retains every original day and creates a single claim',async t=>{
  const f=await fixture(t,{legacy:true}),runtime=relay.createRelayRuntime({createStore:()=>f.blob.s});
  const call=async()=>{const r=await runtime.default(new Request('https://preview.invalid/api/relay',{method:'POST',body:JSON.stringify({action:'iosCollectorNextBatchV3',...f.sender})}));return r.json()};
  const results=await Promise.all([call(),call()]);assert.equal(results.filter(x=>x.state==='RUN').length,1);assert.equal(results.filter(x=>x.state==='WAIT').length,1);
});

test('missing payload cannot advance Device Sync-compatible Collector pull cursor',async t=>{
  const f=await fixture(t),b=await f.next();await f.push(b,b.jobs.map(f.good));
  const path=[...f.blob.db.keys()].find(x=>x.includes('collector-pack-v3/'));f.blob.db.delete(path);
  const pull=await f.call({action:'collectorPull',...f.receiver});assert.equal(pull.status,500);assert.equal(pull.nextRevision,undefined);
});

test('missing origin ETag rejects a write; malformed legacy metadata cannot be migrated as empty',async t=>{
  const f=await fixture(t,{legacy:true});
  const cfg=[...f.blob.db.keys()].find(x=>x.includes('ios-collector-config/'));f.blob.db.get(cfg).text='{invalid';
  const runtime=relay.createRelayRuntime({createStore:()=>f.blob.s});
  const req=()=>new Request('https://preview.invalid/api/relay',{method:'POST',body:JSON.stringify({action:'iosCollectorNextBatchV3',...f.sender})});
  assert.equal((await runtime.default(req())).status,500);
  assert.ok(![...f.blob.db.keys()].some(k=>k.includes('collector-state-v3/')));
  await f.blob.s.setJSON('missing-etag',{x:1});
  const rec=[...f.blob.db.values()].find(x=>x.pathname.endsWith('/missing-etag'));rec.etag='';
  await assert.rejects(f.blob.s.getWithMetadata('missing-etag'),/metadata unavailable/);
});

test('identical local coverage polling and WAIT polling do not write',async t=>{
  const f=await fixture(t),localCoverage=[{sourceStoreId:f.stores[0].sourceStoreId,dates:['2026-09-06']}];
  await f.call({action:'collectorStatus',...f.receiver,localCoverage});f.advance(5000);f.blob.reset();
  await f.call({action:'collectorStatus',...f.receiver,localCoverage});assert.equal(f.blob.counts().put,0);
  await f.next();f.blob.reset();assert.equal((await f.next()).state,'WAIT');assert.equal(f.blob.counts().put,0);
});

test('a failed cleanup remains journaled and a later authorized request safely finishes it',async t=>{
  const f=await fixture(t),b=await f.next();await f.push(b,b.jobs.map(f.good));
  const original=f.blob.s.delete;let first=true;
  f.blob.s.delete=async key=>{if(first&&key.startsWith('collector-pack-v3/')){first=false;throw new Error('delete unavailable')}return original(key)};
  const r=await f.call({action:'iosCollectorTargetDelete',...f.receiver,sourceStoreId:f.stores[0].sourceStoreId});assert.equal(r.status,500);
  f.blob.s.delete=original;assert.equal((await f.next()).state,'DONE');
  assert.equal([...f.blob.db.keys()].filter(k=>k.includes('collector-pack-v3/')).length,0);
});

test('unlink interrupted during deletion can be retried with the original receiver credential',async t=>{
  const f=await fixture(t),b=await f.next();await f.push(b,b.jobs.map(f.good));
  const original=f.blob.s.delete;let first=true;
  f.blob.s.delete=async key=>{if(first&&key.startsWith('collector-pack-v3/')){first=false;throw new Error('unlink deletion failed')}return original(key)};
  assert.equal((await f.call({action:'unlink',...f.receiver})).status,500);
  assert.equal((await f.next()).status,401);f.blob.s.delete=original;
  assert.equal((await f.call({action:'unlink',...f.receiver})).ok,true);
  assert.equal([...f.blob.db.keys()].filter(k=>k.includes('collector-pack-v3/')).length,0);
  assert.equal((await f.call({action:'unlink',channelId:f.creds.channelId,receiverToken:'wrong'})).status,401);
});

for(const operation of ['iosCollectorRequeueDate','iosCollectorTargetDelete','unlink'])test(`${operation} wins against a stale parallel Push`,async t=>{
  const f=await fixture(t),b=await f.next();let release,entered;
  const paused=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let once=true;
  f.blob.hooks.beforePut=async(path,body)=>{
    if(once&&path.includes('collector-state-v3/')&&String(body).includes('"receipt"')){once=false;entered();await gate}
  };
  const pushing=f.push(b,[f.good(b.jobs[0])]);await paused;
  const admin=await f.call({action:operation,...f.receiver,sourceStoreId:b.jobs[0].sourceStoreId,date:b.jobs[0].date});assert.equal(admin.ok,true);
  release();const p=await pushing;assert.ok(p.status===401||p.saved===0);
  if(operation!=='unlink')assert.equal((await f.call({action:'collectorPull',...f.receiver})).items.length,0);
});

test('real parser accepts HTML/text layouts and rejects identity, missing headers and partial pages independently',async t=>{
  const f=await fixture(t),b=await f.next();
  const html=j=>`<html><h1>${j.date} ${j.shop}</h1><table><tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr><tr><td>マイジャグラーV</td><td>601</td><td>2727</td><td>-94</td><td>11</td><td>7</td></tr></table></html>`;
  const rows=b.jobs.map(f.good);rows[0].text=html(b.jobs[0]);
  rows[1].text=`${b.jobs[1].date}\n${b.jobs[1].shop}\n全データ一覧\n機種名\n台番号\nG数\nBB\nRB\nマイジャグラーV\n602\n5000\n20\n15\n機種別データピックアップ`;
  rows[2].text=`${b.jobs[2].date}\n${b.jobs[2].shop}\n全データ一覧\nマイジャグラーV\n601\n5000\n20\n15`;
  rows[3].text='400 Bad Request cloudflare';
  const p=await f.push(b,rows);assert.equal(p.saved,3);assert.equal(p.results[2].code,'parse_empty');assert.equal(p.results[3].code,'upstream_http_400');
  const pull=await f.call({action:'collectorPull',...f.receiver});assert.equal(pull.items[1].day.machines[0].diff,null);
  f.advance();const n=await f.next();await f.push(n,n.jobs.map(f.good));f.advance();
  const n2=await f.next(),partial=await f.push(n2,[{...f.good(n2.jobs[0]),text:samplePage(n2.jobs[0].date,n2.jobs[0].shop,1)}]);
  assert.equal(partial.results[0].code,'partial_page');
});

test('target deletion reclaims unpublished payloads left by an ambiguous failed write',async t=>{
  const f=await fixture(t),b=await f.next();
  f.blob.hooks.beforePut=path=>{if(path.includes('collector-state-v3/'))throw new Error('network unavailable')};
  assert.equal((await f.push(b,[f.good(b.jobs[0])])).status,500);f.blob.hooks.beforePut=null;
  assert.equal((await f.call({action:'iosCollectorTargetDelete',...f.receiver,sourceStoreId:f.stores[0].sourceStoreId})).ok,true);
  assert.equal([...f.blob.db.keys()].filter(k=>k.includes('collector-pack-v3/')).length,0);
});

test('invalid/cross-channel credentials cannot issue or modify jobs',async t=>{
  const f=await fixture(t),g=await f.call({action:'createIosCollector'});
  assert.equal((await f.call({action:'iosCollectorNextBatchV3',...f.receiver})).status,401);
  assert.equal((await f.call({action:'iosCollectorTargetDelete',channelId:f.creds.channelId,collectorKey:f.creds.collectorKey,sourceStoreId:f.stores[0].sourceStoreId})).status,401);
  const b=await f.next();
  assert.equal((await f.call({action:'iosCollectorPushBatchV3',collectorKey:g.collectorKey,batchId:b.batchId,results:b.jobs.map(f.good)})).saved,0);
  assert.equal((await f.push(b,b.jobs.map(f.good))).saved,5);
});

test('SDK-shaped conditional errors without a numeric status retry from a fresh snapshot',async t=>{
  const f=await fixture(t);let first=true;
  // @vercel/blob 2.8.0 inherits Error.name; only the constructor identifies it.
  class BlobPreconditionFailedError extends Error{constructor(){super('Vercel Blob: Precondition failed: ETag mismatch.')}}
  f.blob.hooks.beforePut=path=>{if(first&&path.includes('collector-state-v3/')){first=false;throw new BlobPreconditionFailedError()}};
  const n=await f.next();assert.equal(n.state,'RUN');assert.equal(n.jobs.length,5);
});
