import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app-v510.js','utf8');

assert.doesNotMatch(app,/UI移植待ち|次の移植ゲート/,'FINAL UI must not expose migration placeholders');
assert.doesNotMatch(html,/legacy DOM is retained only as an off-flow compatibility runtime/,'FINAL source comment must not describe removed legacy runtime as retained');
for(const old of ['LEGACY_RUNTIME_ROOT','HanaAppBridge','HanaJudgeUI','navigateLegacy']){
  assert.ok(!html.includes(old),`FINAL source still contains legacy runtime token: ${old}`);
}
console.log('v5.1.0 FINAL shell completion gate PASS');
