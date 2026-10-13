// Development artifact only. Never opens a remote page or permits network access.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium,webkit,devices}=createRequire(import.meta.url)('playwright');
const file=path.resolve('docs/development/completion-20261012/preview.html');
const results=[];
for(const engine of process.env.JUGEST_BROWSER_ENGINE?[process.env.JUGEST_BROWSER_ENGINE]:['chromium','webkit']){
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.JUGEST_BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']}: {})});
 try{
  for(const width of process.env.JUGEST_BROWSER_WIDTHS?process.env.JUGEST_BROWSER_WIDTHS.split(',').map(Number):[320,375,390,430]){
   const context=await browser.newContext({...devices['iPhone 13'],viewport:{width,height:844},serviceWorkers:'block'});
   const external=[],errors=[];
   await context.route('**/*',route=>/^(file:|data:|blob:)/.test(route.request().url())?route.continue():(external.push(route.request().url()),route.abort()));
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(file).href);
   await page.waitForFunction(()=>document.querySelector('jugest-app')?.bridge()?.judgeObservedMachine);
   assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(),1,'a real CSP meta element must block network access');
   await page.waitForFunction(()=>document.querySelector('jugest-app')?.observed.groupReport?.ok===true,null,{timeout:10000});
   const host=page.locator('jugest-app');
   assert.equal(await host.locator('[data-observed-result-row]').count(),5);
   assert.equal(await host.locator('[data-development-note]').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const editor=host.locator('details[data-observed-editor]');if(await editor.count()&&!await editor.evaluate(e=>e.open))await editor.locator('summary').click();
   const number=host.locator('[data-observed-field="tableNo"]').first();
   await number.fill('');
   assert.equal(await host.locator('[data-observed-group-report]').count(),0,'editing immediately invalidates the group');
   await host.locator('[data-observed-action="judge-all"]').click();
   assert.equal(await page.evaluate(()=>document.querySelector('jugest-app').observed.groupReport.ok),true);
   await page.reload();
   await page.waitForFunction(()=>document.querySelector('jugest-app')?.observed.groupReport?.ok===true);
   assert.equal(await page.evaluate(()=>document.querySelector('jugest-app').observed.rows[0].input.tableNo),'','the preview preserves edited drafts on reload');
   const blocked=await page.evaluate(async()=>{try{await fetch('https://jugest.net/api/health');return false}catch{return true}});
   assert.equal(blocked,true,'even GET requests to production must fail');
   assert.deepEqual(external,[],'no remote request may be attempted');assert.deepEqual(errors,[]);
   results.push({engine,width,rows:5,rejudge:true,draftReload:true,networkBlocked:true,pageErrors:0});
   console.error(`PASS offline-preview/${engine}/${width}`);await context.close();
  }
 }finally{await browser.close()}
}
console.log(JSON.stringify({scenarios:results.length,results}));
