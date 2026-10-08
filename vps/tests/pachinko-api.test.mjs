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
import {importPachinkoSnapshot,getPachinkoMatrix,getPachinkoYutimeRanking,pachinkoPreviousJstDate} from '../src/pachinko/store.mjs';

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
async function serve(t,{dbPath,auth=()=>({kind:'pia-viewer'}),receiver=async()=>null,accessOptions={},clock=()=>new Date()}={}){
  const handler=createPachinkoHandler({dbPath,authenticatePia:auth,authorizeReceiver:receiver,accessOptions,clock});const server=http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(e=>{res.statusCode=500;res.end(String(e))}));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r))});return `http://127.0.0.1:${server.address().port}`;
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


test('previous JST calendar day is the only eligible ranking date, including midnight boundaries',()=>{
  assert.equal(pachinkoPreviousJstDate(new Date('2026-10-07T14:59:59Z')),'2026-10-06');
  assert.equal(pachinkoPreviousJstDate(new Date('2026-10-07T15:00:00Z')),'2026-10-07');
  assert.equal(pachinkoPreviousJstDate(new Date('2026-10-08T00:00:00Z')),'2026-10-07');
  assert.throws(()=>pachinkoPreviousJstDate(new Date(NaN)),/invalid_pachinko_clock/);
});

test('yutime ranking reads only safely dated previous-day sea records, sorted by final_start (not total start)',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-yutime-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const dbPath=path.join(dir,'p.sqlite');await seed(dbPath);
  const now=new Date('2026-10-07T12:00:00Z'); // 21:00 JST; previous day is 2026-10-06
  const db=openPachinkoDatabase(dbPath,{readOnly:true});
  const actual=getPachinkoYutimeRanking(db,{now});
  assert.equal(actual.business_date,'2026-10-06');
  assert.ok(actual.available);assert.ok(actual.machine_count>0);
  assert.ok(actual.rows.every(row=>row.date_status==='derived'||row.date_status==='verified'));
  assert.ok(actual.rows.every(row=>Number.isSafeInteger(row.final_start)&&row.final_start>=0));
  assert.ok(actual.rows.every(row=>Number.isSafeInteger(Number(row.machine_no))));
  assert.deepEqual(actual.rows.map(row=>row.rank),actual.rows.map((_,i)=>i+1));
  for(let i=1;i<actual.rows.length;i++)assert.ok(actual.rows[i-1].final_start>=actual.rows[i].final_start);
  for(const row of actual.rows){
    const expected=db.prepare('SELECT r.final_start,r.start FROM p_machine_days d JOIN p_records r ON r.id=d.record_id WHERE d.business_date=? AND d.machine_no=? AND d.machine_model_key=?').get(actual.business_date,row.machine_no,'OUMI5_SPECIAL_ALTA');
    assert.equal(row.final_start,expected.final_start);assert.equal(row.start,expected.start);
  }
  const stale=getPachinkoYutimeRanking(db,{now:new Date('2026-10-08T12:00:00Z')});
  assert.equal(stale.business_date,'2026-10-07');assert.equal(stale.available,false);
  assert.equal(stale.latest_available_date,'2026-10-06');
  assert.deepEqual(stale.rows,[]);db.close();
  const base=await serve(t,{dbPath,clock:()=>now});
  const rsp=await fetch(`${base}/api/pachinko/stores/pia%3A35-p/yutime`);
  assert.equal(rsp.status,200);
  const payload=await rsp.json();assert.equal(payload.ok,true);assert.equal(payload.business_date,'2026-10-06');
  assert.deepEqual(payload.rows,actual.rows);assert.doesNotMatch(JSON.stringify(payload),/raw_json|raw_payload_gzip|receiverToken/);
  const head=await fetch(`${base}/api/pachinko/stores/pia%3A35-p/yutime`,{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await fetch(`${base}/api/pachinko/stores/bogus/yutime`)).status,404);
  const unauthorized=await serve(t,{dbPath,auth:()=>null,receiver:async()=>null});
  assert.equal((await fetch(`${unauthorized}/api/pachinko/stores/pia%3A35-p/yutime`)).status,401);
});
