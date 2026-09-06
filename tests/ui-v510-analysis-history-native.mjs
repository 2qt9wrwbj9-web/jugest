import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app-v510.js','utf8');

for(const method of ['getStoreAnalysisHistory','getStoreAnalysisSnapshot','deleteStoreAnalysisSnapshot']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
for(const token of ['data-analysis-history-open','data-analysis-history-delete','analysis-history-list','analysis-history-detail']){
  assert.ok(app.includes(token),`native analysis history UI missing ${token}`);
}
for(const old of ['renderStoreAnalysisHistory','storeAnalysisOpen','storeAnalysisDelete']){
  assert.ok(!html.includes(old),`old analysis-history UI dependency must be removed: ${old}`);
}
assert.doesNotMatch(html,/\$\(["']BRUTE_HISTORY(?:_DETAIL)?["']\)|getElementById\(["']BRUTE_HISTORY(?:_DETAIL)?["']\)/,'old analysis-history DOM IDs must not be queried');
console.log('v5.1.0 native analysis history static PASS');
