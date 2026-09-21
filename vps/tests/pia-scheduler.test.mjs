import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {shouldAttemptPiaCollection,jstClock} from '../src/collectors/pia-scheduler.mjs';

test('JST scheduler waits until 06:10 and runs once per server date',()=>{
  const db=openDatabase(':memory:');migrate(db);
  try{
    assert.deepEqual(jstClock(new Date('2026-09-21T21:09:00.000Z')),{date:'2026-09-22',minutes:369});
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-21T21:09:00.000Z')}).reason,'before_window');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-21T21:10:00.000Z')}).attempt,true);
    db.prepare(`INSERT INTO source_collector_state(collector_id,source_store_id,last_snapshot_date,last_attempt_at,updated_at) VALUES(?,?,?,?,?)`).run('pia-public:35','pia:35','2026-09-22','2026-09-21T21:10:00.000Z','2026-09-21T21:10:00.000Z');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-21T22:00:00.000Z')}).reason,'done_today');
  }finally{db.close()}
});

test('failed attempt is retried only after cooldown while snapshot date is still old',()=>{
  const db=openDatabase(':memory:');migrate(db);
  try{
    db.prepare(`INSERT INTO source_collector_state(collector_id,source_store_id,last_snapshot_date,last_attempt_at,updated_at) VALUES(?,?,?,?,?)`).run('pia-public:35','pia:35','2026-09-21','2026-09-21T21:10:00.000Z','2026-09-21T21:10:00.000Z');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-21T21:20:00.000Z')}).reason,'cooldown');
    assert.equal(shouldAttemptPiaCollection(db,{now:new Date('2026-09-21T21:41:00.000Z')}).attempt,true);
  }finally{db.close()}
});
