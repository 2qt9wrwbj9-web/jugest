import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {canonicalJson} from '../src/canonical-json.mjs';
import {baselineModel,fingerprintModel} from '../src/research/model-search.mjs';
import {finalizeSealedHoldout} from '../src/research/holdout.mjs';
import {ensureResearchCycle,recordModelSearchCompletion} from '../src/analysis/research-cycle.mjs';

const NOW='2026-09-13T00:00:00.000Z';
function machine(tableNo,{diff=0}={}){const strong=String(tableNo).endsWith('7');return {tableNo,sourceMachineName:'マイジャグラーV',games:5000,bb:18+(strong?5:0),rb:16+(strong?6:0),diff}}
function days(){const out=[];for(let d=1;d<=30;d+=1){const date=`2026-08-${String(d).padStart(2,'0')}`,machines=[];for(let n=101;n<=110;n+=1){const strong=String(n).endsWith('7');machines.push(machine(String(n),{diff:(strong?1600:-200)+((d%3)-1)*20}))}out.push({date,machines})}return out}
function setup(state='converged'){
  const db=openDatabase(':memory:');migrate(db);db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','Holdout店','{}',NOW,NOW);
  const base=baselineModel(),baseFp=fingerprintModel(base);
  const candidate={version:'store-read-model-v1',axes:[{id:'tail7',predicates:[{field:'table_last_digit',op:'eq',value:'7'}],weight:1}]},candidateFp=fingerprintModel(candidate);
  db.prepare(`INSERT INTO research_model_registry(store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at) VALUES(?,?,?,NULL,0,'research_champion',1,NULL,'{}',?,?)`).run('s1',baseFp,canonicalJson(base),NOW,NOW);
  db.prepare(`INSERT INTO research_model_registry(store_id,fingerprint,model_json,parent_fingerprint,generation,status,validation_score,holdout_score,score_json,created_at,updated_at) VALUES(?,?,?,?,1,'historical',2,NULL,'{}',?,?)`).run('s1',candidateFp,canonicalJson(candidate),baseFp,NOW,NOW);
  db.prepare(`INSERT INTO research_loops(store_id,feature_version,current_fingerprint,best_fingerprint,generation,no_improve_count,repeated_fingerprint,state,last_error,frontier_date,search_round,updated_at) VALUES('s1','store-features-v1',?,?,1,5,NULL,?,NULL,'2026-08-30',5,?)`).run(baseFp,baseFp,state,NOW);
  return {db,baseFp,candidateFp,candidate};
}

test('sealed holdout cannot be evaluated before the research loop has converged',()=>{
  const f=setup('running');
  try{assert.throws(()=>finalizeSealedHoldout(f.db,{storeId:'s1',days:days(),frontierDate:'2026-08-30',nowIso:NOW}),error=>error?.code==='holdout_not_unsealed')}finally{f.db.close()}
});

test('converged loop evaluates historical champions once, activates the winner, and emits the live store-read snapshot',()=>{
  const f=setup('converged');
  try{
    const result=finalizeSealedHoldout(f.db,{storeId:'s1',days:days(),frontierDate:'2026-08-30',nowIso:NOW});
    assert.equal(result.winnerFingerprint,f.candidateFp,'tail-7 historical champion should win the unseen holdout');
    assert.equal(result.modelsEvaluated,2);
    assert.ok(result.holdoutDates.length>0);
    assert.equal(f.db.prepare("SELECT fingerprint FROM research_model_registry WHERE store_id='s1' AND status='research_champion'").get().fingerprint,f.candidateFp);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM backtest_runs WHERE store_id='s1' AND split_kind='holdout'").get().n,2);
    const loop=f.db.prepare('SELECT holdout_finalized_at,holdout_winner_fingerprint FROM research_loops WHERE store_id=?').get('s1');
    assert.equal(loop.holdout_winner_fingerprint,f.candidateFp);assert.ok(loop.holdout_finalized_at);

    const active=f.db.prepare('SELECT fingerprint,feature_version,source_frontier_date FROM active_store_models WHERE store_id=?').get('s1');
    assert.equal(active.fingerprint,f.candidateFp);assert.equal(active.feature_version,'store-features-v1');assert.equal(active.source_frontier_date,'2026-08-30');
    const snapshot=f.db.prepare("SELECT business_date,payload_json FROM client_snapshots WHERE store_id='s1' AND snapshot_type='store-read-active' AND version='store-read-v1'").get();
    assert.equal(snapshot.business_date,'2026-08-31');
    const payload=JSON.parse(snapshot.payload_json);
    assert.equal(payload.modelFingerprint,f.candidateFp);assert.equal(payload.asOfDate,'2026-08-30');assert.equal(payload.targetDate,'2026-08-31');
    assert.equal(payload.rankings[0].tableNo,'107');assert.equal(payload.rankings[0].rank,1);

    const again=finalizeSealedHoldout(f.db,{storeId:'s1',days:days(),frontierDate:'2026-08-30',nowIso:'2026-09-13T00:01:00.000Z'});
    assert.equal(again.winnerFingerprint,f.candidateFp);assert.equal(again.alreadyFinalized,true);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM backtest_runs WHERE store_id='s1' AND split_kind='holdout'").get().n,2,'holdout must not be repeatedly mined');
  }finally{f.db.close()}
});

test('model-search convergence automatically unlocks sealed holdout and activates its winner',()=>{
  const f=setup('running');
  try{
    const completed=recordModelSearchCompletion(f.db,{storeId:'s1',frontierDate:'2026-08-30',championFingerprint:f.baseFp,candidateModel:null,improved:false,validationScore:1,scoreJson:{},days:days(),nowIso:NOW});
    assert.equal(completed.converged,true);assert.equal(completed.reason,'no_improvement');
    assert.equal(completed.holdout.winnerFingerprint,f.candidateFp);assert.equal(completed.holdout.alreadyFinalized,false);
    assert.equal(f.db.prepare('SELECT fingerprint FROM active_store_models WHERE store_id=?').get('s1').fingerprint,f.candidateFp);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM backtest_runs WHERE store_id='s1' AND split_kind='holdout'").get().n,2);
  }finally{f.db.close()}
});

test('a new frontier reseals holdout while retaining the last active store model',()=>{
  const f=setup('converged');
  try{
    finalizeSealedHoldout(f.db,{storeId:'s1',days:days(),frontierDate:'2026-08-30',nowIso:NOW});
    const next=ensureResearchCycle(f.db,{storeId:'s1',featureVersion:'store-features-v1',frontierDate:'2026-09-01',nowIso:'2026-09-13T00:02:00.000Z'});
    assert.equal(next.loop.state,'running');assert.equal(next.job.type,'BACKTEST');
    const loop=f.db.prepare('SELECT holdout_finalized_at,holdout_winner_fingerprint,frontier_date FROM research_loops WHERE store_id=?').get('s1');
    assert.equal(loop.frontier_date,'2026-09-01');assert.equal(loop.holdout_finalized_at,null);assert.equal(loop.holdout_winner_fingerprint,null);
    assert.equal(f.db.prepare('SELECT fingerprint FROM active_store_models WHERE store_id=?').get('s1').fingerprint,f.candidateFp,'active model must survive resealing');
  }finally{f.db.close()}
});
