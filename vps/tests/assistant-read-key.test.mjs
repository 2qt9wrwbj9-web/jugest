import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {canonicalJson,hashCanonical} from '../src/canonical-json.mjs';

const CHANNEL='channel_assistant_read_123';
const RECEIVER='receiver-token-assistant-read-1234567890';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-assistant-read-'));
  const root=join(dir,'web'),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  mkdirSync(root,{recursive:true});writeFileSync(join(root,'index.html'),'<title>assistant read</title>');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(RECEIVER),senderHash:'sender'});
  const db=openDatabase(canonicalDbPath);migrate(db);const now='2026-09-22T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('store-a','テスト店',canonicalJson({collectorChannelId:CHANNEL,source:'ana-slo-ios-relay'}),now,now);
  db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at) VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a','2026-09-21','fixture','raw','norm',join(rawRoot,'day.json.gz'),now,now);
  db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('store-a','2026-09-21','000000',canonicalJson({machine:'my',tableNo:'101',games:5000,bb:20,rb:18,diff:100}));
  const storeRead={status:'ready',storeId:'store-a',modelFingerprint:'fp',featureVersion:'store-features-v1',asOfDate:'2026-09-21',targetDate:'2026-09-22',machineCount:1,rankings:[{rank:1,machineKey:'101',tableNo:'101',score:2}]};
  db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-read-active','store-read-v1','2026-09-22',canonicalJson(storeRead),hashCanonical(storeRead),now);
  db.close();
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const receiverHeaders={authorization:`Bearer ${RECEIVER}`,'x-jugest-channel-id':CHANNEL};
  return {base,receiverHeaders,async close(){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}};
}

async function issue(f){
  const response=await fetch(`${f.base}/api/vps/assistant-key`,{method:'POST',headers:f.receiverHeaders});
  assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.ok,true);assert.match(body.key,/^jugest_read_[A-Za-z0-9_-]{30,}$/);return body.key;
}
test('assistant read key management requires receiver auth and never re-displays plaintext',async()=>{
  const f=await fixture();try{
    assert.equal((await fetch(`${f.base}/api/vps/assistant-key`,{method:'POST'})).status,401);
    const key=await issue(f);
    const statusResponse=await fetch(`${f.base}/api/vps/assistant-key`,{headers:f.receiverHeaders});
    assert.equal(statusResponse.status,200);const status=await statusResponse.json();
    assert.equal(status.active,true);assert.equal('key' in status,false);assert.doesNotMatch(JSON.stringify(status),new RegExp(key));
  }finally{await f.close()}
});

test('assistant read key can read only the intended saved-store routes',async()=>{
  const f=await fixture();try{
    const key=await issue(f),auth={authorization:`Bearer ${key}`};
    const stores=await fetch(`${f.base}/api/vps/stores`,{headers:auth});assert.equal(stores.status,200);
    assert.deepEqual((await stores.json()).stores.map(row=>row.id),['store-a']);
    assert.equal((await fetch(`${f.base}/api/vps/stores/store-a/days`,{headers:auth})).status,200);
    assert.equal((await fetch(`${f.base}/api/vps/stores/store-a/days/2026-09-21`,{headers:auth})).status,200);
    assert.equal((await fetch(`${f.base}/api/vps/stores/store-a/research/store-read`,{headers:auth})).status,200);
    assert.equal((await fetch(`${f.base}/api/vps/stores/store-a/research/comparison`,{headers:auth})).status,200);
    assert.equal((await fetch(`${f.base}/api/vps/stores/store-a/analysis/default`,{headers:auth})).status,403);
    assert.equal((await fetch(`${f.base}/api/vps/judge/machines`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:'{"machines":[]}'})).status,403);
  }finally{await f.close()}
});
test('rotating and revoking assistant read key immediately invalidates old credentials',async()=>{
  const f=await fixture();try{
    const first=await issue(f),second=await issue(f);assert.notEqual(first,second);
    assert.equal((await fetch(`${f.base}/api/vps/stores`,{headers:{authorization:`Bearer ${first}`}})).status,401);
    assert.equal((await fetch(`${f.base}/api/vps/stores`,{headers:{authorization:`Bearer ${second}`}})).status,200);
    const revoked=await fetch(`${f.base}/api/vps/assistant-key`,{method:'DELETE',headers:f.receiverHeaders});
    assert.equal(revoked.status,200);assert.equal((await revoked.json()).active,false);
    assert.equal((await fetch(`${f.base}/api/vps/stores`,{headers:{authorization:`Bearer ${second}`}})).status,401);
  }finally{await f.close()}
});
