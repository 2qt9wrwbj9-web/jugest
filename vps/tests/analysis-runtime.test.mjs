import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {loadStoreDays} from '../src/analysis/store-data.mjs';
import {runExistingStoreAnalysis} from '../src/analysis/runtime-adapter.mjs';

const REPO_ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-analysis-runtime-'));
  const db=openDatabase(join(dir,'jugest.sqlite'));
  migrate(db);
  const now='2026-09-11T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run('store-a','解析テスト店','{}',now,now);
  const days=[
    ['2026-09-01',5000,20,18,100],
    ['2026-09-02',5200,21,19,240],
    ['2026-09-03',4800,18,17,-120],
    ['2026-09-04',5500,23,20,360]
  ];
  for(const [date,games,bb,rb,diff] of days){
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a',date,'fixture','raw-'+date,'norm-'+date,'/tmp/'+date+'.gz',now,now);
    const rows=[
      {machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'102',games,bb,rb,diff},
      {machine:'fk2',category:'juggler',sourceMachineName:'ファンキージャグラー2',tableNo:'101',games:games+200,bb:bb+1,rb:Math.max(1,rb-2),diff:diff-80}
    ];
    rows.forEach((row,index)=>db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)')
      .run('store-a',date,String(index).padStart(6,'0'),JSON.stringify(row)));
  }
  return {db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

test('loadStoreDays reconstructs canonical date order and per-day machine order',()=>{
  const f=fixture();
  try{
    const loaded=loadStoreDays(f.db,'store-a',{limit:3});
    assert.equal(loaded.store.id,'store-a');
    assert.equal(loaded.store.name,'解析テスト店');
    assert.deepEqual(loaded.days.map(x=>x.date),['2026-09-02','2026-09-03','2026-09-04']);
    assert.deepEqual(loaded.days[0].machines.map(x=>x.tableNo),['102','101']);
  }finally{f.cleanup()}
});

test('headless adapter runs the existing JUGEST store-analysis bridge over VPS canonical days',async()=>{
  const f=fixture();
  try{
    const loaded=loadStoreDays(f.db,'store-a',{limit:180});
    const result=await runExistingStoreAnalysis({
      rootDir:REPO_ROOT,
      shop:loaded.store.name,
      sourceStoreId:loaded.store.id,
      days:loaded.days,
      options:{period:'30',minG:'0',maxDims:'1',minDays:'3'}
    });
    assert.equal(result.shop,'解析テスト店');
    assert.equal(result.days,4);
    assert.ok(result.rowCount>=8);
    assert.ok(Array.isArray(result.machines));
    assert.ok(Array.isArray(result.positive));
    assert.ok(Array.isArray(result.patterns));
  }finally{f.cleanup()}
});
