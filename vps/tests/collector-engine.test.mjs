import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {addCollectorStore,setCollectorStoreEnabled,ensureCollectorTargets,getCollectorDay,getCollectorControl,resetCollectorDay} from '../src/collector/repository.mjs';
import {canonicalJson,hashCanonical,persistCollectedDay} from '../src/collector/persist.mjs';
import {runCollectorOnce} from '../src/collector/engine.mjs';

const NOW_ISO='2026-09-09T19:00:00.000Z'; // 2026-09-10 04:00 JST
const DAY_HTML=`<html><body><table><tr><th>台番</th><th>機種名</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr><tr><td>275</td><td>マイジャグラーV</td><td>8123</td><td>1450</td><td>31</td><td>29</td></tr></table></body></html>`;

function makeDb(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-engine-'));
  const db=openDatabase(join(dir,'db.sqlite'));migrate(db);
  return {db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}
function seedStore(db,{id='abc',historyStart='2026-09-08'}={}){
  addCollectorStore(db,{storeId:id,slug:id,name:`${id}店`,historyStart,nowIso:NOW_ISO});
  setCollectorStoreEnabled(db,{storeId:id,enabled:true,nowIso:NOW_ISO});
  ensureCollectorTargets(db,{now:new Date(NOW_ISO),historyBackfill:true});
}
function okTransport(html=DAY_HTML){return async url=>({ok:true,status:200,statusText:'OK',url,text:async()=>html});}
function fakeArchive(){return async({root,storeId,date,html})=>({path:`${root}/${storeId}/${date}.html.gz`,sha256:'a'.repeat(64),bytes:Buffer.byteLength(html)});}

function dayPayload(date='2026-09-09',games=8123){return {
  date,sourceUrl:`https://ana-slo.com/${date}-abc-data/`,
  machines:[{machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'275',games,diff:1450,bb:31,rb:29}],
  quality:{score:100,grade:'A',warnings:[],totalMachines:1}
};}

test('canonical JSON is deterministic and hash changes with normalized payload',()=>{
  assert.equal(canonicalJson({b:1,a:{d:2,c:3}}),'{"a":{"c":3,"d":2},"b":1}');
  assert.equal(hashCanonical({b:1,a:2}),hashCanonical({a:2,b:1}));
  assert.notEqual(hashCanonical({a:2}),hashCanonical({a:3}));
  assert.throws(()=>canonicalJson({bad:NaN}),/finite|unsupported/i);
});

test('persistCollectedDay atomically replaces complete machine set and marks collected',()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-09'});
    f.db.prepare("INSERT INTO store_days(store_id,business_date,normalized_payload_hash,quality_status,created_at,updated_at) VALUES(?,?,?,?,?,?)").run('abc','2026-09-09','old','valid',NOW_ISO,NOW_ISO);
    f.db.prepare("INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)").run('abc','2026-09-09','999999','{"old":true}');
    const day={...dayPayload(),machines:[...dayPayload().machines,{machine:'im',category:'juggler',sourceMachineName:'ネオアイムジャグラーEX',tableNo:'300',games:7000,diff:200,bb:25,rb:22}]};
    const result=persistCollectedDay(f.db,{store:{storeId:'abc',name:'abc店',slug:'abc'},day,rawArtifact:{path:'/raw/abc/2026-09-09.html.gz',sha256:'b'.repeat(64)},nowIso:NOW_ISO});
    assert.equal(result.machineCount,2);
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').state,'collected');
    const rows=f.db.prepare('SELECT machine_key,payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all('abc','2026-09-09');
    assert.deepEqual(rows.map(x=>x.machine_key),['000000','000001']);
    assert.equal(JSON.parse(rows[0].payload_json).tableNo,'275');
    assert.equal(f.db.prepare('SELECT raw_artifact_path,source_hash,normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').raw_artifact_path,'/raw/abc/2026-09-09.html.gz');
  }finally{f.cleanup()}
});

test('failed persistence transaction keeps previous canonical data and does not mark collected',()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-09'});
    f.db.prepare("INSERT INTO store_days(store_id,business_date,normalized_payload_hash,quality_status,created_at,updated_at) VALUES(?,?,?,?,?,?)").run('abc','2026-09-09','oldhash','valid',NOW_ISO,NOW_ISO);
    f.db.prepare("INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)").run('abc','2026-09-09','000000','{"old":true}');
    assert.throws(()=>persistCollectedDay(f.db,{store:{storeId:'abc',name:'abc店',slug:'abc'},day:dayPayload(),rawArtifact:{path:'/new',sha256:'c'.repeat(64)},nowIso:NOW_ISO,beforeCommit:()=>{throw new Error('boom')}}),/boom/);
    assert.equal(f.db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').normalized_payload_hash,'oldhash');
    assert.equal(f.db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=?').get('abc','2026-09-09').payload_json,'{"old":true}');
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').state,'pending');
  }finally{f.cleanup()}
});

test('successful engine run requires fetch parse archive and DB commit before collected',async()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-09'});
    const calls=[];
    const result=await runCollectorOnce({db:f.db,rawRoot:'/raw',clock:()=>new Date(NOW_ISO),transport:async url=>{calls.push(url);return okTransport()(url)},archive:fakeArchive(),sleep:async()=>{},random:()=>0,maxRequests:1});
    assert.equal(result.result,'success');assert.equal(result.attempted,1);assert.equal(result.collected,1);assert.equal(calls.length,1);
    const state=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(state.state,'collected');assert.ok(state.rawArtifactPath);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM machine_day_data WHERE store_id=? AND business_date=?').get('abc','2026-09-09').n,1);
  }finally{f.cleanup()}
});

test('ordinary failure delays only failed day 45 minutes and proceeds to older eligible day',async()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-08'});
    let n=0;
    const transport=async url=>{n++;if(n===1)return {ok:false,status:500,statusText:'Server Error',url,text:async()=>'<html>error</html>'};return okTransport()(url)};
    const sleeps=[];
    const result=await runCollectorOnce({db:f.db,rawRoot:'/raw',clock:()=>new Date(NOW_ISO),transport,archive:fakeArchive(),sleep:async ms=>{sleeps.push(ms)},random:()=>0,maxRequests:2});
    assert.equal(result.attempted,2);assert.equal(result.failed,1);assert.equal(result.collected,1);
    const failed=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(failed.state,'pending');assert.equal(failed.retryAfter,'2026-09-09T19:45:00.000Z');
    assert.equal(getCollectorDay(f.db,'abc','2026-09-08').state,'collected');
    assert.deepEqual(sleeps,[10000]);
  }finally{f.cleanup()}
});

for(const status of [403,429])test(`HTTP ${status} blocks all collection for 45 minutes`,async()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-08'});let calls=0;
    const transport=async url=>{calls++;return {ok:false,status,statusText:'blocked',url,text:async()=>'<html>blocked</html>'}};
    const first=await runCollectorOnce({db:f.db,rawRoot:'/raw',clock:()=>new Date(NOW_ISO),transport,archive:fakeArchive(),sleep:async()=>{},maxRequests:5});
    assert.equal(first.result,'blocked');assert.equal(calls,1);assert.equal(getCollectorControl(f.db).globalBlockUntil,'2026-09-09T19:45:00.000Z');
    const second=await runCollectorOnce({db:f.db,rawRoot:'/raw',clock:()=>new Date('2026-09-09T19:30:00.000Z'),transport,archive:fakeArchive(),sleep:async()=>{},maxRequests:5});
    assert.equal(second.result,'blocked');assert.equal(calls,1);
  }finally{f.cleanup()}
});

test('404 becomes excluded only after >=3 misses and >=24 hours; other errors never count as not-found',async()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-09'});
    let nowMs=Date.parse(NOW_ISO),status=404;
    const clock=()=>new Date(nowMs);
    const transport=async url=>({ok:false,status,statusText:'x',url,text:async()=>'<html>x</html>'});
    const run=()=>runCollectorOnce({db:f.db,rawRoot:'/raw',clock,transport,archive:fakeArchive(),sleep:async()=>{},maxRequests:1});
    await run();let row=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(row.notFoundCount,1);assert.equal(row.state,'pending');
    nowMs+=45*60*1000;await run();row=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(row.notFoundCount,2);assert.equal(row.state,'pending');
    nowMs+=45*60*1000;await run();row=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(row.notFoundCount,3);assert.equal(row.state,'pending');
    status=500;nowMs+=45*60*1000;await run();row=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(row.notFoundCount,3);assert.equal(row.state,'pending');
    status=404;nowMs=Date.parse(NOW_ISO)+24*60*60*1000;await run();row=getCollectorDay(f.db,'abc','2026-09-09');assert.equal(row.state,'excluded');
  }finally{f.cleanup()}
});

test('pacing is one request at a time and random wait stays within 10-30 seconds',async()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-08'});
    let active=0,maxActive=0,calls=0;
    const transport=async url=>{calls++;active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return okTransport()(url)};
    const sleeps=[];
    await runCollectorOnce({db:f.db,rawRoot:'/raw',clock:()=>new Date(NOW_ISO),transport,archive:fakeArchive(),sleep:async ms=>{sleeps.push(ms)},random:()=>1,maxRequests:2});
    assert.equal(calls,2);assert.equal(maxActive,1);assert.deepEqual(sleeps,[30000]);
  }finally{f.cleanup()}
});

test('collected day is never fetched again unless manually reset',async()=>{
  const f=makeDb();try{
    seedStore(f.db,{historyStart:'2026-09-09'});let calls=0;
    const transport=async url=>{calls++;return okTransport()(url)};
    const opts={db:f.db,rawRoot:'/raw',clock:()=>new Date(NOW_ISO),transport,archive:fakeArchive(),sleep:async()=>{},maxRequests:1};
    await runCollectorOnce(opts);await runCollectorOnce(opts);assert.equal(calls,1);
    resetCollectorDay(f.db,{storeId:'abc',businessDate:'2026-09-09',nowIso:NOW_ISO});await runCollectorOnce(opts);assert.equal(calls,2);
  }finally{f.cleanup()}
});
