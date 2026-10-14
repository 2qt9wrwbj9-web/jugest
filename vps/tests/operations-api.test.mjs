import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {createAnalyticsHandler} from '../src/analytics-handler.mjs';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {ingestCollectorDay} from '../src/ingest/canonical-ingest.mjs';
import {callOwnedCollector} from '../src/operations.mjs';
const CHANNEL='operations_channel_123',TOKEN='fixture-operations-receiver',NOW='2026-10-09T02:00:00Z';
async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'jugest-operations-')),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'canonical.sqlite'),rawRoot=join(dir,'raw');
 const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
 await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:createHash('sha256').update(TOKEN).digest('hex'),senderHash:'fixture'});
 const db=openDatabase(canonicalDbPath);migrate(db);
 for(const [id,name,meta] of [['a','自分の店',{source:'ana-slo-ios-relay',collectorChannelId:CHANNEL}],['b','他人の秘密店',{collectorChannelId:'other-channel'}],['pia:35','PIA公開店',{source:'pia-public-ranking-top',visibility:'public'}]])db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run(id,name,JSON.stringify(meta),NOW,NOW);
 const machines=[1,2].map(i=>({tableNo:String(i),machine:'my',sourceMachineName:'マイジャグラーV',games:5000,bb:20,rb:18,diff:i===1?0:500}));
 await ingestCollectorDay(db,{rawRoot,channelId:CHANNEL,sourceStoreId:'a',shop:'自分の店',date:'2026-10-08',day:{date:'2026-10-08',machines,quality:{expectedMachineKeys:['1','2']}},rawText:'fixture',nowIso:NOW});
 let piaAllowed=true,lastRequest;
 const handler=createAnalyticsHandler({rootDir:resolve('.'),relayDbPath,canonicalDbPath,authenticatePia:req=>piaAllowed&&req.headers['x-fixture-role']?{kind:req.headers['x-fixture-role']}:null});
 const server=http.createServer((req,res)=>{lastRequest=req;Promise.resolve(handler(req,res)).catch(()=>{res.writeHead(500);res.end()})});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`,auth={authorization:`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL};
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true})});
 return{db,base,auth,rawRoot,CHANNEL,relayDbPath,relay,lastRequest:()=>lastRequest,revokePia:()=>{piaAllowed=false}};
}
test('operations overview uses saved inventory, preserves zero, and isolates private stores',async t=>{
 const f=await fixture(t);assert.equal((await fetch(`${f.base}/api/vps/operations`)).status,401);
 const r=await fetch(`${f.base}/api/vps/operations`,{headers:f.auth});assert.equal(r.status,200);
 const body=await r.json();assert.deepEqual(body.operations.stores.map(s=>s.id).sort(),['a','pia:35']);
 const own=body.operations.stores.find(s=>s.id==='a');assert.equal(own.integrity.actualCount,2);assert.equal(own.integrity.missingFields.diff,0);assert.equal(own.state,'complete');
 assert.doesNotMatch(JSON.stringify(body),/他人の秘密店|fixture-operations-receiver|rawRoot|artifact|collectorChannelId/);
 const denied=await fetch(`${f.base}/api/vps/stores/b/performance`,{headers:f.auth});assert.equal(denied.status,403);
});
test('unknown inventory and no evaluations remain unknown rather than zero percent',async t=>{
 const f=await fixture(t);
 const empty=await (await fetch(`${f.base}/api/vps/stores/pia:35/operations`,{headers:f.auth})).json();assert.equal(empty.operations.integrity,null);assert.equal(empty.operations.missingMachines,null);
 const p=await (await fetch(`${f.base}/api/vps/stores/a/performance`,{headers:f.auth})).json();assert.equal(p.performance.periods.all.evaluatedDays,0);assert.equal(p.performance.periods.all.engines.current_shadow.top['1'].meanDiff,null);
 assert.equal(p.performance.periods.all.businessDays,1);assert.equal(p.performance.periods.all.predictedDays,0);
});
test('rejected incomplete resend is visible without replacing the complete saved day',async t=>{
 const f=await fixture(t);
 await ingestCollectorDay(f.db,{rawRoot:f.rawRoot,channelId:CHANNEL,sourceStoreId:'a',shop:'自分の店',date:'2026-10-08',day:{date:'2026-10-08',machines:[{tableNo:'1',machine:'my',sourceMachineName:'マイジャグラーV',games:5000,bb:20,rb:18,diff:null}],quality:{expectedMachineKeys:['1','2']}},rawText:'partial',nowIso:'2026-10-09T03:00:00Z'});
 const body=await (await fetch(`${f.base}/api/vps/stores/a/operations`,{headers:f.auth})).json();assert.equal(body.operations.state,'needs_review');assert.equal(body.operations.integrity.actualCount,2);assert.equal(body.operations.lastAttempt.decision,'quarantined');assert.equal(body.operations.lastAttempt.integrity.missingKeys.length,1);assert.equal(body.operations.lastCollectedAt,NOW);
});
test('a same-hash verification rejection cannot move the last successful collection time backward',async t=>{
 const f=await fixture(t),machines=[1,2].map(i=>({tableNo:String(i),machine:'my',sourceMachineName:'マイジャグラーV',games:5000,bb:20,rb:18,diff:i===1?0:500}));
 await ingestCollectorDay(f.db,{rawRoot:f.rawRoot,channelId:CHANNEL,sourceStoreId:'a',shop:'自分の店',date:'2026-10-07',day:{date:'2026-10-07',machines,quality:{expectedMachineKeys:['1','2']}},rawText:'older',nowIso:'2026-10-09T01:00:00Z'});
 await ingestCollectorDay(f.db,{rawRoot:f.rawRoot,channelId:CHANNEL,sourceStoreId:'a',shop:'自分の店',date:'2026-10-08',day:{date:'2026-10-08',machines},expectedMachineKeys:['1','2','3'],rawText:'fixture',nowIso:'2026-10-09T03:00:00Z'});
 const result=await (await fetch(`${f.base}/api/vps/stores/a/operations`,{headers:f.auth})).json();assert.equal(result.operations.lastAttempt.decision,'quarantined');assert.equal(result.operations.lastCollectedAt,NOW);assert.equal(result.operations.integrity.actualCount,2);
});
test('retry is owner scoped, bounded and coalesces existing jobs',async t=>{
 const f=await fixture(t),url=`${f.base}/api/vps/stores/a/operations/retry`,headers={...f.auth,'content-type':'application/json','x-jugest-operations':'1'};
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,origin:'https://foreign.invalid'},body:JSON.stringify({kind:'evaluation'})})).status,403);
 const first=await fetch(url,{method:'POST',headers,body:JSON.stringify({kind:'evaluation'})});assert.equal(first.status,202);
 const second=await fetch(url,{method:'POST',headers,body:JSON.stringify({kind:'evaluation'})});assert.equal(second.status,429);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM jobs WHERE type='PREDICTION_EVALUATE'").get().n,1);
 assert.equal((await fetch(`${f.base}/api/vps/stores/b/operations/retry`,{method:'POST',headers,body:JSON.stringify({kind:'evaluation'})})).status,403);
});
test('PIA viewer may inspect only PIA operations/performance and cannot retry',async t=>{
 const f=await fixture(t),headers={'x-fixture-role':'pia-viewer'};
 const overview=await (await fetch(`${f.base}/api/vps/operations`,{headers})).json();assert.deepEqual(overview.operations.stores.map(s=>s.id),['pia:35']);
 assert.equal((await fetch(`${f.base}/api/vps/stores/pia:35/performance`,{headers})).status,200);
 assert.equal((await fetch(`${f.base}/api/vps/stores/a/operations`,{headers})).status,403);
 assert.equal((await fetch(`${f.base}/api/vps/stores/pia:35/operations/retry`,{method:'POST',headers:{...headers,'content-type':'application/json','x-jugest-operations':'1'},body:JSON.stringify({kind:'evaluation'})})).status,403);
});
test('an iPhone target with no saved day remains visible as not collected, without leaking its URL or secrets',async t=>{
 const f=await fixture(t);
 await callOwnedCollector({relayDbPath:f.relayDbPath,auth:{channelId:CHANNEL},token:TOKEN,action:'iosCollectorTargetUpsert',url:'https://ana-slo.com/2026-10-08-uncollected-fixture-store-data/',shop:'未取得の自分の店',startDate:'2026-10-08'});
 const response=await fetch(`${f.base}/api/vps/operations`,{headers:f.auth}),body=await response.json();assert.equal(response.status,200);
 const target=body.operations.stores.find(s=>s.name==='未取得の自分の店');assert.ok(target);assert.equal(target.configuredOnly,true);assert.equal(target.state,'not_collected');assert.equal(target.integrity,null);assert.deepEqual(target.canRetry,{});
 assert.equal(body.operations.summary.targetStores,3);assert.doesNotMatch(JSON.stringify(body),/https:\/\/ana-slo|receiverToken|jobToken|collectorKey/);
});
test('a source count without table identities still reports missing machines correctly',async t=>{
 const f=await fixture(t),machines=[1,2].map(i=>({tableNo:String(i),machine:'my',sourceMachineName:'マイジャグラーV',games:5000,bb:20,rb:18,diff:0}));
 await ingestCollectorDay(f.db,{rawRoot:f.rawRoot,channelId:CHANNEL,sourceStoreId:'a',shop:'自分の店',date:'2026-10-07',day:{date:'2026-10-07',machines,quality:{expectedMachineCount:3}},rawText:'fixture-count-only',nowIso:NOW});
 f.db.prepare("DELETE FROM store_days WHERE business_date='2026-10-08'").run();
 const overview=await (await fetch(`${f.base}/api/vps/operations`,{headers:f.auth})).json(),own=overview.operations.stores.find(s=>s.id==='a');assert.equal(own.state,'partial');assert.equal(own.missingMachines,1);assert.equal(own.integrity.expectedCount,3);assert.deepEqual(own.integrity.missingKeys,[]);
 const p=await (await fetch(`${f.base}/api/vps/stores/a/performance`,{headers:f.auth})).json();assert.equal(p.performance.completeness.missingMachines,1);assert.equal(p.performance.completeness.missingRate,1/3);
});
test('Receiver and PIA admin revocation during a delayed request body prevents retry registration',async t=>{
 for(const role of ['receiver','admin']){
  const f=await fixture(t),id=role==='receiver'?'a':'pia:35',headers={...(role==='receiver'?f.auth:{'x-fixture-role':'admin',origin:f.base}),'content-type':'application/json','x-jugest-operations':'1'};
  const before=f.db.prepare('SELECT * FROM prediction_refresh_state').all();
  let request;const response=new Promise((resolve,reject)=>{request=http.request(`${f.base}/api/vps/stores/${id}/operations/retry`,{method:'POST',headers},res=>{res.resume();res.once('end',()=>resolve(res.statusCode))});request.once('error',reject)});
  request.write('{"kind":');
  for(let i=0;i<1000&&!f.lastRequest()?.listenerCount('readable');i++)await new Promise(r=>setImmediate(r));assert.ok(f.lastRequest()?.listenerCount('readable'));
  if(role==='receiver'){const record=await f.relay.get(`channel/${CHANNEL}`,{type:'json'});await f.relay.setJSON(`channel/${CHANNEL}`,{...record,revokedAt:Date.now()})}else f.revokePia();
  request.end('"evaluation"}');assert.equal(await response,401);assert.deepEqual(f.db.prepare('SELECT * FROM prediction_refresh_state').all(),before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM store_operation_retries').get().n,0);
 }
});
