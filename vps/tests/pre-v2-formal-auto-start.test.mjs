import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {canonicalJson} from '../src/canonical-json.mjs';
import {requestStoreAnalysisRefresh} from '../src/analysis/refresh-state.mjs';
import {executeDailyAnalysis} from '../src/analysis/daily-analysis.mjs';
import {claimNextJob,markJobRunning} from '../src/queue.mjs';
import {baselineModel,fingerprintModel} from '../src/research/model-search.mjs';
import {finalizeSealedHoldout} from '../src/research/holdout.mjs';
import {activateStoreModel} from '../src/research/store-read-output.mjs';
import {maybeStartFinalizedFormalTrial} from '../src/research/pre-v2/formal-auto-start.mjs';
import {migratePreV2TrialStore} from '../src/research/pre-v2/trial-store.mjs';

const NOW='2026-09-17T08:00:00.000Z';
const FEATURE_VERSION='store-features-v1';
const ANALYSIS_VERSION='vps-runtime-v1';

function history(){
  const out=[];
  for(let d=1;d<=30;d+=1){
    const date=`2026-08-${String(d).padStart(2,'0')}`;
    const machines=[];
    for(let n=101;n<=110;n+=1){
      const tableNo=String(n),strong=tableNo.endsWith('7');
      machines.push({tableNo,sourceMachineName:'マイジャグラーV',machine:'my',category:'juggler',games:5000,bb:strong?24:18,rb:strong?22:16,diff:strong?1600:-200});
    }
    out.push({date,machines});
  }
  return out;
}

function challengerModel(){
  const model={version:'store-read-model-v1',axes:[{id:'tail7',predicates:[{field:'table_last_digit',op:'eq',value:'7'}],weight:1}]};
  return Object.freeze({...model,fingerprint:fingerprintModel(model)});
}

function persistCanonicalDays(db,days){
  for(const [dayIndex,day] of days.entries()){
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES('s1',?,'fixture',?,?,'valid',?,?,?)`).run(day.date,`raw-${dayIndex}`,`norm-${dayIndex}`,`/tmp/${day.date}.gz`,NOW,NOW);
    for(const machine of day.machines){
      db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)')
        .run('s1',day.date,machine.tableNo,JSON.stringify(machine));
    }
  }
}

function registerModel(db,{model,status,generation,parentFingerprint=null,validationScore=null}){
  db.prepare(`INSERT INTO research_model_registry(store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at)
    VALUES('s1',?,?,?,?,?,?,NULL,'{}',?,?)`).run(model.fingerprint,canonicalJson(model),parentFingerprint,generation,status,validationScore,NOW,NOW);
}

function installFinalizedCandidate(db,{candidate}){
  registerModel(db,{model:candidate,status:'research_champion',generation:1,validationScore:2});
  db.prepare(`INSERT INTO research_loops(store_id,feature_version,current_fingerprint,best_fingerprint,generation,no_improve_count,repeated_fingerprint,state,last_error,frontier_date,search_round,holdout_finalized_at,holdout_winner_fingerprint,updated_at)
    VALUES('s1',?,?,?,?,5,NULL,'converged',NULL,'2026-08-30',5,?,?,?)`)
    .run(FEATURE_VERSION,candidate.fingerprint,candidate.fingerprint,1,NOW,candidate.fingerprint,NOW);
}

function dailyJob(db){
  requestStoreAnalysisRefresh(db,{storeId:'s1',analysisVersion:ANALYSIS_VERSION,nowIso:NOW,dirty:true});
  const claimed=claimNextJob(db,{owner:'formal-auto-start-test',nowIso:'2026-09-17T08:00:01.000Z'});
  assert.equal(claimed.type,'DAILY_ANALYSIS');
  return markJobRunning(db,{jobId:claimed.id,owner:'formal-auto-start-test',nowIso:'2026-09-17T08:00:02.000Z'});
}

function fakeAnalysis(){
  return {shop:'Formal自動開始店',from:'2026-08-01',latest:'2026-08-30',days:30,rowCount:300,machines:[],positive:[],negative:[],patterns:[],machinePatterns:[]};
}

function setup(){
  const db=openDatabase(':memory:');
  migrate(db);migratePreV2TrialStore(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','Formal自動開始店','{}',NOW,NOW);
  const days=history();persistCanonicalDays(db,days);
  const champion=baselineModel();
  activateStoreModel(db,{storeId:'s1',fingerprint:champion.fingerprint,model:champion,featureVersion:FEATURE_VERSION,frontierDate:'2026-08-30',days,nowIso:NOW});
  return{db,days,champion,candidate:challengerModel()};
}

test('sealed holdout selects a formal Challenger without replacing the incumbent Active Champion',()=>{
  const f=setup();
  try{
    registerModel(f.db,{model:f.champion,status:'research_champion',generation:0,validationScore:1});
    registerModel(f.db,{model:f.candidate,status:'historical',generation:1,parentFingerprint:f.champion.fingerprint,validationScore:2});
    f.db.prepare(`INSERT INTO research_loops(store_id,feature_version,current_fingerprint,best_fingerprint,generation,no_improve_count,repeated_fingerprint,state,last_error,frontier_date,search_round,updated_at)
      VALUES('s1',?,?,?,?,5,NULL,'converged',NULL,'2026-08-30',5,?)`).run(FEATURE_VERSION,f.champion.fingerprint,f.champion.fingerprint,1,NOW);

    const result=finalizeSealedHoldout(f.db,{storeId:'s1',days:f.days,frontierDate:'2026-08-30',nowIso:NOW});
    assert.equal(result.winnerFingerprint,f.candidate.fingerprint);
    assert.equal(f.db.prepare("SELECT fingerprint FROM research_model_registry WHERE store_id='s1' AND status='research_champion'").get().fingerprint,f.candidate.fingerprint);
    assert.equal(f.db.prepare("SELECT fingerprint FROM active_store_models WHERE store_id='s1'").get().fingerprint,f.champion.fingerprint,'sealed holdout must not bypass PRE v2 formal promotion');
  }finally{f.db.close()}
});

test('daily analysis automatically starts one formal trial from a finalized distinct holdout winner',async()=>{
  const f=setup();
  try{
    installFinalizedCandidate(f.db,{candidate:f.candidate});
    const out=await executeDailyAnalysis({db:f.db,job:dailyJob(f.db),rootDir:'/unused',analysisRunner:async()=>fakeAnalysis(),nowIso:'2026-09-17T08:01:00.000Z'});
    assert.equal(out.formalTrialReason,'started');
    assert.equal(out.formalScoredTargetDate,null);
    assert.equal(out.formalNextTargetDate,'2026-08-31');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trials').get().n,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_predictions').get().n,2);
    const trial=f.db.prepare('SELECT champion_fingerprint,challenger_fingerprint,status FROM pre_v2_formal_trials').get();
    assert.equal(trial.champion_fingerprint,f.champion.fingerprint);
    assert.equal(trial.challenger_fingerprint,f.candidate.fingerprint);
    assert.equal(trial.status,'running');
  }finally{f.db.close()}
});

test('formal auto-start never consumes another trial number for the same Champion/Challenger pair',()=>{
  const f=setup();
  try{
    installFinalizedCandidate(f.db,{candidate:f.candidate});
    const args={storeId:'s1',lineageId:'pre-v2-live',featureVersion:FEATURE_VERSION,days:f.days,frontierDate:'2026-08-30',nowIso:NOW};
    const first=maybeStartFinalizedFormalTrial(f.db,args);
    assert.equal(first.reason,'started');
    const second=maybeStartFinalizedFormalTrial(f.db,{...args,nowIso:'2026-09-17T08:05:00.000Z'});
    assert.equal(second.reason,'candidate_already_trialed');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trials').get().n,1);
  }finally{f.db.close()}
});
