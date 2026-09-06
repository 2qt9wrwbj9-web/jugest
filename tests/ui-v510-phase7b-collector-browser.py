from pathlib import Path
from playwright.sync_api import sync_playwright
import base64

root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text()
css=(root/'public/app-v510.css').read_text()
css_data='data:text/css;base64,'+base64.b64encode(css.encode()).decode()
js=js.replace("link.href='./app-v510.css'", "link.href='"+css_data+"'")
img='data:image/png;base64,'+base64.b64encode((root/'public/assets/jugest-mark.png').read_bytes()).decode()
js=js.replace('./assets/jugest-mark.png',img)

bridge="""<script>
let listeners=new Set(),active='Alpha店',refreshCalls=0,receiveCalls=0,requeueCalls=0,deleteCalls=0,toggleCalls=0;
let rows=[
{name:'Alpha店',registered:true,enabled:true,latestDate:'2026-09-05',missing:0,error:'',url:'https://ana-slo.com/a',startDate:'2026-06-01',priority:2},
{name:'Beta店',registered:true,enabled:false,latestDate:'2026-09-03',missing:4,error:'page_identity',url:'https://ana-slo.com/b',startDate:'2026-06-01',priority:2},
{name:'Gamma店',registered:false,enabled:false,latestDate:'2026-09-01',missing:0,error:'',url:'',startDate:'2026-09-01',priority:2}
];
function status(){return{enabled:rows.filter(x=>x.enabled).length,pending:2,missing:rows.reduce((a,x)=>a+(x.enabled?x.missing:0),0),targets:rows}}
window.JUGEST_CORE_BRIDGE={
 getSummary(){return{storeCount:3,runCount:0,externalDayCount:30,linked:true,pending:2,enabledTargets:1,errorTargets:1,missingDays:0,unregistered:1,syncLabel:'22:10'}},
 getStores(){return rows.map(x=>({name:x.name,latestDate:x.latestDate,registered:x.registered,error:!!x.error}))},
 getActiveStore(){return active},setActiveStore(n){active=n;listeners.forEach(f=>f())},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 getDataStatus(){return status()},getCollectorStores(){return rows},
 async setCollectorEnabled(name,enabled){toggleCalls++;rows=rows.map(x=>x.name===name?{...x,enabled}:x);listeners.forEach(f=>f());return status()},
 async refreshCollector(){refreshCalls++;return status()},
 async receiveCollector(){receiveCalls++;return{days:2,machines:90,shops:['Alpha店']}},
 async requeueCollectorStore(name){requeueCalls++;return status()},
 async deleteCollectorStore(name){deleteCalls++;rows=rows.map(x=>x.name===name?{...x,registered:false,enabled:false,url:''}:x);listeners.forEach(f=>f());return status()},
 async saveCollectorStore(){return{}}
};</script>"""
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#f9fbff}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=b.new_page(viewport={'width':390,'height':844})
    page.on('dialog',lambda d:d.accept())
    errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded');page.wait_for_timeout(120)
    host=page.locator('jugest-app')
    def click(sel):
        host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(100)
    def text(sel):
        return host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}')?.innerText||''")
    def no_overflow():
        d=host.evaluate("e=>{let x=e.shadowRoot.querySelector('.app-shell');return [x.scrollWidth,x.clientWidth]}")
        assert d[0]<=d[1],d

    click('[data-workspace=data]')
    click('[data-action=data-collector]')
    assert '新着' in text('.data-kpis')
    click('[data-collector-refresh]');assert page.evaluate('refreshCalls')==1
    click('[data-collector-receive]');assert page.evaluate('receiveCalls')==1
    no_overflow()

    click('[data-workspace=data]');click('[data-action=data-stores]')
    search=host.evaluate_handle("e=>e.shadowRoot.querySelector('[data-store-manage-search]')")
    host.evaluate("e=>{let x=e.shadowRoot.querySelector('[data-store-manage-search]');x.value='Gamma';x.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_timeout(80)
    assert 'Gamma店' in text('.collector-list') and 'Alpha店' not in text('.collector-list')
    host.evaluate("e=>{let x=e.shadowRoot.querySelector('[data-store-manage-search]');x.value='';x.dispatchEvent(new Event('input',{bubbles:true}))}")
    host.evaluate("e=>{let x=e.shadowRoot.querySelector('[data-store-filter]');x.value='error';x.dispatchEvent(new Event('change',{bubbles:true}))}")
    page.wait_for_timeout(80)
    assert 'Beta店' in text('.collector-list') and 'Alpha店' not in text('.collector-list')
    host.evaluate("e=>{let x=e.shadowRoot.querySelector('[data-store-filter]');x.value='all';x.dispatchEvent(new Event('change',{bubbles:true}))}")
    page.wait_for_timeout(80)
    host.evaluate("e=>e.shadowRoot.querySelector('[data-store-requeue=\"Alpha店\"]').click()");page.wait_for_timeout(100)
    assert page.evaluate('requeueCalls')==1
    host.evaluate("e=>e.shadowRoot.querySelector('[data-store-delete=\"Beta店\"]').click()");page.wait_for_timeout(100)
    assert page.evaluate('deleteCalls')==1
    no_overflow()
    assert not errs,errs
    b.close()
print('v5.1.0 Phase 7B collector browser PASS')
