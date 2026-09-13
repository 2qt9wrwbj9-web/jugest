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

test('LIVE pending copy names the exact target date and actual-data wait condition',()=>{
  assert.match(historicalSource,/予測を固定済み/);
  assert.match(historicalSource,/の実績データ待ち/);
  assert.match(historicalSource,/live\?\.rows/);
});

test('analysis completion chip visibility remains owned by the core timer',()=>{
  const start=coreSource.indexOf('function reconcileFailureChip(){');
  const end=coreSource.indexOf('\n}\n\nfunction backfillCardHtml',start);
  assert.ok(start>=0&&end>start,'reconcileFailureChip must exist');
  const fn=coreSource.slice(start,end+2);
  const nonFailure=fn.match(/if\(!text\.includes\('解析失敗'\)\)\{([^}]*)\}/)?.[1]||'';
  assert.match(nonFailure,/text\.includes\('店舗解析中'\)\|\|text\.includes\('解析完了'\)/);
  assert.match(nonFailure,/setFailureAck\(''\);return/);
  assert.doesNotMatch(nonFailure,/chip\.style\./,'non-failure completion visibility must stay owned by the core timer');
  assert.match(fn,/if\(getFailureAck\(\)===fingerprint\)chip\.style\.display='none';else chip\.style\.removeProperty\('display'\)/);
});
