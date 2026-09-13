import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {deriveStoreMachineCount,sizeBucket,persistTaskMetric} from '../src/analysis/task-metrics.mjs';

const NOW='2026-09-13T00:00:00.000Z';

function seedStoreAndJob(db){
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','Test Store','{}',NOW,NOW);
  const job=db.prepare(`INSERT INTO jobs(type,priority,idempotency_key,payload_json,size_class,estimated_lease_mib,max_attempts,attempts,failure_count,state,created_at,updated_at)
    VALUES('DAILY_ANALYSIS',20,'metric-fixture','{}','medium',512,3,1,0,'running',?,?)`).run(NOW,NOW);
  return Number(job.lastInsertRowid);
}

test('machine count uses latest valid day and falls back to median of last seven non-empty days',()=>{
  assert.deepEqual(deriveStoreMachineCount([
    {date:'2026-09-01',machines:[{tableNo:'1'},{tableNo:'2'}]},
    {date:'2026-09-02',machines:[{tableNo:'1'},{tableNo:'2'},{tableNo:'3'}]}
  ]),{count:3,method:'latest'});
  assert.deepEqual(deriveStoreMachineCount([
    {date:'2026-09-01',machines:Array.from({length:100},(_,i)=>({tableNo:String(i)}))},
    {date:'2026-09-02',machines:[]},
    {date:'2026-09-03',machines:[]}
  ]),{count:100,method:'median7'});
});

test('size buckets are deterministic at boundaries',()=>{
  assert.equal(sizeBucket(100),'1-100');
  assert.equal(sizeBucket(101),'101-200');
  assert.equal(sizeBucket(300),'201-300');
  assert.equal(sizeBucket(301),'301-500');
  assert.equal(sizeBucket(501),'501+');
});

test('task metric persists store scale and peak rss',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);
    const jobId=seedStoreAndJob(db);
    const id=persistTaskMetric(db,{
      jobId,storeId:'s1',phase:1,taskKind:'daily_analysis',taskVersion:'v1',modelFingerprint:null,
      storeMachineCount:241,dayCount:180,rowCount:42000,workloadUnits:42000,
      startedAt:NOW,endedAt:'2026-09-13T00:00:05.600Z',durationMs:5600,
      startRssMiB:72,endRssMiB:81,peakRssMiB:207,cpuMs:1100,status:'succeeded',errorClass:null,details:{machineCountMethod:'latest'}
    });
    const row=db.prepare('SELECT * FROM analysis_task_metrics WHERE id=?').get(id);
    assert.equal(row.store_size_bucket,'201-300');
    assert.equal(row.peak_rss_mib,207);
    assert.equal(row.store_id,'s1');
    assert.deepEqual(JSON.parse(row.details_json),{machineCountMethod:'latest'});
  }finally{db.close()}
});
