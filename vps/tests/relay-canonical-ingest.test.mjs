import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {gunzipSync} from 'node:zlib';
import {createWebServer} from '../src/web-server.mjs';
import {openDatabase} from '../src/db.mjs';

function yesterdayJst(){
  const d=new Date(Date.now()+9*60*60*1000);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);
}
function slashDate(date){const [y,m,d]=date.split('-');return `${y}/${+m}/${+d}`}
const tableText=`
全データ一覧
機種名
台番号
G数
差枚
BB
RB
ART
合成確率
BB確率
RB確率
ART確率
マイジャグラーV
601
2,727
-94
11
7
0
1/151.5
1/247.9
1/389.6
1/0.0
ファンキージャグラー2
760
5,584
-694
20
13
0
1/169.2
1/279.2
1/429.5
1/0.0
キングハナハナ-30
1315
5,353
-1,092
17
14
0
1/172.7
1/314.9
1/382.4
1/0.0
機種別データピックアップ
`;

async function startFixture(t,{breakRaw=false}={}){
  const root=await mkdtemp(path.join(tmpdir(),'jugest-relay-ingest-'));
  await writeFile(path.join(root,'index.html'),'<!doctype html><title>relay ingest</title>');
  const relayDbPath=path.join(root,'relay.sqlite');
  const canonicalDbPath=path.join(root,'jugest.sqlite');
  const rawRoot=path.join(root,'raw');
  if(breakRaw)await writeFile(rawRoot,'not a directory');
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})});
  return {base:`http://127.0.0.1:${server.address().port}`,root,relayDbPath,canonicalDbPath,rawRoot};
}
async function call(base,body){
  const response=await fetch(`${base}/api/relay`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  let json=null;try{json=await response.json()}catch{}
  return {status:response.status,json};
}
async function issueJob(base){
  const date=yesterdayJst(),shop='通常店';
  const created=await call(base,{action:'createIosCollector'});
  assert.equal(created.status,200);assert.equal(created.json.ok,true);
  const url=`https://ana-slo.com/${date}-%E9%80%9A%E5%B8%B8%E5%BA%97-data/`;
  const target=await call(base,{action:'iosCollectorTargetUpsert',channelId:created.json.channelId,receiverToken:created.json.receiverToken,url,startDate:date,priority:2,enabled:true});
  assert.equal(target.json.ok,true);
  const next=await call(base,{action:'iosCollectorNextV2',collectorKey:created.json.collectorKey});
  assert.equal(next.json.state,'RUN');
  return {date,shop,created:created.json,next:next.json,target:target.json.stores[0]};
}

test('PushV2 success means raw artifact and canonical DB are durable before acknowledgement',async t=>{
  const f=await startFixture(t);
  const x=await issueJob(f.base);
  const rawText=`${slashDate(x.date)}\n${x.shop}\n${tableText}`;
  const pushed=await call(f.base,{action:'iosCollectorPushV2',collectorKey:x.created.collectorKey,jobToken:x.next.jobToken,text:rawText,fetchUrl:x.next.url});
  assert.equal(pushed.status,200);
  assert.equal(pushed.json.ok,true);
  assert.equal(pushed.json.state,'SAVED');
  assert.ok(Number.isInteger(pushed.json.revision)&&pushed.json.revision>0);

  const db=openDatabase(f.canonicalDbPath);
  t.after(()=>db.close());
  const store=db.prepare('SELECT * FROM stores WHERE id=?').get(x.target.sourceStoreId);
  assert.equal(store.name,x.shop);
  const day=db.prepare('SELECT * FROM store_days WHERE store_id=? AND business_date=?').get(x.target.sourceStoreId,x.date);
  assert.ok(day);
  assert.equal(day.parser_version,'v504-header-driven-1');
  assert.match(day.raw_artifact_path,new RegExp(`${x.date}\\.[0-9a-f]{64}\\.html\\.gz$`));
  assert.equal(gunzipSync(await readFile(day.raw_artifact_path)).toString('utf8'),rawText);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM machine_day_data WHERE store_id=? AND business_date=?').get(x.target.sourceStoreId,x.date).n,3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1);
});

test('canonical persistence failure fails PushV2 and rolls Relay day publication back',async t=>{
  const f=await startFixture(t,{breakRaw:true});
  const x=await issueJob(f.base);
  const rawText=`${slashDate(x.date)}\n${x.shop}\n${tableText}`;
  const pushed=await call(f.base,{action:'iosCollectorPushV2',collectorKey:x.created.collectorKey,jobToken:x.next.jobToken,text:rawText,fetchUrl:x.next.url});
  assert.ok(pushed.status>=500,'canonical ingest failure must fail the Push request');
  assert.notEqual(pushed.json?.ok,true);

  const pulled=await call(f.base,{action:'collectorPull',channelId:x.created.channelId,receiverToken:x.created.receiverToken,sinceRevision:0,limit:45});
  assert.equal(pulled.status,200);
  assert.equal(pulled.json.ok,true);
  assert.equal(pulled.json.items.length,0,'Relay transaction must not publish a day when canonical persistence failed');
});
