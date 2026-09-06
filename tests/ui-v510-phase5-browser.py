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
let active='エスパス日拓新宿歌舞伎町店',listeners=new Set(),planCalls=0,analysisCalls=0,replayCalls=0,modelCalls=0;
const stores=[
{name:'エスパス日拓新宿歌舞伎町店',latestDate:'2026-09-04',registered:true,error:false},
{name:'マルハン蒲田7',latestDate:'2026-09-03',registered:true,error:false}
];
window.JUGEST_CORE_BRIDGE={
 getSummary(){return{storeCount:2,runCount:10,externalDayCount:180,linked:true,pending:0,enabledTargets:2,errorTargets:0,missingDays:0,unregistered:0,syncLabel:'20:10'}},
 getStores(){return stores},getActiveStore(){return active},
 setActiveStore(n){active=n;listeners.forEach(f=>f())},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 getStoreDates(){return['2026-09-04','2026-09-03','2026-09-02']},
 getStoreOverview(){return{storedDays:180,machineRows:48,totalG:310000,collector:{registered:true,enabled:true,latestDate:'2026-09-04'}}},
 getTodayPlan(name,date,opts){planCalls++;return{shop:name,date,available:true,score:73.4,go:true,tier:'validated',quality:88,championLabel:'Champion A',regime:'強め',candidates:[
  {tableNo:'412',machineName:'マイジャグラーV',aimScore:84,predP4:.62,predES:4.7,rootFamilyCount:3,rootMatchedCount:6,rootConfidence:.71,evidence:[{label:'末尾2',confidence:68}]},
  {tableNo:'518',machineName:'アイムジャグラーEX',aimScore:78,predP4:.55,predES:4.3,rootFamilyCount:2,rootMatchedCount:4,rootConfidence:.63,evidence:[]}
 ]}},
 async runStoreAnalysis(name,opts){analysisCalls++;return{shop:name,from:'2026-03-01',latest:'2026-09-04',days:180,rowCount:8640,meanES:3.18,usableCount:17,conditionCount:260,evidenceConfidence:.64,complexTested:4300,fdrSignificant:12,confirmSignificant:4,rawS:2,rawA:5,maxDims:+opts.maxDims,machines:[{machineName:'マイジャグラーV',n:1440,meanES:3.5},{machineName:'アイムジャグラーEX',n:1800,meanES:3.1}],positive:[{label:'土曜 × 末尾2',practicalEffect:.18,confidence:72,days:18,rows:86},{label:'前日凹み7日',practicalEffect:.11,confidence:61,days:32,rows:140}],negative:[{label:'月曜',practicalEffect:-.08,confidence:58,days:25,rows:120}],patterns:[{label:'土曜 × 角',grade:'A',confidence:68,forecastEffect:.14}],machinePatterns:[{label:'マイV × 末尾2',grade:'B',confidence:57,forecastEffect:.09}]}},
 runReplay(name,date){replayCalls++;return{shop:name,date,available:true,trainingDays:92,trainingFrom:'2026-06-01',trainingTo:'2026-09-03',championLabel:'Champion A',topActualP4:.58,storeActualP4:.29,candidates:[{rank:1,tableNo:'412',machineName:'マイジャグラーV',predP4:.61,predES:4.6,actual:{p4:.72,expectedSetting:5.1}},{rank:2,tableNo:'518',machineName:'アイムジャグラーEX',predP4:.53,predES:4.2,actual:{p4:.44,expectedSetting:3.8}}]}},
 getModelPerformance(name){modelCalls++;return{shop:name,trust:67,scoredDays:42,recent30:71,coverage:.82,metrics:{top1:{days:42,meanES:4.4,meanP4:.59,p4Ratio:1.54},top5:{days:42,meanES:4.1,meanP4:.52,p4Ratio:1.37},top10:{days:42,meanES:3.8,meanP4:.46,p4Ratio:1.22}},days:[{date:'2026-09-04',dayScore:76,candidates:10},{date:'2026-09-03',dayScore:64,candidates:8}]}}
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

    click('[data-workspace=store]')
    click('[data-action=store-plan]')
    assert page.evaluate('planCalls')==0
    assert 'まだ計算していない' in text('.intelligence-screen')
    click('[data-plan-run]')
    assert page.evaluate('planCalls')==1
    assert '412番' in text('.intel-list')
    no_overflow()
    # Switching store on the plan screen must clear the previous store's computed result immediately.
    click('[data-open-store-selector]')
    host.evaluate("""e=>{let b=[...e.shadowRoot.querySelectorAll('[data-store-name]')].find(x=>x.dataset.storeName==='マルハン蒲田7');b.click()}""")
    page.wait_for_timeout(100)
    assert 'マルハン蒲田7' in text('.store-title')
    assert 'まだ計算していない' in text('.intelligence-screen')

    click('[data-workspace=store]')
    click('[data-action=store-analysis]')
    assert page.evaluate('analysisCalls')==0
    click('[data-analysis-run]')
    page.wait_for_timeout(100)
    assert page.evaluate('analysisCalls')==1
    assert '土曜 × 末尾2' in text('.evidence-list')
    no_overflow()

    click('[data-workspace=store]')
    click('[data-action=store-replay]')
    assert page.evaluate('replayCalls')==0
    click('[data-replay-run]')
    assert page.evaluate('replayCalls')==1
    assert 'Top実測P4+' in text('.analysis-kpis')
    assert '412番' in text('.replay-list')
    no_overflow()

    click('[data-workspace=store]')
    click('[data-action=store-model]')
    assert page.evaluate('modelCalls')==0
    click('[data-model-run]')
    assert page.evaluate('modelCalls')==1
    assert 'モデル信頼度' in text('.analysis-kpis')
    assert 'Top5' in text('.model-metrics')
    no_overflow()

    click('[data-workspace=store]')
    click('[data-open-store-selector]')
    host.evaluate("""e=>{let b=[...e.shadowRoot.querySelectorAll('[data-store-name]')].find(x=>x.dataset.storeName==='エスパス日拓新宿歌舞伎町店');b.click()}""")
    page.wait_for_timeout(100)
    assert 'エスパス日拓新宿歌舞伎町店' in text('.store-title')
    click('[data-action=store-plan]')
    assert 'まだ計算していない' in text('.intelligence-screen')
    assert not errs,errs
    b.close()
print('v5.1.0 Phase 5 browser harness PASS')
