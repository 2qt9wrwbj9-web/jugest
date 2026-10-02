"""Local-only real-engine UI regression for built and VPS-patched delivery."""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse
import json, os, subprocess
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
node=os.environ.get('JUGEST_TEST_NODE','node')
patch_script="import fs from 'node:fs';import {patchJugestIndexSource} from './vps/src/ui-source-patch.mjs';process.stdout.write(patchJugestIndexSource(fs.readFileSync('index.html','utf8')));"
patched=subprocess.check_output([node,'--input-type=module','-e',patch_script],cwd=root)
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  path=urlparse(self.path).path
  if path.startswith('/api/'):
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"ok":true,"stores":[],"items":[],"receipts":[]}');return
  folder=root/'public' if path.startswith('/built/') else root
  relative=path.removeprefix('/built/') if path.startswith('/built/') else path.lstrip('/')
  file=folder/(relative or 'index.html')
  try: data=patched if path=='/' else file.read_bytes()
  except (OSError,ValueError): self.send_error(404);return
  suffix=file.suffix
  mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'}.get(suffix,'text/html')
  self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(data)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
server.daemon_threads=True
Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for delivery in ['built','patched']:
   context=browser.new_context(viewport={'width':390,'height':844})
   context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
   page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
   page.goto(origin+('/built/' if delivery=='built' else '/'))
   page.wait_for_function("document.querySelector('jugest-app')?.state && window.JUGEST_CORE_BRIDGE?.judgeObservedMachine")
   host=page.locator('jugest-app')
   nav=host.locator('.bottom-nav button')
   assert nav.all_text_contents()==['⌂ホーム','▥判別','◎実戦','▦店舗','▤記録','⇅データ']
   nav.nth(1).click()
   def set_debug(enabled):
    host.locator('[data-vps-settings-gear]').click()
    toggle=host.locator('[data-observed-debug-toggle]')
    assert toggle.evaluate('(element)=>new Promise(resolve=>{let n=0;function next(){if(++n===8)resolve(element.isConnected);else requestAnimationFrame(next)}requestAnimationFrame(next)})'), 'settings input must remain attached between frames'
    toggle.set_checked(enabled)
    assert toggle.is_checked()==enabled
    close=host.locator('[data-vps-settings-close]') if delivery=='patched' else host.locator('[data-observed-action="close-settings"]')
    close.click()
   def assert_debug(enabled):
    assert host.locator('[data-observed-debug]').count()==int(enabled)
    for text in ['設定別ログ尤度','既存の設定別逆算行','内部機種キー','MCP判別識別子','使用した既存テーブル']:
     assert (text in host.locator('.observed-page').text_content())==enabled
   def fill(field,value,index=0): host.locator(f'[data-observed-field="{field}"]').nth(index).fill(value)
   for field,value in [('games','5278'),('bb','19'),('rb','22'),('diff','830'),('tableNo','3064')]:fill(field,value)
   host.locator('[data-observed-action="judge"]').click()
   assert host.locator('.observed-probability').count()==6
   assert 'P5+' in host.locator('[data-observed-result]').inner_text()
   host.locator('summary',has_text='詳細分析を見る').click()
   assert 'reverse-diff' in host.locator('[data-observed-result]').inner_text()
   assert_debug(False)
   before=page.evaluate("document.querySelector('jugest-app').observed.single.result")
   set_debug(True);assert_debug(True)
   host.locator('summary',has_text='開発者情報').click()
   host.locator('summary',has_text='技術情報を見る').click()
   assert 'external-juggler-browser-parity-v1' in host.locator('[data-observed-result]').inner_text()
   assert page.evaluate("document.querySelector('jugest-app').observed.single.result")==before
   host.locator('summary',has_text='使用テーブルJSON').click()
   assert host.locator('[data-observed-debug] pre').is_visible()
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844})
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('.observed-page *')].every(x=>{const r=x.getBoundingClientRect();return !r.width||(r.left>=-1&&r.right<=innerWidth+1)})")
    results.append({'delivery':delivery,'width':width,'single':True,'debug':True})
   set_debug(False);assert_debug(False)
   assert page.evaluate("document.querySelector('jugest-app').observed.single.result")==before
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844})
    for button in nav.all():
     box=button.bounding_box();assert box['width']>=44 and box['height']>=44,box
    assert host.evaluate("e=>e.shadowRoot.querySelector('.app-shell').scrollWidth<=innerWidth")
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('.observed-page *')].every(x=>{const r=x.getBoundingClientRect();return !r.width||(r.left>=-1&&r.right<=innerWidth+1)})")
    results.append({'delivery':delivery,'width':width,'single':True})
   # Editing must immediately remove stale output without losing typing focus.
   fill('rb','23');assert host.locator('[data-observed-result]').count()==0
   assert host.locator('[data-observed-field="rb"]').input_value()=='23'
   fill('bb','');host.locator('[data-observed-action="judge"]').click()
   assert host.locator('[data-observed-result]').count()==0
   fill('bb','0');fill('rb','0');fill('diff','')
   host.locator('[data-observed-action="judge"]').click()
   host.locator('summary',has_text='詳細分析を見る').click()
   assert 'bonus-only' in host.locator('[data-observed-result]').inner_text()
   host.locator('[data-observed-action="parallel"]').click()
   host.locator('[data-observed-action="add"]').click()
   for i in [0,1]:
    for field,value in [('games','5278'),('bb','19'),('rb','22'),('diff','830'),('tableNo',str(3064+i))]:fill(field,value,i)
   host.locator('[data-observed-action="judge-all"]').click()
   assert host.locator('[data-row-summary]').count()==2
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844})
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('.observed-page *')].every(x=>{const r=x.getBoundingClientRect();return !r.width||(r.left>=-1&&r.right<=innerWidth+1)})")
    results.append({'delivery':delivery,'width':width,'parallel':True})
   host.locator('[data-observed-action="detail"]').first.click()
   assert host.locator('.observed-probability').count()==6
   assert_debug(False)
   set_debug(True);assert_debug(True)
   host.locator('summary',has_text='開発者情報').click()
   host.locator('summary',has_text='技術情報を見る').click()
   host.locator('summary',has_text='使用テーブルJSON').click()
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844})
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('.observed-page *')].every(x=>{const r=x.getBoundingClientRect();return !r.width||(r.left>=-1&&r.right<=innerWidth+1)})")
    results.append({'delivery':delivery,'width':width,'parallel':True,'debug':True})
   set_debug(False);assert_debug(False)
   page.go_back();assert host.locator('[data-row-summary]').count()==2
   page.go_forward();assert host.locator('.observed-probability').count()==6
   host.locator('[data-observed-action="close-detail"]').click()
   page.go_back();assert '台3064' in host.locator('.observed-page').inner_text()
   assert host.locator('.observed-probability').count()==6
   page.go_forward();assert host.locator('[data-row-summary]').count()==2
   host.locator('[data-observed-action="detail"]').nth(1).click()
   assert '台3065' in host.locator('.observed-page').inner_text()
   page.go_back();page.go_back()
   assert '台3064' in host.locator('.observed-page').inner_text()
   assert '台3065' not in host.locator('.observed-page').inner_text()
   host.locator('[data-observed-action="single"]').click()
   assert host.locator('[data-observed-action="single"]').get_attribute('aria-pressed')=='true'
   assert host.locator('[data-observed-action="close-detail"]').count()==0
   host.locator('[data-observed-action="parallel"]').click()
   host.locator('[data-observed-action="delete"]').first.click()
   assert host.locator('[data-observed-card]').count()==1
   # Debug preference persists, but old computed results never do.
   set_debug(True)
   # UI tab/mode restoration must not restore old computed results as fresh data.
   page.reload();page.wait_for_function("document.querySelector('jugest-app')?.state?.workspace==='judgement'")
   assert host.locator('[data-observed-action="parallel"]').get_attribute('aria-pressed')=='true'
   assert host.locator('[data-observed-result]').count()==0
   host.locator('[data-vps-settings-gear]').click()
   assert host.locator('[data-observed-debug-toggle]').is_checked()
   (host.locator('[data-vps-settings-close]') if delivery=='patched' else host.locator('[data-observed-action="close-settings"]')).click()
   set_debug(False);page.reload();page.wait_for_function("document.querySelector('jugest-app')?.state")
   host.locator('[data-vps-settings-gear]').click();assert not host.locator('[data-observed-debug-toggle]').is_checked()
   (host.locator('[data-vps-settings-close]') if delivery=='patched' else host.locator('[data-observed-action="close-settings"]')).click()
   # The reported sample is identical with debug OFF and ON.
   page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'my',games:7859,bb:31,rb:35,diff:1500}]);const app=document.querySelector('jugest-app');app.judgeObservedRow(app.observed.single);app.render()")
   sample=page.evaluate("document.querySelector('jugest-app').observed.single.result")
   assert round(sample['expectedSetting'],2)==4.85
   assert [round(sample[k]*100,1) for k in ['p4','p5','p6']]==[92.1,66.3,28.3]
   assert_debug(False);set_debug(True);assert_debug(True)
   assert page.evaluate("document.querySelector('jugest-app').observed.single.result")==sample
   set_debug(False);assert_debug(False)
   assert not errors,errors
   if os.environ.get('JUGEST_SCREENSHOT_DIR'):
    output=Path(os.environ['JUGEST_SCREENSHOT_DIR']);output.mkdir(parents=True,exist_ok=True)
    page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'my',tableNo:'3064',games:5278,bb:19,rb:22,diff:830}]);const app=document.querySelector('jugest-app');app.judgeObservedRow(app.observed.single);app.render()")
    page.screenshot(path=str(output/f'{delivery}-single-390.png'),full_page=True)
   context.close()
  browser.close()
 print(json.dumps({'passed':True,'viewportChecks':results},ensure_ascii=False))
finally:server.shutdown();server.server_close()
