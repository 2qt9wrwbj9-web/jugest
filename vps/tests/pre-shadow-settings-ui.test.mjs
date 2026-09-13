import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const source=readFileSync(resolve(ROOT,'vps-ui-enhancements.mjs'),'utf8');

test('existing left-top settings exposes PRE accuracy comparison page',()=>{
  assert.match(source,/data-vps-settings-comparison/);
  assert.match(source,/PRE版 精度比較/);
  assert.match(source,/settingsPage==='comparison'\?comparisonSettingsHtml\(\)/);
});

test('comparison page loads authenticated VPS comparison for the active store and exposes audit diagnostics',()=>{
  assert.match(source,/createVpsAnalyticsClient/);
  assert.match(source,/getActiveStore\?\.\(\)/);
  assert.match(source,/getResearchComparison\([^)]*\{limit:90\}/);
  assert.match(source,/modelFingerprint/);
  assert.match(source,/sourceFrontierDate/);
  assert.match(source,/outcomeInputHash/);
  assert.match(source,/比較データ蓄積中/);
});

test('comparison page separates LIVE from historical walk-forward mode',()=>{
  assert.match(source,/comparisonMode='live'/);
  assert.match(source,/data-vps-comparison-mode="live"/);
  assert.match(source,/data-vps-comparison-mode="historical"/);
  assert.match(source,/>LIVE</);
  assert.match(source,/>過去検証</);
  assert.match(source,/comparisonData\?\.historical/);
  assert.match(source,/HISTORICAL WALK-FORWARD/);
});

test('LIVE pending copy names the exact target date and actual-data wait condition',()=>{
  assert.match(source,/予測を固定済み/);
  assert.match(source,/の実績データ待ち/);
  assert.match(source,/live\?\.rows/);
});
