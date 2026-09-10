import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {
  addCollectorStore,listCollectorStores,setCollectorStoreEnabled,getCollectorDay,
  ensureCollectorTargets,recoverExpiredCollectorRuns,peekEligibleCollectorDay,
  claimCollectorDay,resetCollectorDay,markCollectorFailure,getCollectorControl,setGlobalBlock
} from '../src/collector/repository.mjs';

function makeDb(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-collector-'));
  const path=join(dir,'jugest.sqlite');
  const db=openDatabase(path);migrate(db);
  return {db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}
const NOW='2026-09-09T19:00:00.000Z'; // 2026-09-10 04:00 JST

test('migration creates collector tables and store registration defaults disabled',()=>{
  const f=makeDb();try{
    const names=f.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
    for(const n of ['collector_stores','collector_days','collector_control'])assert.ok(names.includes(n),n);
    addCollectorStore(f.db,{storeId:'abc-store',slug:'abc-store',name:'ABC店',historyStart:'2026-09-07',nowIso:NOW});
    const stores=listCollectorStores(f.db);
    assert.equal(stores.length,1);assert.equal(stores[0].enabled,false);assert.equal(stores[0].historyStart,'2026-09-07');
    setCollectorStoreEnabled(f.db,{storeId:'abc-store',enabled:true,nowIso:NOW});
    assert.equal(listCollectorStores(f.db)[0].enabled,true);
  }finally{f.cleanup()}
});

test('04:00 JST gate creates yesterday but never today',()=>{
  const f=makeDb();try{
    addCollectorStore(f.db,{storeId:'abc',slug:'abc',name:'ABC',historyStart:'2026-09-09',nowIso:NOW});
    setCollectorStoreEnabled(f.db,{storeId:'abc',enabled:true,nowIso:NOW});
    ensureCollectorTargets(f.db,{now:new Date('2026-09-09T18:59:59.000Z'),historyBackfill:false});
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09'),null);
    ensureCollectorTargets(f.db,{now:new Date(NOW),historyBackfill:false});
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').state,'pending');
    assert.equal(getCollectorDay(f.db,'abc','2026-09-10'),null);
  }finally{f.cleanup()}
});

test('initial backfill covers history_start through yesterday and newest pending wins',()=>{
  const f=makeDb();try{
    addCollectorStore(f.db,{storeId:'abc',slug:'abc',name:'ABC',historyStart:'2026-09-07',nowIso:NOW});
    setCollectorStoreEnabled(f.db,{storeId:'abc',enabled:true,nowIso:NOW});
    ensureCollectorTargets(f.db,{now:new Date(NOW),historyBackfill:true});
    assert.equal(getCollectorDay(f.db,'abc','2026-09-07').state,'pending');
    assert.equal(getCollectorDay(f.db,'abc','2026-09-08').state,'pending');
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').state,'pending');
    const next=peekEligibleCollectorDay(f.db,{nowIso:NOW,todayJst:'2026-09-10'});
    assert.equal(next.businessDate,'2026-09-09');
  }finally{f.cleanup()}
});

test('collected excluded disabled and delayed rows are not automatically selected',()=>{
  const f=makeDb();try{
    for(const id of ['a','b']){
      addCollectorStore(f.db,{storeId:id,slug:id,name:id,historyStart:'2026-09-07',nowIso:NOW});
      setCollectorStoreEnabled(f.db,{storeId:id,enabled:true,nowIso:NOW});
    }
    ensureCollectorTargets(f.db,{now:new Date(NOW),historyBackfill:true});
    f.db.prepare("UPDATE collector_days SET state='collected' WHERE store_id='a' AND business_date='2026-09-09'").run();
    f.db.prepare("UPDATE collector_days SET state='excluded' WHERE store_id='b' AND business_date='2026-09-09'").run();
    f.db.prepare("UPDATE collector_days SET retry_after='2026-09-09T20:00:00.000Z' WHERE store_id='a' AND business_date='2026-09-08'").run();
    setCollectorStoreEnabled(f.db,{storeId:'b',enabled:false,nowIso:NOW});
    const next=peekEligibleCollectorDay(f.db,{nowIso:NOW,todayJst:'2026-09-10'});
    assert.equal(next.storeId,'a');assert.equal(next.businessDate,'2026-09-07');
  }finally{f.cleanup()}
});

test('expired running lease recovers to pending while live lease remains running',()=>{
  const f=makeDb();try{
    addCollectorStore(f.db,{storeId:'abc',slug:'abc',name:'ABC',historyStart:'2026-09-08',nowIso:NOW});
    setCollectorStoreEnabled(f.db,{storeId:'abc',enabled:true,nowIso:NOW});
    ensureCollectorTargets(f.db,{now:new Date(NOW),historyBackfill:true});
    claimCollectorDay(f.db,{storeId:'abc',businessDate:'2026-09-09',owner:'x',nowIso:NOW,leaseExpiresIso:'2026-09-09T18:59:00.000Z'});
    claimCollectorDay(f.db,{storeId:'abc',businessDate:'2026-09-08',owner:'y',nowIso:NOW,leaseExpiresIso:'2026-09-09T20:00:00.000Z'});
    const n=recoverExpiredCollectorRuns(f.db,{nowIso:NOW});assert.equal(n,1);
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').state,'pending');
    assert.equal(getCollectorDay(f.db,'abc','2026-09-08').state,'running');
  }finally{f.cleanup()}
});

test('ordinary failure delays only that day by 45 minutes',()=>{
  const f=makeDb();try{
    addCollectorStore(f.db,{storeId:'abc',slug:'abc',name:'ABC',historyStart:'2026-09-08',nowIso:NOW});
    setCollectorStoreEnabled(f.db,{storeId:'abc',enabled:true,nowIso:NOW});
    ensureCollectorTargets(f.db,{now:new Date(NOW),historyBackfill:true});
    claimCollectorDay(f.db,{storeId:'abc',businessDate:'2026-09-09',owner:'x',nowIso:NOW,leaseExpiresIso:'2026-09-09T19:05:00.000Z'});
    markCollectorFailure(f.db,{storeId:'abc',businessDate:'2026-09-09',nowIso:NOW,httpStatus:500,errorClass:'http',message:'500'});
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').retryAfter,'2026-09-09T19:45:00.000Z');
    assert.equal(peekEligibleCollectorDay(f.db,{nowIso:NOW,todayJst:'2026-09-10'}).businessDate,'2026-09-08');
  }finally{f.cleanup()}
});

test('reset returns collected/excluded to pending without deleting canonical data',()=>{
  const f=makeDb();try{
    addCollectorStore(f.db,{storeId:'abc',slug:'abc',name:'ABC',historyStart:'2026-09-09',nowIso:NOW});
    setCollectorStoreEnabled(f.db,{storeId:'abc',enabled:true,nowIso:NOW});
    ensureCollectorTargets(f.db,{now:new Date(NOW),historyBackfill:true});
    f.db.prepare("INSERT INTO store_days(store_id,business_date,normalized_payload_hash,quality_status,created_at,updated_at) VALUES(?,?,?,?,?,?)").run('abc','2026-09-09','oldhash','valid',NOW,NOW);
    f.db.prepare("UPDATE collector_days SET state='collected',raw_artifact_path='/old.html.gz' WHERE store_id='abc' AND business_date='2026-09-09'").run();
    resetCollectorDay(f.db,{storeId:'abc',businessDate:'2026-09-09',nowIso:NOW});
    assert.equal(getCollectorDay(f.db,'abc','2026-09-09').state,'pending');
    assert.equal(f.db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').normalized_payload_hash,'oldhash');
  }finally{f.cleanup()}
});

test('global block is durable',()=>{
  const f=makeDb();try{
    setGlobalBlock(f.db,{untilIso:'2026-09-09T19:45:00.000Z',nowIso:NOW});
    assert.equal(getCollectorControl(f.db).globalBlockUntil,'2026-09-09T19:45:00.000Z');
  }finally{f.cleanup()}
});
