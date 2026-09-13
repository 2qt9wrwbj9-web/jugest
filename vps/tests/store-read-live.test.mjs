import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {persistStoreReadSnapshot,STORE_READ_VERSION} from '../src/research/store-read-output.mjs';

const DAYS=[
  {date:'2026-09-12',machines:[{tableNo:'101',sourceMachineName:'マイジャグラーV',games:5000,bb:20,rb:18,diff:0},{tableNo:'107',sourceMachineName:'マイジャグラーV',games:5000,bb:24,rb:22,diff:1200}]},
  {date:'2026-09-13',machines:[{tableNo:'101',sourceMachineName:'マイジャグラーV',games:5100,bb:21,rb:18,diff:100},{tableNo:'107',sourceMachineName:'マイジャグラーV',games:5200,bb:25,rb:23,diff:1300}]}
];

test('store-read refresh captures first PRE prediction immutably while latest client snapshot may refresh',()=>{
  const db=openDatabase(':memory:');
  try{
    migrate(db);
    const now='2026-09-13T12:00:00.000Z';
    db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',now,now);
    const firstModel={version:'store-read-model-v1',axes:[{id:'tail7',predicates:[{field:'table_last_digit',op:'eq',value:'7'}],weight:1}]};
    const secondModel={version:'store-read-model-v1',axes:[{id:'tail1',predicates:[{field:'table_last_digit',op:'eq',value:'1'}],weight:1}]};
    const first=persistStoreReadSnapshot(db,{storeId:'s1',modelFingerprint:'fp-stable',model:firstModel,featureVersion:'store-features-v1',frontierDate:'2026-09-13',days:DAYS,nowIso:now});
    const second=persistStoreReadSnapshot(db,{storeId:'s1',modelFingerprint:'fp-stable',model:secondModel,featureVersion:'store-features-v1',frontierDate:'2026-09-13',days:DAYS,nowIso:'2026-09-13T12:05:00.000Z'});
    assert.equal(first.targetDate,'2026-09-14');
    assert.equal(second.targetDate,'2026-09-14');
    const live=db.prepare("SELECT * FROM store_prediction_snapshots WHERE store_id='s1' AND engine='pre_research' ORDER BY id").all();
    assert.equal(live.length,1);
    const livePayload=JSON.parse(live[0].payload_json);
    assert.equal(livePayload.rankings[0].tableNo,'107');
    assert.equal(live[0].engine_version,STORE_READ_VERSION);
    assert.equal(live[0].source_frontier_date,'2026-09-13');
    const latest=db.prepare("SELECT payload_json FROM client_snapshots WHERE store_id='s1' AND snapshot_type='store-read-active' AND version=?").get(STORE_READ_VERSION);
    assert.equal(JSON.parse(latest.payload_json).rankings[0].tableNo,'101');
  }finally{db.close()}
});
