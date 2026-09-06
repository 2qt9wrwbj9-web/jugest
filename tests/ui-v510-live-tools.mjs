import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/app-v510.js','utf8');
for(const method of ['getReverseState','getReverseStyles','beginPickup','getPickupState','setPickupCurrentG','setPickupMetric','setPickupMetricEnabled','endPickup','getCompareState','addCompareRow','updateCompareRow','deleteCompareRow','clearCompareRows','getMoveState','selectMoveTarget','calculateMoveCompare']){
  assert.match(html,new RegExp(`${method}\\s*:`),`core bridge must expose ${method}`);
}
for(const fn of ['renderReverseScreen','renderMoveScreen','renderCompareScreen']) assert.match(js,new RegExp(`${fn}\\s*\\(`),`new UI must implement ${fn}`);
assert.match(js,/data-rev-g/);assert.match(js,/data-pickup-current-g/);assert.match(js,/data-move-candidate/);assert.match(js,/data-compare-row/);
assert.doesNotMatch(js,/navigateLegacy\?\.\(['"](?:rev|movecompare|cmp)/,'live tools must not visibly navigate to legacy pages');
assert.doesNotMatch(js,/min-width\s*:\s*(?:5|6|7|8|9)\d\dpx/,'new app JS must not introduce desktop min-width tables');
console.log('v5.1.0 live tools native UI static PASS');
