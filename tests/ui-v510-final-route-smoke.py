from pathlib import Path
from playwright.sync_api import sync_playwright
import base64

root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text()
css=(root/'public/app-v510.css').read_text()
js=js.replace("link.href='./app-v510.css'","link.href='data:text/css;base64,"+base64.b64encode(css.encode()).decode()+"'")
js=js.replace('./assets/jugest-mark.png','data:image/png;base64,'+base64.b64encode((root/'public/assets/jugest-mark.png').read_bytes()).decode())
bridge=r'''<script>
let listeners=new Set(),active='Alpha店';
const judge={machine:'my',machineName:'マイV',machines:[{key:'my',name:'マイV'}],G:0,defs:[],q:[0,0,0,0,0,0],expectedSetting:0,p4:0,p5:0,p6:0,warning:'',context:{date:'2026-09-06',shopName:'Alpha店',tableNo:'',badge:'',note:''}};
window.JUGEST_CORE_BRIDGE={
 getSummary(){return{storeCount:1,runCount:0,externalDayCount:10,linked:false,pending:0,enabledTargets:0,errorTargets:0,missingDays:0,unregistered:0,syncLabel:'未同期'}},
 getStores(){return[{name:'Alpha店',latestDate:'2026-09-05',registered:true,error:false}]},getActiveStore(){return active},setActiveStore(n){active=n;listeners.forEach(f=>f())},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 getJudgeState(){return judge},prepareJudge(){return judge},getReverseState(){return{...judge,G:0,denom:null,estimatedCount:null}},getReverseStyles(){return[]},getPickupState(){return null},
 getMoveState(){return{candidates:[],history:[],context:{},current:null,target:null}},getCompareState(){return{rows:[],ranking:[],machines:[{key:'my',name:'マイV'}]}},
 getStoreOverview(){return{storedDays:10,machineRows:0,totalG:0,collector:{registered:true,enabled:true}}},getStoreDates(){return['2026-09-05']},getStoreDay(){return{date:'2026-09-05',machines:[]}},getStoreTrendRoster(){return[]},
 getRecordsSummary(){return{n:0,totalG:0,actualN:0,actualDiff:0}},getRecentRecords(){return[]},getCalendarMonth(y,m){return{year:y,month:m,days:[],summary:{}}},getRecordsBreakdown(){return{summary:{},machines:[],shops:[],shopMachines:[]}},
 getStrategyAnalysis(){return{summary:{},filters:{shops:[],machines:[],tags:[]},entryRows:[],tagRows:[],shopTag:[],machineTag:[]}},getStoreFinance(){return{summary:{},rows:[]}},
 getDataStatus(){return{linked:false,pending:0,enabled:0,missing:0,targets:[]}},getCollectorStores(){return[]},getSyncStatus(){return{}},
 getHanaState(){return null},getStoreAnalysisHistory(){return Promise.resolve([])}
};</script>'''
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#f9fbff}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'
routes=[
 ('home',''),('live',''),('live','judge'),('live','rev'),('live','move'),('live','compare'),('live','hana'),('live','hana-pickup'),
 ('store',''),('store','data'),('store','trend'),('store','plan'),('store','analysis'),('store','replay'),('store','model'),
 ('records',''),('records','log'),('records','calendar'),('records','analysis'),('records','strategy'),('records','storesfinance'),
 ('data',''),('data','collector'),('data','stores'),('data','import'),('data','sync'),('data','backup')
]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for width in (320,390):
        page=browser.new_page(viewport={'width':width,'height':844})
        errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(html,wait_until='domcontentloaded');page.wait_for_timeout(80)
        host=page.locator('jugest-app')
        assert host.count()==1
        for ws,screen in routes:
            page.evaluate("([ws,screen])=>document.querySelector('jugest-app').navigate(ws,screen||null)",[ws,screen])
            page.wait_for_timeout(20)
            dims=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return[x.scrollWidth,x.clientWidth,!!e.shadowRoot.querySelector('.workspace')]}" )
            assert dims[2],(width,ws,screen,'workspace missing')
            assert dims[0]<=dims[1],(width,ws,screen,dims)
        serious=[e for e in errors if 'Failed to load resource' not in e]
        assert not serious,(width,serious)
        page.close()
    browser.close()
print('v5.1.0 FINAL all-route 320/390 smoke PASS')
