from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
for name in ['core-v510.js','app-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js']:
    code=(root/name).read_text()
    html=html.replace(f'<script defer="" src="./{name}"></script>',f'<script>{code}</script>').replace(f'<script defer src="./{name}"></script>',f'<script>{code}</script>').replace(f'<script src="./{name}"></script>',f'<script>{code}</script>')

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':390,'height':844})
    errs=[]
    page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded',timeout=20000)
    page.wait_for_timeout(1300)
    assert page.locator('jugest-app').count()==1
    strategy=page.evaluate("JUGEST_CORE_BRIDGE.getStrategyAnalysis({})")
    assert isinstance(strategy,dict)
    assert 'summary' in strategy and 'filters' in strategy
    stores=page.evaluate("JUGEST_CORE_BRIDGE.getCollectorStores()")
    assert isinstance(stores,list)
    host=page.locator('jugest-app')
    host.evaluate("e=>e.shadowRoot.querySelector('[data-workspace=records]').click()")
    page.wait_for_timeout(80)
    host.evaluate("e=>e.shadowRoot.querySelector('[data-action=records-strategy]').click()")
    page.wait_for_timeout(80)
    assert host.evaluate("e=>!!e.shadowRoot.querySelector('.strategy-screen')")
    dims=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return [x.scrollWidth,x.clientWidth]}")
    assert dims[0]<=dims[1],dims
    host.evaluate("e=>e.shadowRoot.querySelector('[data-workspace=data]').click()")
    page.wait_for_timeout(80)
    host.evaluate("e=>e.shadowRoot.querySelector('[data-action=data-stores]').click()")
    page.wait_for_timeout(80)
    assert host.evaluate("e=>!!e.shadowRoot.querySelector('.data-screen')")
    benign=('Failed to load resource','manifest')
    serious=[x for x in errs if not any(k in x for k in benign)]
    assert not serious,serious
    b.close()
print('v5.1.0 Phase 6 real-core browser PASS')
