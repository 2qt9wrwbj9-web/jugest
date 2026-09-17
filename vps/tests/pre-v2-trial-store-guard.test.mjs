import test from 'node:test';
import assert from 'node:assert/strict';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {applyFormalDay,startFormalTrial} from '../src/research/pre-v2/trial.mjs';
import {
  createTrialRecord,
  migratePreV2TrialStore,
  saveTrialState,
} from '../src/research/pre-v2/trial-store.mjs';

test('saveTrialState cannot advance formal evidence outside appendTrialDay',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);
    migratePreV2TrialStore(db);
    const now='2026-09-17T00:00:00.000Z';
    db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run('store-a','PRE v2 guard store','{}',now,now);
    const before=startFormalTrial({
      storeId:'store-a',lineageId:'lineage-a',trialNumber:1,
      championFingerprint:'champion-1',challengerFingerprint:'challenger-1',
      machineSetHash:'machines-v1',scorerVersion:'pre-v2-score-v1',
    });
    const created=createTrialRecord(db,{trial:before,nowIso:'2026-09-17T01:00:00.000Z'});
    const advanced=applyFormalDay(before,{targetDate:'2026-10-01',top10Delta:0.2,top5Delta:0.1});
    assert.throws(()=>saveTrialState(db,{
      trial:advanced,
      expectedStateHash:created.row.stateHash,
      nowIso:'2026-10-02T00:00:00.000Z',
    }),/appendTrialDay|evidence/i);
  }finally{db.close()}
});
