// Run explicitly with Playwright available. Uses a temporary real SQLite/API
// server and synthetic data only; never connects to the production site.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../vps/src/web-server.mjs';
import {openDatabase} from '../vps/src/db.mjs';
import {migrate} from '../vps/src/schema.mjs';
import {ingestCollectorDay} from '../vps/src/ingest/canonical-ingest.mjs';
import {persistLivePrediction} from '../vps/src/research/live-comparison.mjs';
import {scoreAvailableComparisonDays} from '../vps/src/analysis/comparison-refresh.mjs';
const {chromium,webkit,devices}=createRequire(import.meta.url)('playwright');
const engine=process.env.JUGEST_BROWSER_ENGINE==='webkit'?'webkit':'chromium',outDir=resolve(process.env.JUGEST_UI_EVIDENCE_DIR||'/tmp/jugest-mobile-evidence');mkdirSync(outDir,{recursive:true});
const dir=mkdtempSync(join(tmpdir(),'jugest-mobile-')),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'canonical.sqlite'),rawRoot=join(dir,'raw'),rootDir=resolve('.'),nowIso=new Date().toISOString();
const today=new Date(Date.parse(nowIso)+9*3600000).toISOString().slice(0,10),date=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
const server=createWebServer({rootDir,relayDbPath,canonicalDbPath,rawRoot,accessConfig:null});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
let browser,db;
try{
 const relay=async body=>{const r=await fetch(base+'/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json()};
 const receiver=await relay({action:'createIosCollector'});
 await relay({action:'iosCollectorTargetUpsert',channelId:receiver.channelId,receiverToken:receiver.receiverToken,url:`https://ana-slo.com/${date(-1)}-uncollected-mobile-store-data/`,shop:'未取得の登録店舗',startDate:date(-1)});
 db=openDatabase(canonicalDbPath);migrate(db);
 for(let d=-10;d<0;d++){
  const machines=[1,2,3].map((i)=>({tableNo:String(100+i),machine:'my',sourceMachineName:'マイジャグラーV',games:5000+i*100,bb:25,rb:20,diff:d===-2&&i===1?null:(i-2)*500-d*10}));
  await ingestCollectorDay(db,{rawRoot,channelId:receiver.channelId,sourceStoreId:'mobile',shop:'検証用ジャグラー店',date:date(d),day:{date:date(d),machines,quality:{expectedMachineKeys:['101','102','103']}},rawText:`synthetic-mobile-${d}`,nowIso});
  for(const engine of ['current_shadow','pre_research'])persistLivePrediction(db,{storeId:'mobile',targetDate:date(d),sourceFrontierDate:date(d-1),createdAt:date(d-1)+'T10:00:00Z',engine,engineVersion:'mobile-fixture',inputHash:'synthetic',rankings:machines.map((r,i)=>({machineKey:r.tableNo,tableNo:r.tableNo,machineName:r.sourceMachineName,rank:i+1,score:3-i}))});
 }
 scoreAvailableComparisonDays(db,{storeId:'mobile',throughDate:date(-1),nowIso});db.prepare('UPDATE store_days SET source_hash=? WHERE store_id=? AND business_date=?').run('synthetic-correction','mobile',date(-4));
 persistLivePrediction(db,{storeId:'mobile',targetDate:date(1),sourceFrontierDate:date(-1),createdAt:nowIso,engine:'current_shadow',engineVersion:'mobile-fixture',inputHash:'synthetic-future',rankings:[1,2,3].map((i)=>({machineKey:String(100+i),tableNo:String(100+i),machineName:'マイジャグラーV',rank:i,score:4-i}))});
 const options=engine==='webkit'?{}:{...(process.env.JUGEST_BROWSER_EXECUTABLE_PATH?{executablePath:process.env.JUGEST_BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox']};
 browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...options});
 const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},serviceWorkers:'block'});await context.addInitScript(receiver=>localStorage.setItem('jugglerRelayReceiver:v1',JSON.stringify({...receiver,linked:true})),{channelId:receiver.channelId,receiverToken:receiver.receiverToken});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await page.goto(base,{waitUntil:'networkidle'});const app=page.locator('jugest-app');await app.locator('[data-vps-settings-gear]').click();await app.locator('[data-vps-settings-collection]').click();
 await app.getByText('店舗ごとの保存状況',{exact:true}).waitFor();await app.getByText('未取得の登録店舗',{exact:true}).waitFor();
 const overlay=app.locator('.vps-settings-overlay');assert.match(await overlay.innerText(),/検証用ジャグラー店/);assert.match(await overlay.innerText(),/正常完了/);assert.match(await overlay.innerText(),/未取得/);
 assert.equal(await overlay.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);await page.screenshot({path:join(outDir,`${engine}-collection.png`)});
 const retry=app.locator('[data-vps-op-retry="evaluation"][data-store-id="mobile"]');const response=page.waitForResponse(r=>r.url().endsWith('/operations/retry'));await retry.click();assert.equal((await response).status(),202);await app.getByText('再試行を登録したよ。',{exact:false}).waitFor();
 const count=db.prepare("SELECT COUNT(*) n FROM jobs WHERE type='PREDICTION_EVALUATE' AND json_extract(payload_json,'$.storeId')='mobile'").get().n;assert.equal(count,1);
 await app.locator('[data-vps-settings-back]').click();await app.locator('[data-vps-settings-performance]').click();await app.getByText('日別の答え合わせ',{exact:true}).waitFor();
 assert.match(await overlay.innerText(),/結果待ち/);assert.match(await overlay.innerText(),/データ不足/);assert.match(await overlay.innerText(),/訂正・確認待ち/);assert.match(await overlay.innerText(),/実設定は不明/);
 await app.locator('[data-vps-op-period="all"]').click();await page.waitForFunction(()=>document.querySelector('jugest-app').shadowRoot.querySelector('[data-vps-op-period="all"]').getAttribute('aria-pressed')==='true');assert.equal(await app.locator('[data-vps-op-period="all"]').getAttribute('aria-pressed'),'true');assert.match(await overlay.innerText(),/事前予測した日/);
 assert.equal(await overlay.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);await overlay.evaluate(el=>{el.scrollTop=0});await page.screenshot({path:join(outDir,`${engine}-performance.png`)});
 await overlay.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.screenshot({path:join(outDir,`${engine}-history.png`)});
 await page.route('**/api/vps/operations',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({ok:false,code:'unauthorized'})}));await app.locator('[data-vps-op-refresh]').click();await app.getByRole('alert').waitFor();assert.doesNotMatch(await overlay.innerText(),/検証用ジャグラー店|上位候補/);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({engine,version:browser.version(),width:390,actualSqliteAndHttp:true,retryStatus:202,coalescedJobs:1,periods:true,pendingMissingCorrectedStates:true,revokedStateCleared:true,horizontalOverflow:false,pageErrors:errors,screenshots:3},null,2));
}finally{if(browser)await browser.close();db?.close();server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
