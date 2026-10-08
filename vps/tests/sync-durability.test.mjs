import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import * as sync from '../../api/_sync-web.js';
import {createRelayStore} from '../src/relay-store.mjs';
import {createWebServer} from '../src/web-server.mjs';

const payload=ct=>({v:1,zip:'none',iv:'abcdefghijklmnop',ct});
async function fixture(t,wrap=s=>s){
  const dir=await mkdtemp(join(tmpdir(),'jugest-sync-durable-')),dbPath=join(dir,'relay.sqlite');
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=createRelayStore('juggler-device-sync-v1',{dbPath});
  assert.equal(typeof sync.createSyncRuntime,'function','sync runtime must use injected real SQLite storage');
  const runtime=sync.createSyncRuntime({createStore:()=>wrap(store)});
  const call=async body=>{const response=await runtime.default(new Request('http://localhost/api/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()}};
  const {body:auth}=await call({action:'create'});return{store,auth,call,dir,dbPath};
}
test('VPS exposes the same encrypted sync protocol on its SQLite save path',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'jugest-vps-sync-'));t.after(()=>rm(dir,{recursive:true,force:true}));await writeFile(join(dir,'index.html'),'<title>test</title>');
  const server=createWebServer({rootDir:dir,relayDbPath:join(dir,'relay.sqlite')});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/sync`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create'})});
  assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
});
test('two concurrent SQLite sync writers cannot both own one revision',async t=>{
  const f=await fixture(t),out=await Promise.all(['AAAA','BBBB'].map(ct=>f.call({...f.auth,action:'push',baseRevision:0,payload:payload(ct)})));
  assert.deepEqual(out.map(x=>x.status).sort(),[200,409]);
  assert.equal((await f.call({...f.auth,action:'pull'})).body.revision,1);
});
test('recovery returns the latest committed revision beyond the old 64-record limit',async t=>{
  const f=await fixture(t),headKey=`sync/${f.auth.syncId}`,zero=await f.store.get(headKey,{type:'json'});
  for(let revision=1;revision<=70;revision++)await f.store.setJSON(`sync-commit/${f.auth.syncId}/${String(revision).padStart(12,'0')}`,{...zero,revision,payload:payload('A'.repeat(revision))},{onlyIfNew:true});
  const out=await f.call({...f.auth,action:'pull'});assert.equal(out.status,200);assert.equal(out.body.revision,70);
});
test('corrupt committed JSON is a storage error instead of an empty successful pull',async t=>{
  const f=await fixture(t);await f.store.set(`sync-commit/${f.auth.syncId}/000000000001`,'broken-json');
  const out=await f.call({...f.auth,action:'pull'});assert.equal(out.status,500);assert.equal(out.body.ok,false);
});
test('delayed head update uses a precondition and cannot roll a newer revision back',async t=>{
  let release,entered;const started=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);let pause=true;
  const f=await fixture(t,s=>({...s,setJSON:async(key,value,options)=>{if(pause&&key.startsWith('sync/')&&value.revision===1){pause=false;entered();await blocked}return s.setJSON(key,value,options)}}));
  const first=f.call({...f.auth,action:'push',baseRevision:0,payload:payload('AAAA')});await started;
  // Recover commit 1 and write commit 2 while commit 1's cache update is paused.
  await f.call({...f.auth,action:'pull'});const second=await f.call({...f.auth,action:'push',baseRevision:1,payload:payload('BBBB')});assert.equal(second.status,200);
  release();await first;assert.equal((await f.store.get(`sync/${f.auth.syncId}`,{type:'json'})).revision,2);
});
test('failed head save reports error and a fresh runtime recovers the durable commit',async t=>{
  let failing=true;
  const f=await fixture(t,s=>({...s,setJSON:async(key,value,options)=>{if(failing&&key.startsWith('sync/')&&value.revision===1){failing=false;throw new Error('disk full')}return s.setJSON(key,value,options)}}));
  assert.equal((await f.call({...f.auth,action:'push',baseRevision:0,payload:payload('AAAA')})).status,500);
  const recovered=await f.call({...f.auth,action:'pull'});assert.equal(recovered.status,200);assert.equal(recovered.body.payload.ct,'AAAA');
});
