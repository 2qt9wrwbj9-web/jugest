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
assert.match(html, /ジャグラー設定判別 v4\.7\.8/);
assert.match(html, /appVersion:"4\.7\.8"/);

const launcher = fs.readFileSync(path.join(base, 'ana-launcher.js'));
const launcherPublic = fs.readFileSync(path.join(base, 'public', 'ana-launcher.js'));
assert.deepEqual(launcher, launcherPublic, 'root/public ana-launcher.js must stay byte-identical');
const sha = crypto.createHash('sha256').update(launcher).digest('hex');
assert.equal(sha, '964891a40f829bc73e12dfd4da2c486b775e2650535a97e702ca296f12cb13a4',
  'Launcher changed unexpectedly; bookmarklet/parser bump would need explicit review');
const bookmarklet = fs.readFileSync(path.join(base, 'BOOKMARKLET_v4500.txt'), 'utf8');
assert.match(bookmarklet, /ana-launcher\.js\?v=4500/);
console.log('PASS v4.7.8 relay storage-init ordering regression; Launcher/bookmarklet unchanged');
