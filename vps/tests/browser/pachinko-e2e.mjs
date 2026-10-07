// Optional real-browser test. Provide JUGEST_PLAYWRIGHT_MODULE and Chromium executable.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createWebHandler} from '../../src/web-server.mjs';
import {createRelayStore} from '../../src/relay-store.mjs';
import {openPachinkoDatabase,migratePachinko} from '../../src/pachinko/schema.mjs';
import {importPachinkoSnapshot} from '../../src/pachinko/store.mjs';

const ROOT=fileURLToPath(new URL('../../..',import.meta.url));
const FIXTURE=fileURLToPath(new URL('../fixtures/pachinko/',import.meta.url));
const CHANNEL='pachinko_browser_owner_12345',TOKEN='pachinko-browser-owner-token-123456';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
function raw(name){return gunzipSync(readFileSync(join(FIXTURE,name))).toString('utf8')}
function seedPachinko(dbPath){
  const db=openPachinkoDatabase(dbPath);migratePachinko(db);try{
    const snapshots=[
      ['2026-10-05-ranking.json.gz',{source:'public_pia_getRankingTop',historical:true,observed_at_unknown:true}],
      ['2026-10-06-ranking.json.gz',{source:'archived_public_raw_csv',scopeModelKeys:['OUMI5_SPECIAL_ALTA'],observed_at_unknown:true}],
      ['2026-10-07-ranking.json.gz',{source:'public_pia_getRankingTop',historical:true}]
    ];
    for(const [name,provenance] of snapshots){const text=raw(name);importPachinkoSnapshot(db,{payload:JSON.parse(text),rawText:text,provenance,collectorVersion:'browser-fixture-v1'})}
  }finally{db.close()}
}

test('browser: PIA大船-P matrix, filters, detail, undated data and mobile containment', {timeout:120000}, async t=>{
  const modulePath=process.env.JUGEST_PLAYWRIGHT_MODULE;if(!modulePath){t.skip('JUGEST_PLAYWRIGHT_MODULE is not configured');return}
  const previous={mode:process.env.JUGEST_PIA_ACCESS_MODE,ids:process.env.JUGEST_PIA_OWNER_CHANNEL_IDS};process.env.JUGEST_PIA_ACCESS_MODE='owner';process.env.JUGEST_PIA_OWNER_CHANNEL_IDS=CHANNEL;t.after(()=>{for(const [k,v] of [['JUGEST_PIA_ACCESS_MODE',previous.mode],['JUGEST_PIA_OWNER_CHANNEL_IDS',previous.ids]]){if(v===undefined)delete process.env[k];else process.env[k]=v}});
  const dir=mkdtempSync(join(tmpdir(),'jugest-pachinko-browser-')),pachinkoDbPath=join(dir,'pachinko.sqlite'),relayDbPath=join(dir,'relay.sqlite');seedPachinko(pachinkoDbPath);
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(TOKEN),senderHash:'sender'});
  const handler=createWebHandler({rootDir:ROOT,relayDbPath,pachinkoDbPath,accessConfig:null});const server=http.createServer((req,res)=>handler(req,res));server.listen(0,'localhost');await once(server,'listening');const origin='http://localhost:'+server.address().port;
  t.after(async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})});
  const {chromium}=await import(modulePath);const browser=await chromium.launch({headless:true,...(process.env.JUGEST_CHROMIUM_EXECUTABLE?{executablePath:resolve(process.env.JUGEST_CHROMIUM_EXECUTABLE)}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(({channelId,receiverToken})=>localStorage.setItem('jugglerRelayReceiver:v1',JSON.stringify({linked:true,channelId,receiverToken})),{channelId:CHANNEL,receiverToken:TOKEN});const page=await context.newPage(),pageErrors=[],requests=[];page.on('pageerror',e=>pageErrors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(origin+'/');await page.locator('jugest-app').waitFor();const app=page.locator('jugest-app');
  await app.locator('.bottom-nav [data-workspace="store"]').click();await app.locator('[data-open-store-selector]').click();await app.locator('[data-pachinko-store]').waitFor();assert.equal(await app.locator('[data-pachinko-store] b').innerText(),'PIA大船-P');
  const startRequestIndex=requests.length;await app.locator('[data-pachinko-store]').click();const screen=app.locator('.pachinko-data-screen');await screen.waitFor();await screen.locator('.p-matrix tbody tr').first().waitFor();
  assert.equal(await screen.locator('.p-filters button').count(),4);assert.deepEqual(await screen.locator('.p-matrix thead th').allTextContents(),['台番 / 機種','10-06','10-05']);assert.equal(await screen.locator('.p-matrix tbody tr').count(),108);
  const compare=screen.locator('.p-summary-compare');assert.match(await compare.innerText(),/平均回転率/);assert.match(await compare.innerText(),/平均稼働/);assert.match(await compare.innerText(),/平均差玉/);assert.match(await compare.innerText(),/大海5SP/);assert.match(await compare.innerText(),/東京喰種399/);assert.match(await compare.innerText(),/東京喰種999/);const firstCompare=compare.locator('tbody tr').first();assert.match(await firstCompare.innerText(),/20\.3/);assert.match(await firstCompare.innerText(),/1,020/);assert.match(await firstCompare.innerText(),/-948玉/);
  const allVisual=await screen.evaluate(el=>{const style=x=>{const s=getComputedStyle(x);return {background:s.backgroundColor,color:s.color,borderRadius:s.borderRadius,boxShadow:s.boxShadow,border:s.border}};return {compare:style(el.querySelector('.p-compare-scroll')),selectedFilter:style(el.querySelector('.p-filters .selected')),refresh:style(el.querySelector('.p-refresh'))}});
  assert.equal(allVisual.compare.background,'rgba(255, 255, 255, 0.97)');assert.equal(allVisual.compare.borderRadius,'16px');assert.match(allVisual.compare.border,/rgb\(226, 232, 243\)/);assert.match(allVisual.compare.boxShadow,/rgba\(35, 61, 112/);assert.equal(allVisual.selectedFilter.background,'rgb(237, 242, 255)');assert.equal(allVisual.selectedFilter.color,'rgb(49, 91, 234)');assert.equal(allVisual.selectedFilter.borderRadius,'16px');assert.equal(allVisual.refresh.background,'rgb(49, 91, 234)');assert.equal(allVisual.refresh.borderRadius,'16px');
  await screen.locator('[data-pachinko-filter="OUMI5_SPECIAL_ALTA"]').click();await screen.locator('.p-selected-summary').waitFor();const selectedSummary=screen.locator('.p-selected-summary');assert.equal(await selectedSummary.locator('.p-metric-card').count(),3);assert.match(await selectedSummary.innerText(),/平均回転率/);assert.match(await selectedSummary.innerText(),/20\.3/);assert.match(await selectedSummary.innerText(),/平均稼働/);assert.match(await selectedSummary.innerText(),/1,020/);assert.match(await selectedSummary.innerText(),/平均差玉/);assert.match(await selectedSummary.innerText(),/-948玉/);assert.doesNotMatch(await selectedSummary.innerText(),/東京喰種399|東京喰種999/);const metricVisual=await selectedSummary.locator('.p-metric-card').first().evaluate(x=>{const s=getComputedStyle(x);return {background:s.backgroundColor,borderRadius:s.borderRadius,border:s.border,boxShadow:s.boxShadow}});assert.equal(metricVisual.background,'rgba(255, 255, 255, 0.97)');assert.equal(metricVisual.borderRadius,'16px');assert.match(metricVisual.border,/rgb\(226, 232, 243\)/);
  await screen.locator('[data-pachinko-filter=""]').click();await screen.locator('.p-summary-compare').waitFor();await screen.locator('.p-matrix tbody tr').first().waitFor();assert.equal(await screen.locator('.p-matrix tbody tr').count(),108);
  assert.equal(await screen.locator('.p-cell.provisional').count(),0,'Ghoul has no safely dated cells yet');
  const table=screen.locator('[data-pachinko-table-scroll]');await page.setViewportSize({width:320,height:844});const scrollable=await table.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(scrollable.scroll>scrollable.client,'matrix must have its own horizontal scroll when the viewport is narrow');await table.evaluate(el=>el.scrollLeft=150);const before=await table.evaluate(el=>el.scrollLeft);await screen.locator('.p-cell.verified').first().evaluate(el=>el.click());await screen.locator('[data-pachinko-detail]').waitFor();assert.ok((await table.evaluate(el=>el.scrollLeft))>=before-1);await page.setViewportSize({width:390,height:844});assert.match(await screen.locator('[data-pachinko-detail]').innerText(),/推定方法/);await screen.locator('[data-pachinko-detail] details').first().locator('summary').click();assert.match(await screen.locator('[data-pachinko-detail]').innerText(),/special_2/);
  await screen.locator('[data-pachinko-close-detail]').click();await screen.locator('[data-pachinko-filter="TOKYO_GHOUL_399"]').click();const filteredUndated=screen.locator('.p-undated-model').filter({hasText:'東京喰種399'});await filteredUndated.waitFor();assert.match(await screen.locator('.p-empty').innerText(),/営業日/);assert.equal(await screen.locator('.p-cell').count(),0,'399 has no derived business dates');await filteredUndated.locator('summary').click();assert.equal(await filteredUndated.locator('[data-pachinko-record]').first().locator('b').innerText(),'—');assert.match(await filteredUndated.innerText(),/追加検証中/);const seatLabels=await filteredUndated.locator('[data-pachinko-record] span').allTextContents();assert.equal(new Set(seatLabels).size,12);
  await screen.locator('[data-pachinko-filter=""]').click();await screen.locator('.p-undated-model').first().waitFor();const ghoulUndated=screen.locator('.p-undated-model').filter({hasText:'東京喰種399'});await ghoulUndated.locator('summary').click();await ghoulUndated.locator('[data-pachinko-record]').first().click();await screen.locator('[data-pachinko-detail]').waitFor();assert.match(await screen.locator('[data-pachinko-detail]').innerText(),/日付未確定/);await screen.locator('[data-pachinko-detail] details').nth(1).locator('summary').click();assert.match(await screen.locator('[data-pachinko-detail]').innerText(),/PIAサーバー日時/);
  for(const width of [320,375,390]){await page.setViewportSize({width,height:844});const dims=await screen.evaluate(el=>({rootClient:el.clientWidth,rootScroll:el.scrollWidth,doc:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(dims.rootScroll<=dims.rootClient+1,`P screen must not overflow at ${width}`);assert.ok(dims.doc<=dims.viewport+1,`document must not overflow at ${width}`)}
  const afterClick=requests.slice(startRequestIndex).filter(url=>url.startsWith(origin));assert.equal(afterClick.some(url=>/\/api\/(?:vps\/judge|vps\/stores\/[^/]+\/analysis|pre)/.test(url)),false,'P screen must not start slot judgement/analysis/PRE requests');assert.deepEqual(pageErrors,[]);
  const shotDir=process.env.JUGEST_PACHINKO_SCREENSHOT_DIR;if(shotDir){mkdirSync(shotDir,{recursive:true});await page.screenshot({path:join(shotDir,'pia-ofuna-p-mobile-390.png'),fullPage:true})}
});
