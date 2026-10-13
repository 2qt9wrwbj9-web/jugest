// Run explicitly with Playwright. All HTTP/data are local; production is blocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createWebServer} from '../vps/src/web-server.mjs';

const {chromium,webkit,devices}=createRequire(import.meta.url)('playwright');
const root=process.cwd(),dir=fs.mkdtempSync(path.join(tmpdir(),'jugest-parallel-browser-'));
const evidence=path.resolve(process.env.JUGEST_UI_EVIDENCE_DIR||path.join(dir,'evidence'));fs.mkdirSync(evidence,{recursive:true});
const patched=createWebServer({rootDir:root,relayDbPath:path.join(dir,'relay.sqlite'),canonicalDbPath:path.join(dir,'canonical.sqlite'),rawRoot:path.join(dir,'raw'),accessConfig:null});
const built=createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,stores:[],items:[],receipts:[],linked:false}));return}
 const file=path.resolve(root,'public','.'+(u.pathname==='/'?'/index.html':u.pathname));
 if(!file.startsWith(path.resolve(root,'public')+path.sep)){res.writeHead(403);res.end();return}
 try{const body=fs.readFileSync(file);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end()}
});
for(const s of [patched,built]){s.listen(0,'127.0.0.1');await once(s,'listening')}
const wanted=process.env.JUGEST_BROWSER_ENGINE;
assert.ok(!wanted||['chromium','webkit'].includes(wanted),'choose chromium or webkit');
const widths=process.env.JUGEST_BROWSER_WIDTHS?process.env.JUGEST_BROWSER_WIDTHS.split(',').map(Number):[320,375,390,430];
assert.ok(widths.length&&widths.every(w=>[320,375,390,430].includes(w)),'choose widths from 320,375,390,430');
const deliveries=[['built',built],['patched',patched]].filter(([name])=>!process.env.JUGEST_BROWSER_DELIVERY||name===process.env.JUGEST_BROWSER_DELIVERY);
assert.ok(deliveries.length,'choose built or patched delivery');
const results=[];
let browser;
try{
 for(const name of wanted?[wanted]:['chromium','webkit']){
  const executable=process.env.JUGEST_BROWSER_EXECUTABLE_PATH;
  browser=await (name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'?{...(executable?{executablePath:executable}:{}),args:['--no-sandbox','--disable-dev-shm-usage']}: {})});
  for(const [delivery,server] of deliveries)for(const width of widths){
   const origin=`http://127.0.0.1:${server.address().port}`;
   const context=await browser.newContext({...devices['iPhone 13'],viewport:{width,height:844},serviceWorkers:'block'});
   await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin,{waitUntil:'networkidle'});
   await page.waitForFunction(()=>document.querySelector('jugest-app')?.state&&window.JUGESTGroupJudge);
   const host=page.locator('jugest-app');
   await host.locator('[data-workspace="judgement"]').click();
   await host.locator('[data-observed-action="parallel"]').click();
   const openEditor=async()=>{const e=host.locator('details[data-observed-editor]');if(await e.count()&&!await e.evaluate(x=>x.open))await e.locator('summary').first().click()};
   const field=(key,i)=>host.locator(`[data-observed-field="${key}"]`).nth(i);
   const stable=async()=>host.locator('.observed-page').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)));
   const geometry=async()=>{
    await stable();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1));
    const overflow=await host.locator('.observed-page').evaluate(e=>[...e.querySelectorAll('*')].filter(x=>{const r=x.getBoundingClientRect();return r.width&&(r.left< -1||r.right>innerWidth+1)}).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent.slice(0,40)})));
    assert.deepEqual(overflow,[],`${name}/${delivery}/${width} element overflow`);
    for(const input of await host.locator('[data-observed-parallel-editor] input,[data-observed-parallel-editor] select').all())assert.ok(await input.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
    for(const button of await host.locator('[data-observed-parallel-editor] button').all()){
     if(!await button.isVisible())continue;const b=await button.boundingBox();assert.ok(b.width>=43.5&&b.height>=43.5,JSON.stringify(b));
    }
   };
   for(let i=0;i<5;i++){
    if(i)await host.locator('[data-observed-action="add"]').click();
    await field('machine',i).selectOption('mr');
    for(const [key,value] of Object.entries({tableNo:String(100+i),games:'5000',bb:String(12+i*3),rb:String(14+i*4),diff:i?'0':''}))await field(key,i).fill(value);
   }
   await field('diff',2).fill('-500');await geometry();
   if(delivery==='patched'){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(evidence,`${name}-${delivery}-${width}-input.png`),scale:'css'})}
   await host.locator('[data-observed-group-toggle]').check();
   await host.locator('[data-observed-action="judge-all"]').click();
   assert.equal(await host.locator('[data-row-summary]').count(),5);
   for(const row of await host.locator('[data-row-summary]').all())assert.match(await row.innerText(),/最有力 設定/);
   await host.locator('[data-observed-group-report]').waitFor();
   assert.match(await host.locator('[data-observed-group-report]').innerText(),/全456/);
   assert.match(await host.locator('[data-observed-group-report]').innerText(),/成立確率|確率では/);
   assert.match(await host.locator('[data-observed-group-report]').innerText(),/入力済み|4\/5|4台/);
   const original=await page.evaluate(()=>JSON.stringify(document.querySelector('jugest-app').observed.rows.map(r=>r.result.q)));
   const inputOrder=await page.evaluate(()=>document.querySelector('jugest-app').observed.rows.map(r=>r.id));
   for(const key of ['expectedSetting','p4','p5','p6','tableNo']){
    await host.locator('[data-observed-sort]').selectOption(key);
    const wantedOrder=await page.evaluate(key=>document.querySelector('jugest-app').observed.rows.slice().sort((a,b)=>key==='tableNo'?Number(a.input.tableNo)-Number(b.input.tableNo):b.result[key]-a.result[key]).map(r=>String(r.id)),key);
    const shownOrder=await host.locator('[data-observed-result-row]').evaluateAll(nodes=>nodes.map(e=>e.dataset.observedResultRow));
    assert.deepEqual(shownOrder,wantedOrder,`${key} result order`);
   }
   const expected=await page.evaluate(()=>document.querySelector('jugest-app').observed.rows.map(r=>r.id));
   assert.deepEqual(expected,inputOrder,'sorting results preserves input order');
   await host.locator('[data-observed-allocation]').selectOption('all56');
   assert.match(await host.locator('[data-observed-group-report]').innerText(),/全56/);
   await host.locator('[data-observed-allocation]').selectOption('all6');
   await host.locator('[data-observed-group-toggle]').uncheck();
   assert.equal(await host.locator('[data-observed-group-report]').count(),0);
   await host.locator('[data-observed-group-toggle]').check();
   assert.equal(await page.evaluate(()=>JSON.stringify(document.querySelector('jugest-app').observed.rows.map(r=>r.result.q))),original);
   await geometry();
   await host.locator('[data-observed-action="detail"]').first().click();
   assert.equal(await host.locator('[data-observed-unified]').count(),1);
   await host.locator('[data-observed-action="close-detail"]').click();
   assert.equal(await host.locator('[data-row-summary]').count(),5);
   await openEditor();
   await field('rb',0).focus();
   const scroll=await page.evaluate(()=>scrollY);await field('rb',0).fill('15');
   assert.equal(await host.locator('[data-observed-group-report]').count(),0);
   assert.ok(await field('rb',0).evaluate(e=>e.getRootNode().activeElement===e));
   assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scroll)<3,'typing preserves scroll');
   await field('rb',0).press('ArrowLeft');
   const caret=await field('rb',0).evaluate(e=>e.selectionStart);
   await field('rb',0).press('0');
   assert.deepEqual(await field('rb',0).evaluate(e=>[e.selectionStart,e.selectionEnd]),[caret+1,caret+1],'editing preserves the native caret');
   assert.ok(await field('rb',0).evaluate(e=>e.getRootNode().activeElement===e));
   await field('rb',0).fill('15');
   await host.locator('[data-observed-action="judge-all"]').click();
   await openEditor();await host.locator('[data-observed-action="duplicate"]').first().click();
   assert.equal(await host.locator('[data-observed-row]').count(),6);
   const draft=await page.evaluate(()=>document.querySelector('jugest-app').observed.rows.map(r=>r.input));
   const duplicateIndex=draft.findIndex((r,i)=>i>0&&r.tableNo==='');
   assert.ok(duplicateIndex>=0,'duplicate clears machine number');
   await field('tableNo',duplicateIndex).fill('100');await host.locator('[data-observed-action="judge-all"]').click();
   assert.match(await host.locator('[data-observed-group-report]').innerText(),/重複|同じ台番/);
   await openEditor();await host.locator('[data-observed-action="delete"]').nth(duplicateIndex).click();
   await host.locator('[data-observed-action="judge-all"]').click();
   await openEditor();await field('bb',0).fill('');await host.locator('[data-observed-action="judge-all"]').click();
   assert.equal(await host.locator('[data-row-summary]').count(),4);
   assert.match(await host.locator('[data-observed-group-report]').innerText(),/入力|未判別|確認/);
   await field('bb',0).fill('12');await host.locator('[data-observed-action="judge-all"]').click();
   await host.locator('[data-observed-allocation]').selectOption('all456');await geometry();
   if(delivery==='patched'){
    await host.locator('[data-observed-group-report]').evaluate(e=>{
     const top=e.getRootNode().querySelector('.topbar')?.getBoundingClientRect().bottom||0;
     scrollTo({top:scrollY+e.getBoundingClientRect().top-top-8,behavior:'instant'});
    });
    await page.screenshot({path:path.join(evidence,`${name}-${delivery}-${width}-group.png`),scale:'css'});
   }
   // Stable internal IDs are not visible editor positions. Exercise the whole
   // editor, including a skipped empty row, duplicate insertion and deletion.
   await openEditor();await field('tableNo',0).fill('');await field('tableNo',4).fill('');
   for(const [key,value] of Object.entries({games:'8000',bb:'4',rb:'1',diff:''}))await field(key,0).fill(value);
   const identities=async()=>{
    await host.locator('[data-observed-action="judge-all"]').click();
    for(const details of await host.locator('[data-observed-group-report] details').all())if(!await details.evaluate(e=>e.open))await details.locator('summary').first().click();
    const wanted=await page.evaluate(()=>{
     const o=document.querySelector('jugest-app').observed,report=o.groupReport;
     if(!report?.ok)throw Error(JSON.stringify(report));
     const label=r=>r.tableNo||`台番なし（${o.rows.findIndex(x=>x.id===r.id)+1}行目）`;
     const h=report.hypotheses.find(x=>x.id===o.allocation);
     return{n:report.n,worst:report.hypotheses.map(x=>label(x.worstRow)),conditional:h.conditional.rows.map(label),p:h.refutation.rows.map(label),individual:Object.fromEntries(o.rows.filter(x=>x.result).map((x,i)=>[x.id,x.input.tableNo||`台番なし（${o.rows.indexOf(x)+1}行目）`]))};
    });
    assert.equal(wanted.n,5);
    assert.deepEqual(await host.locator('.observed-group-meaning b').allTextContents(),wanted.worst);
    assert.deepEqual(await host.locator('.observed-group-conditional-row>b').allTextContents(),wanted.conditional);
    assert.deepEqual(await host.locator('.observed-group-p-row>b').allTextContents(),wanted.p);
    for(const row of await host.locator('[data-observed-result-row]').all())assert.equal(await row.locator('.observed-result-main>b').innerText(),wanted.individual[await row.getAttribute('data-observed-result-row')]);
    await geometry();
   };
   await identities();await openEditor();await host.locator('[data-observed-action="duplicate"]').first().click();
   for(const key of ['tableNo','games','bb','rb','diff'])await field(key,0).fill('');
   await field('machine',0).selectOption('');
   await identities();await openEditor();await host.locator('[data-observed-action="delete"]').first().click();await identities();
   // The warned row's internal id may equal a healthy row's real table number.
   // It must still point to the current editor row in native rendered notices.
   await openEditor();
   const warningId=await page.evaluate(()=>document.querySelector('jugest-app').observed.rows[0].id);
   for(const [index,values] of [[0,{machine:'my6',tableNo:'',games:'5000',bb:'20',rb:'20',diff:'50000'}],[1,{machine:'my',tableNo:warningId,games:'5000',bb:'20',rb:'20',diff:''}]]){
    for(const [key,value] of Object.entries(values))if(key==='machine')await field(key,index).selectOption(value);else await field(key,index).fill(value);
   }
   await host.locator('[data-observed-action="judge-all"]').click();
   assert.equal(await page.evaluate(()=>document.querySelector('jugest-app').observed.groupReport.ok),true);
   const warningReport=await host.locator('[data-observed-group-report]').textContent();
   assert.match(warningReport,/台番なし（1行目）：差枚の逆算に警告があります。/);
   assert.doesNotMatch(warningReport,new RegExp(`台${warningId}：差枚の逆算に警告があります。`),'never blame the healthy numbered row');
   const warningSummary=host.locator('[data-observed-group-report] summary').filter({hasText:'注意点を確認'});
   if(!await warningSummary.evaluate(e=>e.parentElement.open))await warningSummary.click();
   if(delivery==='patched'&&width===390){await warningSummary.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`${name}-${delivery}-${width}-warning.png`),scale:'css'});}
   await openEditor();await field('tableNo',0).fill('<img src=x onerror=alert(1)>');
   await host.locator('[data-observed-action="judge-all"]').click();assert.equal(await host.locator('[data-row-summary] img').count(),0);await geometry();
   const saved=await page.evaluate(()=>JSON.stringify(document.querySelector('jugest-app').observed.rows.map(r=>r.input)));
   await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('jugest-app')?.observed?.rows?.length===5);
   assert.equal(await page.evaluate(()=>JSON.stringify(document.querySelector('jugest-app').observed.rows.map(r=>r.input))),saved);
   assert.equal(await host.locator('[data-row-summary]').count(),0,'never restore stale results');
   assert.equal(await host.locator('[data-observed-group-report]').count(),0,'never restore stale group');
   assert.ok(await host.locator('[data-observed-group-toggle]').isChecked());await geometry();
   await host.locator('.bottom-nav [data-workspace="home"]').click();await host.locator('.bottom-nav [data-workspace="judgement"]').click();
   assert.equal(await page.evaluate(()=>JSON.stringify(document.querySelector('jugest-app').observed.rows.map(r=>r.input))),saved,'workspace changes preserve all drafts');
   assert.deepEqual(errors,[],`${name}/${delivery}/${width} page errors`);
   results.push({engine:name,browserVersion:browser.version(),delivery,width,rows:5,negativeDifference:true,draftReload:true,workspaceSwitch:true,groupToggle:true,sort:true,conditionalModes:true,duplicate:true,duplicateNumberBlocked:true,partialInputBlocked:true,unnumberedEditorIdentity:true,skippedBlankIdentity:true,reverseWarningIdentity:true,modalSettingVisible:true,focusAndScrollStable:true,caretStable:true,escaped:true,pageErrors:0});
   console.error(`PASS ${name}/${delivery}/${width}`);
   await context.close();
  }
  await browser.close();browser=null;
 }
 console.log(JSON.stringify({scenarios:results.length,results}));
}finally{
 await browser?.close();for(const s of [patched,built]){s.closeAllConnections();await new Promise(r=>s.close(r))}fs.rmSync(dir,{recursive:true,force:true});
}
