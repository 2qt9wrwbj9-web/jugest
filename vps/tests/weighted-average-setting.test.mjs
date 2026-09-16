import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateStoreRows,machineStoreSummaries,mergeStoreRows} from '../../vps-ui-audit-utils.mjs';

test('aggregateStoreRows weights expected setting by observed game count',()=>{
  const rows=[
    {machine:'a',games:1000,expectedSetting:3,diff:0,diffSource:'observed'},
    {machine:'a',games:8000,expectedSetting:5,diff:0,diffSource:'observed'}
  ];
  const result=aggregateStoreRows(rows);
  assert.ok(Math.abs(result.avgExpectedSetting-(43000/9000))<1e-12);
});

test('aggregateStoreRows excludes rows without positive games from weighted expected setting',()=>{
  const rows=[
    {machine:'a',games:1000,expectedSetting:3,diff:0,diffSource:'observed'},
    {machine:'a',games:0,expectedSetting:6,diff:0,diffSource:'observed'},
    {machine:'a',games:null,expectedSetting:6,diff:0,diffSource:'observed'}
  ];
  assert.equal(aggregateStoreRows(rows).avgExpectedSetting,3);
});

test('aggregateStoreRows does not coerce missing expected setting to zero',()=>{
  const rows=[
    {machine:'a',games:3000,expectedSetting:null,diff:0,diffSource:'observed'},
    {machine:'a',games:3000,expectedSetting:4,diff:0,diffSource:'observed'}
  ];
  assert.equal(aggregateStoreRows(rows).avgExpectedSetting,4);
});

test('mergeStoreRows overlays latest judged games and expected setting onto stale raw provenance',()=>{
  const raw=[
    {machine:'a',machineName:'A',tableNo:'101',games:null,expectedSetting:null,diff:500,diffSource:'observed',gamesSource:'missing'}
  ];
  const display=[
    {machine:'a',machineName:'A',tableNo:'101',games:4200,expectedSetting:4.6,diff:500}
  ];
  const rows=mergeStoreRows(display,raw);
  assert.equal(rows.length,1);
  assert.equal(rows[0].games,4200);
  assert.equal(rows[0].expectedSetting,4.6);
  assert.equal(rows[0].diffSource,'observed');
  assert.equal(aggregateStoreRows(rows).avgExpectedSetting,4.6);
});

test('machineStoreSummaries uses the same game-weighted expected setting per machine',()=>{
  const rows=[
    {machine:'a',machineName:'A',games:1000,expectedSetting:3,diff:0,diffSource:'observed'},
    {machine:'a',machineName:'A',games:8000,expectedSetting:5,diff:0,diffSource:'observed'},
    {machine:'b',machineName:'B',games:4000,expectedSetting:2,diff:0,diffSource:'observed'}
  ];
  const summaries=machineStoreSummaries(rows);
  const a=summaries.find(row=>row.machine==='a');
  assert.ok(Math.abs(a.avgExpectedSetting-(43000/9000))<1e-12);
});
