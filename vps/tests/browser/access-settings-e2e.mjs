import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createWebHandler} from '../../src/web-server.mjs';
import {openDatabase} from '../../src/db.mjs';
import {migrate} from '../../src/schema.mjs';
import {migrateAccessDatabase,createAccessStore} from '../../src/access/store.mjs';
import {createRelayStore} from '../../src/relay-store.mjs';

test('settings: Passkey admin management, inline OTP redemption, unlimited viewing, reload and force stop', {timeout:120000},async t=>{
  const previous={mode:process.env.JUGEST_PIA_ACCESS_MODE,ids:process.env.JUGEST_PIA_OWNER_CHANNEL_IDS};
  process.env.JUGEST_PIA_ACCESS_MODE='owner';process.env.JUGEST_PIA_OWNER_CHANNEL_IDS='settings-test-owner';
  t.after(()=>{for(const [k,v] of [['JUGEST_PIA_ACCESS_MODE',previous.mode],['JUGEST_PIA_OWNER_CHANNEL_IDS',previous.ids]]){if(v===undefined)delete process.env[k];else process.env[k]=v}});
  const dir=mkdtempSync(join(tmpdir(),'jugest-settings-')),dbPath=join(dir,'access.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),relayDbPath=join(dir,'relay.sqlite');
  let handler,clock=Date.now();const server=http.createServer((req,res)=>handler(req,res));server.listen(0,'localhost');await once(server,'listening');
  const origin='http://localhost:'+server.address().port;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})});
  migrateAccessDatabase(dbPath);const store=createAccessStore({dbPath,now:()=>clock});t.after(()=>store.close());const bootstrap=store.issueEnrollment();
  const db=openDatabase(canonicalDbPath);migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('pia:35','PIAテスト店舗',JSON.stringify({source:'pia-public-ranking-top',visibility:'public'}),'2026-10-06','2026-10-06');
  db.exec("INSERT INTO store_days(store_id,business_date,quality_status,created_at,updated_at) VALUES('pia:35','2026-10-05','valid','2026-10-06','2026-10-06');");
  db.prepare('INSERT INTO machine_day_data VALUES(?,?,?,?)').run('pia:35','2026-10-05','1',JSON.stringify({tableNo:'3090',machine:'my',games:5000,bb:20,rb:18,diff:900}));db.close();
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON('channel/settings-test-owner',{receiverHash:createHash('sha256').update('settings-owner-test-token').digest('hex'),revokedAt:0});
  handler=createWebHandler({rootDir:fileURLToPath(new URL('../../..',import.meta.url)),canonicalDbPath,relayDbPath,rawRoot:join(dir,'raw'),accessConfig:{dbPath,origin,rpID:'localhost',allowLocalhost:true,now:()=>clock}});
  const {chromium}=await import(process.env.JUGEST_PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.JUGEST_CHROMIUM_EXECUTABLE?{executablePath:resolve(process.env.JUGEST_CHROMIUM_EXECUTABLE)}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});t.after(()=>browser.close());
  const errors=[];
  async function device(){const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page}}
  async function settings(page){await page.locator('jugest-app [data-vps-settings-gear]').click();await page.locator('[data-pia-settings]').waitFor()}
  const admin=await device(),cdp=await admin.context.newCDPSession(admin.page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await admin.page.goto(origin+'/admin/register');await admin.page.locator('#enrollment-token').fill(bootstrap.token);await admin.page.locator('#credential-name').fill('ヒロ');await admin.page.locator('#registration button').click();await admin.page.waitForURL(origin+'/admin');
  let releaseStatus;const statusReady=new Promise(r=>{releaseStatus=r});
  await admin.page.route('**/api/access/viewer/status',async route=>{await statusReady;await route.continue()});
  await admin.page.goto(origin+'/');await settings(admin.page);
  assert.equal(await admin.page.locator('[data-pia-settings] #invite-code').count(),0,'pending server role must not flash the OTP form to an admin');
  releaseStatus();
  const panel=admin.page.locator('[data-pia-settings]');await panel.locator('#issue-invite').waitFor();assert.equal(await panel.locator('#invite-code').count(),0);
  assert.match(await panel.locator('h1').innerText(),/PIA共有アクセス/);
  assert.deepEqual(await panel.locator('#viewer-hours option').evaluateAll(nodes=>nodes.map(n=>n.value)),['1','24','72','168','720','unlimited']);
  for(const width of [320,375,390]){await admin.page.setViewportSize({width,height:844});assert.equal(await admin.page.evaluate(()=>document.querySelector('jugest-app').shadowRoot.querySelector('.vps-settings-overlay').scrollWidth<=innerWidth),true)}
  let releaseIssue,issueStarted;
  const issueReady=new Promise(r=>{releaseIssue=r}),issueSeen=new Promise(r=>{issueStarted=r});
  await admin.page.route('**/api/access/admin/invites',async route=>{const response=await route.fetch();issueStarted();await issueReady;await route.fulfill({response})});
  await panel.locator('#viewer-hours').selectOption('unlimited');await panel.locator('#invite-label').fill('<img src=x onerror=alert(1)>');await panel.locator('#issue-invite button').click();await issueSeen;
  // Ordinary Collector/bridge updates rerender the app while an operation is running.
  await admin.page.evaluate(()=>{document.querySelector('jugest-app').render();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  assert.equal(await panel.locator('#invite-label').inputValue(),'<img src=x onerror=alert(1)>','background app render must preserve the active settings operation');
  releaseIssue();await panel.locator('#secret-card').waitFor({state:'visible'});
  const code=await panel.locator('#issued-secret').inputValue();assert.equal(await panel.locator('img').count(),0);
  const guest=await device();await guest.page.goto(origin+'/');await settings(guest.page);
  let guestPanel=guest.page.locator('[data-pia-settings]');await guestPanel.locator('#invite-code').waitFor();assert.equal(await guestPanel.locator('#issue-invite').count(),0);
  await guestPanel.locator('#invite-code').fill(code);await guestPanel.locator('#redemption button').click();await guestPanel.locator('#machine-data .machine').waitFor();
  assert.match(await guestPanel.locator('#viewer-status').innerText(),/閲覧権限：有効.*無期限/);
  assert.match(await guestPanel.locator('#machine-data').innerText(),/3090/);assert.equal(new URL(guest.page.url()).pathname,'/');
  await guest.page.waitForFunction(()=>globalThis.JUGEST_VPS_REMOTE_STORES?.getStores().some(s=>s.id==='pia:35'));
  assert.equal((await guest.context.request.get(origin+'/api/access/admin/state')).status(),403);
  assert.equal((await guest.context.request.post(origin+'/api/access/admin/invites',{headers:{origin,'x-jugest-access':'1'},data:{viewerHours:null}})).status(),403);
  assert.equal((await guest.context.request.post(origin+'/api/vps/judge/machines',{data:{machines:[]}})).status(),403);
  const cookie=(await guest.context.cookies()).find(c=>c.name==='__Host-jugest_pia');assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'Strict');
  assert.ok(cookie.expires-Date.now()/1000>399*86400,'the real browser must retain unlimited authentication beyond a half-year gap');
  assert.ok(cookie.expires-Date.now()/1000<=400*86400,'browser retention stays within the supported 400-day limit');
  await guest.page.reload();await settings(guest.page);guestPanel=guest.page.locator('[data-pia-settings]');await guestPanel.locator('#machine-data .machine').waitFor();assert.equal(await guestPanel.locator('#invite-code').count(),0);
  for(const width of [320,375,390]){await guest.page.setViewportSize({width,height:844});assert.equal(await guest.page.evaluate(()=>document.querySelector('jugest-app').shadowRoot.querySelector('.vps-settings-overlay').scrollWidth<=innerWidth),true)}
  await panel.locator('#refresh-admin').click();await panel.locator('#sessions button').waitFor();assert.match(await panel.locator('#sessions').innerText(),/無期限（管理者が停止するまで）/);admin.page.on('dialog',d=>d.accept());
  await panel.locator('#sessions button').click();assert.equal((await guest.context.request.get(origin+'/api/vps/stores')).status(),401);
  await guestPanel.locator('#refresh-data').click();await guest.page.locator('[data-pia-settings] #invite-code').waitFor();assert.equal(await guest.page.locator('[data-pia-settings] #machine-data .machine').count(),0);
  await guest.page.waitForFunction(()=>globalThis.JUGEST_VPS_REMOTE_STORES?.getStores().length===0);
  await admin.page.evaluate(()=>localStorage.setItem('jugglerRelayReceiver:v1',JSON.stringify({linked:true,channelId:'settings-test-owner',receiverToken:'settings-owner-test-token'})));
  await panel.locator('#admin-logout').click();await panel.locator('#invite-code').waitFor();
  await admin.page.waitForFunction(()=>globalThis.JUGEST_VPS_REMOTE_STORES?.getStores().some(s=>s.id==='pia:35'),{},{timeout:5000});
  await panel.locator('#settings-admin-login').click();await panel.locator('#issue-invite').waitFor();assert.equal(await panel.locator('#invite-code').count(),0);
  // Each reopened settings panel waits for fresh authorization, not cached role.
  await admin.page.locator('[data-vps-settings-close]').click();await panel.waitFor({state:'detached'});
  let releaseReopen;const reopenReady=new Promise(r=>{releaseReopen=r});
  await admin.page.route('**/api/access/viewer/status',async route=>{await reopenReady;await route.continue()});
  await settings(admin.page);assert.equal(await panel.locator('#issue-invite').count(),0);assert.equal(await panel.locator('#invite-code').count(),0);
  releaseReopen();await panel.locator('#issue-invite').waitFor();assert.equal(await panel.locator('#issued-secret').inputValue(),'');
  assert.deepEqual(errors,[]);
});
