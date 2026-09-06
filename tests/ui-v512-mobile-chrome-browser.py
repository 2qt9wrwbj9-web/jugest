from pathlib import Path
from playwright.sync_api import sync_playwright
import base64

root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text()
css=(root/'public/app-v510.css').read_text()
css_data='data:text/css;base64,'+base64.b64encode(css.encode()).decode()
js=js.replace("link.href='./app-v510.css'", "link.href='"+css_data+"'")
img_data='data:image/png;base64,'+base64.b64encode((root/'public/assets/jugest-mark.png').read_bytes()).decode()
js=js.replace('./assets/jugest-mark.png',img_data)

defs=','.join([f"{{id:'m{i}',name:'小役{i}',group:'small',value:0,enabled:true}}" for i in range(18)])
bridge=f'''<script>
let active='ARROW平塚店';const listeners=new Set();
let judge={{machine:'my',machineName:'マイジャグラーV',machines:[{{key:'my',name:'マイジャグラーV'}}],G:1000,expectedSetting:3.5,p4:.4,p5:.2,p6:.1,q:[.1,.15,.2,.2,.2,.15],warning:'',context:{{date:'2026-09-06',shopName:active,tableNo:'2102'}},defs:[{defs}]}};
window.JUGEST_CORE_BRIDGE={{
 getSummary(){{return{{storeCount:8,runCount:0,externalDayCount:100,linked:true,pending:0,enabledTargets:5,errorTargets:0,missingDays:0,unregistered:1,syncLabel:'07:40'}}}},
 getStores(){{return['ARROW平塚店','pia雑色','エスパス日拓新宿歌舞伎町店','グリーン','ジアス大船','セブンS川崎店'].map((name,i)=>({{name,latestDate:'2026-09-0'+(6-i%3),registered:i!==1,error:false}}))}},
 getActiveStore(){{return active}},setActiveStore(n){{active=n;listeners.forEach(f=>f());return true}},subscribe(f){{listeners.add(f);return()=>listeners.delete(f)}},
 prepareJudge(){{return structuredClone(judge)}},getJudgeState(){{return structuredClone(judge)}},setJudgeContext(p){{judge.context={{...judge.context,...p}};return structuredClone(judge)}},setJudgeG(v){{judge.G=+v||0;return structuredClone(judge)}},setJudgeMetric(id,v){{let x=judge.defs.find(d=>d.id===id);if(x)x.value=+v||0;return structuredClone(judge)}},setJudgeMetricEnabled(id,v){{let x=judge.defs.find(d=>d.id===id);if(x)x.enabled=!!v;return structuredClone(judge)}},setJudgeMachine(){{return structuredClone(judge)}}
}};</script>'''
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;min-height:100%;background:#f9fbff}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    page.set_content(html,wait_until='domcontentloaded');page.wait_for_timeout(150)
    host=page.locator('jugest-app')
    host.evaluate("e=>e.shadowRoot.querySelector('[data-action=live-judge]').click()")
    page.wait_for_timeout(80)
    page.evaluate('window.scrollTo(0,900)');page.wait_for_timeout(80)
    y=page.evaluate('window.scrollY')
    assert y>500,y
    nav=host.evaluate("e=>{let r=e.shadowRoot.querySelector('.bottom-nav').getBoundingClientRect();return{top:r.top,bottom:r.bottom}}")
    top=host.evaluate("e=>e.shadowRoot.querySelector('.topbar').getBoundingClientRect().top")
    assert abs(nav['bottom']-844)<=2,('bottom nav is not viewport-fixed',nav,y)
    assert abs(top)<=2,('topbar is not viewport-fixed',top,y)
    host.evaluate("e=>e.shadowRoot.querySelector('[data-open-store-selector]').click()")
    page.wait_for_timeout(80)
    layer=host.evaluate("e=>{let r=e.shadowRoot.querySelector('.sheet-layer').getBoundingClientRect();return{top:r.top,bottom:r.bottom}}")
    sheet=host.evaluate("e=>{let r=e.shadowRoot.querySelector('.sheet').getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height}}")
    assert abs(layer['top'])<=2 and abs(layer['bottom']-844)<=2,('store selector layer is not viewport-fixed',layer,y)
    assert sheet['top']<210,('store selector starts too low in viewport',sheet,y)
    browser.close()
print('v5.1.2 mobile chrome/store selector browser PASS')
