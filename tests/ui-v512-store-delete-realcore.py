from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public'
html=(root/'index.html').read_text()
seed='''let shops=[{id:"s1",name:"誤登録店",savedCoinBase:0,createdAt:1},{id:"s2",name:"使用中店",savedCoinBase:0,createdAt:2},{id:"s3",name:"残高あり店",savedCoinBase:500,createdAt:3}],sessions=[{id:1,shopId:"s2",date:"2026-09-06",machine:"my",playedG:1000,q:[1,0,0,0,0,0],expectedSetting:1,expectedDiff:0}],sessionSeq=2,pendingSession=null,editingSessionId=null;'''
needle='let shops=[],sessions=[],sessionSeq=1,pendingSession=null,editingSessionId=null;'
assert needle in html
html=html.replace(needle,seed,1)
for name in ['core-v510.js','app-v510.js','hanahana-judge.js','missing-inference.js','sync-core.js']:
    p=root/name
    if not p.exists(): continue
    code=p.read_text()
    for tag in [f'<script defer="" src="./{name}"></script>',f'<script src="./{name}"></script>',f'<script defer src="./{name}"></script>']:
        html=html.replace(tag,f'<script>{code}</script>')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':390,'height':844});errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.set_content(html,wait_until='domcontentloaded',timeout=25000);page.wait_for_timeout(700)
    rows=page.evaluate('JUGEST_CORE_BRIDGE.getCollectorStores()')
    a=next(x for x in rows if x['name']=='誤登録店');u=next(x for x in rows if x['name']=='使用中店');m=next(x for x in rows if x['name']=='残高あり店')
    assert a['canDeleteMaster'] is True,a
    assert u['canDeleteMaster'] is False and '稼働1件' in u['deleteBlockedReason'],u
    assert m['canDeleteMaster'] is False and '店舗設定' in m['deleteBlockedReason'],m
    r=page.evaluate("JUGEST_CORE_BRIDGE.deleteStoreMaster('s1')")
    assert r['deleted'] is True and r['activeStore']=='使用中店',r
    rows2=page.evaluate('JUGEST_CORE_BRIDGE.getCollectorStores()')
    assert all(x['name']!='誤登録店' for x in rows2),rows2
    msg=page.evaluate("JUGEST_CORE_BRIDGE.deleteStoreMaster('s2').then(()=>'',e=>String(e.message||e))")
    assert '稼働1件' in msg,msg
    assert not [e for e in errs if 'Failed to load resource' not in e],errs
    b.close()
print('v5.1.2 safe store deletion real-core PASS')
