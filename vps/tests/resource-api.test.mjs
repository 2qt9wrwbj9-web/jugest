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

const CHANNEL='channel_resource_api_123';
const TOKEN='receiver-token-resource-api-1234567890';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-resource-api-'));
  const root=join(dir,'web'),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  mkdirSync(root,{recursive:true});writeFileSync(join(root,'index.html'),'<title>resource api</title>');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});
  const db=openDatabase(canonicalDbPath);migrate(db);db.close();
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});server.listen(0,'127.0.0.1');await once(server,'listening');
  return {base:`http://127.0.0.1:${server.address().port}`,auth:{authorization:`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL},async close(){server.closeAllConnections?.();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}};
}

test('resource endpoint is receiver-authenticated and returns bounded diagnostics',async()=>{
  const f=await fixture();
  try{
    assert.equal((await fetch(`${f.base}/api/vps/system/resources`)).status,401);
    const response=await fetch(`${f.base}/api/vps/system/resources`,{headers:f.auth});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);assert.ok(body.resources?.system);assert.ok(body.resources?.process);assert.ok(body.resources?.analysis);assert.ok(body.resources?.ingest);
    for(const value of [body.resources.system.totalMemoryBytes,body.resources.system.usedMemoryBytes,body.resources.process.rssBytes,body.resources.process.heapUsedBytes])assert.ok(Number.isFinite(value)&&value>=0);
    assert.ok(Array.isArray(body.resources.analysis.recentRuns));assert.ok(Array.isArray(body.resources.ingest.recent));
    assert.doesNotMatch(JSON.stringify(body),/receiver-token-resource-api|senderHash|rawRoot/i);
  }finally{await f.close()}
});

test('resource endpoint remains read-only',async()=>{
  const f=await fixture();
  try{const response=await fetch(`${f.base}/api/vps/system/resources`,{method:'POST',headers:f.auth});assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD')}finally{await f.close()}
});
