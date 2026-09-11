import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {ingestCollectorDay} from '../src/ingest/canonical-ingest.mjs';

const mod=await import('../src/ingest/device-backfill.mjs').catch(()=>({}));
const {ingestDeviceBackfillDay}=mod;

function sampleDay({date='2026-09-10',games=5000}={}){
  return {
    date,
    sourceUrl:`https://ana-slo.com/${date}-sample-data/`,
    capturedAt:'2026-09-10T23:00:00.000Z',
    machines:[
      {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'101',games,bb:20,rb:18,diff:900},
      {machine:'im',category:'juggler',sourceMachineName:'アイムジャグラーEX',tableNo:'102',games:4200,bb:16,rb:14,diff:350}
    ]
  };
}

async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'jugest-device-backfill-'));
  const db=openDatabase(join(dir,'jugest.sqlite'));
  migrate(db);
  return {dir,db,rawRoot:join(dir,'raw'),close:async()=>{try{db.close()}catch{}await rm(dir,{recursive:true,force:true})}};
}

const base={
  channelId:'channel_device_123456',
  sourceStoreId:'store-kanagawa-001',
  shop:'テスト店',
  date:'2026-09-10',
  nowIso:'2026-09-12T01:00:00.000Z'
};

test('device backfill inserts a missing canonical day with explicit provenance and queues analysis',async()=>{
  assert.equal(typeof ingestDeviceBackfillDay,'function','ingestDeviceBackfillDay must exist');
  const f=await fixture();
  try{
    const day=sampleDay();
    const result=await ingestDeviceBackfillDay(f.db,{...base,rawRoot:f.rawRoot,day});
    assert.equal(result.inserted,true);
    assert.equal(result.duplicate,false);
    assert.equal(result.conflict,false);
    assert.equal(result.machineCount,2);
    assert.match(result.rawArtifactPath,/2026-09-10\.[0-9a-f]{64}\.html\.gz$/);
    const archived=gunzipSync(await readFile(result.rawArtifactPath)).toString('utf8');
    assert.match(archived,/device-indexeddb-backfill-v1/);
    assert.match(archived,/"date":"2026-09-10"/);

    const stored=f.db.prepare('SELECT * FROM store_days WHERE store_id=? AND business_date=?').get(base.sourceStoreId,base.date);
    assert.equal(stored.parser_version,'device-indexeddb-backfill-v1');
    assert.equal(stored.normalized_payload_hash,result.normalizedHash);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM machine_day_data WHERE store_id=? AND business_date=?').get(base.sourceStoreId,base.date).n,2);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1);
  }finally{await f.close()}
});

test('device backfill is idempotent when the same canonical day already exists',async()=>{
  assert.equal(typeof ingestDeviceBackfillDay,'function','ingestDeviceBackfillDay must exist');
  const f=await fixture();
  try{
    const day=sampleDay();
    const first=await ingestDeviceBackfillDay(f.db,{...base,rawRoot:f.rawRoot,day});
    const second=await ingestDeviceBackfillDay(f.db,{...base,rawRoot:f.rawRoot,day,nowIso:'2026-09-12T01:01:00.000Z'});
    assert.equal(first.inserted,true);
    assert.equal(second.inserted,false);
    assert.equal(second.duplicate,true);
    assert.equal(second.conflict,false);
    assert.equal(second.normalizedHash,first.normalizedHash);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1);
    assert.equal(f.db.prepare('SELECT generation FROM analysis_refresh_state WHERE store_id=?').get(base.sourceStoreId).generation,1);
  }finally{await f.close()}
});

test('device backfill never overwrites an existing VPS canonical day with a different hash',async()=>{
  assert.equal(typeof ingestDeviceBackfillDay,'function','ingestDeviceBackfillDay must exist');
  const f=await fixture();
  try{
    const authoritative=sampleDay({games:6100});
    const collector=await ingestCollectorDay(f.db,{
      channelId:base.channelId,sourceStoreId:base.sourceStoreId,shop:base.shop,date:base.date,
      parserBuild:'v504-header-driven-1',revision:1,rawRoot:f.rawRoot,day:authoritative,
      rawText:'<!doctype html><body>authoritative collector raw</body>',nowIso:'2026-09-12T00:59:00.000Z'
    });
    const before=f.db.prepare('SELECT normalized_payload_hash,parser_version,raw_artifact_path FROM store_days WHERE store_id=? AND business_date=?').get(base.sourceStoreId,base.date);
    const result=await ingestDeviceBackfillDay(f.db,{...base,rawRoot:f.rawRoot,day:sampleDay({games:5000})});
    assert.equal(result.inserted,false);
    assert.equal(result.duplicate,false);
    assert.equal(result.conflict,true);
    const after=f.db.prepare('SELECT normalized_payload_hash,parser_version,raw_artifact_path FROM store_days WHERE store_id=? AND business_date=?').get(base.sourceStoreId,base.date);
    assert.deepEqual(after,before,'existing canonical day must remain byte-for-byte referenced');
    assert.equal(after.normalized_payload_hash,collector.normalizedHash);
    assert.equal(after.parser_version,'v504-header-driven-1');
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1);
  }finally{await f.close()}
});
