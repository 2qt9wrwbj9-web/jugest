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
   def mode_layout():
    mode=host.locator('.observed-modes')
    mode.evaluate('e=>Promise.all(e.closest(".observed-page").getAnimations().map(a=>a.finished))')
    geometry=mode.evaluate('e=>[e,...e.querySelectorAll("button")].map(x=>{const r=x.getBoundingClientRect();return {x:r.x,width:r.width}})')
    box,a,b=geometry
    assert abs(a['width']-b['width'])<1
    assert abs((a['x']+b['x']+b['width'])/2-(box['x']+box['width']/2))<1, 'mode switch must fill both grid columns symmetrically'
    assert mode.evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length')==2
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844});host.locator('.observed-page').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))');mode_layout()
   def editor_layout():
    mode_layout()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth')
    assert host.evaluate('e=>e.scrollWidth<=innerWidth && e.shadowRoot.querySelector(".app-shell").scrollWidth<=innerWidth')
    editor=host.locator('[data-observed-parallel-editor]')
    assert editor.evaluate('e=>e.scrollWidth<=e.clientWidth')
    for field in editor.locator('input,select').all():
     assert field.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)>=16')
     rect=field.bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=page.viewport_size['width']+1
    assert editor.locator('input').first.get_attribute('inputmode')=='numeric'
    assert editor.locator('[data-observed-field=diff]').first.get_attribute('inputmode')=='text'
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
   assert '推定ブドウ確率' in host.locator('[data-observed-result]').inner_text()
   assert 'reverse-diff' not in host.locator('[data-observed-result]').text_content()
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
    page.set_viewport_size({'width':width,'height':844});host.locator('.observed-page').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))')
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('.observed-page *')].every(x=>{const r=x.getBoundingClientRect();return !r.width||(r.left>=-1&&r.right<=innerWidth+1)})")
    results.append({'delivery':delivery,'width':width,'single':True,'debug':True})
   set_debug(False);assert_debug(False)
   assert page.evaluate("document.querySelector('jugest-app').observed.single.result")==before
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844});host.locator('.observed-page').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))')
    mode_layout()
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
   assert '未使用' in host.locator('[data-observed-result]').inner_text()
   assert page.evaluate("document.querySelector('jugest-app').observed.single.result.method")=='bonus-only'
   host.locator('[data-observed-action="parallel"]').click()
   host.locator('[data-observed-action="add"]').click()
   assert host.locator('[data-observed-parallel-editor]').count()==1
   for i in [0,1]:
    host.locator('[data-observed-field=machine]').nth(i).select_option('my')
    for field,value in [('games','5278'),('bb','19'),('rb','22'),('diff','830'),('tableNo',str(3064+i))]:fill(field,value,i)
   host.locator('[data-observed-action="judge-all"]').click()
   assert host.locator('[data-row-summary]').count()==2
   assert page.evaluate("document.querySelector('jugest-app').observed.rows[0].result")==before
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844});host.locator('.observed-page').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))')
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('.observed-page *')].every(x=>{const r=x.getBoundingClientRect();return !r.width||(r.left>=-1&&r.right<=innerWidth+1)})")
    editor_layout()
    results.append({'delivery':delivery,'width':width,'parallel':True,'columnWidths':host.locator('.observed-table-row').first.evaluate('e=>[...e.querySelectorAll("input,select,button")].map(x=>x.getBoundingClientRect().width)')})
   host.locator('[data-observed-action="detail"]').first.click()
   assert host.locator('.observed-probability').count()==6
   assert_debug(False)
   set_debug(True);assert_debug(True)
   host.locator('summary',has_text='開発者情報').click()
   host.locator('summary',has_text='技術情報を見る').click()
   host.locator('summary',has_text='使用テーブルJSON').click()
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844});host.locator('.observed-page').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))')
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
   assert host.locator('.observed-table-row').count()==1
   # A partial row reports only its own errors. Blank rows never become errors.
   fill('bb','');host.locator('[data-observed-action=judge-all]').click()
   assert host.locator('.observed-table-row [aria-invalid=true]').count()==1
   fill('bb','19');host.locator('[data-observed-action=add]').click()
   host.locator('[data-observed-action=judge-all]').click()
   assert host.locator('.observed-table-row').nth(1).locator('.observed-error').count()==0
   fill('tableNo','only-table-number',1);host.locator('[data-observed-action=judge-all]').click()
   assert host.locator('.observed-table-row').nth(1).locator('[aria-invalid=true]').count()==4
   fill('tableNo','',1);host.locator('[data-observed-action=judge-all]').click()
   assert host.locator('.observed-table-row').nth(1).locator('.observed-error').count()==0
   # Explicit zero / empty / negative differences stay distinct.
   for i,diff in enumerate(['0','','-200'],start=1):
    if i>1:host.locator('[data-observed-action=add]').click()
    host.locator('[data-observed-field=machine]').nth(i).select_option('my')
    for field,value in [('games','7859'),('bb','0' if i==1 else '31'),('rb','0' if i==1 else '35'),('diff',diff)]:fill(field,value,i)
   host.locator('[data-observed-action=add]').click();host.locator('[data-observed-action=judge-all]').click()
   values=page.evaluate("document.querySelector('jugest-app').observed.rows.map(r=>({result:r.result,errors:r.errors}))")
   assert values[1]['result']['input']['bb']==0 and values[1]['result']['input']['rb']==0 and values[1]['result']['input']['diff']==0
   assert values[2]['result']['input']['diff'] is None and values[2]['result']['method']=='bonus-only'
   assert values[3]['result']['input']['diff']==-200
   assert values[4]=={'result':None,'errors':{}}
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844});host.locator('.observed-page').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))');editor_layout()
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
   def assert_grape(value):
    assert host.locator('.observed-summary dt').filter(has_text='推定ブドウ').evaluate('e=>e.nextElementSibling.textContent')==value
    host.locator('summary',has_text='詳細分析を見る').click()
    detail=host.locator('summary',has_text='詳細分析を見る').locator('..')
    assert detail.locator('dt').filter(has_text='推定ブドウ確率').evaluate('e=>e.nextElementSibling.textContent')==('未使用' if value=='—' else value)
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844});mode_layout();assert_grape('1/5.87')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth')
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('.observed-summary *')].every(x=>{const r=x.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1})")
   assert round(sample['expectedSetting'],2)==4.85
   assert [round(sample[k]*100,1) for k in ['p4','p5','p6']]==[92.1,66.3,28.3]
   assert_debug(False);set_debug(True);assert_debug(True);assert_grape('1/5.87')
   assert page.evaluate("document.querySelector('jugest-app').observed.single.result")==sample
   set_debug(False);assert_debug(False)
   # Structured imports feed the editor unchanged and share the single result.
   page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'my',games:7859,bb:31,rb:35,diff:1500},{machine:'my',games:7859,bb:31,rb:35,diff:1500}])")
   host.locator('[data-observed-action=judge-all]').click()
   assert page.evaluate("document.querySelector('jugest-app').observed.rows[0].result")==sample
   for row in host.locator('[data-row-summary]').all(): assert '推定ブドウ 1/5.87' in row.inner_text()
   for width in [320,375,390]:
    page.set_viewport_size({'width':width,'height':844});editor_layout()
    assert host.evaluate("e=>[...e.shadowRoot.querySelectorAll('[data-row-summary] *')].every(x=>x.getBoundingClientRect().right<=innerWidth+1)")
   imported=page.evaluate("document.querySelector('jugest-app').observed.rows[0].input")
   page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'go',games:1000,bb:0,rb:0}],{append:true})")
   assert host.locator('.observed-table-row').count()==3
   assert page.evaluate("document.querySelector('jugest-app').observed.rows[0].input")==imported
   host.locator('[data-observed-action=detail]').first.click();assert_grape('1/5.87');set_debug(True);assert_debug(True);assert_grape('1/5.87')
   assert page.evaluate("document.querySelector('jugest-app').observed.rows[0].result")==sample
   set_debug(False);host.locator('[data-observed-action=close-detail]').click()
   assert host.locator('.observed-table-row').count()==3
   page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'my',games:7859,bb:31,rb:35,diff:''}]);const app=document.querySelector('jugest-app');app.judgeObservedRow(app.observed.single);app.render()")
   assert_grape('—')
   page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'my',games:7859,bb:31,rb:35,diff:''},{machine:'my',games:7859,bb:31,rb:35,diff:1500}])")
   host.locator('[data-observed-action=judge-all]').click()
   assert '推定ブドウ —' in host.locator('[data-row-summary]').first.inner_text()
   assert '推定ブドウ 1/5.87' in host.locator('[data-row-summary]').nth(1).inner_text()
   assert not errors,errors
   if os.environ.get('JUGEST_SCREENSHOT_DIR'):
    output=Path(os.environ['JUGEST_SCREENSHOT_DIR']);output.mkdir(parents=True,exist_ok=True)
    page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'my',tableNo:'3064',games:5278,bb:19,rb:22,diff:830}]);const app=document.querySelector('jugest-app');app.judgeObservedRow(app.observed.single);app.render()")
    page.screenshot(path=str(output/f'{delivery}-single-390.png'),full_page=True)
    page.evaluate("document.querySelector('jugest-app').acceptMachineRows([{machine:'my',tableNo:'3064',games:7851,bb:31,rb:35,diff:1500},{machine:'my',tableNo:'3065',games:6240,bb:25,rb:18,diff:800},{machine:'my',tableNo:'3066',games:7112,bb:22,rb:29,diff:-200}])")
    host.locator('[data-observed-action=judge-all]').click()
    for width in [320,375,390]:
     page.set_viewport_size({'width':width,'height':844});host.locator('.observed-page').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))');editor_layout()
     page.screenshot(path=str(output/f'{delivery}-parallel-{width}.png'),full_page=True)
   context.close()
  browser.close()
 print(json.dumps({'passed':True,'viewportChecks':results},ensure_ascii=False))
finally:server.shutdown();server.server_close()
