import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {aggregateStoreRows,machineStoreSummaries,settingHeatColor,settingHeatTextColor} from '../../vps-ui-audit-utils.mjs';

test('store data summaries include average games for all rows and each machine',()=>{
  const rows=[
    {machine:'my',machineName:'マイジャグラーV',games:4000,diff:100,diffSource:'observed',expectedSetting:3},
    {machine:'my',machineName:'マイジャグラーV',games:6000,diff:-50,diffSource:'observed',expectedSetting:4},
    {machine:'go',machineName:'ゴーゴージャグラー3',games:3000,diff:null,diffSource:'missing',expectedSetting:2}
  ];
  assert.equal(aggregateStoreRows(rows).avgGames,13000/3);
  const my=machineStoreSummaries(rows).find(row=>row.machine==='my');
  assert.equal(my.avgGames,5000);
});

test('store win rate uses every machine as denominator and counts zero diff as a win',()=>{
  const summary=aggregateStoreRows([
    {diff:120},
    {diff:0},
    {diff:-1},
    {diff:null}
  ]);
  assert.equal(summary.rowCount,4);
  assert.equal(summary.winCount,2);
  assert.equal(summary.winRate,50);
});

test('setting heat uses four fixed readable ranges',()=>{
  assert.equal(settingHeatColor(2.49),'#ffffff');
  assert.equal(settingHeatColor(2.5),'#60a5fa');
  assert.equal(settingHeatColor(3.49),'#60a5fa');
  assert.equal(settingHeatColor(3.5),'#fde047');
  assert.equal(settingHeatColor(4.49),'#fde047');
  assert.equal(settingHeatColor(4.5),'#ef4444');
  assert.equal(settingHeatTextColor(2.49),'#172342');
  assert.equal(settingHeatTextColor(4.5),'#ffffff');
});

test('store data UI contains matrix filters, sticky axes, tap detail and hides the legacy machine list',async()=>{
  const source=await readFile(new URL('../../vps-ui-audit-store.mjs',import.meta.url),'utf8');
  for(const token of ['data-vps-matrix-period','vps-matrix-cell','vps-matrix-detail','position:sticky','機種 / 台番','store-data-screen.vps-matrix-active .machine-list','平均G','勝率','fmtWinRate(overall)'])assert.ok(source.includes(token),token);
  assert.ok(source.includes("dates=[...source.dates].sort((a,b)=>String(b).localeCompare(String(a)))"),'dates should be newest first left to right');
  for(const token of [
    '.store-data-screen .vps-audit-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}',
    '.store-data-screen .vps-audit-kpis>.vps-audit-kpi{grid-column:span 2',
    '.store-data-screen .vps-audit-kpis>.vps-audit-kpi:nth-child(n+4){grid-column:span 3'
  ])assert.ok(source.includes(token),token);
  assert.ok(source.includes("${kpi('総差枚',fmtDiff(overall.totalDiff))}${kpi('平均差枚',fmtDiff(overall.avgDiff))}${kpi('平均G',fmtGames(overall.avgGames))}${kpi('勝率',fmtWinRate(overall))}${kpi('平均出率',fmtRate(overall.actualRate))}"),'summary KPI order should put win rate on the wide second row');
});

test('matrix detail taps preserve the current horizontal and vertical scroll position',async()=>{
  const source=await readFile(new URL('../../vps-ui-audit-store.mjs',import.meta.url),'utf8');
  for(const token of ["cell.closest?.('.vps-matrix-wrap')",'scrollLeft=matrixScroll.left','scrollTop=matrixScroll.top'])assert.ok(source.includes(token),token);
});

test('matrix evolution preserves the heatmap and adds local search, density and mobile details',async()=>{
 const source=await readFile(new URL('../../vps-ui-audit-store.mjs',import.meta.url),'utf8');
 for(const token of [
  'data-vps-matrix-search','data-vps-matrix-match-count','data-vps-matrix-row','data-vps-matrix-search-empty',
  'data-vps-matrix-density','readMatrixDensity(shop)','writeMatrixDensity(activeShop(),density.value)',
  'vps-matrix-dense','vps-matrix-floating','data-vps-matrix-detail-close',
  'data-vps-matrix-cell','aria-pressed=','vps-matrix-label','position:sticky'
 ])assert.ok(source.includes(token),'missing matrix control: '+token);
 const search=source.slice(source.indexOf('function handleMatrixSearchInput('),source.indexOf('function handleMachineFilterChange('));
 assert.ok(search.includes('applyMatrixSearch(panel,matrixSearchState.query)'));
 assert.ok(!search.includes('schedule()'),'typing must not rerun all-day judgement');
 const change=source.slice(source.indexOf('function handleMachineFilterChange('),source.indexOf('function handleMachineFilterClick('));
 assert.ok(change.indexOf("if(density)")<change.indexOf('schedule()'),'density applied without recomputation');
 assert.ok(source.includes('detail.hidden=!selectedVisible'),'filter hides excluded selection details');
 assert.ok(source.includes('root.append(floating)'),'detail stays outside animated workspace');
 assert.ok(source.includes('scrollLeft=matrixScroll.left')&&source.includes('scrollTop=matrixScroll.top'),'both scroll axes retained');
 assert.ok(source.includes("dates=[...source.dates].sort((a,b)=>String(b).localeCompare(String(a)))"),'newest columns first');
 assert.ok(source.includes('settingHeatColor(ok?es:null)')&&source.includes('settingHeatTextColor(ok?es:null)'),'existing heat colors remain');
});
