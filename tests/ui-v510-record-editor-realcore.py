from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public';html=(root/'index.html').read_text()
for name in ['core-v510.js','app-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js']:
    code=(root/name).read_text()
    for tag in [f'<script defer="" src="./{name}"></script>',f'<script src="./{name}"></script>',f'<script defer src="./{name}"></script>']:
        html=html.replace(tag,f'<script>{code}</script>')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});page.on('dialog',lambda d:d.accept());errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.set_content(html,wait_until='domcontentloaded',timeout=25000);page.wait_for_timeout(900);host=page.locator('jugest-app')
    def click(sel):host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(60)
    def setv(sel,val,event='input'):host.evaluate("(e,a)=>{let x=e.shadowRoot.querySelector(a.s);x.value=a.v;x.dispatchEvent(new Event(a.ev,{bubbles:true}))}",{'s':sel,'v':val,'ev':event});page.wait_for_timeout(30)
    def text(sel):return host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}')?.innerText||''")
    click('[data-workspace=live]');click('[data-action=live-judge]');setv('[data-judge-g]','3200');click('[data-record-save-current="judge"]');assert host.evaluate("e=>!!e.shadowRoot.querySelector('.record-editor-screen')");assert '3,200G' in text('.info-card')
    setv('[data-record-field="loanCoinsPer1000"]','46');setv('[data-record-field="exchangeCoinsPer1000"]','52');setv('[data-record-field="cashInvestYen"]','10000');setv('[data-record-field="collectedCoins"]','1700');setv('[data-record-field="exchangedYen"]','20000');setv('[data-record-tag-name]','末尾狙い');click('[data-record-add-tag]');assert '末尾狙い' in text('.record-tag-chips');click('[data-record-save]');assert host.evaluate("e=>e.shadowRoot.querySelectorAll('[data-record-row]').length")==1;assert '末尾狙い' in text('[data-record-row]')
    click('[data-record-edit]');setv('[data-record-field="memo"]','実機テストメモ');click('[data-record-save]');assert '実機テストメモ' in text('[data-record-row]');click('[data-record-delete]');assert host.evaluate("e=>e.shadowRoot.querySelectorAll('[data-record-row]').length")==0
    d=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return[x.scrollWidth,x.clientWidth]}");assert d[0]<=d[1],d;serious=[e for e in errs if 'Failed to load resource' not in e];assert not serious,serious;b.close()
print('v5.1.0 native record editor real-core browser PASS')
