import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/production-preservation.json',import.meta.url)));
const hash=x=>createHash('sha256').update(x).digest('hex');
const intentionalBackendChanges=new Set(['api/_blob-store.js','api/_sync-web.js','api/_relay-web.js']);
const ROOT_APP_SHA256='2864841121cca81f70a08c8d1ba574c533ee936fd20c3290575d67255a8a461a';
const collectorStartDateMarkup='<label><small>取得開始日</small><input data-store-start type="date" value="${esc(e.startDate)}"></label>';
const collectorSetupOpen='<section class="panel sync-setup"><h2>';
const compactCollectorSetupOpen=`<details class="panel sync-setup collector-link-card" \${d.linked?'':'open'}><summary class="collector-link-summary">`;
const collectorSetupHeadingClose='</h2>\n    <p>端末同期とは別の、取得データをJUGESTへ送るための連携です。</p>';
const compactCollectorSetupHeadingClose=`\${d.linked?'　設定を表示':''}</summary>\n    <p>端末同期とは別の、取得データをJUGESTへ送るための連携です。</p>`;
const collectorSetupClose='</section>\n    <div class="data-kpis">';
const compactCollectorSetupClose='</details>\n    <div class="data-kpis">';
function expectedCollectorUi(){
 let rootApp=fs.readFileSync('app-v510.js','utf8');
 assert.equal(hash(rootApp),ROOT_APP_SHA256,'root app-v510.js remains byte-exact to the approved v5.1.2 source');
 assert.ok(rootApp.includes(collectorStartDateMarkup),'Collector start-date source anchor missing');
 rootApp=rootApp.replace(collectorStartDateMarkup,'');
 for(const [from,to,label] of [[collectorSetupOpen,compactCollectorSetupOpen,'compact setup open'],[collectorSetupHeadingClose,compactCollectorSetupHeadingClose,'compact setup heading'],[collectorSetupClose,compactCollectorSetupClose,'compact setup close']]){
  const hits=rootApp.split(from).length-1;assert.equal(hits,1,`Collector ${label} anchor count`);rootApp=rootApp.replace(from,to);
 }
 return rootApp;
}
test('Production icons, parser, math libraries, CSS and untouched Vercel APIs remain byte-exact',()=>{
 for(const [file,sha] of Object.entries(baseline.public))assert.equal(hash(fs.readFileSync(`public/${file}`)),sha,file);
 assert.equal(fs.readFileSync('public/app-v510.js','utf8'),expectedCollectorUi(),'public app differs only by approved Collector UI transforms');
 for(const [file,sha] of Object.entries(baseline.api))if(!intentionalBackendChanges.has(file))assert.equal(hash(fs.readFileSync(file)),sha,file);
});
test('Protected inline math and research sections remain identical to the captured Production',()=>{
 const html=fs.readFileSync('index.html','utf8');
 for(const part of baseline.indexSegments){const a=html.indexOf(part.start),b=html.indexOf(part.end,a);assert.ok(a>=0&&b>a,'protected boundary missing');assert.equal(hash(html.slice(a,b)),part.sha256,part.start)}
});
test('Fresh public build uses checked-in runtime source and no hidden deployment source',()=>{
 for(const file of ['index.html','sync-core.js',...Object.keys(baseline.public).filter(f=>!f.endsWith('.png'))])assert.deepEqual(fs.readFileSync(`public/${file}`),fs.readFileSync(file),file);
 assert.equal(fs.readFileSync('public/app-v510.js','utf8'),expectedCollectorUi(),'public app applies only the approved Collector UI transforms');
 assert.ok(!fs.existsSync('netlify.toml'));assert.ok(!fs.existsSync('netlify/functions'));
 assert.doesNotMatch(fs.readFileSync('build.mjs','utf8'),/await fetch|https:\/\/jugest\.vercel\.app/);
 assert.match(fs.readFileSync('index.html','utf8'),/const RELAY_API="\/api\/relay"/);
 assert.match(fs.readFileSync('sync-core.js','utf8'),/API='\/api\/sync'/);
});
