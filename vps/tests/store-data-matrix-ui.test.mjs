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
  for(const token of ['data-vps-matrix-period','vps-matrix-cell','vps-matrix-detail','position:sticky','機種 / 台番','store-data-screen.vps-matrix-active .machine-list','平均G'])assert.ok(source.includes(token),token);
  assert.ok(source.includes("[...source.dates].reverse()"),'dates should be chronological left to right');
});
