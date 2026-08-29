import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('./index.html','utf8');
const publicHtml=fs.readFileSync('./public/index.html','utf8');
assert.equal(html,publicHtml,'root/public index.html must stay byte-identical');
assert.match(html,/ジャグラー設定判別 v4\.\d+\.\d+/);
assert.match(html,/appVersion:"\d+\.\d+\.\d+"/);
assert.match(html,/function trendRosterRows\(\)/,'lightweight trend roster helper missing');
assert.match(html,/function renderTrendRoster\(\)/,'trend roster renderer missing');
assert.match(html,/台番＋機種名を先読み/,'trend roster should explain lightweight preload');
assert.match(html,/let meta=\[MONTH_REPORT_LABEL\[machine\]\|\|analysisMachineName\(machine\)\]/,'computed matrix row label must always include machine name');

const start=html.indexOf('function renderShopTrend(compute=false)');
const end=html.indexOf('const BRUTE_WD=',start);
assert.ok(start>0&&end>start,'renderShopTrend bounds missing');
const body=html.slice(start,end);
assert.match(body,/if\(!compute\)\{renderTrendRoster\(\);return\}/,'non-compute render should show lightweight table/machine roster');
const falseBranch=body.slice(body.indexOf('if(!compute)'),body.indexOf('let rows=trendFilteredRows()'));
assert.doesNotMatch(falseBranch,/ensureExternalJudged/,'lightweight roster must not trigger setting judgement');
assert.doesNotMatch(falseBranch,/trendFilteredRows\(/,'lightweight roster must not build judged trend matrix');

const launcher=fs.readFileSync('./ana-launcher.js');
assert.deepEqual(launcher,fs.readFileSync('./public/ana-launcher.js'),'Launcher root/public mismatch');
const single=fs.readFileSync('./ana-single-day.js');
assert.deepEqual(single,fs.readFileSync('./public/ana-single-day.js'),'single-day companion root/public mismatch');
console.log('PASS v4.7.8 trend roster: table number + machine name preload stays judgment-free');
