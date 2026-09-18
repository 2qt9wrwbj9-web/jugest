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

const CHANNEL='mcp_channel_test_123';
const TOKEN='mcp-receiver-token-test-1234567890';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-mcp-store-'));
  const root=join(dir,'web'),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  mkdirSync(root,{recursive:true});writeFileSync(join(root,'index.html'),'<title>MCP STORE TEST</title>');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});
  await relay.setJSON('channel/other_channel_123',{version:1,createdAt:1,revokedAt:0,receiverHash:digest('other-secret-token'),senderHash:'sender'});

  const db=openDatabase(canonicalDbPath);migrate(db);
  const now='2026-09-18T10:00:00.000Z';
  const seedStore=(id,name,channel)=>db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,name,canonicalJson({collectorChannelId:channel,source:'ana-slo-ios-relay'}),now,now);
  seedStore('store-a','MCP認証店舗',CHANNEL);seedStore('store-b','他人店舗','other_channel_123');
  db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at) VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a','2026-09-18','fixture','raw-secret','norm',join(rawRoot,'secret.html.gz'),now,now);
  db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('store-a','2026-09-18','101',canonicalJson({machine:'my',tableNo:'101',games:5230,bb:24,rb:18,diff:600}));
  const storeRead={status:'ready',storeId:'store-a',modelFingerprint:'mcp-model-fp',featureVersion:'store-features-v1',asOfDate:'2026-09-17',targetDate:'2026-09-18',machineCount:1,rankings:[{rank:1,machineKey:'101',tableNo:'101',machineName:'my',score:2}]};
  db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-read-active','store-read-v1','2026-09-18',canonicalJson(storeRead),hashCanonical(storeRead),now);
  db.close();

  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot,mcpEnabled:true});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  return{base,async close(){server.closeAllConnections?.();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});}};
}

async function call(base,name,args={},token=null,id=1){
  const headers={'content-type':'application/json','accept':'application/json, text/event-stream'};
  if(token)headers.authorization=`Bearer ${token}`;
  const response=await fetch(`${base}/mcp`,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})});
  return await response.json();
}

test('store tools require receiver authentication but judge discovery remains separate',async()=>{
  const f=await fixture();try{
    const result=await call(f.base,'list_stores');
    assert.equal(result.result.isError,true);
    assert.match(result.result.content[0].text,/authentication_required/);
  }finally{await f.close()}
});

test('Bearer receiver token alone resolves its channel and lists only owned stores',async()=>{
  const f=await fixture();try{
    const result=await call(f.base,'list_stores',{},TOKEN);
    assert.equal(result.result.isError,false);
    const data=result.result.structuredContent;
    assert.deepEqual(data.stores.map(x=>x.id),['store-a']);
    assert.equal(data.stores[0].name,'MCP認証店舗');
    assert.doesNotMatch(JSON.stringify(data),/receiver-token|raw-secret|html\.gz|source_metadata/i);
  }finally{await f.close()}
});

test('MCP can read one stored day and PRE store-read without exposing raw storage details',async()=>{
  const f=await fixture();try{
    const day=(await call(f.base,'get_store_day',{storeId:'store-a',date:'2026-09-18'},TOKEN,2)).result;
    assert.equal(day.isError,false);
    assert.equal(day.structuredContent.day.machines[0].tableNo,'101');
    assert.equal(day.structuredContent.day.machines[0].games,5230);
    assert.doesNotMatch(JSON.stringify(day.structuredContent),/raw-secret|html\.gz/);

    const prediction=(await call(f.base,'get_store_prediction',{storeId:'store-a'},TOKEN,3)).result;
    assert.equal(prediction.isError,false);
    assert.equal(prediction.structuredContent.storeRead.modelFingerprint,'mcp-model-fp');
    assert.equal(prediction.structuredContent.storeRead.rankings[0].tableNo,'101');
    assert.doesNotMatch(JSON.stringify(prediction.structuredContent),/model_json|raw-secret|html\.gz/);
  }finally{await f.close()}
});

test('MCP store authorization rejects cross-channel reads',async()=>{
  const f=await fixture();try{
    const result=(await call(f.base,'get_store_day',{storeId:'store-b',date:'2026-09-18'},TOKEN)).result;
    assert.equal(result.isError,true);
    assert.match(result.content[0].text,/forbidden|store_not_found/);
  }finally{await f.close()}
});
