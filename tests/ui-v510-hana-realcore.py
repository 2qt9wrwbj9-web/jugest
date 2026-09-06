from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
for name in ['core-v510.js','app-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js']:
    code=(root/name).read_text()
    for tag in [f'<script defer="" src="./{name}"></script>',f'<script src="./{name}"></script>',f'<script defer src="./{name}"></script>']:
        html=html.replace(tag,f'<script>{code}</script>')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':390,'height':844});errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded',timeout=25000);page.wait_for_timeout(900);host=page.locator('jugest-app');assert host.count()==1
    def click(sel):host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(60)
    def inputv(sel,val):host.evaluate("(e,a)=>{let x=e.shadowRoot.querySelector(a.s);x.value=a.v;x.dispatchEvent(new Event('input',{bubbles:true}))}",{'s':sel,'v':val});page.wait_for_timeout(30)
    def txt(sel):return host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}')?.textContent||''")
    click('[data-workspace=live]');click('[data-action=live-hana-pickup]');inputv('[data-hana-field="G"][data-hana-scope="rev"]','3000');inputv('[data-hana-field="bb"][data-hana-scope="rev"]','12');inputv('[data-hana-field="rb"][data-hana-scope="rev"]','10');inputv('[data-hana-field="diff"][data-hana-scope="rev"]','800');
    assert txt('[data-hana-es]')!='—';assert txt('[data-hana-bell]').startswith('1/')
    click('[data-hana-begin]');inputv('[data-hana-field="currentG"]','3600');inputv('[data-hana-field="bb"][data-hana-scope="live"]','2');inputv('[data-hana-field="rb"][data-hana-scope="live"]','1');inputv('[data-hana-field="bell"][data-hana-scope="live"]','85');assert txt('[data-hana-es]')!='—'
    click('[data-hana-count="bigWater"][data-delta="1"]');assert host.evaluate("e=>e.shadowRoot.querySelector('[data-hana-field=\"bigWater\"]').value")=='1'
    d=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return[x.scrollWidth,x.clientWidth]}");assert d[0]<=d[1],d
    serious=[e for e in errs if 'Failed to load resource' not in e];assert not serious,serious;b.close()
print('v5.1.0 native HANA real-core browser PASS')
