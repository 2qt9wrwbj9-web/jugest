import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestHistoricalComparisonRefresh,bootstrapHistoricalComparisonRuns} from '../src/analysis/historical-refresh-state.mjs';
import {advanceHistoricalCursor,getHistoricalComparisonRun,loadHistoricalRunSnapshot} from '../src/research/historical-comparison.mjs';

const NOW='2026-09-13T12:00:00.000Z';
function date(index){return new Date(Date.UTC(2026,0,1)+index*86400000).toISOString().slice(0,10)}
function seedStore(db,id,count=10){
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,`店-${id}`,'{}',NOW,NOW);
  const dayStmt=db.prepare('INSERT INTO store_days(store_id,business_date,quality_status,created_at,updated_at) VALUES(?,?,?,?,?)');
  const machineStmt=db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)');
  for(let i=0;i<count;i+=1){dayStmt.run(id,date(i),'valid',NOW,NOW);machineStmt.run(id,date(i),'101',JSON.stringify({tableNo:'101',diff:i*100,games:5000+i}))}
}
function appendDay(db,id,index){db.prepare('INSERT INTO store_days(store_id,business_date,quality_status,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,date(index),'valid',NOW,NOW);db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run(id,date(index),'101',JSON.stringify({tableNo:'101',diff:index*100,games:5000+index}))}

test('new live tail does not stale or expand a fixed historical snapshot',()=>{
  const db=openDatabase(':memory:');migrate(db);seedStore(db,'a',10);
  const first=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:NOW});
  const runId=first.run.id,identity=first.run.historyIdentity,last=first.run.snapshotLastDate,snapshotCount=loadHistoricalRunSnapshot(db,{runId}).length;
  appendDay(db,'a',10);
  const second=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:'2026-09-14T12:00:00.000Z'});
  assert.equal(second.run.id,runId);
  assert.equal(second.run.historyIdentity,identity);
  assert.equal(second.run.snapshotLastDate,last);
  assert.equal(loadHistoricalRunSnapshot(db,{runId}).length,snapshotCount);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM historical_comparison_runs WHERE store_id='a'").get().n,1);
  db.close();
});

test('correction inside active snapshot sets pending refresh without resetting current run',()=>{
  const db=openDatabase(':memory:');migrate(db);seedStore(db,'a',10);
  const first=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:NOW});
  const frozen=JSON.stringify(loadHistoricalRunSnapshot(db,{runId:first.run.id}));
  db.prepare("UPDATE machine_day_data SET payload_json=? WHERE store_id='a' AND business_date=? AND machine_key='101'").run(JSON.stringify({tableNo:'101',diff:999999,games:9999}),date(3));
  const second=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:'2026-09-14T12:00:00.000Z'});
  assert.equal(second.run.id,first.run.id);
  assert.equal(second.run.state,'queued');
  assert.equal(second.run.refreshPending,1);
  assert.equal(JSON.stringify(loadHistoricalRunSnapshot(db,{runId:first.run.id})),frozen,'frozen run input must not mutate');
  db.close();
});

test('completed run with pending corrected history creates exactly one successor snapshot',()=>{
  const db=openDatabase(':memory:');migrate(db);seedStore(db,'a',8);
  const first=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:NOW});
  db.prepare("UPDATE machine_day_data SET payload_json=? WHERE store_id='a' AND business_date=? AND machine_key='101'").run(JSON.stringify({tableNo:'101',diff:-999999,games:7777}),date(2));
  const pending=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:'2026-09-13T12:04:00.000Z'});
  assert.equal(pending.run.id,first.run.id);
  assert.equal(pending.run.refreshPending,1);
  advanceHistoricalCursor(db,{runId:first.run.id,nextTargetDate:null,processedDelta:1,scoredDelta:0,excludedDelta:1,preState:first.run.preState,nowIso:'2026-09-13T12:05:00.000Z'});
  assert.equal(getHistoricalComparisonRun(db,{storeId:'a',runId:first.run.id}).state,'complete');
  const replacement=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:'2026-09-14T12:00:00.000Z'});
  assert.notEqual(replacement.run.id,first.run.id);
  assert.equal(replacement.run.state,'queued');
  const again=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:'2026-09-14T12:01:00.000Z'});
  assert.equal(again.run.id,replacement.run.id,'same latest history must coalesce to one successor');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM historical_comparison_runs WHERE store_id='a'").get().n,2);
  db.close();
});

test('bootstrap creates successor for a completed snapshot after corrected history',()=>{
  const db=openDatabase(':memory:');migrate(db);seedStore(db,'a',8);
  const first=requestHistoricalComparisonRefresh(db,{storeId:'a',nowIso:NOW});
  advanceHistoricalCursor(db,{runId:first.run.id,nextTargetDate:null,processedDelta:1,scoredDelta:0,excludedDelta:1,preState:first.run.preState,nowIso:'2026-09-13T12:05:00.000Z'});
  db.prepare("UPDATE machine_day_data SET payload_json=? WHERE store_id='a' AND business_date=? AND machine_key='101'").run(JSON.stringify({tableNo:'101',diff:-999999,games:7777}),date(2));
  bootstrapHistoricalComparisonRuns(db,{nowIso:'2026-09-14T12:00:00.000Z'});
  const active=getHistoricalComparisonRun(db,{storeId:'a'});
  assert.notEqual(active.id,first.run.id);
  assert.equal(active.state,'queued');
  assert.equal(getHistoricalComparisonRun(db,{storeId:'a',runId:first.run.id}).state,'complete','completed audit run remains preserved');
  db.close();
});
