// Local-only browser verification. Every analysis response below is a labelled fixture.
// Run after node build.mjs. Supports Chromium and WebKit at 320/375/390/430px.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {patchJugestIndexSource} from '../vps/src/ui-source-patch.mjs';
import '../store-day-allocation.js';

const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright')}catch{playwright=createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules','package.json'))('playwright')}
const root=process.cwd(),screenshots=process.env.JUGEST_ALLOCATION_SCREENSHOT_DIR;
if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
function makeReport(date,options={}){
 const q=[.08,.1,.12,.2,.23,.27],rows=[{id:'my-101',machine:'my',tableNo:'101',input:{games:6000,bb:25,rb:23,diff:500},individual:{q},bonusLogs:[0,0,1,.5,.5,.5]},{id:'my-102',machine:'my',tableNo:'102',input:{games:2000,bb:9,rb:7,diff:null},individual:{q},warnings:['diff_not_safe_integer'],diffIssue:'diff_not_safe_integer',bonusLogs:[0,0,1,.5,.5,.5]}];
 const result=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize:27,detail:options.detail?{band:options.band,kind:options.kind,count:options.count}:null});
 const reference=globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows:rows.map(row=>({...row,bonusLogs:[0,-1,-2,-3,-4,-5]})),familySize:27});reference.approximate=true;reference.primary=false;for(const band of reference.bands)for(const event of band.events)Object.assign(event,{logEValue:null,logThreshold:null,modelPass:false,strongEnabled:false});
 return {ok:true,store:{id:'fixture-store',name:'投入分析テスト店'},date,snapshot:{inputHash:'fixture-a',updatedAt:date+' 23:00'},roster:{status:'partial'},quality:{},familySize:27,alpha:.05,strongEnabled:false,access:{canCompute:false},
 groups:[{machine:'my',machineName:'マイジャグラーⅤ',nInstalled:2,nObserved:2,eligible:true,reasons:[],zeroGamesN:0,lowGamesN:1,diffN:1,rows,result,differenceReference:{available:true,diffN:1,reverseDiffN:1,warningN:1,methodCounts:{'reverse-diff':1,'bonus-only':1},result:reference}},
 {machine:'go',machineName:'ゴーゴージャグラー3',nInstalled:3,nObserved:2,eligible:false,reasons:[{code:'missing_games',message:'台番201の通常Gを確認できません'}],rows:[],zeroGamesN:0,lowGamesN:0,diffN:0},
 {machine:'im',machineName:'アイムジャグラー',nInstalled:null,nObserved:1,eligible:false,reasons:['roster_unverified'],rows:[]}],unsupported:[{machineName:'未対応のテスト機種',tableNo:'999'}]};
}
const fixture=`
(()=>{
 window.__legacyDayReads=0;
 let active='投入分析テスト店';const listeners=new Set();
 window.JUGEST_CORE_BRIDGE={
 getSummary:()=>({storeCount:1,externalDayCount:2}),getStores:()=>[{name:active}],getActiveStore:()=>active,setActiveStore:n=>{active=n;return true},subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},
 getStoreDates:()=>['2026-10-16','2026-10-15'],getStoreOverview:()=>({storedDays:2,latestDate:'2026-10-16',machineRows:2,totalG:8000,collector:{}}),
 getStoreDay:(shop,date)=>{window.__legacyDayReads++;return {shop,date,rows:[{machine:'my',machineName:'マイジャグラーⅤ',tableNo:'101',games:6000,bb:25,rb:23,diff:500,expectedSetting:4}]}}};
 const start=()=>{const app=document.querySelector('jugest-app');if(!app?.handleAction)return setTimeout(start,5);app.state.activeStore=active;app.state.storeDate='2026-10-15';app.handleAction('store-data');window.__allocationFixtureReady=true};
 window.addEventListener('DOMContentLoaded',start,{once:true});
})();`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),segments=url.pathname.split('/').filter(Boolean),mode=segments.shift()||'source',relative=segments.join('/')||'index.html';
 if(url.pathname.startsWith('/api/')){
  res.setHeader('content-type','application/json');
  const match=url.pathname.match(/^\/api\/vps\/stores\/fixture-store\/days\/(\d{4}-\d{2}-\d{2})\/allocation$/);
  if(req.method==='GET'&&String(req.headers.cookie||'').includes('jugest_allocation_fixture=1')&&(url.pathname==='/api/vps/allocation/stores'||match)){
   if(match?.[1]==='2026-10-14'){res.writeHead(409);res.end(JSON.stringify({ok:false,code:'allocation_result_not_ready'}));return}
   const payload=match?makeReport(match[1],{detail:url.searchParams.get('detail')==='true'||url.searchParams.get('detail')==='1',band:url.searchParams.get('band'),kind:url.searchParams.get('kind'),count:Number(url.searchParams.get('count'))}):{ok:true,stores:[{id:'fixture-store',name:'投入分析テスト店'}]};res.end(JSON.stringify(payload));return;
  }
  res.writeHead(401);res.end(JSON.stringify({ok:false,code:'authentication_required'}));return;
 }
 const base=mode==='source'?root:path.join(root,'public');let file=path.resolve(base,relative);
 if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return}
 if(!fs.existsSync(file))file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
 if(relative==='index.html'){
  let html=fs.readFileSync(file,'utf8');if(mode==='patched')html=patchJugestIndexSource(html);
  html=html.replace('</body>',`<script>${fixture}</script></body>`);res.end(html);
 }else res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,results=[],unavailable=[];
try{
 for(const engine of process.env.JUGEST_BROWSER_ENGINE?[process.env.JUGEST_BROWSER_ENGINE]:['chromium','webkit']){
  let browser;
  try{browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{...(process.env.JUGEST_BROWSER_EXECUTABLE_PATH?{executablePath:process.env.JUGEST_BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']}: {})})}
  catch(error){unavailable.push({engine,reason:error.message.split('\n')[0]});console.error(`UNAVAILABLE ${engine}: ${error.message.split('\n')[0]}`);continue}
  try{
   for(const mode of process.env.JUGEST_BROWSER_MODES?process.env.JUGEST_BROWSER_MODES.split(','):['source','built','patched'])for(const width of process.env.JUGEST_BROWSER_WIDTHS?process.env.JUGEST_BROWSER_WIDTHS.split(',').map(Number):[320,375,390,430]){
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,serviceWorkers:'block'}),external=[],errors=[];
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin||/^(data:|blob:)/.test(route.request().url()))return route.continue();external.push(route.request().url());return route.abort()});
    await context.addCookies([{name:'jugest_allocation_fixture',value:'1',url:origin,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${origin}/${mode}/index.html`);await page.waitForFunction(()=>window.__allocationFixtureReady===true);
    const host=page.locator('jugest-app');
    await host.locator('[data-action="store-allocation"]').first().waitFor({state:'visible'});
    if(mode==='patched')await page.waitForFunction(()=>!!document.querySelector('jugest-app').shadowRoot.querySelector('.sv2-tabs [data-action="store-allocation"]'));
    await host.locator('[data-action="store-allocation"]').first().click();
    assert.equal(await host.locator('[data-store-date]').inputValue(),'2026-10-15');
    const dateWidth=await host.locator('[data-store-date]').evaluate(node=>node.getBoundingClientRect().width);assert.ok(dateWidth>=150,`${engine}/${mode}/${width}: date field clips the full date at ${dateWidth}px`);
    const dayReads=await page.evaluate(()=>window.__legacyDayReads);
    await host.locator('[data-allocation-action="run"]').click();await host.locator('[data-allocation-report]').waitFor();
    assert.equal(await page.evaluate(()=>window.__legacyDayReads),dayReads,'allocation must not call the fallback store-day reader');
    assert.match(await host.locator('[data-allocation-report]').innerText(),/全体推定を保留/);
    assert.doesNotMatch(await host.locator('[data-allocation-report]').innerText(),/—台以上/);
    assert.match(await host.locator('[data-allocation-report]').innerText(),/未対応のテスト機種/);
    assert.match(await host.locator('.allocation-events').first().innerText(),/仮定によって変わる/);assert.match(await host.locator('.allocation-events').first().innerText(),/根拠比の幅/);
    assert.doesNotMatch(await host.locator('[data-allocation-report]').innerText(),/90\.0%|成立確率|認定|強い候補/);
    await host.locator('[data-allocation-sort]').selectOption('name');await host.locator('[data-allocation-filter]').selectOption('my');
    assert.equal(await host.locator('[data-allocation-card]').count(),1);assert.match(await host.locator('.allocation-scope').innerText(),/27/);
    const geometry=await host.locator('.allocation-screen').evaluate(node=>({scroll:node.scrollWidth,width:node.clientWidth,overflow:[...node.querySelectorAll('*')].map(e=>({tag:e.tagName,r:e.getBoundingClientRect()})).filter(x=>x.r.width>0&&(x.r.right>innerWidth+1||x.r.left< -1)).map(x=>x.tag)}));
    assert.ok(geometry.scroll<=geometry.width+1,`${engine}/${mode}/${width} summary overflows: ${JSON.stringify(geometry)}`);assert.deepEqual(geometry.overflow,[]);
    await host.locator('[data-allocation-machine="my"]').click();await page.waitForFunction(()=>!!document.querySelector('jugest-app').allocation.detail);
    assert.match(await host.locator('[data-allocation-detail]').innerText(),/通常の各台判別|仮説を仮定した配分/);
    assert.match(await host.locator('[data-allocation-detail]').innerText(),/差枚が整数として確認できないため、差枚なしで計算しました/);
    assert.match(await host.locator('[data-allocation-difference]').innerText(),/差枚込み：近似参考/);assert.match(await host.locator('[data-allocation-difference]').innerText(),/ボーナスのみ 1台/);assert.doesNotMatch(await host.locator('[data-allocation-difference]').innerText(),/慎重比較/);
    await host.locator('[data-allocation-kind]').selectOption('exact');await page.waitForFunction(()=>document.querySelector('jugest-app').allocation.detail?.kind==='exact');
    assert.match(await host.locator('[data-allocation-detail]').innerText(),/ちょうど1台|固定台数の慎重比較は対象外/);
    assert.match(await host.locator('[data-allocation-selected-sensitivity]').innerText(),/仮定によって変わる/);assert.match(await host.locator('[data-allocation-selected-sensitivity]').innerText(),/9通り/);
    await host.locator('[data-allocation-count]').selectOption('0');await page.waitForFunction(()=>document.querySelector('jugest-app').allocation.detail?.count===0);assert.match(await host.locator('[data-allocation-detail]').innerText(),/ちょうど0台/);
    await host.locator('[data-allocation-kind]').selectOption('atLeast');await page.waitForFunction(()=>document.querySelector('jugest-app').allocation.detail?.kind==='atLeast');
    await host.locator('.allocation-detail > .allocation-assumptions > summary').click();
    await host.locator('.allocation-baseline summary').first().click();
    assert.match(await host.locator('.allocation-detail > .allocation-assumptions').innerText(),/0〜2台を同じ重み/);
    const targets=await host.locator('.allocation-screen button,.allocation-screen select,.allocation-screen input,.allocation-screen summary').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0).map(n=>({tag:n.tagName,height:n.getBoundingClientRect().height})).filter(n=>n.height<43.5));assert.deepEqual(targets,[],`${engine}/${mode}/${width}: touch targets`);
    const detailGeometry=await host.locator('.allocation-screen').evaluate(node=>({scroll:node.scrollWidth,width:node.clientWidth}));assert.ok(detailGeometry.scroll<=detailGeometry.width+1,JSON.stringify(detailGeometry));
    if(screenshots){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(screenshots,`${engine}-${mode}-${width}-viewport.png`)});await page.screenshot({path:path.join(screenshots,`${engine}-${mode}-${width}.png`),fullPage:true})}
    await host.locator('[data-allocation-action="back"]').click();
    await host.locator('[data-store-date]').fill('2026-10-14');await host.locator('[data-store-date]').dispatchEvent('change');assert.equal(await host.locator('[data-allocation-report]').count(),0);
    await host.locator('[data-allocation-action="run"]').click();await page.waitForFunction(()=>document.querySelector('jugest-app').allocation.error.includes('所有者または管理者'));assert.match(await host.locator('.allocation-screen').innerText(),/計算後に再度開いてください/);
    assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
    results.push({engine,mode,width,dateFieldWidth:dateWidth,exactDate:true,sensitivityDirectionChange:true,sensitivityModels:9,exactZeroDetail:true,held:true,unsupported:true,familySize:27,detail:true,differenceReference:true,realCookieClient:true,savedResult:true,readOnlyNotReady:true,noHorizontalOverflow:true,pageErrors:0});console.error(`PASS allocation/${engine}/${mode}/${width}`);await context.close();
   }
  }finally{await browser.close()}
 }
}finally{await new Promise(resolve=>server.close(resolve))}
console.log(JSON.stringify({scenarios:results.length,results,unavailable},null,2));
if(!results.length)process.exitCode=2;
