import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['getCurrentRunDraft','getRunRecord','saveRunRecord','deleteRunRecord','getRecordOptions','addRecordTag','setRecordTagActive'])assert.match(html,new RegExp(`${method}\\s*:`),`core bridge missing ${method}`);
assert.match(app,/renderRecordEditor\s*\(/);for(const token of ['data-record-save-current','data-record-edit','data-record-delete','data-record-save','data-record-tag','data-record-add-tag'])assert.ok(app.includes(token),`record UI missing ${token}`);
for(const label of ['現金投資','貯メダル投資','回収枚数','換金額','貸出','交換'])assert.ok(app.includes(label),`record finance missing ${label}`);
console.log('v5.1.0 native record editor static PASS');
