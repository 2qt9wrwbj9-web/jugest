import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app-v510.js','utf8');
for(const m of ['getCalendarDay','getRecordsBreakdown','canUndoRestore','undoRestore']){
  assert.match(html,new RegExp(`${m}\\s*:`),`bridge missing ${m}`);
}
for(const token of ['data-calendar-date','calendar-machine-report','analysis-machine-list','analysis-shop-list','data-backup-undo']){
  assert.ok(app.includes(token),`UI parity missing ${token}`);
}
console.log('v5.1.0 records parity static PASS');
