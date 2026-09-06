import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['getRecordsSummary','getRecentRecords','getCalendarMonth','getDataStatus','setCollectorEnabled','saveBackup','restoreBackup']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
for(const fn of ['renderRecordsLogScreen','renderCalendarScreen','renderRecordsAnalysisScreen','renderCollectorScreen','renderStoreManagementScreen','renderBackupScreen']){
  assert.match(js,new RegExp(`${fn}\\s*\\(`),`new UI must implement ${fn}`);
}
assert.match(js,/data-record-row/,'records must render native record rows');
assert.match(js,/data-calendar-month/,'calendar must be native');
assert.match(js,/data-collector-enabled/,'collector toggles must be native');
assert.match(js,/data-backup-save/,'backup action must be native');
assert.doesNotMatch(js,/navigateLegacy\?\.\(['"](?:runlog|calendar|analysis|extimport|stores|data)/,'records/data UI must not visibly navigate to legacy pages');
console.log('v5.1.0 records/data native UI static PASS');
