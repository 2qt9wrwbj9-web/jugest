import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app-v510.js',import.meta.url),'utf8');
const client=fs.existsSync(new URL('../vps-browser-analytics.mjs',import.meta.url))
  ?fs.readFileSync(new URL('../vps-browser-analytics.mjs',import.meta.url),'utf8')
  :'';

test('ordinary store analysis loads the VPS analytics module and canonical snapshot',()=>{
  assert.match(app,/import\(['"]\.\/vps-browser-analytics\.mjs['"]\)/);
  assert.match(app,/loadVpsStoreAnalysis/);
  assert.match(app,/getDefaultAnalysis\(activeShop\)/);
  assert.match(app,/action==='store-analysis'[\s\S]{0,500}loadVpsStoreAnalysis\(\)/);
});

test('local heavy analysis is gated behind an explicit rollback/developer switch',()=>{
  const fallback=app.indexOf('global.JUGEST_LOCAL_ANALYSIS_FALLBACK===true');
  const localRun=app.indexOf('bridge.runStoreAnalysis',Math.max(0,fallback));
  assert.notEqual(fallback,-1,'explicit local-analysis fallback gate must exist');
  assert.notEqual(localRun,-1,'legacy local runner should remain available for rollback');
  assert.ok(localRun>fallback,'local run must occur only after the explicit fallback gate');
  assert.doesNotMatch(app.slice(0,fallback),/bridge\.runStoreAnalysis/);
});

test('canonical browser analytics path is independent from IndexedDB analytical helpers',()=>{
  assert.ok(client.length>0,'VPS browser analytics module must exist');
  assert.match(client,/\/api\/vps/);
  assert.doesNotMatch(client,/externalDbGet|externalDbSet|indexedDB/i);
});

test('store analysis UI presents the fixed VPS analysis contract instead of editable local-heavy options',()=>{
  const start=app.indexOf('renderStoreAnalysisScreen(){');
  const end=app.indexOf('renderAnalysisHistory(){',start);
  assert.ok(start>=0&&end>start,'store analysis renderer must exist');
  const renderer=app.slice(start,end);
  assert.match(renderer,/VPS自動解析/);
  assert.match(renderer,/180日/);
  assert.match(renderer,/2000G/);
  assert.match(renderer,/単一/);
  assert.match(renderer,/最低4日/);
  assert.match(renderer,/VPS解析結果を更新/);
  assert.doesNotMatch(renderer,/data-analysis-period|data-analysis-ming|data-analysis-dims|data-analysis-mindays/);
  assert.doesNotMatch(renderer,/法則探索を実行/);
});
