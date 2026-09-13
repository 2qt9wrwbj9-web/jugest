import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestShadowPrediction,getShadowRefreshState,completeShadowPrediction} from '../src/analysis/shadow-refresh-state.mjs';

function setup(){
  const db=openDatabase(':memory:');migrate(db);
  const now='2026-09-13T00:00:00.000Z';
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',now,now);
  return db;
}

test('shadow refresh coalesces behind one active low-priority job and advances to newest frontier',()=>{
  const db=setup();
  try{
    const a=requestShadowPrediction(db,{storeId:'s1',frontierDate:'2026-09-12',nowIso:'2026-09-13T00:00:00.000Z'});
    assert.equal(a.job.type,'SHADOW_PREDICT');
    assert.equal(a.job.priority,70);
    assert.equal(a.job.sizeClass,'medium');
    assert.equal(a.job.estimatedLeaseMiB,512);
    const b=requestShadowPrediction(db,{storeId:'s1',frontierDate:'2026-09-13',nowIso:'2026-09-13T00:00:01.000Z'});
    assert.equal(b.job.id,a.job.id);
    assert.equal(getShadowRefreshState(db,{storeId:'s1'}).requestedFrontierDate,'2026-09-13');
    const completion=completeShadowPrediction(db,{storeId:'s1',jobId:a.job.id,completedFrontierDate:'2026-09-12',nowIso:'2026-09-13T00:00:02.000Z'});
    assert.ok(completion.job);
    assert.notEqual(completion.job.id,a.job.id);
    assert.equal(completion.job.payload.targetFrontierDate,'2026-09-13');
  }finally{db.close()}
});
