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

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const CHANNEL='channel_judge_api_123';
const TOKEN='receiver-token-judge-api-1234567890';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const close=(actual,expected,eps=1e-11)=>assert.ok(Math.abs(actual-expected)<=eps,`expected ${expected}, got ${actual}`);

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-judge-api-'));
  const relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});
  const db=openDatabase(canonicalDbPath);migrate(db);db.close();
  const server=createWebServer({rootDir:ROOT,relayDbPath,canonicalDbPath,rawRoot});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const auth={'authorization':`Bearer ${TOKEN}`,'x-jugest-channel-id':CHANNEL,'content-type':'application/json'};
  return {base,auth,async close(){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}};
}

test('judge API requires the existing Collector receiver credentials',async()=>{
  const f=await fixture();
  try{
    const response=await fetch(`${f.base}/api/vps/judge/machines`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({machines:[]})});
    assert.equal(response.status,401);
  }finally{await f.close()}
});

test('judge API returns browser-parity results without store/PRE context',async()=>{
  const f=await fixture();
  try{
    const response=await fetch(`${f.base}/api/vps/judge/machines`,{
      method:'POST',headers:f.auth,
      body:JSON.stringify({machines:[
        {tableNo:'101',machine:'my',games:5230,bb:24,rb:18,diff:1200},
        {tableNo:'102',machine:'im',games:4100,bb:17,rb:14}
      ]})
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.judgeVersion,'external-juggler-browser-parity-v1');
    assert.equal(body.machines.length,2);
    assert.equal(body.machines[0].tableNo,'101');
    assert.equal(body.machines[0].method,'reverse-diff');
    close(body.machines[0].expectedSetting,3.6317261654375623);
    close(body.machines[0].p4,0.5703360940719412);
    assert.equal(body.machines[1].tableNo,'102');
    assert.equal(body.machines[1].method,'bonus-only');
    close(body.machines[1].expectedSetting,3.9483796073793527);
    assert.equal('storeRead' in body,false);
    assert.equal('pre' in body,false);
    assert.equal('store' in body,false);
  }finally{await f.close()}
});

test('judge API validates request shape and returns row-local OCR/input errors',async()=>{
  const f=await fixture();
  try{
    const badShape=await fetch(`${f.base}/api/vps/judge/machines`,{method:'POST',headers:f.auth,body:JSON.stringify({machines:'nope'})});
    assert.equal(badShape.status,400);
    assert.equal((await badShape.json()).code,'bad_machines');

    const response=await fetch(`${f.base}/api/vps/judge/machines`,{method:'POST',headers:f.auth,body:JSON.stringify({machines:[
      {tableNo:'1',machine:'unknown',games:5000,bb:20,rb:20},
      {tableNo:'2',machine:'my',games:100,bb:80,rb:30},
      {tableNo:'3',machine:'my',games:5000,bb:20,rb:20,diff:'not-number'},
      {tableNo:'4',machine:'my',games:5000,bb:20,rb:20}
    ]})});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.machines[0].ok,false);assert.equal(body.machines[0].code,'unsupported_machine');
    assert.equal(body.machines[1].ok,false);assert.equal(body.machines[1].code,'bonus_exceeds_games');
    assert.equal(body.machines[2].ok,false);assert.equal(body.machines[2].code,'bad_diff');
    assert.equal(body.machines[3].ok,true);assert.equal(body.machines[3].method,'bonus-only');
  }finally{await f.close()}
});

test('judge API caps batch size and does not make other analytics routes writable',async()=>{
  const f=await fixture();
  try{
    const tooMany=Array.from({length:201},(_,i)=>({tableNo:String(i+1),machine:'my',games:1000,bb:3,rb:2}));
    const response=await fetch(`${f.base}/api/vps/judge/machines`,{method:'POST',headers:f.auth,body:JSON.stringify({machines:tooMany})});
    assert.equal(response.status,413);
    assert.equal((await response.json()).code,'batch_too_large');

    const storesPost=await fetch(`${f.base}/api/vps/stores`,{method:'POST',headers:f.auth,body:'{}'});
    assert.equal(storesPost.status,405);
    assert.equal(storesPost.headers.get('allow'),'GET, HEAD');
  }finally{await f.close()}
});
