import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {baselineModel,fingerprintModel} from '../src/research/model-search.mjs';
import {activateStoreModel} from '../src/research/store-read-output.mjs';
import {migratePreV2TrialStore} from '../src/research/pre-v2/trial-store.mjs';
import {startFormalLiveTrial} from '../src/research/pre-v2/formal-start.mjs';
import {loadFormalModelSnapshot} from '../src/research/pre-v2/formal-model-store.mjs';

function days(){
  return Array.from({length:10},(_,index)=>{
    const day=index+1;
    return{date:`2026-09-${String(day).padStart(2,'0')}`,machines:[
      {tableNo:'101',sourceMachineName:'マイジャグラーV',machine:'my',games:5000,bb:20,rb:18,diff:100+day},
      {tableNo:'102',sourceMachineName:'マイジャグラーV',machine:'my',games:5100,bb:21,rb:17,diff:-50+day},
      {tableNo:'103',sourceMachineName:'マイジャグラーV',machine:'my',games:5200,bb:22,rb:19,diff:250+day},
    ]};
  });
}

function candidate(tableNo){
  const model={version:'store-read-model-v1',axes:[{id:`axis-${tableNo}`,predicates:[{field:'table_no',op:'eq',value:tableNo}],weight:1}]};
  return Object.freeze({...model,fingerprint:fingerprintModel(model)});
}

function registerResearchModel(db,{storeId,model,nowIso}){
  db.prepare(`INSERT INTO research_model_registry(
    store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at
  ) VALUES(?,?,?,NULL,1,'research_champion',2,NULL,'{}',?,?)`).run(
    storeId,model.fingerprint,JSON.stringify(model),nowIso,nowIso
  );
}

test('formal trial freezes exact Champion and Challenger model JSON at start',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);migratePreV2TrialStore(db);
    const now='2026-09-10T12:00:00.000Z',storeId='s1',history=days();
    db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(storeId,'モデル固定店','{}',now,now);
    const champion=baselineModel(),challenger=candidate('103');
    activateStoreModel(db,{storeId,fingerprint:champion.fingerprint,model:champion,featureVersion:'store-feature-v1',frontierDate:'2026-09-10',days:history,nowIso:now});
    registerResearchModel(db,{storeId,model:challenger,nowIso:now});

    const started=startFormalLiveTrial(db,{storeId,lineageId:'pre-v2-live',challengerFingerprint:challenger.fingerprint,featureVersion:'store-feature-v1',days:history,frontierDate:'2026-09-10',nowIso:now});
    const key={storeId,lineageId:'pre-v2-live',trialNumber:started.trial.trial.trialNumber};
    const frozenChampion=loadFormalModelSnapshot(db,{...key,role:'champion'});
    const frozenChallenger=loadFormalModelSnapshot(db,{...key,role:'challenger'});
    assert.deepEqual(frozenChampion.model,champion);
    assert.deepEqual(frozenChallenger.model,challenger);
    assert.equal(frozenChampion.modelFingerprint,champion.fingerprint);
    assert.equal(frozenChallenger.modelFingerprint,challenger.fingerprint);

    const replacement=candidate('102');
    activateStoreModel(db,{storeId,fingerprint:replacement.fingerprint,model:replacement,featureVersion:'store-feature-v1',frontierDate:'2026-09-10',days:history,nowIso:'2026-09-10T13:00:00.000Z'});
    db.prepare("UPDATE research_model_registry SET model_json=?,updated_at=? WHERE store_id=? AND fingerprint=?").run(JSON.stringify(replacement),'2026-09-10T13:00:00.000Z',storeId,challenger.fingerprint);

    assert.deepEqual(loadFormalModelSnapshot(db,{...key,role:'champion'}).model,champion);
    assert.deepEqual(loadFormalModelSnapshot(db,{...key,role:'challenger'}).model,challenger);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pre_v2_formal_models').get().n,2);
  }finally{db.close()}
});
