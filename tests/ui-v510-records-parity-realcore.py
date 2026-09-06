from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public';html=(root/'index.html').read_text()
for name in ['core-v510.js','app-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js']:
    code=(root/name).read_text()
    for tag in [f'<script defer="" src="./{name}"></script>',f'<script src="./{name}"></script>',f'<script defer src="./{name}"></script>']:
        html=html.replace(tag,f'<script>{code}</script>')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});page.on('dialog',lambda d:d.accept());errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.set_content(html,wait_until='domcontentloaded',timeout=25000);page.wait_for_timeout(800);host=page.locator('jugest-app')
    def click(sel):host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(60)
    def setv(sel,val):host.evaluate("(e,a)=>{let x=e.shadowRoot.querySelector(a.s);x.value=a.v;x.dispatchEvent(new Event('input',{bubbles:true}))}",{'s':sel,'v':val});page.wait_for_timeout(30)
    click('[data-workspace=live]');click('[data-action=live-judge]');setv('[data-judge-g]','2500');click('[data-record-save-current="judge"]');click('[data-record-save]')
    row=page.evaluate("window.JUGEST_CORE_BRIDGE.getRecentRecords(1)[0]");assert row and row['date']
    click('[data-workspace=records]');click('[data-action=records-calendar]')
    assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.calendar-machine-report article').length")>=1
    host.evaluate("(e,d)=>e.shadowRoot.querySelector(`[data-calendar-date=\"${d}\"]`).click()",row['date']);page.wait_for_timeout(60)
    assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.calendar-day-list .record-row').length")>=1
    click('[data-workspace=records]');click('[data-action=records-analysis]')
    assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.analysis-machine-list .analysis-breakdown-row').length")>=1
    d=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return[x.scrollWidth,x.clientWidth]}");assert d[0]<=d[1],d
    serious=[e for e in errs if 'Failed to load resource' not in e];assert not serious,serious;b.close()
print('v5.1.0 records parity real-core browser PASS')
