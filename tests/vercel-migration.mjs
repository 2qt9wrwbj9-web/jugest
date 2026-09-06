import fs from 'node:fs';
import assert from 'node:assert/strict';

const cfg=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const html=fs.readFileSync('public/index.html','utf8');

assert.equal(cfg.outputDirectory,'public');
assert.equal(cfg.buildCommand,'npm run vercel:build');
assert.ok(cfg.functions?.['api/relay.js']);
assert.ok(cfg.functions?.['api/sync.js']);
assert.match(pkg.scripts?.['vercel:build']||'',/npm test/);
assert.match(html,/const RELAY_API="\/api\/relay"/,'Vercel frontend must use same-origin relay proxy');
for(const file of ['api/relay.js','api/sync.js']) assert.ok(fs.existsSync(file),`${file} missing`);
console.log('Vercel migration static PASS');
