import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const coreSource=readFileSync(resolve(ROOT,'vps-ui-enhancements.mjs'),'utf8');
const historicalSource=readFileSync(resolve(ROOT,'vps-ui-historical-comparison.mjs'),'utf8');
const source=`${coreSource}\n${historicalSource}`;

test('existing left-top settings exposes PRE accuracy comparison page',()=>{
  assert.match(coreSource,/data-vps-settings-comparison/);
  assert.match(coreSource,/PRE版 精度比較/);
  assert.match(coreSource,/settingsPage==='comparison'\?comparisonSettingsHtml\(\)/);
});

test('comparison page loads authenticated VPS comparison for the active store and exposes audit diagnostics',()=>{
  assert.match(source,/createVpsAnalyticsClient/);
  assert.match(source,/getActiveStore\?\.\(\)/);
  assert.match(source,/getResearchComparison\([^)]*\{limit:90\}/);
  assert.match(source,/modelFingerprint|preFingerprint/);
  assert.match(source,/sourceFrontierDate|preFrontierDate/);
  assert.match(source,/outcomeInputHash/);
  assert.match(coreSource,/比較データ蓄積中/);
});

test('comparison page separates LIVE from historical walk-forward mode',()=>{
  assert.match(historicalSource,/comparisonMode='live'/);
  assert.match(historicalSource,/data-vps-comparison-mode="live"/);
  assert.match(historicalSource,/data-vps-comparison-mode="historical"/);
  assert.match(historicalSource,/>LIVE</);
  assert.match(historicalSource,/>過去検証</);
  assert.match(historicalSource,/comparisonData\?\.historical/);
  assert.match(historicalSource,/HISTORICAL WALK-FORWARD/);
});

test('comparison page shows direct Top1 Top3 Top5 hit rates with hit-day counts in both modes',()=>{
  assert.match(historicalSource,/実的中率/);
  assert.match(historicalSource,/hitRates\?\.top1|hitRates\.top1/);
  assert.match(historicalSource,/hitRates\?\.top3|hitRates\.top3/);
  assert.match(historicalSource,/hitRates\?\.top5|hitRates\.top5/);
  assert.match(historicalSource,/\/\$\{Number\(item\?\.days\)\|\|0\}日|日.*fmtPct/);
  const liveStart=historicalSource.indexOf('function liveHtml(){');
  const historicalStart=historicalSource.indexOf('function historicalHtml(){');
  assert.ok(liveStart>=0&&historicalStart>liveStart);
  assert.match(historicalSource.slice(liveStart,historicalStart),/hitRateRows\(/);
  assert.match(historicalSource.slice(historicalStart),/hitRateRows\(/);
});

test('historical mode can explain pending refresh without implying progress reset',()=>{
  assert.match(historicalSource,/refreshPending/);
  assert.match(historicalSource,/新しいデータあり/);
  assert.match(historicalSource,/完了後に再検証予定/);
});

test('LIVE pending copy names the exact target date and actual-data wait condition',()=>{
  assert.match(historicalSource,/予測を固定済み/);
  assert.match(historicalSource,/の実績データ待ち/);
  assert.match(historicalSource,/live\?\.rows/);
});

test('analysis chip stays visible only while analysis is running',()=>{
  const start=historicalSource.indexOf('function reconcileAnalysisChip(){');
  const end=historicalSource.indexOf('\n}\nfunction storeSelectorHtml',start);
  assert.ok(start>=0&&end>start,'reconcileAnalysisChip must exist');
  const fn=historicalSource.slice(start,end+2);
  assert.match(fn,/includes\('店舗解析中'\)/);
  assert.match(fn,/if\(running\)chip\.style\.removeProperty\('display'\);else chip\.style\.display='none'/);
});

test('comparison overlay exposes an in-page store selector backed by bridge stores',()=>{
  assert.match(historicalSource,/getStores\?\.\(\)/);
  assert.match(historicalSource,/data-vps-comparison-store/);
  assert.match(historicalSource,/setActiveStore\?\.\(/);
  assert.match(historicalSource,/document\.addEventListener\('change'/);
});

test('comparison overlay redraw preserves scroll and skips identical markup',()=>{
  assert.match(historicalSource,/host\.innerHTML===nextHost\.innerHTML/);
  assert.match(historicalSource,/const scrollTop=host\.scrollTop/);
  assert.match(historicalSource,/nextHost\.scrollTop=scrollTop/);
  assert.match(historicalSource,/touch-action:pan-y/);
});
