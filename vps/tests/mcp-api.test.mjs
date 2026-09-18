import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {canonicalJson,hashCanonical} from '../src/canonical-json.mjs';

const CHANNEL='channel_mcp_test_123';
const TOKEN='receiver-token-mcp-test-1234567890';
const RESOURCE='https://jugest.net/mcp';
const REDIRECT='https://chatgpt.com/connector_platform_oauth_redirect';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const challenge=value=>createHash('sha256').update(String(value)).digest('base64url');
const modernMeta={
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientInfo':{name:'jugest-test-client',version:'1.0.0'},
  'io.modelcontextprotocol/clientCapabilities':{}
};

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-mcp-api-'));
  const root=join(dir,'web'),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  await mkdir(root,{recursive:true});
  writeFileSync(join(root,'index.html'),'<title>JUGEST MCP TEST</title>');
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

  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const legacyAuth={'authorization':`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL};
  const post=async(method,params={},extraHeaders={},authHeaders=legacyAuth)=>{
    const name=method==='tools/call'?String(params?.name||''):'';
    return await fetch(`${base}/mcp`,{
      method:'POST',
      headers:{'content-type':'application/json',...authHeaders,'mcp-protocol-version':'2026-07-28','mcp-method':method,...(name?{'mcp-name':name}:{}),...extraHeaders},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,_meta:params?._meta??modernMeta}})
    });
  };
  return {base,legacyAuth,post,async close(){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}};
}

async function issueOAuthToken(base){
  const registered=await fetch(`${base}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'ChatGPT MCP Test',redirect_uris:[REDIRECT],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
  assert.equal(registered.status,201);
  const client=await registered.json();
  const verifier='m'.repeat(64);
  const params=new URLSearchParams({response_type:'code',client_id:client.client_id,redirect_uri:REDIRECT,scope:'jugest:read',state:'mcp-oauth-state',resource:RESOURCE,code_challenge:challenge(verifier),code_challenge_method:'S256',channel_id:CHANNEL,receiver_token:TOKEN});
  const authorized=await fetch(`${base}/oauth/authorize`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params,redirect:'manual'});
  assert.equal(authorized.status,302);
  const code=new URL(authorized.headers.get('location')).searchParams.get('code');
  const tokenResponse=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code,redirect_uri:REDIRECT,code_verifier:verifier,resource:RESOURCE})});
  assert.equal(tokenResponse.status,200);
  return await tokenResponse.json();
}

test('MCP discovery and tool list are public and every tool advertises jugest:read OAuth',async()=>{
  const f=await fixture();
  try{
    const discover=await f.post('server/discover',{}, {}, {});
    assert.equal(discover.status,200);
    const discovery=await discover.json();
    assert.equal(discovery.result.resultType,'complete');
    assert.deepEqual(discovery.result.supportedVersions,['2026-07-28']);
    assert.deepEqual(discovery.result.capabilities,{tools:{}});
    assert.equal(discovery.result._meta['io.modelcontextprotocol/serverInfo'].name,'jugest');
    assert.match(discovery.result.instructions,/setting judgement.*observed|observed.*setting judgement/i);
    assert.equal(discovery.result.cacheScope,'private');

    const listed=await f.post('tools/list',{}, {}, {});
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
      assert.deepEqual(tool.securitySchemes,[{type:'oauth2',scopes:['jugest:read']}]);
      assert.deepEqual(tool._meta.securitySchemes,[{type:'oauth2',scopes:['jugest:read']}]);
    }
    const judge=body.result.tools[0];
    assert.match(judge.description,/observed|current machine/i);
    assert.doesNotMatch(judge.description,/automatically.*PRE|mix.*PRE/i);
  }finally{await f.close()}
});

test('unauthenticated MCP tool call returns the OAuth resource challenge in tool metadata',async()=>{
  const f=await fixture();
  try{
    const response=await f.post('tools/call',{name:'judge_machines',arguments:{machines:[{machine:'my',games:1000,bb:4,rb:3}]}}, {}, {});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.result.isError,true);
    const challengeHeader=body.result._meta['mcp/www_authenticate'];
    assert.equal(Array.isArray(challengeHeader),true);
    assert.equal(challengeHeader.length,1);
    assert.match(challengeHeader[0],/Bearer/i);
    assert.match(challengeHeader[0],/oauth-protected-resource/);
    assert.match(challengeHeader[0],/error="invalid_token"/);
    assert.match(challengeHeader[0],/error_description=/);
  }finally{await f.close()}
});

test('OAuth bearer can call judge_machines without a Collector channel header',async()=>{
  const f=await fixture();
  try{
    const token=await issueOAuthToken(f.base);
    const response=await f.post('tools/call',{name:'judge_machines',arguments:{machines:[
      {tableNo:'101',machine:'my',games:5230,bb:24,rb:18,diff:1200},
      {tableNo:'102',machine:'im',games:4100,bb:17,rb:14}
    ]}}, {}, {authorization:`Bearer ${token.access_token}`});
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

test('OAuth store tools inherit the proven Collector channel and keep PRE separate',async()=>{
  const f=await fixture();
  try{
    const token=await issueOAuthToken(f.base),oauth={authorization:`Bearer ${token.access_token}`};
    const stores=await (await f.post('tools/call',{name:'list_stores',arguments:{}}, {}, oauth)).json();
    assert.deepEqual(stores.result.structuredContent.stores.map(store=>store.id),['store-a']);

    const days=await (await f.post('tools/call',{name:'get_store_days',arguments:{storeId:'store-a',limit:30}}, {}, oauth)).json();
    assert.deepEqual(days.result.structuredContent.days.map(day=>day.date),['2026-09-18']);

    const day=await (await f.post('tools/call',{name:'get_store_day',arguments:{storeId:'store-a',date:'2026-09-18'}}, {}, oauth)).json();
    assert.equal(day.result.structuredContent.day.machines[0].tableNo,'101');
    assert.doesNotMatch(JSON.stringify(day),/raw-secret|html\.gz/);

    const prediction=await (await f.post('tools/call',{name:'get_store_prediction',arguments:{storeId:'store-a'}}, {}, oauth)).json();
    assert.equal(prediction.result.structuredContent.storeRead.targetDate,'2026-09-19');
    assert.equal(prediction.result.structuredContent.storeRead.rankings[0].tableNo,'101');

    const forbidden=await (await f.post('tools/call',{name:'get_store_prediction',arguments:{storeId:'store-b'}}, {}, oauth)).json();
    assert.equal(forbidden.result.isError,true);
    assert.match(forbidden.result.content[0].text,/forbidden/i);
  }finally{await f.close()}
});

test('legacy Collector receiver credentials continue to authorize MCP tool calls',async()=>{
  const f=await fixture();
  try{
    const response=await f.post('tools/call',{name:'list_stores',arguments:{}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(body.result.structuredContent.stores.map(store=>store.id),['store-a']);
  }finally{await f.close()}
});

test('MCP validates modern routing headers and rejects untrusted browser origins',async()=>{
  const f=await fixture();
  try{
    const mismatch=await f.post('tools/list',{}, {'mcp-method':'tools/call'}, {});
    assert.equal(mismatch.status,400);
    const mismatchBody=await mismatch.json();
    assert.equal(mismatchBody.error.code,-32600);

    const origin=await f.post('server/discover',{}, {origin:'https://evil.example'}, {});
    assert.equal(origin.status,403);
  }finally{await f.close()}
});

test('MCP keeps a legacy initialize/tools path for client fallback without requiring login for discovery',async()=>{
  const f=await fixture();
  try{
    const initialize=await fetch(`${f.base}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'legacy-test',version:'1'}}})});
    assert.equal(initialize.status,200);
    const init=await initialize.json();
    assert.equal(init.result.protocolVersion,'2025-11-25');
    assert.deepEqual(init.result.capabilities,{tools:{}});
    assert.equal(init.result.serverInfo.name,'jugest');

    const list=await fetch(`${f.base}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:8,method:'tools/list',params:{}})});
    assert.equal(list.status,200);
    const body=await list.json();
    assert.equal(Array.isArray(body.result.tools),true);
    assert.equal('resultType' in body.result,false);
  }finally{await f.close()}
});
