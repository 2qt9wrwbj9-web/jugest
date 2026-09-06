from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, json

root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text()
css=(root/'public/app-v510.css').read_text()
css_data='data:text/css;base64,'+base64.b64encode(css.encode()).decode()
js=js.replace("link.href='./app-v510.css'", "link.href='"+css_data+"'")
img=(root/'public/assets/jugest-mark.png').read_bytes()
img_data='data:image/png;base64,'+base64.b64encode(img).decode()
js=js.replace('./assets/jugest-mark.png',img_data)
bridge=r'''<script>
let active="エスパス日拓新宿歌舞伎町店"; const listeners=new Set();
window.JUGEST_CORE_BRIDGE={
 getSummary(){return {storeCount:9,runCount:1,externalDayCount:253,linked:true,pending:0,enabledTargets:7,errorTargets:3,missingDays:2,unregistered:2,syncLabel:"14:55"}},
 getStores(){return [{name:"エスパス日拓新宿歌舞伎町店",latestDate:"2026-08-31",registered:true,error:false},{name:"マルハンメガシティ蒲田7",latestDate:"2026-09-04",registered:true,error:false},{name:"PIA雑色",latestDate:"2026-09-03",registered:false,error:false}]},
 getActiveStore(){return active},
 setActiveStore(name){active=name; for(const fn of listeners)fn(); return true},
 subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
};</script>'''
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;min-height:100%;background:#f9fbff}</style>'+bridge+'<jugest-app id="JUGEST_APP"></jugest-app><script>'+js+'</script>'

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=1)
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded',timeout=15000); page.wait_for_timeout(350)
    assert not errors, errors
    dims=page.evaluate('({h:document.documentElement.scrollHeight,w:document.documentElement.scrollWidth,ih:innerHeight,iw:innerWidth})')
    assert dims['w']==dims['iw']==390, dims
    host=page.locator('jugest-app').bounding_box(); assert host and host['height']>=844, host
    bg=page.locator('jugest-app').evaluate("e=>getComputedStyle(e).backgroundImage")
    assert 'gradient' in bg.lower(), bg
    shadow=page.locator('jugest-app')
    shadow.evaluate("e=>e.shadowRoot.querySelector('[data-workspace=store]').click()")
    page.wait_for_timeout(220)
    shadow.evaluate("e=>e.shadowRoot.querySelector('[data-open-store-selector]').click()")
    page.wait_for_timeout(320)
    assert shadow.evaluate("e=>!!e.shadowRoot.querySelector('.sheet')")
    shadow.evaluate("e=>[...e.shadowRoot.querySelectorAll('[data-store-name]')].find(x=>x.dataset.storeName==='マルハンメガシティ蒲田7').click()")
    page.wait_for_timeout(120)
    title=shadow.evaluate("e=>e.shadowRoot.querySelector('.store-title span').textContent")
    active_now=page.evaluate('active')
    assert title=='マルハンメガシティ蒲田7', title
    assert active_now=='マルハンメガシティ蒲田7', active_now
    assert not shadow.evaluate("e=>!!e.shadowRoot.querySelector('.sheet')")
    dims2=page.evaluate('({w:document.documentElement.scrollWidth,iw:innerWidth})')
    assert dims2['w']==dims2['iw'], dims2
    browser.close()
print('v5.1.0 browser harness PASS')
