import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/production-preservation.json',import.meta.url)));
const hash=x=>createHash('sha256').update(x).digest('hex');
const intentionalBackendChanges=new Set(['api/_blob-store.js','api/_sync-web.js','api/_relay-web.js']);
const collectorStartDateMarkup='<label><small>取得開始日</small><input data-store-start type="date" value="${esc(e.startDate)}"></label>';
function expectedCollectorUi(){
 const rootApp=fs.readFileSync('app-v510.js','utf8');
 assert.equal(hash(rootApp),baseline.public['app-v510.js'],'root app-v510.js remains the captured Production source');
 assert.ok(rootApp.includes(collectorStartDateMarkup),'Collector start-date source anchor missing');
 return rootApp.replace(collectorStartDateMarkup,'');
}
test('Production icons, parser, math libraries, CSS and untouched Vercel APIs remain byte-exact',()=>{
 for(const [file,sha] of Object.entries(baseline.public))if(file!=='app-v510.js')assert.equal(hash(fs.readFileSync(`public/${file}`)),sha,file);
 assert.equal(fs.readFileSync('public/app-v510.js','utf8'),expectedCollectorUi(),'public app differs only by removal of manual Collector start-date control');
 for(const [file,sha] of Object.entries(baseline.api))if(!intentionalBackendChanges.has(file))assert.equal(hash(fs.readFileSync(file)),sha,file);
});
test('Protected inline math and research sections remain identical to the captured Production',()=>{
 const html=fs.readFileSync('index.html','utf8');
 for(const part of baseline.indexSegments){const a=html.indexOf(part.start),b=html.indexOf(part.end,a);assert.ok(a>=0&&b>a,'protected boundary missing');assert.equal(hash(html.slice(a,b)),part.sha256,part.start)}
});
test('Fresh public build uses checked-in runtime source and has no Netlify deployment path',()=>{
 for(const file of ['index.html','sync-core.js',...Object.keys(baseline.public).filter(f=>!f.endsWith('.png')&&f!=='app-v510.js')])assert.deepEqual(fs.readFileSync(`public/${file}`),fs.readFileSync(file),file);
 assert.equal(fs.readFileSync('public/app-v510.js','utf8'),expectedCollectorUi(),'public app applies only the approved Collector UI transform');
 assert.ok(!fs.existsSync('netlify.toml'));assert.ok(!fs.existsSync('netlify/functions'));
 assert.doesNotMatch(fs.readFileSync('build.mjs','utf8'),/await fetch|https:\/\/jugest\.vercel\.app/);
 assert.match(fs.readFileSync('index.html','utf8'),/const RELAY_API="\/api\/relay"/);
 assert.match(fs.readFileSync('sync-core.js','utf8'),/API='\/api\/sync'/);
});
