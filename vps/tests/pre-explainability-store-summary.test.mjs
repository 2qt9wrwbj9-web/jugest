import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {enrichStoreReadRankings} from '../src/research/store-read-explain.mjs';
import {aggregateStoreRows,machineStoreSummaries,exclusionReasonLabel} from '../../vps-ui-audit-utils.mjs';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));

test('PRE explanation preserves raw score/rank and collapses overlapping facts',()=>{
  const featureRows=[
    {machineKey:'101',tableNo:'101',machineName:'A',features:{table_no:'101',table_last_digit:'1',hist_1_diff_mean:120,hist_7_diff_mean:100}},
    {machineKey:'102',tableNo:'102',machineName:'A',features:{table_no:'102',table_last_digit:'2',hist_1_diff_mean:-50,hist_7_diff_mean:-40}}
  ];
  const rankings=[{machineKey:'101',tableNo:'101',machineName:'A',score:.75,rank:1},{machineKey:'102',tableNo:'102',machineName:'A',score:0,rank:2}];
  const model={axes:[
    {id:'exact',predicates:[{field:'table_no',op:'eq',value:'101'}],weight:.3,support:40,lift:.18,pValue:.01,foldPassRate:1,robustness:1},
    {id:'tail',predicates:[{field:'table_last_digit',op:'eq',value:'1'}],weight:.2,support:45,lift:.14,pValue:.02,foldPassRate:1,robustness:1},
    {id:'h1',predicates:[{field:'hist_1_diff_mean',op:'gte',value:50}],weight:.15,support:35,lift:.12,pValue:.03,foldPassRate:.75,robustness:1},
    {id:'h7',predicates:[{field:'hist_7_diff_mean',op:'gte',value:50}],weight:.10,support:32,lift:.10,pValue:.04,foldPassRate:.75,robustness:.5}
  ]};
  const out=enrichStoreReadRankings({rankings,featureRows,model});
  assert.equal(out[0].score,.75);assert.equal(out[0].rank,1);
  assert.equal(out[1].score,0);assert.equal(out[1].rank,2);
  assert.equal(out[0].evidenceMatchedCount,4);
  assert.equal(out[0].evidenceFamilyCount,2);
  assert.ok(out[0].aimScore>=0&&out[0].aimScore<=100);
  assert.ok(out[0].evidenceConfidence>=0&&out[0].evidenceConfidence<=100);
  assert.equal(out[0].evidence.length,2);
});

test('store summaries use total diff over total games and group by machine',()=>{
  const rows=[
    {machine:'my',machineName:'マイV',games:3000,diff:600,expectedSetting:4},
    {machine:'my',machineName:'マイV',games:2000,diff:-300,expectedSetting:2},
    {machine:'im',machineName:'ネオアイム',games:5000,diff:900,expectedSetting:3}
  ];
  const overall=aggregateStoreRows(rows);
  assert.equal(overall.totalDiff,1200);assert.equal(overall.avgDiff,400);
  assert.equal(overall.actualRate,104);
  const machines=machineStoreSummaries(rows);
  assert.deepEqual(machines.map(x=>x.machine),['im','my']);
  const my=machines.find(x=>x.machine==='my');
  assert.equal(my.totalDiff,300);assert.equal(my.avgDiff,150);assert.equal(my.actualRate,102);assert.equal(my.avgExpectedSetting,3);
});

test('exclusion reasons are readable while unknown codes remain auditable',()=>{
  assert.match(exclusionReasonLabel('insufficient_history'),/7日未満/);
  assert.match(exclusionReasonLabel('pre_cycle_incomplete'),/収束/);
  assert.equal(exclusionReasonLabel('future_new_code'),'future_new_code');
});

test('browser addon is loaded without changing headless data runtime',()=>{
  const core=readFileSync(resolve(ROOT,'core-v510.js'),'utf8');
  assert.match(core,/vps-ui-audit-store\.mjs/);
  assert.match(core,/location[^\n]+protocol[^\n]+data:/);
});
