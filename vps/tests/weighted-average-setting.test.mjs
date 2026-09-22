import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateStoreRows,machineStoreSummaries,mergeStoreRows} from '../../vps-ui-audit-utils.mjs';

const q=(setting)=>Array.from({length:6},(_,i)=>i===setting-1?0.7:0.06);

test('aggregateStoreRows averages MAP setting one machine one vote regardless of game count',()=>{
  const rows=[
    {machine:'a',games:1000,expectedSetting:3,q:q(3),diff:0,diffSource:'observed'},
    {machine:'a',games:8000,expectedSetting:5,q:q(5),diff:0,diffSource:'observed'}
  ];
  assert.equal(aggregateStoreRows(rows).avgExpectedSetting,4);
});

test('aggregateStoreRows excludes rows without posterior instead of using expected setting',()=>{
  const rows=[
    {machine:'a',games:3000,expectedSetting:6,q:null,diff:0,diffSource:'observed'},
    {machine:'a',games:3000,expectedSetting:4,q:q(4),diff:0,diffSource:'observed'}
  ];
  assert.equal(aggregateStoreRows(rows).avgExpectedSetting,4);
});

test('mergeStoreRows carries latest judged posterior onto stale raw provenance',()=>{
  const raw=[
    {machine:'a',machineName:'A',tableNo:'101',games:null,expectedSetting:null,q:null,diff:500,diffSource:'observed',gamesSource:'missing'}
  ];
  const display=[
    {machine:'a',machineName:'A',tableNo:'101',games:4200,expectedSetting:4.6,q:q(5),diff:500}
  ];
  const rows=mergeStoreRows(display,raw);
  assert.equal(rows.length,1);
  assert.equal(rows[0].games,4200);
  assert.equal(rows[0].expectedSetting,4.6);
  assert.deepEqual(rows[0].q,q(5));
  assert.equal(rows[0].diffSource,'observed');
  assert.equal(aggregateStoreRows(rows).avgExpectedSetting,5);
});

test('machineStoreSummaries uses the same one-machine-one-vote MAP average per machine',()=>{
  const rows=[
    {machine:'a',machineName:'A',games:1000,expectedSetting:3,q:q(3),diff:0,diffSource:'observed'},
    {machine:'a',machineName:'A',games:8000,expectedSetting:5,q:q(5),diff:0,diffSource:'observed'},
    {machine:'b',machineName:'B',games:4000,expectedSetting:2,q:q(2),diff:0,diffSource:'observed'}
  ];
  const summaries=machineStoreSummaries(rows);
  assert.equal(summaries.find(row=>row.machine==='a').avgExpectedSetting,4);
  assert.equal(summaries.find(row=>row.machine==='b').avgExpectedSetting,2);
});
