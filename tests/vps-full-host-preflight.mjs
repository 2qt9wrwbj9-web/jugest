import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const script = await readFile(path.join(root, 'vps/bootstrap-full-ubuntu.sh'), 'utf8');
const docs = await readFile(path.join(root, 'vps/FULL_HOST.md'), 'utf8');

assert.match(script, /APP_HOST=\$\{1:-\}/);
assert.match(script, /RELAY_HOST=\$\{2:-\}/);
assert.match(script, /root \* \/opt\/jugest\/public/);
assert.match(script, /reverse_proxy 127\.0\.0\.1:8787/);
assert.match(script, /JUGEST_ALLOWED_ORIGINS=https:\/\/\$\{APP_HOST\}/);
assert.match(script, /https:\/\/\$\{RELAY_HOST\}\/healthz/);
assert.match(script, /https:\/\/\$\{RELAY_HOST\}\/relay-bridge\.html/);
assert.match(script, /Production wiring has NOT been changed/);
assert.match(docs, /Keep Netlify available as rollback/);
assert.match(docs, /infrastructure-only/);

console.log('vps full-host preflight regression passed');
