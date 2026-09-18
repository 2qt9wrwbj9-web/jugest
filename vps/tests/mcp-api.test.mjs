import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {canonicalJson,hashCanonical} from '../src/canonical-json.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CHANNEL='channel_mcp_test_123';
const TOKEN='receiver-token-mcp-test-1234567890';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const modernMeta={
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientInfo':{name:'jugest-test-client',version:'1.0.0'},
  'io.modelcontextprotocol/clientCapabilities':{}
};

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-mcp-api-'));
  const relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});

  const db=openDatabase(canonicalDbPath);migrate(db);
  const now='2026-09-19T00:00:00.000Z';
  const seedStore=(id,name,channel)=>db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,name,canonicalJson({collectorChannelId:channel,source:'fixture'}),now,now);
  seedStore('store-a','認証店舗',CHANNEL);
  seedStore('store-b','他人店舗','another-channel');
  db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
    VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a','2026-09-18','fixture','raw-secret','norm-secret',join(rawRoot,'2026-09-18.html.gz'),now,now);
  db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('store-a','2026-09-18','000101',canonicalJson({machine:'my',tableNo:'101',games:5230,bb:24,rb:18,diff:1200}));
  const storeRead={status:'ready',storeId:'store-a',modelFingerprint:'research-model-fp',featureVersion:'store-features-v1',asOfDate:'2026-09-18',targetDate:'2026-09-19',machineCount:1,rankings:[{rank:1,machineKey:'101',tableNo:'101',machineName:'my',score:2}]};
  db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-read-active','store-read-v1','2026-09-19',canonicalJson(storeRead),hashCanonical(storeRead),now);
  db.close();

  const server=createWebServer({rootDir:ROOT,relayDbPath,canonicalDbPath,rawRoot});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const auth={'authorization':`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL,'content-type':'application/json'};
  const post=async(method,params={},extraHeaders={})=>{
    const name=method==='tools/call'?String(params?.name||''):'';
    return await fetch(`${base}/mcp`,{
      method:'POST',
      headers:{...auth,'mcp-protocol-version':'2026-07-28','mcp-method':method,...(name?{'mcp-name':name}:{}),...extraHeaders},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:params?._meta??modernMeta}})
    });
  };
  return {base,auth,post,async close(){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}};
}

test('MCP requires the existing JUGEST receiver credentials',async()=>{
  const f=await fixture();
  try{
    const response=await fetch(`${f.base}/mcp`,{method:'POST',headers:{'content-type':'application/json','mcp-protocol-version':'2026-07-28','mcp-method':'server/discover'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:modernMeta}})});
    assert.equal(response.status,401);
  }finally{await f.close()}
});

test('MCP modern discovery and deterministic read-only tool list are exposed',async()=>{
  const f=await fixture();
  try{
    const discover=await f.post('server/discover');
    assert.equal(discover.status,200);
    const discovery=await discover.json();
    assert.equal(discovery.result.resultType,'complete');
    assert.deepEqual(discovery.result.supportedVersions,['2026-07-28']);
    assert.deepEqual(discovery.result.capabilities,{tools:{}});
    assert.equal(discovery.result._meta['io.modelcontextprotocol/serverInfo'].name,'jugest');
    assert.match(discovery.result.instructions,/setting judgement.*observed|observed.*setting judgement/i);
    assert.equal(discovery.result.cacheScope,'private');

    const listed=await f.post('tools/list');
    assert.equal(listed.status,200);
    const body=await listed.json();
    assert.equal(body.result.resultType,'complete');
    assert.equal(body.result.cacheScope,'private');
    assert.deepEqual(body.result.tools.map(tool=>tool.name),[
      'judge_machines','list_stores','get_store_days','get_store_day','get_store_prediction','get_store_comparison'
    ]);
    for(const tool of body.result.tools){
      assert.equal(tool.annotations.readOnlyHint,true);
      assert.equal(tool.annotations.openWorldHint,false);
    }
    const judge=body.result.tools[0];
    assert.match(judge.description,/observed|current machine/i);
    assert.doesNotMatch(judge.description,/automatically.*PRE|mix.*PRE/i);
  }finally{await f.close()}
});

test('MCP judge_machines uses current machine data only and preserves JUGEST parity',async()=>{
  const f=await fixture();
  try{
    const response=await f.post('tools/call',{name:'judge_machines',arguments:{machines:[
      {tableNo:'101',machine:'my',games:5230,bb:24,rb:18,diff:1200},
      {tableNo:'102',machine:'im',games:4100,bb:17,rb:14}
    ]}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.result.resultType,'complete');
    assert.equal(body.result.isError,false);
    const output=body.result.structuredContent;
    assert.equal(output.judgeVersion,'external-juggler-browser-parity-v1');
    assert.equal(output.machines.length,2);
    assert.equal(output.machines[0].method,'reverse-diff');
    assert.ok(Math.abs(output.machines[0].expectedSetting-3.6317261654375623)<1e-11);
    assert.equal(output.machines[1].method,'bonus-only');
    assert.equal('pre' in output,false);
    assert.equal('storeRead' in output,false);
    assert.equal('store' in output,false);
  }finally{await f.close()}
});

test('MCP store tools are scoped to the authenticated Collector channel and keep PRE separate',async()=>{
  const f=await fixture();
  try{
    const stores=await (await f.post('tools/call',{name:'list_stores',arguments:{}})).json();
    assert.deepEqual(stores.result.structuredContent.stores.map(store=>store.id),['store-a']);

    const days=await (await f.post('tools/call',{name:'get_store_days',arguments:{storeId:'store-a',limit:30}})).json();
    assert.deepEqual(days.result.structuredContent.days.map(day=>day.date),['2026-09-18']);

    const day=await (await f.post('tools/call',{name:'get_store_day',arguments:{storeId:'store-a',date:'2026-09-18'}})).json();
    assert.equal(day.result.structuredContent.day.machines[0].tableNo,'101');
    assert.doesNotMatch(JSON.stringify(day),/raw-secret|html\.gz/);

    const prediction=await (await f.post('tools/call',{name:'get_store_prediction',arguments:{storeId:'store-a'}})).json();
    assert.equal(prediction.result.structuredContent.storeRead.targetDate,'2026-09-19');
    assert.equal(prediction.result.structuredContent.storeRead.rankings[0].tableNo,'101');

    const forbidden=await (await f.post('tools/call',{name:'get_store_prediction',arguments:{storeId:'store-b'}})).json();
    assert.equal(forbidden.result.isError,true);
    assert.match(forbidden.result.content[0].text,/forbidden/i);
  }finally{await f.close()}
});

test('MCP validates modern routing headers and rejects untrusted browser origins',async()=>{
  const f=await fixture();
  try{
    const mismatch=await f.post('tools/list',{}, {'mcp-method':'tools/call'});
    assert.equal(mismatch.status,400);
    const mismatchBody=await mismatch.json();
    assert.equal(mismatchBody.error.code,-32600);

    const origin=await f.post('server/discover',{}, {origin:'https://evil.example'});
    assert.equal(origin.status,403);
  }finally{await f.close()}
});

test('MCP keeps a legacy initialize/tools path for client fallback',async()=>{
  const f=await fixture();
  try{
    const initialize=await fetch(`${f.base}/mcp`,{method:'POST',headers:f.auth,body:JSON.stringify({jsonrpc:'2.0',id:7,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'legacy-test',version:'1'}}})});
    assert.equal(initialize.status,200);
    const init=await initialize.json();
    assert.equal(init.result.protocolVersion,'2025-11-25');
    assert.deepEqual(init.result.capabilities,{tools:{}});
    assert.equal(init.result.serverInfo.name,'jugest');

    const list=await fetch(`${f.base}/mcp`,{method:'POST',headers:f.auth,body:JSON.stringify({jsonrpc:'2.0',id:8,method:'tools/list',params:{}})});
    assert.equal(list.status,200);
    const body=await list.json();
    assert.equal(Array.isArray(body.result.tools),true);
    assert.equal('resultType' in body.result,false);
  }finally{await f.close()}
});
