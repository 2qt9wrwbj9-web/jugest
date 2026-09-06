import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync('public/app-v510.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');

for(const q of ['storeManageQuery','storeManageFilter','storeManageSort','data-store-manage-search','data-store-filter','data-store-sort']){
  assert.ok(app.includes(q),`new store-management UI missing ${q}`);
}
assert.match(app,/URL未登録/);
assert.match(app,/data-store-edit=/);
assert.match(app,/data-store-requeue=/);
assert.match(app,/data-store-delete=/);
assert.match(app,/data-collector-enabled=/);
assert.doesNotMatch(app,/<small>取得開始日<\/small><input data-store-start/, '取得開始日の手動設定は表示しない');
for(const q of ['v510CollectorStoreRows','v510SaveCollectorStore','v510RequeueCollectorStore','v510DeleteCollectorStore']){
  assert.ok(html.includes(q),`headless store-management core missing ${q}`);
}
console.log('collector store management new-UI PASS');
