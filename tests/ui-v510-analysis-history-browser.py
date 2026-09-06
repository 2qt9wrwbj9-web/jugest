from pathlib import Path
from playwright.sync_api import sync_playwright
import base64

root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text()
css=(root/'public/app-v510.css').read_text()
js=js.replace("link.href='./app-v510.css'","link.href='data:text/css;base64,"+base64.b64encode(css.encode()).decode()+"'")
js=js.replace('./assets/jugest-mark.png','data:image/png;base64,'+base64.b64encode((root/'public/assets/jugest-mark.png').read_bytes()).decode())

bridge="""<script>
let listeners=new Set(),heavy=0,historyLoads=0,snapshotLoads=0,deletes=0;
window.JUGEST_CORE_BRIDGE={
 getSummary(){return{storeCount:1,runCount:0,externalDayCount:50,linked:false,pending:0,enabledTargets:0,errorTargets:0,missingDays:0,unregistered:0,syncLabel:'未同期'}},
 getStores(){return[{name:'Alpha店',latestDate:'2026-09-05',registered:true,error:false}]},
 getActiveStore(){return'Alpha店'},setActiveStore(){},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 getStoreOverview(){return{storedDays:50,machineRows:40,totalG:200000,collector:{registered:true,enabled:true}}},
 getStoreDates(){return['2026-09-05']},
 async getStoreAnalysisHistory(){historyLoads++;return[{id:'h1',shop:'Alpha店',createdAt:Date.now(),source:{from:'2026-07-01',latest:'2026-09-05',days:50,rowCount:1800},summary:{meanES:3.2,usableCount:8},hasForecast:true}]},
 async getStoreAnalysisSnapshot(){snapshotLoads++;return{id:'h1',shop:'Alpha店',createdAt:Date.now(),source:{days:50,rowCount:1800},summary:{meanES:3.2,usableCount:8},machines:[{machine:'my',machineName:'マイV',n:300,meanES:3.4}],positive:[{label:'末尾5',days:12,rows:40,confidence:82,practicalEffect:.24}],negative:[],patterns:[],machinePatterns:[],forecast:{rows:[{tableNo:'105',machine:'my',predES:4.1,predP4:.64}]}}},
 async deleteStoreAnalysisSnapshot(){deletes++;return true},
 async runStoreAnalysis(){heavy++;return{days:50,rowCount:1800,meanES:3.2,usableCount:8,positive:[],negative:[],machines:[],patterns:[],machinePatterns:[]}}
};</script>"""
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=b.new_page(viewport={'width':390,'height':844})
    page.on('dialog',lambda d:d.accept())
    errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html);page.wait_for_timeout(100)
    host=page.locator('jugest-app')
    def click(sel):
        host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(90)
    click('[data-workspace=store]')
    click('[data-action=store-analysis]')
    page.wait_for_timeout(100)
    assert page.evaluate('heavy')==0, 'opening history must not run analysis'
    assert page.evaluate('historyLoads')==1
    assert host.evaluate("e=>e.shadowRoot.querySelectorAll('[data-analysis-history-open]').length")==1
    click('[data-analysis-history-open]')
    assert page.evaluate('snapshotLoads')==1
    assert '末尾5' in host.evaluate("e=>e.shadowRoot.querySelector('.analysis-history-detail').innerText")
    click('[data-analysis-history-close]')
    click('[data-analysis-history-delete]')
    assert page.evaluate('deletes')==1
    assert page.evaluate('heavy')==0
    d=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return[x.scrollWidth,x.clientWidth]}")
    assert d[0]<=d[1],d
    assert not errs,errs
    b.close()
print('v5.1.0 native analysis history browser PASS')
