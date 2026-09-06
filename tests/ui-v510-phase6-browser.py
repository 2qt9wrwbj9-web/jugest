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

bridge="""<script>
let active='エスパス日拓新宿歌舞伎町店',listeners=new Set(),saveStoreCalls=0,previewCalls=0,saveJsonCalls=0;
const stores=[
{name:'エスパス日拓新宿歌舞伎町店',latestDate:'2026-09-04',registered:true,error:false},
{name:'PIA雑色',latestDate:'2026-09-03',registered:false,error:false}
];
window.JUGEST_CORE_BRIDGE={
 getSummary(){return{storeCount:2,runCount:12,externalDayCount:180,linked:true,pending:0,enabledTargets:1,errorTargets:0,missingDays:0,unregistered:1,syncLabel:'21:10'}},
 getStores(){return stores},getActiveStore(){return active},setActiveStore(n){active=n;listeners.forEach(f=>f())},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 getStrategyAnalysis(filters){return{summary:{n:12,totalG:43800,actualN:12,actualDiff:2100,expectedSetting:4.02},filters:{shops:[{id:'1',name:'エスパス日拓新宿歌舞伎町店'}],machines:[{key:'my',name:'マイV'}],tags:[{id:'a',name:'末尾狙い',active:true}]},entryRows:[{label:'朝イチ',n:8,totalG:31000,winRate:62.5,actualN:8,actualDiff:1800,expectedSetting:4.2}],tagRows:[{label:'末尾狙い',n:5,totalG:19200,winRate:60,actualN:5,actualDiff:1200,expectedSetting:4.5}],shopTag:[{label:'エスパス日拓新宿歌舞伎町店 × 末尾狙い',n:5,totalG:19200,winRate:60,actualN:5,actualDiff:1200,expectedSetting:4.5}],machineTag:[{label:'マイV × 末尾狙い',n:4,totalG:16400,winRate:75,actualN:4,actualDiff:1500,expectedSetting:4.7}]}},
 getCollectorStores(){return[
  {name:'エスパス日拓新宿歌舞伎町店',registered:true,enabled:true,latestDate:'2026-09-04',missing:0,error:'',url:'https://ana-slo.com/2026-09-04-espace-data/',startDate:'2026-06-01',priority:2},
  {name:'PIA雑色',registered:false,enabled:false,latestDate:'2026-09-03',missing:0,error:'',url:'',startDate:'2026-09-03',priority:2}
 ]},
 async saveCollectorStore(name,payload){saveStoreCalls++;return{name,...payload,registered:true}},
 async previewExternalJson(raw){previewCalls++;return{preview:{bulk:true,days:[{date:'2026-09-01'}]},summary:{bulk:true,shop:'エスパス日拓新宿歌舞伎町店',days:3,machines:144,from:'2026-09-01',to:'2026-09-03',duplicates:1,failed:0}}},
 async saveExternalJsonPreview(preview){saveJsonCalls++;return{saved:true,days:183}}
};</script>"""

html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#f9fbff}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':390,'height':844})
    errs=[]
    page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded')
    page.wait_for_timeout(120)
    host=page.locator('jugest-app')
    def click(sel):
        host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()")
        page.wait_for_timeout(80)
    def text(sel):
        return host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}')?.innerText||''")
    def no_overflow():
        d=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return [x.scrollWidth,x.clientWidth]}")
        assert d[0]<=d[1],d

    click('[data-workspace=records]')
    click('[data-action=records-strategy]')
    assert '立ち回り分析' in text('.strategy-screen')
    assert '末尾狙い' in text('.strategy-screen')
    no_overflow()
    page.screenshot(path='/mnt/data/jugest_v510_phase7_strategy.png',full_page=True)

    click('[data-workspace=data]')
    click('[data-action=data-stores]')
    assert 'PIA雑色' in text('.collector-list')
    host.evaluate("e=>[...e.shadowRoot.querySelectorAll('[data-store-edit]')].find(x=>x.dataset.storeEdit==='PIA雑色').click()")
    page.wait_for_timeout(50)
    assert 'URLを登録' in text('.store-editor')
    page.screenshot(path='/mnt/data/jugest_v510_phase7_store_editor.png',full_page=True)
    host.evaluate("e=>{let x=e.shadowRoot.querySelector('[data-store-url]');x.value='https://ana-slo.com/2026-09-05-pia-data/';x.dispatchEvent(new Event('input',{bubbles:true}));}")
    click('[data-store-save]')
    assert page.evaluate('saveStoreCalls')==1
    no_overflow()

    click('[data-workspace=data]')
    click('[data-action=data-import]')
    host.evaluate("e=>{let x=e.shadowRoot.querySelector('[data-json-raw]');x.value='{\"format\":\"juggler-external-import-bulk\"}';x.dispatchEvent(new Event('input',{bubbles:true}));}")
    click('[data-json-preview]')
    assert page.evaluate('previewCalls')==1
    assert '144台' in text('.import-preview')
    assert '重複 1' in text('.import-preview')
    page.screenshot(path='/mnt/data/jugest_v510_phase7_json_preview.png',full_page=True)
    click('[data-json-save]')
    assert page.evaluate('saveJsonCalls')==1
    assert host.evaluate("e=>e.shadowRoot.querySelector('[data-json-raw]').value")=='' 
    no_overflow()

    assert not errs,errs
    b.close()
print('v5.1.0 Phase 6 browser harness PASS')
