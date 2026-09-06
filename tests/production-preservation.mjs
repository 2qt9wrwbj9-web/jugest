import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/production-preservation.json',import.meta.url)));
const hash=x=>createHash('sha256').update(x).digest('hex');
const intentionalSyncBackendChanges=new Set(['api/_blob-store.js','api/_sync-web.js']);
test('Production icons, parser, math libraries, CSS and untouched Vercel APIs remain byte-exact',()=>{
 for(const [file,sha] of Object.entries(baseline.public))assert.equal(hash(fs.readFileSync(`public/${file}`)),sha,file);
 for(const [file,sha] of Object.entries(baseline.api))if(!intentionalSyncBackendChanges.has(file))assert.equal(hash(fs.readFileSync(file)),sha,file);
});
test('Protected inline math and research sections remain identical to the captured Production',()=>{
 const html=fs.readFileSync('index.html','utf8');
 for(const part of baseline.indexSegments){const a=html.indexOf(part.start),b=html.indexOf(part.end,a);assert.ok(a>=0&&b>a,'protected boundary missing');assert.equal(hash(html.slice(a,b)),part.sha256,part.start)}
});
test('Fresh public build uses checked-in runtime source and has no Netlify deployment path',()=>{
 for(const file of ['index.html','app-v510.js','sync-core.js',...Object.keys(baseline.public).filter(f=>!f.endsWith('.png'))])assert.deepEqual(fs.readFileSync(`public/${file}`),fs.readFileSync(file),file);
 assert.ok(!fs.existsSync('netlify.toml'));assert.ok(!fs.existsSync('netlify/functions'));
 assert.doesNotMatch(fs.readFileSync('build.mjs','utf8'),/await fetch|https:\/\/jugest\.vercel\.app/);
 assert.match(fs.readFileSync('index.html','utf8'),/const RELAY_API="\/api\/relay"/);
 assert.match(fs.readFileSync('sync-core.js','utf8'),/API='\/api\/sync'/);
});
