from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
for name in ['core-v510.js','app-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js']:
    code=(root/name).read_text()
    html=html.replace(f'<script defer="" src="./{name}"></script>',f'<script>{code}</script>').replace(f'<script defer src="./{name}"></script>',f'<script>{code}</script>').replace(f'<script src="./{name}"></script>',f'<script>{code}</script>')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':390,'height':844});errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded',timeout=20000);page.wait_for_timeout(1200)
    assert page.evaluate("()=>['getTodayPlan','runStoreAnalysis','runReplay','getModelPerformance'].every(k=>typeof JUGEST_CORE_BRIDGE[k]==='function')")
    # Opening each screen must not execute heavy prediction/analysis automatically.
    host=page.locator('jugest-app');host.evaluate("e=>e.shadowRoot.querySelector('[data-workspace=store]').click()");page.wait_for_timeout(80)
    for action,selector in [('store-plan','[data-plan-run]'),('store-analysis','[data-analysis-run]'),('store-replay','[data-replay-run]'),('store-model','[data-model-run]')]:
        host.evaluate(f"e=>e.shadowRoot.querySelector('[data-action={action}]').click()");page.wait_for_timeout(80)
        assert host.evaluate(f"e=>!!e.shadowRoot.querySelector('{selector}')")
        host.evaluate("e=>e.shadowRoot.querySelector('[data-workspace=store]').click()");page.wait_for_timeout(60)
    # With no selected store in a clean core, explicit direct calls stop before heavy core work.
    for expr in ["JUGEST_CORE_BRIDGE.getTodayPlan('', '2026-09-05')","JUGEST_CORE_BRIDGE.getModelPerformance('')"]:
        ok=page.evaluate(f"()=>{{try{{{expr};return false}}catch(e){{return /店舗/.test(String(e.message||e))}}}}")
        assert ok,expr
    serious=[x for x in errs if 'Failed to load resource' not in x and 'manifest' not in x]
    assert not serious,serious
    b.close()
print('v5.1.0 Phase 5 real-core browser PASS')
