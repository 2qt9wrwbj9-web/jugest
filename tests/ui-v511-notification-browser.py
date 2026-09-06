from pathlib import Path
from playwright.sync_api import sync_playwright
import base64

root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text()
css=(root/'public/app-v510.css').read_text()
js=js.replace("link.href='./app-v510.css'","link.href='data:text/css;base64,"+base64.b64encode(css.encode()).decode()+"'")
js=js.replace('./assets/jugest-mark.png','data:image/png;base64,'+base64.b64encode((root/'public/assets/jugest-mark.png').read_bytes()).decode())
bridge="""<script>
let listeners=new Set(),active='Alpha店',summary={storeCount:1,runCount:2,externalDayCount:50,linked:true,pending:2,enabledTargets:1,errorTargets:1,missingDays:1,unregistered:1,syncLabel:'06:55'};
window.JUGEST_CORE_BRIDGE={
 getSummary(){return summary},
 getStores(){return[{name:'Alpha店',latestDate:'2026-09-05',registered:true,error:false}]},getActiveStore(){return active},setActiveStore(){},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 prepareJudge(){return{machine:'my',machineName:'マイV',G:0,defs:[],q:[0,0,0,0,0,0],machines:[{key:'my',name:'マイV'}],expectedSetting:0,p4:0,p5:0,p6:0}}
};</script>"""
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=b.new_page(viewport={'width':390,'height':844})
    errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html);page.wait_for_timeout(120)
    host=page.locator('jugest-app')
    def click(sel):
        host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(80)
    assert host.evaluate("e=>e.shadowRoot.querySelector('[data-notification-toggle]').textContent.includes('🔔')")
    assert host.evaluate("e=>e.shadowRoot.querySelector('.notification-badge').textContent")=='3'
    assert not host.evaluate("e=>!!e.shadowRoot.querySelector('.notification-popover')")
    click('[data-notification-toggle]')
    assert host.evaluate("e=>!!e.shadowRoot.querySelector('.notification-popover')")
    assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.notification-item').length")==3
    assert not host.evaluate("e=>!!e.shadowRoot.querySelector('.notification-popover [aria-label*=閉],.notification-popover [data-notification-close],.notification-popover .close')")
    box=host.evaluate("e=>{let r=e.shadowRoot.querySelector('.notification-popover').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,right:r.right}}")
    assert box['width']<=340,box
    assert box['y']<115,box
    assert box['right']<=386,box
    # A normal tap outside the panel should dismiss it AND still perform that tap's action.
    click('[data-workspace=records]')
    assert not host.evaluate("e=>!!e.shadowRoot.querySelector('.notification-popover')")
    assert '記録' in host.evaluate("e=>e.shadowRoot.querySelector('main').innerText")
    # Notification items themselves navigate and close the panel.
    click('[data-notification-toggle]')
    click('.notification-item')
    assert not host.evaluate("e=>!!e.shadowRoot.querySelector('.notification-popover')")
    assert 'データ' in host.evaluate("e=>e.shadowRoot.querySelector('main').innerText")
    # Healthy state: bell remains available, but the red badge disappears and the popover says there is nothing to act on.
    page.evaluate("summary={storeCount:1,runCount:2,externalDayCount:50,linked:true,pending:0,enabledTargets:1,errorTargets:0,missingDays:0,unregistered:0,syncLabel:'07:00'};listeners.forEach(f=>f())")
    page.wait_for_timeout(80)
    assert not host.evaluate("e=>!!e.shadowRoot.querySelector('.notification-badge')")
    click('[data-notification-toggle]')
    assert '確認が必要な通知はありません' in host.evaluate("e=>e.shadowRoot.querySelector('.notification-popover').innerText")
    assert not errs,errs
    b.close()
print('v5.1.1 notification popover browser PASS')
