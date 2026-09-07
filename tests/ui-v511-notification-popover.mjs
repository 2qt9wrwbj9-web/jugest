import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('public/app-v510.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');

assert.match(app,/data-notification-toggle/,'top-right notification bell control is missing');
assert.match(app,/<svg class="bell"/,'notification control must use an SVG bell');
assert.doesNotMatch(app,/>🔔</,'emoji bell must be removed');
assert.match(app,/renderNotificationPanel\s*\(/,'notification popover renderer is missing');
assert.match(app,/notification-popover/,'notification popover markup is missing');
assert.match(app,/notificationOpen/,'notification open\/closed state is missing');
assert.match(app,/notificationCount/,'notification badge\/count source is missing');
assert.match(app,/data-home-notice/,'notification items must remain actionable');
assert.doesNotMatch(app,/class="bell">◌</,'old ambiguous status icon must be removed');
assert.doesNotMatch(html,/前回データを復元したよ/,'restore toast message must not exist in runtime HTML');
assert.doesNotMatch(html,/showRestoreToast/,'legacy restore-toast function must not exist in runtime HTML');
assert.doesNotMatch(html,/let didRestore=restoreSavedState\(\)/,'restore success must not be retained solely for a toast');
console.log('v5.1.1 notification popover + silent restore static PASS');
