import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestStoreAnalysisRefresh} from '../src/analysis/refresh-state.mjs';
import {claimNextJob,markJobRunning} from '../src/queue.mjs';
import {executeDailyAnalysis} from '../src/analysis/daily-analysis.mjs';
import {persistLivePrediction} from '../src/research/live-comparison.mjs';

const VERSION='vps-runtime-v1';
const NOW='2026-09-04T09:00:00.000Z';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-daily-comparison-'));
  const db=openDatabase(join(dir,'jugest.sqlite'));migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('store-a','比較店','{}',NOW,NOW);
  for(let i=0;i<4;i+=1){
    const date=`2026-09-0${i+1}`;
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a',date,'fixture','raw-'+date,'norm-'+date,'/tmp/'+date+'.gz',NOW,NOW);
    const diffs=i===3?[2200,900,-800]:[100+i*10,50+i*10,-100-i*10];
    for(let table=1;table<=3;table+=1){
      const tableNo=String(100+table);
      db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('store-a',date,String(table).padStart(6,'0'),JSON.stringify({machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo,games:6000,bb:25,rb:20,diff:diffs[table-1]}));
    }
  }
  const shared={storeId:'store-a',targetDate:'2026-09-04',sourceFrontierDate:'2026-09-03',createdAt:'2026-09-03T12:00:00.000Z'};
  persistLivePrediction(db,{...shared,engine:'pre_research',engineVersion:'store-read-v1',modelFingerprint:'fp-a',featureVersion:'store-features-v1',inputHash:'pre-input',rankings:[
    {machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:1,score:.9},{machineKey:'102',tableNo:'102',machineName:'マイジャグラーV',rank:2,score:.6},{machineKey:'103',tableNo:'103',machineName:'マイジャグラーV',rank:3,score:.2}
  ]});
  persistLivePrediction(db,{...shared,engine:'current_shadow',engineVersion:'current-v5',modelFingerprint:'',featureVersion:null,inputHash:'shadow-input',rankings:[
    {machineKey:'103',tableNo:'103',machineName:'マイジャグラーV',rank:1,score:90},{machineKey:'102',tableNo:'102',machineName:'マイジャグラーV',rank:2,score:60},{machineKey:'101',tableNo:'101',machineName:'マイジャグラーV',rank:3,score:20}
  ]});
  requestStoreAnalysisRefresh(db,{storeId:'store-a',analysisVersion:VERSION,nowIso:NOW,dirty:true});
  const claimed=claimNextJob(db,{owner:'worker-test',nowIso:'2026-09-04T09:00:01.000Z'});
  const job=markJobRunning(db,{jobId:claimed.id,owner:'worker-test',nowIso:'2026-09-04T09:00:02.000Z'});
  return {db,job,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

test('daily analysis scores live PRE and current-shadow predictions when target day becomes canonical',async()=>{
  const f=fixture();
  try{
    const out=await executeDailyAnalysis({db:f.db,job:f.job,rootDir:'/unused',nowIso:'2026-09-04T09:05:00.000Z',analysisRunner:async()=>({shop:'比較店',from:'2026-09-01',latest:'2026-09-04',days:4,rowCount:12,machines:[],positive:[],negative:[],patterns:[],machinePatterns:[]})});
    assert.equal(out.status,'analyzed');
    assert.equal(out.comparisonScored,1);
    assert.equal(out.comparisonExcluded,0);
    const rows=f.db.prepare("SELECT engine,outcome_input_hash FROM store_prediction_scores WHERE store_id='store-a' AND target_date='2026-09-04' ORDER BY engine").all();
    assert.equal(rows.length,2);
    assert.equal(new Set(rows.map(row=>row.outcome_input_hash)).size,1);
  }finally{f.cleanup()}
});
