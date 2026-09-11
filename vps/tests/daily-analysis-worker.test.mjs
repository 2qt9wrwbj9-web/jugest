import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestStoreAnalysisRefresh,getAnalysisRefreshState} from '../src/analysis/refresh-state.mjs';
import {claimNextJob,markJobRunning} from '../src/queue.mjs';
import {executeDailyAnalysis} from '../src/analysis/daily-analysis.mjs';

const VERSION='vps-runtime-v1';
const NOW='2026-09-11T09:00:00.000Z';

function fixture({days=4}={}){
  const dir=mkdtempSync(join(tmpdir(),'jugest-daily-analysis-'));
  const db=openDatabase(join(dir,'jugest.sqlite'));
  migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('store-a','解析店','{}',NOW,NOW);
  for(let i=0;i<days;i+=1){
    const date=`2026-09-${String(1+i).padStart(2,'0')}`;
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('store-a',date,'fixture','raw-'+i,'norm-'+i,'/tmp/'+date+'.gz',NOW,NOW);
    db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)')
      .run('store-a',date,'000000',JSON.stringify({machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'101',games:5000+i*100,bb:20+i,rb:18+i,diff:100+i*50}));
  }
  const requested=requestStoreAnalysisRefresh(db,{storeId:'store-a',analysisVersion:VERSION,nowIso:NOW,dirty:true});
  const claimed=claimNextJob(db,{owner:'worker-test',nowIso:'2026-09-11T09:00:01.000Z'});
  const running=markJobRunning(db,{jobId:claimed.id,owner:'worker-test',nowIso:'2026-09-11T09:00:02.000Z'});
  return {dir,db,job:running,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

function fakeResult(){
  return {shop:'解析店',from:'2026-09-01',latest:'2026-09-04',days:4,rowCount:4,meanES:3.2,usableCount:2,conditionCount:5,evidenceConfidence:.7,complexTested:0,fdrSignificant:0,confirmSignificant:0,rawS:0,rawA:0,maxDims:1,machines:[{machine:'my',machineName:'マイジャグラーV',n:4,meanES:3.2,delta:.2,meanP5:.2}],positive:[],negative:[],patterns:[],machinePatterns:[]};
}

test('daily worker persists state, receipt and three client snapshots from canonical VPS input',async()=>{
  const f=fixture();
  try{
    const out=await executeDailyAnalysis({
      db:f.db,job:f.job,rootDir:'/unused',nowIso:'2026-09-11T09:01:00.000Z',
      analysisRunner:async({shop,days,options})=>{
        assert.equal(shop,'解析店');
        assert.equal(days.length,4);
        assert.deepEqual(options,{period:'180',minG:'2000',maxDims:'1',minDays:'4'});
        return fakeResult();
      }
    });
    assert.equal(out.status,'analyzed');
    assert.match(out.inputHash,/^[a-f0-9]{64}$/);
    assert.match(out.outputHash,/^[a-f0-9]{64}$/);
    assert.equal(out.targetGeneration,1);
    assert.equal(out.followupJobId,null);

    const state=f.db.prepare("SELECT * FROM analysis_state WHERE store_id='store-a' AND component='store-analysis-default' AND version=?").get(VERSION);
    assert.equal(state.frontier_date,'2026-09-04');
    assert.equal(state.input_hash,out.inputHash);
    assert.equal(JSON.parse(state.state_json).rowCount,4);

    const receipts=f.db.prepare("SELECT * FROM analysis_receipts WHERE store_id='store-a'").all();
    assert.equal(receipts.length,1);
    assert.equal(receipts[0].input_hash,out.inputHash);
    assert.equal(receipts[0].output_hash,out.outputHash);

    const snapshots=f.db.prepare("SELECT snapshot_type,payload_hash FROM client_snapshots WHERE store_id='store-a' ORDER BY snapshot_type").all();
    assert.deepEqual(snapshots.map(x=>x.snapshot_type),['store-analysis-default','store-data-summary','store-latest-status']);
    assert.ok(snapshots.every(x=>/^[a-f0-9]{64}$/.test(x.payload_hash)));

    const refresh=getAnalysisRefreshState(f.db,{storeId:'store-a',analysisVersion:VERSION});
    assert.equal(refresh.generation,1);
    assert.equal(refresh.completedGeneration,1);
    assert.equal(refresh.activeJobId,null);
  }finally{f.cleanup()}
});

test('data arriving during analysis produces exactly one follow-up generation',async()=>{
  const f=fixture();
  try{
    const out=await executeDailyAnalysis({
      db:f.db,job:f.job,rootDir:'/unused',nowIso:'2026-09-11T09:02:00.000Z',
      analysisRunner:async()=>{
        requestStoreAnalysisRefresh(f.db,{storeId:'store-a',analysisVersion:VERSION,nowIso:'2026-09-11T09:01:30.000Z',dirty:true});
        requestStoreAnalysisRefresh(f.db,{storeId:'store-a',analysisVersion:VERSION,nowIso:'2026-09-11T09:01:31.000Z',dirty:true});
        return fakeResult();
      }
    });
    assert.equal(out.targetGeneration,1);
    assert.ok(out.followupJobId);
    const refresh=getAnalysisRefreshState(f.db,{storeId:'store-a',analysisVersion:VERSION});
    assert.equal(refresh.generation,3);
    assert.equal(refresh.completedGeneration,1);
    assert.equal(refresh.activeJobId,out.followupJobId);
    const jobs=f.db.prepare("SELECT id,payload_json FROM jobs WHERE type='DAILY_ANALYSIS' ORDER BY id").all();
    assert.equal(jobs.length,2,'multiple dirty events during one run must coalesce to one follow-up');
    assert.equal(JSON.parse(jobs[1].payload_json).generation,3);
  }finally{f.cleanup()}
});

test('fewer than three valid days completes as insufficient data without burning failure retries',async()=>{
  const f=fixture({days:2});
  try{
    let called=false;
    const out=await executeDailyAnalysis({db:f.db,job:f.job,rootDir:'/unused',nowIso:'2026-09-11T09:03:00.000Z',analysisRunner:async()=>{called=true;throw new Error('must not run')}});
    assert.equal(called,false);
    assert.equal(out.status,'insufficient_data');
    assert.equal(out.dayCount,2);
    const refresh=getAnalysisRefreshState(f.db,{storeId:'store-a',analysisVersion:VERSION});
    assert.equal(refresh.completedGeneration,1);
    assert.equal(refresh.activeJobId,null);
    const latest=JSON.parse(f.db.prepare("SELECT payload_json FROM client_snapshots WHERE store_id='store-a' AND snapshot_type='store-latest-status'").get().payload_json);
    assert.equal(latest.status,'insufficient_data');
  }finally{f.cleanup()}
});
