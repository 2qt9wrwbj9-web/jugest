import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {enrichStoreReadRankings} from '../src/research/store-read-explain.mjs';
import {enrichStoredStoreReadPayload} from '../src/research/store-read-output.mjs';
import {patchJugestIndexSource} from '../src/ui-source-patch.mjs';
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

test('existing PRE snapshot can gain audit fields without changing persisted score/rank',()=>{
  const model={axes:[{id:'tail1',predicates:[{field:'table_last_digit',op:'eq',value:'1'}],weight:.4,support:50,lift:.2,pValue:.01,foldPassRate:1,robustness:1}]};
  const payload={status:'ready',storeId:'s1',modelFingerprint:'fp1',featureVersion:'v1',asOfDate:'2026-09-02',targetDate:'2026-09-03',machineCount:1,rankings:[{machineKey:'101',tableNo:'101',machineName:'A',score:.4,rank:1}]};
  const days=[{date:'2026-09-02',machines:[{tableNo:'101',machineName:'A',diff:100,games:5000,bb:20,rb:18}]}];
  const out=enrichStoredStoreReadPayload({payload,activeModel:{storeId:'s1',fingerprint:'fp1',model},days});
  assert.equal(out.explanationVersion,'pre-audit-v1');
  assert.equal(out.rankings[0].score,.4);assert.equal(out.rankings[0].rank,1);
  assert.equal(out.rankings[0].evidenceFamilyCount,1);
});

test('store summaries use observed diff metrics and one-table-one-vote MAP setting average',()=>{
  const rows=[
    {machine:'my',machineName:'マイV',games:3000,diff:600,diffSource:'observed',expectedSetting:4,q:[.05,.10,.15,.50,.15,.05]},
    {machine:'my',machineName:'マイV',games:2000,diff:-300,diffSource:'observed',expectedSetting:2,q:[.10,.45,.20,.15,.07,.03]},
    {machine:'im',machineName:'ネオアイム',games:5000,diff:900,diffSource:'observed',expectedSetting:3,q:[.05,.10,.30,.30,.15,.10]},
    {machine:'im',machineName:'ネオアイム',games:5000,diff:3000,diffSource:'estimated',expectedSetting:5,q:[.05,.10,.10,.15,.45,.15]}
  ];
  const overall=aggregateStoreRows(rows);
  assert.equal(overall.totalDiff,1200);assert.equal(overall.avgDiff,400);assert.equal(overall.diffCount,3);
  assert.equal(overall.actualRate,104);
  assert.equal(overall.avgExpectedSetting,3.625);
  const machines=machineStoreSummaries(rows);
  assert.deepEqual(machines.map(x=>x.machine),['im','my']);
  const my=machines.find(x=>x.machine==='my'),im=machines.find(x=>x.machine==='im');
  assert.equal(my.totalDiff,300);assert.equal(my.avgDiff,150);assert.equal(my.actualRate,102);assert.equal(my.avgExpectedSetting,3);
  assert.equal(im.totalDiff,900);assert.equal(im.diffCount,1);assert.equal(im.avgExpectedSetting,4.25);
});

test('store MAP average excludes rows without posterior q instead of falling back to expected setting',()=>{
  const rows=[
    {machine:'my',games:9000,expectedSetting:6,q:null},
    {machine:'my',games:1000,expectedSetting:1,q:[.7,.1,.05,.05,.05,.05]}
  ];
  assert.equal(aggregateStoreRows(rows).avgExpectedSetting,1);
});

test('exclusion reasons are readable while unknown codes remain auditable',()=>{
  assert.match(exclusionReasonLabel('insufficient_history'),/7日未満/);
  assert.match(exclusionReasonLabel('pre_cycle_incomplete'),/収束/);
  assert.equal(exclusionReasonLabel('future_new_code'),'future_new_code');
});

test('browser addon is injected by VPS-only source patch, parses, and protected core stays untouched',()=>{
  const core=readFileSync(resolve(ROOT,'core-v510.js'),'utf8');
  assert.doesNotMatch(core,/vps-ui-audit-store\.mjs|document\.|createElement|appendChild/);
  const addon=resolve(ROOT,'vps-ui-audit-store.mjs'),syntax=spawnSync(process.execPath,['--check',addon],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr||syntax.stdout);
  const source=readFileSync(resolve(ROOT,'index.html'),'utf8'),patched=patchJugestIndexSource(source),tag='vps-ui-audit-store.mjs';
  assert.equal(patched.split(tag).length-1,1);
  assert.equal(patchJugestIndexSource(patched).split(tag).length-1,1);
});
