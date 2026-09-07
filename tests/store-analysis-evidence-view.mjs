import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../public/app-v510.js',import.meta.url),'utf8');

assert.match(html,/positiveStore=bruteSingleFactGroups\(storeCandidates\.filter\(c=>c\.practicalEffect>0\)\)/,'store-wide positives must be collapsed by existing fact groups');
assert.match(html,/machinePositive/,'machine-scoped evidence must be exported separately');
assert.match(html,/capped:Math\.abs\(practicalEffect\)>=\.699/,'effect-cap state must be exported for the UI');
assert.match(html,/relatedConditions/,'related conditions in the same evidence family must be retained for audit');
assert.match(app,/独立根拠/,'analysis KPI must describe independent evidence rather than raw usable conditions');
assert.match(app,/検証条件/,'raw condition volume must remain visible as a diagnostic count');
assert.match(app,/機種別のプラス根拠/,'machine-scoped evidence must be visually separated from store-wide evidence');
assert.match(app,/上限/,'capped +0.700 effects must be labelled as capped');

console.log('store-analysis evidence view regression PASS');
