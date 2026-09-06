import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/app-v510.css','utf8');

assert.doesNotMatch(html,/LEGACY_RUNTIME_ROOT/,'legacy runtime root must not exist');
assert.doesNotMatch(html,/<aside[^>]+id="drawer"|class="drawer"/i,'legacy drawer must not exist');
assert.doesNotMatch(html,/<section\s+id="(?:judge|rev|movecompare|cmp|runlog|stores|calendar|strategy|todayplan|replay|extimport|bruteanalysis|modelperf)"/i,'legacy page DOM must not exist');
assert.match(html,/<body[^>]*class="jugest-v510"/i,'v5.1 body mode must be explicit');
assert.match(html,/<jugest-app[^>]*id="JUGEST_APP"/i,'new app host must be the visible app root');
assert.doesNotMatch(html,/body\.jugest-v510\s+#LEGACY_RUNTIME_ROOT/,'legacy runtime CSS must not remain');
assert.doesNotMatch(css,/jugest-app[^}]*height:\s*0/i,'visible shell must never collapse to zero height');
assert.doesNotMatch(css,/position:\s*absolute[^}]*bottom:\s*-\d{3,}/is,'shell must not hide layout bugs offscreen');
console.log('v5.1.0 no-legacy runtime isolation PASS');
