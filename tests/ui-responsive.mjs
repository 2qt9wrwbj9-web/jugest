import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.JUGEST_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const fontDir=process.env.JUGEST_TEST_FONT_DIR;
const server=http.createServer((req,res)=>{const route=req.url.split('?')[0],file=fontDir&&route.startsWith('/test-fonts/')?path.join(fontDir,route.slice(12)):path.join(process.cwd(),'public',route==='/'?'index.html':route);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(file))}catch(_){res.writeHead(404);res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=process.env.JUGEST_PREVIEW_URL||`http://127.0.0.1:${server.address().port}`;
try{
 await page.goto(url);await page.waitForFunction(()=>window.JUGEST_CORE_BRIDGE&&document.querySelector('jugest-app')?.state);
 if(fontDir){await page.addStyleTag({content:fs.readFileSync(path.join(fontDir,'400.css'),'utf8').replaceAll('./files/',`http://127.0.0.1:${server.address().port}/test-fonts/files/`)});await page.evaluate(()=>document.fonts.ready)}
 await page.evaluate(()=>{
  const base=window.JUGEST_CORE_BRIDGE;
  const long='非常に長い店舗名・マイジャグラー特別な機種名ABC1234567890';
  window.JUGEST_CORE_BRIDGE={...base,getMoveState:()=>({context:{tableNo:'12345678',machineName:long},current:{combinedP4:.99999},message:long+'の状況を確認してください',target:{machine:'my',tableNo:'222222',machineName:long},candidates:[{machine:'my',tableNo:'222222',machineName:long,predP4:.999,predES:5.99,gap:.987}],history:[{tableNo:'12345678',machineName:long,decision:'移動を検討してください',gap:.987}]})};
  const app=document.querySelector('jugest-app');app.state.moveInput={G:'12345678',B:'12345678',R:'12345678',D:'-12345678'};
 });
 const failures=[];
 for(const width of [320,360,375,390,414,430]){
  await page.setViewportSize({width,height:844});
  for(const action of ['live-move','live-judge','live-rev','live-compare','live-hana','live-hana-pickup','home']){
   await page.evaluate(action=>{const a=document.querySelector('jugest-app');action==='home'?a.navigate('home'):a.handleAction(action)},action);
   await page.waitForTimeout(250);
   const bad=await page.evaluate(()=>[...document.querySelector('jugest-app').shadowRoot.querySelectorAll('.workspace *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&& (r.right>innerWidth+1||r.left< -1 || (e.scrollWidth>e.clientWidth+2&&!['INPUT','SELECT'].includes(e.tagName)&&getComputedStyle(e).overflowX==='visible'))}).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,60)})));
   if(bad.length)failures.push({width,action,bad});
   if(action==='live-move'){
    const spacing=await page.evaluate(()=>{const r=document.querySelector('jugest-app').shadowRoot,c=r.querySelector('.move-current'),t=r.querySelector('.move-target');return {currentPadding:parseFloat(getComputedStyle(c).paddingLeft),targetPadding:parseFloat(getComputedStyle(t).paddingLeft),labelSize:parseFloat(getComputedStyle(c.querySelector('small')).fontSize)}});
    if(spacing.currentPadding<12||spacing.targetPadding<12||spacing.labelSize<12)failures.push({width,action,spacing});
   }
  }
 }
 await page.evaluate(()=>document.querySelector('jugest-app').handleAction('live-move'));
 const chromeBefore=await page.evaluate(()=>{const r=document.querySelector('jugest-app').shadowRoot;return ['.topbar','.bottom-nav'].map(s=>r.querySelector(s).getBoundingClientRect().top)});
 await page.evaluate(()=>window.scrollTo(0,500));
 const chromeAfter=await page.evaluate(()=>{const r=document.querySelector('jugest-app').shadowRoot;return ['.topbar','.bottom-nav'].map(s=>r.querySelector(s).getBoundingClientRect().top)});
 assert.deepEqual(chromeAfter,chromeBefore,'fixed chrome must remain fixed after scrolling');
 fs.mkdirSync('docs/ui-refresh',{recursive:true});fs.writeFileSync('docs/ui-refresh/responsive-results.json',JSON.stringify({url,japaneseFont:!!fontDir,widths:[320,360,375,390,414,430],combinations:42,fixedChrome:true,failures,errors},null,2));
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.querySelector('jugest-app').handleAction('live-move');window.scrollTo(0,0)});await page.waitForTimeout(300);await page.screenshot({path:'docs/ui-refresh/move-390.png',fullPage:true});
 await page.evaluate(()=>document.querySelector('jugest-app').navigate('home'));await page.waitForTimeout(300);await page.screenshot({path:'docs/ui-refresh/home-390.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[],'UI elements must fit at every tested iPhone width');
 console.log('PASS 42 viewport/screen combinations; no page errors');
}finally{await browser.close();server.close()}
