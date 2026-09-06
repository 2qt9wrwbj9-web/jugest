import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/app-v510.js','utf8');

for(const method of ['getStrategyAnalysis','saveCollectorStore','previewExternalJson','saveExternalJsonPreview']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
for(const fn of ['renderStrategyScreen','renderStoreManagementScreen','renderJsonImportScreen']){
  assert.match(js,new RegExp(`${fn}\\s*\\(`),`new UI must implement ${fn}`);
}
assert.match(js,/data-store-edit=/,'store management must expose URL edit/register actions');
assert.match(js,/data-store-save/,'store management must expose save action');
assert.match(js,/data-json-raw/,'JSON import must use native textarea');
assert.match(js,/data-json-preview/,'JSON import must require preview');
assert.match(js,/data-json-save/,'JSON import must explicitly save preview');
assert.doesNotMatch(js,/navigateLegacy\?\.\(['"](?:strategy|extimport|stores)/,'migrated Phase 6 screens must not visibly navigate to legacy pages');
console.log('v5.1.0 strategy/data-management native UI static PASS');
