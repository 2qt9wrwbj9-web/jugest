import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['getStoreFinance','setStoreSavedBalance','renameStore'])assert.match(html,new RegExp(`${method}\\s*:`),`core bridge missing ${method}`);
assert.match(app,/renderStoreFinanceScreen\s*\(/);for(const token of ['records-stores','data-store-finance-balance','data-store-finance-rename'])assert.ok(app.includes(token),`store finance UI missing ${token}`);
for(const label of ['現在貯玉','現金収支','実差枚','残高を補正','店舗名を変更'])assert.ok(app.includes(label),`store finance missing ${label}`);
console.log('v5.1.0 native store finance static PASS');
