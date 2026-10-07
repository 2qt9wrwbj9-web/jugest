// Optional browser test: provide Playwright and a Chromium binary (see docs/pia-access.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createWebHandler} from '../../src/web-server.mjs';
import {openDatabase} from '../../src/db.mjs';
import {migrate} from '../../src/schema.mjs';
import {createAccessStore} from '../../src/access/store.mjs';

test('browser: bootstrap Passkey, invite, scoped data, force stop, login and additional credential',async t=>{
  const previous={mode:process.env.JUGEST_PIA_ACCESS_MODE,ids:process.env.JUGEST_PIA_OWNER_CHANNEL_IDS};
  process.env.JUGEST_PIA_ACCESS_MODE='owner';process.env.JUGEST_PIA_OWNER_CHANNEL_IDS='browser-test-owner';
  t.after(()=>{for(const [key,value] of [['JUGEST_PIA_ACCESS_MODE',previous.mode],['JUGEST_PIA_OWNER_CHANNEL_IDS',previous.ids]]){if(value===undefined)delete process.env[key];else process.env[key]=value}});
  const rootDir=fileURLToPath(new URL('../../..',import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),'jugest-browser-')),dbPath=join(dir,'access.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),relayDbPath=join(dir,'relay.sqlite');
  let handler,clock=Date.now();
  const server=http.createServer((req,res)=>handler(req,res));server.listen(0,'localhost');await once(server,'listening');
  const origin='http://localhost:'+server.address().port;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})});
  const env={...process.env,JUGEST_ACCESS_DB:dbPath};
  const cli=fileURLToPath(new URL('../../scripts/access-admin.mjs',import.meta.url));
  execFileSync(process.execPath,[cli,'migrate'],{env});
  const bootstrap=JSON.parse(execFileSync(process.execPath,[cli,'bootstrap'],{env,encoding:'utf8'}));
  const db=openDatabase(canonicalDbPath);migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('pia:35','PIAテスト店舗',JSON.stringify({source:'pia-public-ranking-top'}),'2026-10-06','2026-10-06');
  db.prepare("INSERT INTO store_days(store_id,business_date,quality_status,created_at,updated_at) VALUES(?,?,'valid',?,?)").run('pia:35','2026-10-05','2026-10-06','2026-10-06');
  db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('pia:35','2026-10-05','1',JSON.stringify({tableNo:'3090',machine:'マイジャグラー',games:5000,bb:20,rb:18,diff:900}));db.close();
  handler=createWebHandler({rootDir,canonicalDbPath,relayDbPath,rawRoot:join(dir,'raw'),accessConfig:{dbPath,origin,rpID:'localhost',allowLocalhost:true,now:()=>clock}});
  const {chromium}=await import(process.env.JUGEST_PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.JUGEST_CHROMIUM_EXECUTABLE?{executablePath:resolve(process.env.JUGEST_CHROMIUM_EXECUTABLE)}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});t.after(()=>browser.close());
  const errors=[];
  async function device(){
    const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    return {context,page};
  }
  const admin=await device();await admin.page.goto(origin+'/admin/register');
  await admin.page.locator('#enrollment-token').fill(bootstrap.token);await admin.page.locator('#credential-name').fill('ヒロのテスト端末');
  await admin.page.locator('#registration button').click();await admin.page.waitForURL(origin+'/admin');
  await admin.page.locator('#credentials .entry').waitFor();
  assert.match(await admin.page.locator('#credentials').innerText(),/ヒロのテスト端末/);
  const adminCookie=(await admin.context.cookies()).find(c=>c.name==='__Host-jugest_admin');assert.equal(adminCookie.secure,true);assert.equal(adminCookie.httpOnly,true);assert.equal(adminCookie.sameSite,'Strict');
  await admin.page.goto(origin+'/pia');await admin.page.locator('#machine-data .machine').waitFor();
  assert.equal(await admin.page.locator('#viewer-logout').innerText(),'管理画面へ戻る');
  await admin.page.locator('#viewer-logout').click();await admin.page.waitForURL(origin+'/admin');
  assert.equal((await admin.context.cookies()).find(c=>c.name==='__Host-jugest_admin').value,adminCookie.value);
  // Force the important-operation reauthentication branch before issuance.
  clock+=300001;
  const label='<img src=x onerror=alert(1)>';
  await admin.page.locator('#invite-label').fill(label);await admin.page.locator('#issue-invite button').click();
  await admin.page.locator('#secret-card').waitFor({state:'visible'});
  const code=await admin.page.locator('#issued-secret').inputValue();assert.match(code,/^JGST-/);
  assert.equal(await admin.page.locator('#invites img').count(),0);
  const viewerContext=await browser.newContext({viewport:{width:375,height:812}}),viewer=await viewerContext.newPage();viewer.on('pageerror',error=>errors.push(error.message));
  await viewer.goto(origin+'/pia/access');await viewer.locator('#invite-code').fill(code);await viewer.locator('#redemption button').click();await viewer.waitForURL(origin+'/pia');
  await viewer.locator('#machine-data .machine').waitFor();assert.match(await viewer.locator('#machine-data').innerText(),/3090/);
  await viewer.goto(origin+'/pia/access');await viewer.waitForURL(origin+'/pia',{timeout:5000});await viewer.locator('#machine-data .machine').waitFor();
  for(const width of [320,375,390]){await viewer.setViewportSize({width,height:844});assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  assert.equal((await viewerContext.request.get(origin+'/admin')).status(),403);
  assert.equal((await viewerContext.request.get(origin+'/api/access/admin/state')).status(),403);
  await admin.page.reload();await admin.page.locator('#sessions button').waitFor();admin.page.on('dialog',dialog=>dialog.accept());
  await admin.page.locator('#sessions button').click();await admin.page.getByText('停止したよ。',{exact:true}).waitFor();
  assert.equal((await viewerContext.request.get(origin+'/api/vps/stores/pia:35/days/2026-10-05')).status(),401);
  await viewer.locator('#refresh-data').click();await viewer.locator('#message.error').waitFor();assert.equal(await viewer.locator('#machine-data .machine').count(),0);
  await admin.page.locator('#add-credential').click();await admin.page.locator('#secret-card').waitFor({state:'visible'});
  const registrationLink=await admin.page.locator('#issued-secret').inputValue();
  const additional=await device();await additional.page.goto(registrationLink);assert.equal(new URL(additional.page.url()).hash,'');
  await additional.page.locator('#credential-name').fill('追加端末');await additional.page.locator('#registration button').click();await additional.page.waitForURL(origin+'/admin');
  await additional.page.locator('#credentials .entry').first().waitFor();assert.equal(await additional.page.locator('#credentials .entry').count(),2);
  await admin.page.reload();await admin.page.locator('#credentials .entry').filter({hasText:'追加端末'}).locator('button').click();await admin.page.getByText('停止したよ。',{exact:true}).waitFor();
  assert.equal((await additional.context.request.get(origin+'/api/access/admin/state')).status(),401);
  await admin.page.locator('#admin-logout').click();await admin.page.waitForURL(origin+'/admin/login');
  await admin.page.locator('#login').click();await admin.page.waitForURL(origin+'/admin');
  assert.deepEqual(errors,[]);
  const store=createAccessStore({dbPath,now:()=>clock});try{
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM admin_credentials').get().n,2);
    for(const table of ['admin_enrollment_tokens','pia_access_invites','pia_viewer_sessions','admin_sessions','access_audit_events']){
      const rows=JSON.stringify(store.db.prepare('SELECT * FROM '+table).all());assert.ok(!rows.includes(code));assert.ok(!rows.includes(bootstrap.token));
    }
  }finally{store.close()}
});
