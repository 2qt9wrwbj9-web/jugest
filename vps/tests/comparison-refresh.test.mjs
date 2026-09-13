import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {persistLivePrediction,listLivePredictions} from '../src/research/live-comparison.mjs';
import {scoreAvailableComparisonDays} from '../src/analysis/comparison-refresh.mjs';

const NOW='2026-09-15T09:00:00.000Z';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-comparison-refresh-'));
  const db=openDatabase(join(dir,'jugest.sqlite'));migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('store-a','比較店','{}',NOW,NOW);
  return {db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}
function prediction(engine,rankings){
  return {storeId:'store-a',targetDate:'2026-09-14',engine,engineVersion:engine==='pre_research'?'store-read-v1':'current-v5',modelFingerprint:engine==='pre_research'?'fp-pre':'',featureVersion:engine==='pre_research'?'store-features-v1':null,sourceFrontierDate:'2026-09-13',inputHash:`input-${engine}`,rankings,createdAt:'2026-09-13T12:00:00.000Z'};
}
function insertTargetDay(db,date='2026-09-14'){
  db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
    VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a',date,'fixture','raw-target','norm-target','/tmp/target.gz',NOW,NOW);
  const rows=[
    {machine:'my',sourceMachineName:'マイジャグラーV',tableNo:'101',games:6000,bb:30,rb:25,diff:2200},
    {machine:'my',sourceMachineName:'マイジャグラーV',tableNo:'102',games:6000,bb:25,rb:22,diff:900},
    {machine:'my',sourceMachineName:'マイジャグラーV',tableNo:'103',games:6000,bb:18,rb:15,diff:-800}
  ];
  rows.forEach((row,index)=>db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('store-a',date,String(index).padStart(6,'0'),JSON.stringify(row)));
}

test('completed canonical target day scores both engines against one immutable outcome hash',()=>{
  const f=fixture();
  try{
    persistLivePrediction(f.db,prediction('pre_research',[
      {machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:.9},
      {machineKey:'102',tableNo:'102',machineName:'マイジャグラーV',rank:2,score:.6},
      {machineKey:'103',tableNo:'103',machineName:'マイジャグラーV',rank:3,score:.2}
    ]));
    persistLivePrediction(f.db,prediction('current_shadow',[
      {machineKey:'103',tableNo:'103',machineName:'マイジャグラーV',rank:1,score:90},
      {machineKey:'102',tableNo:'102',machineName:'マイジャグラーV',rank:2,score:60},
      {machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:3,score:20}
    ]));
    persistLivePrediction(f.db,{...prediction('pre_research',[{machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:1}]),targetDate:'2026-09-16',sourceFrontierDate:'2026-09-15',inputHash:'future-input',modelFingerprint:'fp-future'});
    insertTargetDay(f.db);

    const first=scoreAvailableComparisonDays(f.db,{storeId:'store-a',throughDate:'2026-09-14',nowIso:NOW});
    assert.equal(first.scored,1);
    assert.equal(first.excluded,0);
    const scores=f.db.prepare("SELECT engine,outcome_input_hash,score_hash FROM store_prediction_scores WHERE store_id='store-a' AND target_date='2026-09-14' ORDER BY engine").all();
    assert.equal(scores.length,2);
    assert.equal(new Set(scores.map(row=>row.outcome_input_hash)).size,1,'both engines must share the exact same outcome hash');
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM store_prediction_scores WHERE target_date='2026-09-16'").get().n,0,'future target must stay untouched');

    const second=scoreAvailableComparisonDays(f.db,{storeId:'store-a',throughDate:'2026-09-14',nowIso:'2026-09-15T10:00:00.000Z'});
    assert.equal(second.scored,1);
    const scoresAgain=f.db.prepare("SELECT engine,outcome_input_hash,score_hash FROM store_prediction_scores WHERE store_id='store-a' AND target_date='2026-09-14' ORDER BY engine").all();
    assert.deepEqual(scoresAgain,scores,'rerun must be idempotent');
    assert.equal(listLivePredictions(f.db,{storeId:'store-a',targetDate:'2026-09-14'}).length,2);
  }finally{f.cleanup()}
});
