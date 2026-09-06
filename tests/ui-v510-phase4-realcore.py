from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
for name in ['core-v510.js','app-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js']:
    code=(root/name).read_text()
    html=html.replace(f'<script defer="" src="./{name}"></script>',f'<script>{code}</script>').replace(f'<script defer src="./{name}"></script>',f'<script>{code}</script>').replace(f'<script src="./{name}"></script>',f'<script>{code}</script>')
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.set_content(html,wait_until='domcontentloaded',timeout=20000);page.wait_for_timeout(1200)
 host=page.locator('jugest-app');assert host.count()==1
 host.evaluate("e=>e.shadowRoot.querySelector('[data-workspace=live]').click()");page.wait_for_timeout(100);host.evaluate("e=>e.shadowRoot.querySelector('[data-action=live-rev]').click()");page.wait_for_timeout(100)
 assert host.evaluate("e=>!!e.shadowRoot.querySelector('.reverse-screen')")
 host.evaluate("e=>{for(const [s,v] of [['[data-rev-g]','2400'],['[data-rev-b]','10'],['[data-rev-r]','9'],['[data-rev-d]','850']]){const x=e.shadowRoot.querySelector(s);x.value=v;x.dispatchEvent(new Event('input',{bubbles:true}))}}")
 page.wait_for_timeout(100);es=host.evaluate("e=>e.shadowRoot.querySelector('[data-rev-es]').textContent");assert es!='—' and float(es)>0,es
 assert host.evaluate("e=>!e.shadowRoot.querySelector('[data-pickup-begin]').disabled");host.evaluate("e=>e.shadowRoot.querySelector('[data-pickup-begin]').click()");page.wait_for_timeout(100);assert host.evaluate("e=>!!e.shadowRoot.querySelector('.pickup-wrap')")
 host.evaluate("e=>{const x=e.shadowRoot.querySelector('[data-pickup-current-g]');x.value='3000';x.dispatchEvent(new Event('input',{bubbles:true}))}");page.wait_for_timeout(80);assert host.evaluate("e=>e.shadowRoot.querySelector('[data-pickup-self]').textContent")=='600G'
 host.evaluate("e=>e.shadowRoot.querySelector('[data-action=live-compare]').click()");page.wait_for_timeout(100);assert host.evaluate("e=>!!e.shadowRoot.querySelector('[data-compare-row]')")
 host.evaluate("e=>{const row=e.shadowRoot.querySelector('[data-compare-row]');for(const [f,v] of [['G','3000'],['B','12'],['R','10'],['D','900']]){const x=row.querySelector(`[data-field=${f}]`);x.value=v;x.dispatchEvent(new Event('input',{bubbles:true}))}}")
 page.wait_for_timeout(100);assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.ranking-row').length")>=1
 dims=host.evaluate("e=>({sw:e.shadowRoot.querySelector('.app-shell').scrollWidth,cw:e.shadowRoot.querySelector('.app-shell').clientWidth})");assert dims['sw']<=dims['cw'],dims
 benign=('Failed to load resource' ,'manifest')
 serious=[x for x in errs if not any(k in x for k in benign)];assert not serious,serious;b.close()
print('v5.1.0 Phase 4 real-core browser PASS')
