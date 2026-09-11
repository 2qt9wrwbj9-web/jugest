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
