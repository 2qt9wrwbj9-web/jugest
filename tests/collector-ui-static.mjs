import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app-v510.js','utf8');
const relay=fs.readFileSync('tests/fixtures/legacy-netlify/functions/relay.mjs','utf8');

for(const q of ['renderCollectorScreen','renderStoreManagementScreen','data-collector-refresh','data-collector-receive','data-store-edit','data-store-requeue','data-store-delete','data-store-manage-search','data-store-filter','data-store-sort']){
  assert.ok(app.includes(q),`new collector UI missing ${q}`);
}
for(const q of ['refreshCollector','receiveCollector','requeueCollectorStore','deleteCollectorStore','saveCollectorStore','setCollectorEnabled']){
  assert.match(html,new RegExp(`${q}\\s*:`),`core bridge missing ${q}`);
}
for(const q of ['iosCollectorNextV2','iosCollectorPushV2','iosCollectorTargetUpsert','iosCollectorTargetDelete','iosCollectorRequeueDate','rotateIosCollectorKey','collectorStatus','IOS_COLLECTOR_MAX_STORES = 50','header_required','gamesSource','diffSource']){
  assert.ok(relay.includes(q),`relay missing ${q}`);
}
assert.doesNotMatch(html,/<[^>]+id=["'](?:IOS_TARGET_ADD_TOGGLE|IOS_TARGET_LIST|GLOBAL_COLLECTOR_IMPORT)["']/i,'legacy collector UI elements must be gone');
console.log('collector new-UI static PASS');
