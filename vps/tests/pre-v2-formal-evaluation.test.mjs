import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {hashCanonical} from '../src/canonical-json.mjs';
import {startFormalTrial} from '../src/research/pre-v2/trial.mjs';
import {createTrialRecord,loadTrialRecord,migratePreV2TrialStore} from '../src/research/pre-v2/trial-store.mjs';
import {persistFormalPrediction} from '../src/research/pre-v2/formal-prediction-store.mjs';
import {scoreFormalTargetDay} from '../src/research/pre-v2/formal-evaluation.mjs';

const KEYS=['101','102','103','104','105','106'];

function setup({withChallenger=true}={}){
  const db=openDatabase(':memory:');
  migrate(db);migratePreV2TrialStore(db);
  const now='2026-09-17T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','正式評価店','{}',now,now);
  const trial=startFormalTrial({
    storeId:'s1',lineageId:'lineage-a',trialNumber:1,
    championFingerprint:'champion-fp',challengerFingerprint:'challenger-fp',
    machineSetHash:hashCanonical(KEYS.slice().sort()),scorerVersion:'pre-v2-score-v1',
  });
  createTrialRecord(db,{trial,nowIso:now});
  const makePrediction=(role,fingerprint,order)=>({
    role,modelFingerprint:fingerprint,targetDate:'2026-09-18',sourceFrontierDate:'2026-09-17',
    rankings:order.map((machineKey,index)=>({machineKey,tableNo:machineKey,machineName:'マイジャグラーV',rank:index+1,score:order.length-index})),
  });
  persistFormalPrediction(db,{trial,prediction:makePrediction('champion','champion-fp',[...KEYS].reverse()),nowIso:'2026-09-17T12:00:00.000Z'});
  if(withChallenger)persistFormalPrediction(db,{trial,prediction:makePrediction('challenger','challenger-fp',KEYS),nowIso:'2026-09-17T12:00:00.000Z'});
  const judgedRows=KEYS.map((tableNo,index)=>{
    const setting=6-index;
    const q=[0,0,0,0,0,0];q[setting-1]=1;
    return{tableNo,machine:'my',q,expectedSetting:setting};
  });
  return{db,trial,judgedRows};
}

test('formal target scoring turns protected q into paired Top10/Top5 evidence and atomically freezes the exact outcome',()=>{
  const {db,judgedRows}=setup();
  try{
    const scored=scoreFormalTargetDay(db,{
      storeId:'s1',lineageId:'lineage-a',trialNumber:1,targetDate:'2026-09-18',judgedRows,
      nowIso:'2026-09-18T23:00:00.000Z',
    });
    assert.equal(scored.inserted,true);
    assert.ok(scored.top10.delta>0);
    assert.ok(scored.top5.delta>0);
    assert.equal(scored.trial.trial.daysProcessed,1);
    assert.equal(scored.trial.trial.lastTargetDate,'2026-09-18');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,1);
    const outcome=db.prepare('SELECT * FROM pre_v2_formal_outcomes WHERE store_id=? AND lineage_id=? AND trial_number=? AND target_date=?').get('s1','lineage-a',1,'2026-09-18');
    assert.ok(outcome);
    assert.deepEqual(JSON.parse(outcome.judged_rows_json),judgedRows);
    assert.equal(outcome.outcome_hash,hashCanonical(judgedRows));
  }finally{db.close()}
});

test('formal target scoring is idempotent only for the exact same frozen outcome',()=>{
  const {db,judgedRows}=setup();
  try{
    const input={storeId:'s1',lineageId:'lineage-a',trialNumber:1,targetDate:'2026-09-18',judgedRows,nowIso:'2026-09-18T23:00:00.000Z'};
    const first=scoreFormalTargetDay(db,input);
    const second=scoreFormalTargetDay(db,{...input,nowIso:'2026-09-18T23:10:00.000Z'});
    assert.equal(first.inserted,true);
    assert.equal(second.inserted,false);
    assert.equal(loadTrialRecord(db,{storeId:'s1',lineageId:'lineage-a',trialNumber:1}).trial.daysProcessed,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_outcomes').get().n,1);

    const corrected=structuredClone(judgedRows);
    corrected[0].q=[1,0,0,0,0,0];
    corrected[0].expectedSetting=1;
    assert.throws(()=>scoreFormalTargetDay(db,{...input,judgedRows:corrected,nowIso:'2026-09-18T23:20:00.000Z'}),/outcome.*conflict|conflict.*outcome/i);
    assert.equal(loadTrialRecord(db,{storeId:'s1',lineageId:'lineage-a',trialNumber:1}).trial.daysProcessed,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_outcomes').get().n,1);
  }finally{db.close()}
});

test('formal target scoring fails closed before evidence mutation when a frozen prediction or judged machine is missing',()=>{
  const missingPrediction=setup({withChallenger:false});
  try{
    assert.throws(()=>scoreFormalTargetDay(missingPrediction.db,{
      storeId:'s1',lineageId:'lineage-a',trialNumber:1,targetDate:'2026-09-18',judgedRows:missingPrediction.judgedRows,
      nowIso:'2026-09-18T23:00:00.000Z',
    }),/challenger.*prediction|prediction.*challenger/i);
    assert.equal(missingPrediction.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,0);
    assert.equal(missingPrediction.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_outcomes').get().n,0);
  }finally{missingPrediction.db.close()}

  const missingTruth=setup();
  try{
    assert.throws(()=>scoreFormalTargetDay(missingTruth.db,{
      storeId:'s1',lineageId:'lineage-a',trialNumber:1,targetDate:'2026-09-18',judgedRows:missingTruth.judgedRows.slice(0,-1),
      nowIso:'2026-09-18T23:00:00.000Z',
    }),/exact.*machine set|missing/i);
    assert.equal(missingTruth.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_trial_days').get().n,0);
    assert.equal(missingTruth.db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_outcomes').get().n,0);
  }finally{missingTruth.db.close()}
});
