from pathlib import Path
from playwright.sync_api import sync_playwright
import base64

root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text()
css=(root/'public/app-v510.css').read_text()
css_data='data:text/css;base64,'+base64.b64encode(css.encode()).decode()
js=js.replace("link.href='./app-v510.css'", "link.href='"+css_data+"'")
img=(root/'public/assets/jugest-mark.png').read_bytes()
img_data='data:image/png;base64,'+base64.b64encode(img).decode()
js=js.replace('./assets/jugest-mark.png',img_data)
bridge=r'''<script>
let active="エスパス日拓新宿歌舞伎町店"; const listeners=new Set(); let trendCalls=0;
let judge={machine:'im',machineName:'アイムジャグラーEX',machines:[{key:'im',name:'アイムジャグラーEX'},{key:'my',name:'マイジャグラーV'}],G:0,expectedSetting:0,p4:0,p5:0,p6:0,q:[1/6,1/6,1/6,1/6,1/6,1/6],warning:'',context:{date:'2026-09-05',shopName:active,tableNo:'412'},defs:[{id:'bell',name:'ぶどう',group:'small',value:0,enabled:true},{id:'bb',name:'BIG',group:'big',value:0,enabled:true},{id:'rb',name:'REG',group:'reg',value:0,enabled:true}]};
function recalc(){judge.expectedSetting=judge.G?4.25:0;judge.p4=judge.G?.72:0;judge.p5=judge.G?.41:0;judge.p6=judge.G?.18:0;judge.q=judge.G?[.03,.07,.18,.31,.23,.18]:[1/6,1/6,1/6,1/6,1/6,1/6];return structuredClone(judge)}
window.JUGEST_CORE_BRIDGE={
 getSummary(){return {storeCount:9,runCount:1,externalDayCount:253,linked:true,pending:0,enabledTargets:7,errorTargets:0,missingDays:0,unregistered:0,syncLabel:'14:55'}},
 getStores(){return [{name:'エスパス日拓新宿歌舞伎町店',latestDate:'2026-09-04',registered:true,error:false},{name:'マルハンメガシティ蒲田7',latestDate:'2026-09-04',registered:true,error:false}]},
 getActiveStore(){return active},
 setActiveStore(name){active=name;judge.context.shopName=name;for(const fn of listeners)fn();return true},
 subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
 prepareJudge(){return recalc()}, getJudgeState(){return recalc()},
 setJudgeG(v){judge.G=Math.max(0,+v||0);return recalc()},
 setJudgeMetric(id,v){const d=judge.defs.find(x=>x.id===id);if(d)d.value=Math.max(0,+v||0);return recalc()},
 setJudgeMetricEnabled(id,v){const d=judge.defs.find(x=>x.id===id);if(d)d.enabled=!!v;return recalc()},
 setJudgeMachine(v){judge.machine=v;judge.machineName=v==='my'?'マイジャグラーV':'アイムジャグラーEX';return recalc()},
 setJudgeContext(p){judge.context={...judge.context,...p};return recalc()},
 getStoreOverview(){return {storedDays:90,machineRows:38,totalG:231400,totalBB:810,totalRB:742,collector:{registered:true,enabled:true,errorCode:'',missingDays:0,latestDate:'2026-09-04'}}},
 getStoreDates(){return ['2026-09-04','2026-09-03']},
 getStoreDay(name,date){return {date,rows:Array.from({length:36},(_,i)=>({tableNo:String(401+i),machine:i%2?'my':'im',machineName:i%2?'マイジャグラーV':'アイムジャグラーEX',games:6000+i*17,bb:20+i%9,rb:18+i%7,diff:(i-12)*110,expectedSetting:i%3===0?4.2:NaN}))}},
 getStoreTrendRoster(){return {dayCount:30,rows:Array.from({length:38},(_,i)=>({tableNo:String(401+i),machine:i%2?'my':'im',machineName:i%2?'マイジャグラーV':'アイムジャグラーEX'}))}},
 async computeStoreTrend(){trendCalls++;await new Promise(r=>setTimeout(r,25));return {dayCount:30,rowCount:1140,rows:Array.from({length:35},(_,i)=>({tableNo:String(401+i),machineName:i%2?'マイジャグラーV':'アイムジャグラーEX',days:30,latest:'2026-09-04',avgES:5.1-i*.035,confidence:88-i%15}))}}
};
</script>'''
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;min-height:100%;background:#f9fbff}</style>'+bridge+'<jugest-app id="JUGEST_APP"></jugest-app><script>'+js+'</script>'

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded',timeout=15000);page.wait_for_timeout(250)
    assert not errors,errors
    host=page.locator('jugest-app')
    # Live judge is native and typing preserves focus while the result patches in place.
    host.evaluate("e=>e.shadowRoot.querySelector('[data-action=live-judge]').click()")
    page.wait_for_timeout(100)
    assert host.evaluate("e=>!!e.shadowRoot.querySelector('.judge-screen')")
    host.evaluate("e=>{const x=e.shadowRoot.querySelector('[data-judge-g]');x.focus();x.value='2400';x.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_timeout(80)
    assert host.evaluate("e=>e.shadowRoot.activeElement===e.shadowRoot.querySelector('[data-judge-g]')"), 'judge G input lost focus after input'
    assert host.evaluate("e=>e.shadowRoot.querySelector('[data-judge-es]').textContent")== '4.25'
    host.evaluate("e=>{const x=e.shadowRoot.querySelector('[data-judge-metric=bell]');x.focus();x.value='390';x.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_timeout(80)
    assert host.evaluate("e=>e.shadowRoot.activeElement===e.shadowRoot.querySelector('[data-judge-metric=bell]')"), 'judge metric input lost focus after input'
    assert page.evaluate("judge.defs.find(x=>x.id==='bell').value")==390
    # No horizontal overflow on dense judge UI.
    judge_dims=host.evaluate("e=>({sw:e.shadowRoot.querySelector('.app-shell').scrollWidth,cw:e.shadowRoot.querySelector('.app-shell').clientWidth})")
    assert judge_dims['sw']<=judge_dims['cw'],judge_dims
    page.screenshot(path='/mnt/data/jugest_v510_phase5_phase2_judge.png',full_page=True)

    # Store data native list.
    host.evaluate("e=>e.shadowRoot.querySelector('[data-workspace=store]').click()")
    page.wait_for_timeout(80)
    host.evaluate("e=>e.shadowRoot.querySelector('[data-action=store-data]').click()")
    page.wait_for_timeout(80)
    assert host.evaluate("e=>!!e.shadowRoot.querySelector('.store-data-screen')")
    assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.machine-row').length")==24
    store_dims=host.evaluate("e=>({sw:e.shadowRoot.querySelector('.app-shell').scrollWidth,cw:e.shadowRoot.querySelector('.app-shell').clientWidth})")
    assert store_dims['sw']<=store_dims['cw'],store_dims
    page.screenshot(path='/mnt/data/jugest_v510_phase5_phase2_store_data.png',full_page=True)

    # Trend must stay lazy until explicit compute.
    host.evaluate("e=>e.shadowRoot.querySelector('[data-action=store-trend]').click()")
    page.wait_for_timeout(80)
    assert page.evaluate('trendCalls')==0,'trend analysis ran during initial render'
    assert host.evaluate("e=>!!e.shadowRoot.querySelector('.roster-preview')")
    host.evaluate("e=>e.shadowRoot.querySelector('[data-trend-run]').click()")
    page.wait_for_timeout(180)
    assert page.evaluate('trendCalls')==1,'trend compute must run exactly once after explicit action'
    assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.trend-row').length")==24
    trend_dims=host.evaluate("e=>({sw:e.shadowRoot.querySelector('.app-shell').scrollWidth,cw:e.shadowRoot.querySelector('.app-shell').clientWidth})")
    assert trend_dims['sw']<=trend_dims['cw'],trend_dims
    page.screenshot(path='/mnt/data/jugest_v510_phase5_phase2_store_trend.png',full_page=True)
    assert not errors,errors
    browser.close()
print('v5.1.0 Phase 2 browser harness PASS')
