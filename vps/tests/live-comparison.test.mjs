import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';

test('migration creates immutable live prediction and score tables',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);
    const prediction=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='store_prediction_snapshots'").get();
    const score=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='store_prediction_scores'").get();
    assert.equal(prediction?.name,'store_prediction_snapshots');
    assert.equal(score?.name,'store_prediction_scores');
  }finally{db.close()}
});
