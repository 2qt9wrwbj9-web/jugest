from pathlib import Path
from playwright.sync_api import sync_playwright
import base64
root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text();css=(root/'public/app-v510.css').read_text()
js=js.replace("link.href='./app-v510.css'","link.href='data:text/css;base64,"+base64.b64encode(css.encode()).decode()+"'")
js=js.replace('./assets/jugest-mark.png','data:image/png;base64,'+base64.b64encode((root/'public/assets/jugest-mark.png').read_bytes()).decode())
bridge='''<script>
let listeners=new Set(),deleted=0,active='誤登録店';let rows=[
{name:'誤登録店',shopId:'s1',registered:false,enabled:false,latestDate:'',missing:0,error:'',url:'',startDate:'',priority:2,canDeleteMaster:true,deleteBlockedReason:''},
{name:'使用中店',shopId:'s2',registered:false,enabled:false,latestDate:'',missing:0,error:'',url:'',startDate:'',priority:2,canDeleteMaster:false,deleteBlockedReason:'稼働1件'}];
window.JUGEST_CORE_BRIDGE={
 getSummary(){return{storeCount:rows.length,runCount:1,externalDayCount:0,linked:false,pending:0,enabledTargets:0,errorTargets:0,missingDays:0,unregistered:rows.length,syncLabel:'未同期'}},
 getStores(){return rows.map(x=>({name:x.name,latestDate:'',registered:x.registered,error:false}))},getActiveStore(){return active},setActiveStore(n){active=n;return true},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 getCollectorStores(){return rows},async deleteStoreMaster(id){deleted++;rows=rows.filter(x=>x.shopId!==id);if(active==='誤登録店')active='使用中店';listeners.forEach(f=>f());return{deleted:true,activeStore:active}}
};</script>'''
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844});page.on('dialog',lambda d:d.accept());errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.set_content(html);page.wait_for_timeout(100);host=page.locator('jugest-app')
 def click(sel):host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(80)
 click('[data-workspace=data]');click('[data-action=data-stores]')
 assert host.evaluate("e=>e.shadowRoot.querySelectorAll('[data-store-master-delete]').length")==1
 assert '誤登録店' in host.evaluate("e=>e.shadowRoot.querySelector('[data-store-master-delete]').closest('.collector-row').innerText")
 click('[data-store-master-delete]')
 assert page.evaluate('deleted')==1
 assert '誤登録店' not in host.evaluate("e=>e.shadowRoot.querySelector('.collector-list').innerText")
 assert '使用中店' in host.evaluate("e=>e.shadowRoot.querySelector('.collector-list').innerText")
 assert not errs,errs
 b.close()
print('v5.1.2 safe store deletion browser PASS')
