import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createPachinkoHandler} from '../src/pachinko/handler.mjs';
import {openPachinkoDatabase,migratePachinko} from '../src/pachinko/schema.mjs';
import {importPachinkoSnapshot,getPachinkoMatrix} from '../src/pachinko/store.mjs';

async function raw(name){return gunzipSync(await readFile(new URL(`./fixtures/pachinko/${name}`,import.meta.url))).toString('utf8')}
async function seed(dbPath){
  const db=openPachinkoDatabase(dbPath);migratePachinko(db);
  for(const [name,provenance] of [
    ['2026-10-05-ranking.json.gz',{source:'fixture',historical:true,observed_at_unknown:true}],
    ['2026-10-06-ranking.json.gz',{source:'fixture-csv',scopeModelKeys:['OUMI5_SPECIAL_ALTA'],observed_at_unknown:true}],
    ['2026-10-07-ranking.json.gz',{source:'fixture',historical:true}]
  ]){const text=await raw(name);importPachinkoSnapshot(db,{payload:JSON.parse(text),rawText:text,provenance})}
  const matrix=getPachinkoMatrix(db,{limit:2});db.close();return matrix;
}
async function serve(t,{dbPath,auth=()=>({kind:'pia-viewer'}),receiver=async()=>null,accessOptions={}}={}){
  const handler=createPachinkoHandler({dbPath,authenticatePia:auth,authorizeReceiver:receiver,accessOptions});const server=http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(e=>{res.statusCode=500;res.end(String(e))}));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r))});return `http://127.0.0.1:${server.address().port}`;
}

test('read-only pachinko API exposes only one PIA-P store, matrix and detail',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-api-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=path.join(dir,'p.sqlite');const seeded=await seed(dbPath);const base=await serve(t,{dbPath});
  const stores=await (await fetch(`${base}/api/pachinko/stores`)).json();assert.equal(stores.ok,true);assert.deepEqual(stores.stores.map(s=>s.id),['pia:35-p']);assert.equal(stores.stores[0].models.length,3);assert.doesNotMatch(JSON.stringify(stores),/raw_payload_gzip|raw_json/);
  const response=await fetch(`${base}/api/pachinko/stores/pia%3A35-p/matrix?limit=2`);assert.equal(response.status,200);const matrix=await response.json();assert.deepEqual(matrix.dates,['2026-10-06','2026-10-05']);assert.equal(matrix.models.length,3);assert.equal(matrix.summaries[0].models.find(x=>x.machine_model_key==='OUMI5_SPECIAL_ALTA').pooled_k,20.294776119402986);
  const recordId=seeded.records[0].record_id;const detail=await (await fetch(`${base}/api/pachinko/stores/pia%3A35-p/records/${recordId}`)).json();assert.equal(detail.ok,true);assert.equal(detail.record.record_id,recordId);assert.equal(typeof detail.record.raw,'object');assert.ok(Array.isArray(detail.record.snapshots));
});

test('matrix validates model, limit, store and record id; only GET/HEAD are allowed',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-api-validation-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=path.join(dir,'p.sqlite');await seed(dbPath);const base=await serve(t,{dbPath});
  assert.equal((await fetch(`${base}/api/pachinko/stores/nope/matrix`)).status,404);
  assert.equal((await fetch(`${base}/api/pachinko/stores/pia%3A35-p/matrix?model=REZERO`)).status,400);
  assert.equal((await fetch(`${base}/api/pachinko/stores/pia%3A35-p/matrix?limit=31`)).status,400);
  assert.equal((await fetch(`${base}/api/pachinko/stores/pia%3A35-p/records/abc`)).status,400);
  const head=await fetch(`${base}/api/pachinko/stores`,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const post=await fetch(`${base}/api/pachinko/stores`,{method:'POST'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
});

test('authorization is checked on every request and unrelated receiver is forbidden',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-api-auth-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=path.join(dir,'p.sqlite');await seed(dbPath);let valid=true;
  const base=await serve(t,{dbPath,auth:()=>valid?{kind:'pia-viewer'}:null,receiver:async()=>null});assert.equal((await fetch(`${base}/api/pachinko/stores`)).status,200);valid=false;assert.equal((await fetch(`${base}/api/pachinko/stores`)).status,401);
  const forbidden=await serve(t,{dbPath,auth:()=>null,receiver:async()=>({channelId:'definitely-not-owner-channel'}),accessOptions:{piaAccessMode:'owner',piaOwnerChannelIds:'known-owner-channel'}});assert.equal((await fetch(`${forbidden}/api/pachinko/stores`)).status,403);
});


test('authorized PIA owner Receiver can use the read-only API without an access cookie',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-api-owner-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=path.join(dir,'p.sqlite');await seed(dbPath);
  const base=await serve(t,{dbPath,auth:()=>null,receiver:async()=>({channelId:'owner_channel_12345'}),accessOptions:{piaAccessMode:'owner',piaOwnerChannelIds:'owner_channel_12345'}});const response=await fetch(`${base}/api/pachinko/stores`);assert.equal(response.status,200);const body=await response.json();assert.equal(body.stores[0].id,'pia:35-p');
});

test('missing independent DB returns preparation-required and is not created by API',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-api-missing-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=path.join(dir,'missing.sqlite');const base=await serve(t,{dbPath});const response=await fetch(`${base}/api/pachinko/stores`);assert.equal(response.status,503);assert.equal((await response.json()).code,'pachinko_preparation_required');await assert.rejects(()=>readFile(dbPath));
});
