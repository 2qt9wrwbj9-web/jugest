import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {baselineModel,fingerprintModel} from '../src/research/model-search.mjs';
import {activateStoreModel} from '../src/research/store-read-output.mjs';
import {migratePreV2TrialStore} from '../src/research/pre-v2/trial-store.mjs';
import {startFormalLiveTrial} from '../src/research/pre-v2/formal-start.mjs';
import {advanceFormalLiveTrialDay} from '../src/research/pre-v2/formal-daily-loop.mjs';

function makeDays(lastDay=10,{extraMachineFrom=null}={}){
  const out=[];
  for(let d=1;d<=lastDay;d+=1){
    const date=`2026-09-${String(d).padStart(2,'0')}`;
    const machines=[
      {tableNo:'101',sourceMachineName:'マイジャグラーV',machine:'my',games:5000+d,bb:20,rb:18,diff:100+d},
      {tableNo:'102',sourceMachineName:'マイジャグラーV',machine:'my',games:5100+d,bb:21,rb:17,diff:-50+d},
      {tableNo:'103',sourceMachineName:'マイジャグラーV',machine:'my',games:5200+d,bb:22,rb:19,diff:250+d},
    ];
    if(extraMachineFrom&&d>=extraMachineFrom)machines.push({tableNo:'104',sourceMachineName:'マイジャグラーV',machine:'my',games:4800+d,bb:18,rb:16,diff:30+d});
    out.push({date,machines});
  }
  return out;
}

function candidate(tableNo='103'){
  const model={version:'store-read-model-v1',axes:[{id:`axis-${tableNo}`,predicates:[{field:'table_no',op:'eq',value:tableNo}],weight:1}]};
  return Object.freeze({...model,fingerprint:fingerprintModel(model)});
}

function registerResearchModel(db,{storeId,model,nowIso}){
  db.prepare(`INSERT INTO research_model_registry(
    store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at
  ) VALUES(?,?,?,NULL,1,'research_champion',2,NULL,'{}',?,?)`).run(storeId,model.fingerprint,JSON.stringify(model),nowIso,nowIso);
}

function judgedRows(keys=['101','102','103']){
  return keys.map((tableNo,index)=>({
    tableNo,machine:'my',
    q:index===0?[0.05,0.05,0.10,0.15,0.25,0.40]:index===1?[0.40,0.25,0.15,0.10,0.05,0.05]:[0.15,0.15,0.15,0.15,0.20,0.20],
    expectedSetting:index===0?5.05:index===1?2.10:3.70,
  }));
}

function setup(){
  const db=openDatabase(':memory:');
  migrate(db);migratePreV2TrialStore(db);
  const now='2026-09-10T12:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','正式試験店','{}',now,now);
  const history=makeDays(10);
  const champion=baselineModel();
  activateStoreModel(db,{storeId:'s1',fingerprint:champion.fingerprint,model:champion,featureVersion:'store-feature-v1',frontierDate:'2026-09-10',holdoutScore:1,days:history,nowIso:now});
  const challenger=candidate('103');
  registerResearchModel(db,{storeId:'s1',model:challenger,nowIso:now});
  const started=startFormalLiveTrial(db,{storeId:'s1',lineageId:'pre-v2-live',challengerFingerprint:challenger.fingerprint,featureVersion:'store-feature-v1',days:history,frontierDate:'2026-09-10',nowIso:now});
  return{db,champion,challenger,started};
}

test('formal daily loop scores the frozen target and freezes the next unseen day with frozen models',async()=>{
  const f=setup();
  try{
    const seen=[];
    const result=await advanceFormalLiveTrialDay(f.db,{
      storeId:'s1',lineageId:'pre-v2-live',days:makeDays(11),throughDate:'2026-09-11',rootDir:'/unused',nowIso:'2026-09-11T12:00:00.000Z',
      judgementRunner:async input=>{seen.push(input.targetDate);return{date:input.targetDate,rows:judgedRows()};},
    });
    assert.deepEqual(seen,['2026-09-11']);
    assert.equal(result.reason,'advanced');
    assert.equal(result.scoredTargetDate,'2026-09-11');
    assert.equal(result.trial.trial.status,'running');
    assert.equal(result.nextTargetDate,'2026-09-12');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_predictions').get().n,4);
    const next=f.db.prepare("SELECT role,source_frontier_date,model_fingerprint FROM pre_v2_formal_predictions WHERE target_date='2026-09-12' ORDER BY role").all();
    assert.equal(next.length,2);
    assert.ok(next.every(row=>row.source_frontier_date==='2026-09-11'));
    assert.deepEqual(new Set(next.map(row=>row.model_fingerprint)),new Set([f.champion.fingerprint,f.challenger.fingerprint]));
  }finally{f.db.close()}
});

test('formal daily loop never backfills a prediction after that target outcome is already available',async()=>{
  const f=setup();
  try{
    const result=await advanceFormalLiveTrialDay(f.db,{
      storeId:'s1',lineageId:'pre-v2-live',days:makeDays(13),throughDate:'2026-09-13',rootDir:'/unused',nowIso:'2026-09-13T12:00:00.000Z',
      judgementRunner:async input=>({date:input.targetDate,rows:judgedRows()}),
    });
    assert.equal(result.scoredTargetDate,'2026-09-11');
    assert.equal(result.nextTargetDate,'2026-09-14');
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pre_v2_formal_predictions WHERE target_date IN ('2026-09-12','2026-09-13')").get().n,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM pre_v2_formal_predictions WHERE target_date='2026-09-14'").get().n,2);
  }finally{f.db.close()}
});

test('formal daily loop waits without mutation when the frozen target has not arrived yet',async()=>{
  const f=setup();
  try{
    const result=await advanceFormalLiveTrialDay(f.db,{
      storeId:'s1',lineageId:'pre-v2-live',days:makeDays(10),throughDate:'2026-09-10',rootDir:'/unused',nowIso:'2026-09-10T18:00:00.000Z',
      judgementRunner:async()=>{throw new Error('must not judge unavailable target');},
    });
    assert.equal(result.reason,'waiting_for_target');
    assert.equal(result.scoredTargetDate,null);
    assert.equal(result.nextTargetDate,'2026-09-11');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_predictions').get().n,2);
  }finally{f.db.close()}
});
