import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestHistoricalComparisonRefresh,HISTORICAL_JOB_PRIORITY,HISTORICAL_JOB_LEASE_MIB} from '../src/analysis/historical-refresh-state.mjs';

const T0='2026-09-13T12:00:00.000Z',T1='2026-09-13T12:01:00.000Z';
function day(index){return new Date(Date.UTC(2026,0,1)+index*86400000).toISOString().slice(0,10)}
function seed(db,count=12){
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',T0,T0);
  const putDay=db.prepare(`INSERT INTO store_days(store_id,business_date,quality_status,created_at,updated_at) VALUES(?,?,?,?,?)`);
  const putMachine=db.prepare(`INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)`);
  for(let i=0;i<count;i+=1){const date=day(i);putDay.run('s1',date,'valid',T0,T0);putMachine.run('s1',date,'101',JSON.stringify({tableNo:'101',sourceMachineName:'マイジャグラーV',games:5000+i,bb:20,rb:18,diff:i*10}))}
}

test('historical refresh coalesces by store run and cursor with lowest research priority',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);seed(db);
    const first=requestHistoricalComparisonRefresh(db,{storeId:'s1',nowIso:T0});
    const second=requestHistoricalComparisonRefresh(db,{storeId:'s1',nowIso:T1});
    assert.equal(first.job.id,second.job.id);
    assert.equal(first.job.type,'HISTORICAL_COMPARE');
    assert.equal(first.job.priority,HISTORICAL_JOB_PRIORITY);
    assert.equal(first.job.estimatedLeaseMiB,HISTORICAL_JOB_LEASE_MIB);
    assert.equal(HISTORICAL_JOB_PRIORITY,80);
    assert.equal(HISTORICAL_JOB_LEASE_MIB,768);
    assert.ok(first.run.nextTargetDate);
  }finally{db.close()}
});
