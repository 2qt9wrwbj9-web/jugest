import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app-v510.js','utf8'),sync=fs.readFileSync('public/sync-core.js','utf8');
for(const method of ['getSyncStatus','createSyncShare','joinSyncShare','runDeviceSync','unlinkDeviceSync','getSyncCode'])assert.match(html,new RegExp(`${method}\\s*:`),`core bridge missing ${method}`);
assert.match(app,/renderSyncScreen\s*\(/);for(const token of ['data-sync-create','data-sync-join','data-sync-now','data-sync-unlink','data-sync-code'])assert.ok(app.includes(token),`sync UI missing ${token}`);
assert.doesNotMatch(sync,/function\s+mount\s*\(|MutationObserver|document\.getElementById/);console.log('v5.1.0 native device sync static PASS');
