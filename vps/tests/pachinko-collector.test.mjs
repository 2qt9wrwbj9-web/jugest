import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {openPachinkoDatabase,migratePachinko} from '../src/pachinko/schema.mjs';
import {fetchPachinkoSnapshot,collectPachinkoOnce,runPachinkoCollectorTick,shouldAttemptPachinkoCollection,startPachinkoCollectorScheduler,jstPachinkoClock} from '../src/pachinko/collector.mjs';
import {importPachinkoSnapshot} from '../src/pachinko/store.mjs';
import {identifyPachinkoModel} from '../src/pachinko/models.mjs';
import {readPachinkoConfig} from '../src/pachinko/config.mjs';
import {runWebServer} from '../src/web-main.mjs';

async function latest(){const text=gunzipSync(await readFile(new URL('./fixtures/pachinko/2026-10-07-ranking.json.gz',import.meta.url))).toString('utf8');return {text,payload:JSON.parse(text)}}
function response(text,{status=200}={}){return {ok:status>=200&&status<300,status,async text(){return text}}}

test('public collector sends one complete P request, archives exact HTTP-success bytes and validates target models',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-collector-'));t.after(()=>rm(dir,{recursive:true,force:true}));const f=await latest();let call;
  const got=await fetchPachinkoSnapshot({archiveRoot:path.join(dir,'raw'),observedAt:'2026-10-07T14:43:44.000Z',fetchImpl:async(url,opts)=>{call={url,opts};return response(f.text)}});
  assert.equal(call.url,'https://piagroupapp.com/api/stores/getRankingTop');assert.equal(call.opts.method,'POST');assert.equal(String(call.opts.body),'machine_type=P&store_id=35&limit=20000');assert.equal(got.meta.modelCounts.length,3);assert.equal(got.rawText,f.text);
  const files=await import('node:fs/promises').then(fs=>fs.readdir(path.join(dir,'raw','2026-10-07')));assert.ok(files.some(x=>x.endsWith('.json.gz')));const gz=files.find(x=>x.endsWith('.json.gz'));assert.equal(gunzipSync(await readFile(path.join(dir,'raw','2026-10-07',gz))).toString('utf8'),f.text);
});

test('HTTP-success malformed response is archived before validation failure',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-bad-'));t.after(()=>rm(dir,{recursive:true,force:true}));await assert.rejects(()=>fetchPachinkoSnapshot({archiveRoot:path.join(dir,'raw'),observedAt:'2026-10-07T00:00:00Z',fetchImpl:async()=>response('{"status":0,"ranking":[]}')}),/pachinko_/);const files=await import('node:fs/promises').then(fs=>fs.readdir(path.join(dir,'raw','2026-10-07')));assert.ok(files.some(x=>x.endsWith('.json.gz')));
});

test('scheduler window, once-per-server-day and cooldown are independent from slot collector',()=>{
  const db=openPachinkoDatabase(':memory:');migratePachinko(db);try{
    assert.deepEqual(jstPachinkoClock(new Date('2026-10-07T15:29:00Z')),{date:'2026-10-08',minutes:29});assert.equal(shouldAttemptPachinkoCollection(db,{now:new Date('2026-10-07T15:29:00Z')}).reason,'outside_window');assert.equal(shouldAttemptPachinkoCollection(db,{now:new Date('2026-10-07T15:30:00Z')}).attempt,true);
    db.prepare(`INSERT INTO p_collector_state(collector_id,last_attempt_at,last_success_at,last_error,last_collected_server_date,updated_at) VALUES('pia:35-p',?,?,?,?,?)`).run('2026-10-07T15:31:00Z',null,'x',null,'2026-10-07T15:31:00Z');assert.equal(shouldAttemptPachinkoCollection(db,{now:new Date('2026-10-07T15:40:00Z')}).reason,'cooldown');db.prepare("UPDATE p_collector_state SET last_collected_server_date='2026-10-08'").run();assert.equal(shouldAttemptPachinkoCollection(db,{now:new Date('2026-10-07T16:40:00Z')}).reason,'done_today');assert.equal(shouldAttemptPachinkoCollection(db,{now:new Date('2026-10-07T21:00:00Z')}).reason,'outside_window');
  }finally{db.close()}
});

test('successful initial full collection seeds all models and marks day complete',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-once-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=path.join(dir,'p.sqlite'),db=openPachinkoDatabase(dbPath);migratePachinko(db);const f=await latest();try{const result=await collectPachinkoOnce(db,{archiveRoot:path.join(dir,'raw'),now:new Date('2026-10-07T14:43:44Z'),fetchImpl:async()=>response(f.text)});assert.equal(result.collectionReady,true);const s=db.prepare('SELECT * FROM p_collector_state').get();assert.equal(s.last_collected_server_date,'2026-10-07');assert.equal(s.last_error,null)}finally{db.close()}
});

test('automated next-day tick recovers Ghoul 999 from the retained not-ready previous-day source',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-999-autoforward-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const dbPath=path.join(dir,'p.sqlite'),db=openPachinkoDatabase(dbPath);migratePachinko(db);
  const original=(await latest()).payload;
  try{
    const first=importPachinkoSnapshot(db,{payload:original});assert.equal(first.status,'seeded');
    const stalled={...original,server_date_time:{date:'2026-10-08',time:'01:45:00'}};
    const second=importPachinkoSnapshot(db,{payload:stalled});assert.equal(second.assignedCount,0);
    assert.equal(second.status,'not_ready');
    assert.equal(db.prepare("SELECT server_date FROM p_model_anchors WHERE model_key='TOKYO_GHOUL_999'").get().server_date,'2026-10-07');
    const groups=new Map(),other=[];
    for(const row of stalled.ranking){const model=identifyPachinkoModel(row);if(!model){other.push(row);continue}const key=`${model.key}|${row.store_machine_id}|${row.machine_no}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
    const nextRows=[...other];let ordinal=0;
    for(const rows of groups.values()){
      if(rows.length===30)nextRows.push(...rows.slice(1));else nextRows.push(...rows);
      const last=rows.at(-1);nextRows.push({...last,start:last.start+1,final_start:last.final_start+100000+ordinal++});
    }
    const current={...stalled,server_date_time:{date:'2026-10-09',time:'01:45:00'},ranking:nextRows};
    const result=await runPachinkoCollectorTick({dbPath,archiveRoot:path.join(dir,'raw'),now:new Date('2026-10-08T16:45:00.000Z'),fetchImpl:async()=>response(JSON.stringify(current))});
    assert.equal(result.reason,'due');assert.equal(result.result.collectionReady,true);
    const ghoulDays=db.prepare("SELECT business_date,COUNT(*) n FROM p_machine_days WHERE machine_model_key='TOKYO_GHOUL_999' GROUP BY business_date ORDER BY business_date").all();
    assert.deepEqual(ghoulDays.map(r=>[r.business_date,r.n]),[['2026-09-08',48],['2026-10-08',48]]);
    const latest=db.prepare('SELECT diagnostics_json FROM p_snapshots ORDER BY id DESC LIMIT 1').get();
    const model=JSON.parse(latest.diagnostics_json).modelResults.find(r=>r.machine_model_key==='TOKYO_GHOUL_999');
    assert.equal(model.previous_snapshot_id,second.snapshotId);
    const state=db.prepare('SELECT last_collected_server_date,last_error FROM p_collector_state').get();
    assert.equal(state.last_collected_server_date,'2026-10-09');assert.equal(state.last_error,null);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{db.close()}
});

test('scheduler suppresses overlapping ticks',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pachinko-overlap-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=path.join(dir,'p.sqlite'),db=openPachinkoDatabase(dbPath);migratePachinko(db);db.close();const f=await latest();let release;const gate=new Promise(r=>release=r),calls=[];const runtime=startPachinkoCollectorScheduler({dbPath,archiveRoot:path.join(dir,'raw'),clock:()=>new Date('2026-10-07T15:30:00Z'),intervalMs:60_000,fetchImpl:async()=>{calls.push(1);await gate;return response(f.text)}});try{await new Promise(r=>setTimeout(r,20));const second=await runtime.tick();assert.equal(second.reason,'running');assert.equal(calls.length,1);release();await new Promise(r=>setTimeout(r,30))}finally{release?.();await runtime.stop()}
});


test('web runtime keeps P collector OFF by default and starts/stops it only when explicitly enabled',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'pachinko-web-runtime-'));await import('node:fs/promises').then(fs=>fs.writeFile(path.join(root,'index.html'),'<title>test</title>'));let starts=0,stops=0;
  const baseConfig={rootDir:root,host:'127.0.0.1',port:0,relayDbPath:path.join(root,'relay.sqlite'),canonicalDbPath:null,rawRoot:null,piaCollectorEnabled:false};
  const disabled=await runWebServer({config:baseConfig,pachinkoConfig:{dbPath:path.join(root,'p.sqlite'),archiveRoot:path.join(root,'p-raw'),collectorEnabled:false,timeoutMs:20000,retryMs:1800000,windowStartMinutes:30,windowEndMinutes:360},startPachinkoCollector:()=>{starts++;return {stop(){stops++}}},logger:()=>{}});disabled.closeAllConnections?.();await new Promise(r=>disabled.close(r));assert.equal(starts,0);assert.equal(stops,0);
  const enabled=await runWebServer({config:baseConfig,pachinkoConfig:{dbPath:path.join(root,'p2.sqlite'),archiveRoot:path.join(root,'p2-raw'),collectorEnabled:true,timeoutMs:20000,retryMs:1800000,windowStartMinutes:30,windowEndMinutes:360},startPachinkoCollector:()=>{starts++;return {async stop(){stops++}}},logger:()=>{}});assert.equal(starts,1);enabled.closeAllConnections?.();await new Promise(r=>enabled.close(r));await new Promise(r=>setImmediate(r));assert.equal(stops,1);await rm(root,{recursive:true,force:true});
});

test('pachinko config defaults collector OFF, keeps 30-minute retry minimum and rejects DB collisions',()=>{
  const cfg=readPachinkoConfig({}, {canonicalDbPath:'/tmp/jugest.sqlite',relayDbPath:'/tmp/relay.sqlite',rootDir:'/srv/jugest'});assert.equal(cfg.collectorEnabled,false);assert.equal(cfg.retryMs,30*60*1000);assert.throws(()=>readPachinkoConfig({JUGEST_PACHINKO_RETRY_MS:'60000'},{canonicalDbPath:'/tmp/jugest.sqlite'}));assert.throws(()=>readPachinkoConfig({JUGEST_PACHINKO_DB:'/tmp/jugest.sqlite'},{canonicalDbPath:'/tmp/jugest.sqlite'}),/collision/);assert.throws(()=>readPachinkoConfig({JUGEST_PACHINKO_RAW_ROOT:'/srv/jugest/pachinko-raw'},{canonicalDbPath:'/tmp/jugest.sqlite',rootDir:'/srv/jugest'}),/collision/);
});
