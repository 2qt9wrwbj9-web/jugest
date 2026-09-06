import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app-v510.js','utf8');
assert.match(html,/setRecordTagActive\s*:/);assert.ok(app.includes('data-record-tag-disable'),'native record editor must support retiring a tag');assert.match(app,/過去の稼働に付いている分は残る/);
console.log('v5.1.0 native tag admin static PASS');
