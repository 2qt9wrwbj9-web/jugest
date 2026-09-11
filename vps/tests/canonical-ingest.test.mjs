import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';

const ingestMod=await import('../src/ingest/canonical-ingest.mjs').catch(()=>({}));
const {ingestCollectorDay}=ingestMod;

function sampleDay({date='2026-09-10',machines}={}){
  return {
    date,
    sourceUrl:`https://ana-slo.com/${date}-sample-data/`,
    parserBuild:'v504-header-driven-1',
    machines:machines??[
      {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'101',games:5000,bb:20,rb:18,diff:900},
      {machine:'im',category:'juggler',sourceMachineName:'アイムジャグラーEX',tableNo:'102',games:4200,bb:16,rb:14,diff:350}
    ]
  };
}

async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'jugest-ingest-'));
  const dbPath=join(dir,'jugest.sqlite');
  const rawRoot=join(dir,'raw');
  const db=openDatabase(dbPath);
  migrate(db);
  return {dir,db,rawRoot,close:async()=>{try{db.close()}catch{}await rm(dir,{recursive:true,force:true})}};
}

const baseInput={
  channelId:'channel_test_123456',
  sourceStoreId:'store-kanagawa-001',
  shop:'テスト店',
  date:'2026-09-10',
  parserBuild:'v504-header-driven-1',
  revision:12,
  rawText:'<!doctype html><html><body>JUGEST RAW SOURCE</body></html>',
  nowIso:'2026-09-11T01:00:00.000Z'
};

test('first canonical ingest archives raw, persists ordered machines, and queues one store analysis refresh',async()=>{
  assert.equal(typeof ingestCollectorDay,'function','ingestCollectorDay must exist');
  const f=await fixture();
  try{
    const day=sampleDay();
    const result=await ingestCollectorDay(f.db,{...baseInput,rawRoot:f.rawRoot,day});
    assert.equal(result.changed,true);
    assert.equal(result.storeId,baseInput.sourceStoreId);
    assert.equal(result.businessDate,baseInput.date);
    assert.equal(result.machineCount,2);
    assert.match(result.rawArtifactPath,/2026-09-10\.[0-9a-f]{64}\.html\.gz$/);
    assert.equal(gunzipSync(await readFile(result.rawArtifactPath)).toString('utf8'),baseInput.rawText);

    const store=f.db.prepare('SELECT * FROM stores WHERE id=?').get(baseInput.sourceStoreId);
    assert.equal(store.name,baseInput.shop);
    assert.doesNotMatch(store.source_metadata_json,/token|secret|collectorKey/i);

    const storedDay=f.db.prepare('SELECT * FROM store_days WHERE store_id=? AND business_date=?').get(baseInput.sourceStoreId,baseInput.date);
    assert.equal(storedDay.quality_status,'valid');
    assert.equal(storedDay.parser_version,baseInput.parserBuild);
    assert.equal(storedDay.source_hash,result.rawSha256);
    assert.equal(storedDay.normalized_payload_hash,result.normalizedHash);
    assert.equal(storedDay.raw_artifact_path,result.rawArtifactPath);

    const rows=f.db.prepare('SELECT machine_key,payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(baseInput.sourceStoreId,baseInput.date);
    assert.deepEqual(rows.map(x=>x.machine_key),['000000','000001']);
    assert.deepEqual(rows.map(x=>JSON.parse(x.payload_json).tableNo),['101','102']);

    const jobs=f.db.prepare("SELECT * FROM jobs WHERE type='DAILY_ANALYSIS'").all();
    assert.equal(jobs.length,1);
    assert.match(jobs[0].idempotency_key,new RegExp(`^daily:${baseInput.sourceStoreId}:gen:1:vps-runtime-v1$`));
    assert.equal(result.jobId,jobs[0].id);
    const refresh=f.db.prepare('SELECT * FROM analysis_refresh_state WHERE store_id=?').get(baseInput.sourceStoreId);
    assert.equal(refresh.generation,1);
    assert.equal(refresh.completed_generation,0);
    assert.equal(refresh.active_job_id,jobs[0].id);
  }finally{await f.close()}
});

test('same-hash replay is a semantic no-op with one analysis job and unchanged generation',async()=>{
  assert.equal(typeof ingestCollectorDay,'function','ingestCollectorDay must exist');
  const f=await fixture();
  try{
    const day=sampleDay();
    const first=await ingestCollectorDay(f.db,{...baseInput,rawRoot:f.rawRoot,day});
    const second=await ingestCollectorDay(f.db,{...baseInput,rawRoot:f.rawRoot,day,revision:13,nowIso:'2026-09-11T01:01:00.000Z'});
    assert.equal(first.changed,true);
    assert.equal(second.changed,false);
    assert.equal(second.normalizedHash,first.normalizedHash);
    assert.equal(second.rawArtifactPath,first.rawArtifactPath);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1);
    assert.equal(f.db.prepare('SELECT generation FROM analysis_refresh_state WHERE store_id=?').get(baseInput.sourceStoreId).generation,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM machine_day_data WHERE store_id=? AND business_date=?').get(baseInput.sourceStoreId,baseInput.date).n,2);
  }finally{await f.close()}
});

test('many changed days coalesce behind one active store analysis job',async()=>{
  assert.equal(typeof ingestCollectorDay,'function','ingestCollectorDay must exist');
  const f=await fixture();
  try{
    for(let i=0;i<5;i+=1){
      const date=`2026-09-${String(6+i).padStart(2,'0')}`;
      await ingestCollectorDay(f.db,{
        ...baseInput,date,rawRoot:f.rawRoot,day:sampleDay({date}),revision:20+i,
        rawText:`<!doctype html><body>${date}</body>`,nowIso:`2026-09-11T01:0${i}:00.000Z`
      });
    }
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1,'backfill must not queue one heavy job per day');
    const refresh=f.db.prepare('SELECT * FROM analysis_refresh_state WHERE store_id=?').get(baseInput.sourceStoreId);
    assert.equal(refresh.generation,5);
    assert.equal(refresh.completed_generation,0);
    assert.ok(refresh.active_job_id);
  }finally{await f.close()}
});

test('corrected day replaces complete machine set but stays coalesced behind active analysis',async()=>{
  assert.equal(typeof ingestCollectorDay,'function','ingestCollectorDay must exist');
  const f=await fixture();
  try{
    const first=await ingestCollectorDay(f.db,{...baseInput,rawRoot:f.rawRoot,day:sampleDay()});
    const corrected=sampleDay({machines:[
      {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'101',games:5300,bb:22,rb:20,diff:1200}
    ]});
    const second=await ingestCollectorDay(f.db,{...baseInput,rawRoot:f.rawRoot,day:corrected,rawText:'<!doctype html><html><body>CORRECTED RAW</body></html>',revision:14,nowIso:'2026-09-11T01:02:00.000Z'});
    assert.equal(second.changed,true);
    assert.notEqual(second.normalizedHash,first.normalizedHash);
    assert.notEqual(second.rawArtifactPath,first.rawArtifactPath);
    const rows=f.db.prepare('SELECT machine_key,payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all(baseInput.sourceStoreId,baseInput.date);
    assert.equal(rows.length,1,'stale machine rows must not survive corrected-day replacement');
    assert.equal(JSON.parse(rows[0].payload_json).games,5300);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1);
    assert.equal(f.db.prepare('SELECT generation FROM analysis_refresh_state WHERE store_id=?').get(baseInput.sourceStoreId).generation,2);
  }finally{await f.close()}
});
