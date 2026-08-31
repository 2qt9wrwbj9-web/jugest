import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, '..');
const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const publicHtml = fs.readFileSync(path.join(base, 'public', 'index.html'), 'utf8');
const decl = 'const externalStorageReadyPromise=new Promise(resolve=>{externalStorageReadyResolve=resolve});';
const receive = 'async function relayReceiveAll()';

assert.equal((html.match(/const externalStorageReadyPromise=new Promise\(/g) || []).length, 1,
  'externalStorageReadyPromise must have exactly one readiness-gate initializer');
assert.ok(html.indexOf(decl) > 0 && html.indexOf(decl) < html.indexOf(receive),
  'externalStorageReadyPromise readiness gate must exist before relayReceiveAll can await it');
assert.ok(html.indexOf('initExternalStorage().finally(()=>externalStorageReadyResolve());') > html.indexOf('let didRestore=restoreSavedState()'),
  'actual external storage initialization must remain in the late startup phase after restore setup');
assert.equal(html, publicHtml, 'root/public index.html must stay byte-identical');
const visibleVersion = html.match(/ジャグラー設定判別 v(\d+\.\d+\.\d+)/)?.[1];
const backupVersion = html.match(/appVersion:"(\d+\.\d+\.\d+)"/)?.[1];
assert.ok(visibleVersion, 'visible app version must be present');
assert.equal(backupVersion, visibleVersion, 'visible version and backup appVersion must stay synchronized');

const launcher = fs.readFileSync(path.join(base, 'ana-launcher.js'));
const launcherPublic = fs.readFileSync(path.join(base, 'public', 'ana-launcher.js'));
assert.deepEqual(launcher, launcherPublic, 'root/public ana-launcher.js must stay byte-identical');
const sha = crypto.createHash('sha256').update(launcher).digest('hex');
assert.equal(sha, '6654a4406ff5b30dcf7e83e8253bfe76280224c7032ba79457dda90bc4fe0b7b',
  'Launcher changed unexpectedly beyond the reviewed v4.8.6 collector + store-registration hotfix; further Launcher changes need explicit review');
const bookmarklet = fs.readFileSync(path.join(base, 'BOOKMARKLET_v4860.txt'), 'utf8');
assert.match(bookmarklet, /ana-launcher\.js\?v=4860/);
console.log('PASS relay storage-init ordering regression; version sync + reviewed Launcher origin migration pinned');
