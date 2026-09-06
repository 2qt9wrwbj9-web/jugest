import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['deleteStoreMaster']) assert.match(html,new RegExp(`${method}\\s*:`),`bridge missing ${method}`);
for(const token of ['data-store-master-delete','canDeleteMaster','deleteBlockedReason']) assert.ok(app.includes(token)||html.includes(token),`store delete flow missing ${token}`);
assert.match(app,/店舗を削除/);
console.log('v5.1.2 safe store deletion static PASS');
