from pathlib import Path
from playwright.sync_api import sync_playwright
import base64
root=Path(__file__).resolve().parents[1]
js=(root/'public/app-v510.js').read_text();css=(root/'public/app-v510.css').read_text()
css_data='data:text/css;base64,'+base64.b64encode(css.encode()).decode();js=js.replace("link.href='./app-v510.css'", "link.href='"+css_data+"'")
img_data='data:image/png;base64,'+base64.b64encode((root/'public/assets/jugest-mark.png').read_bytes()).decode();js=js.replace('./assets/jugest-mark.png',img_data)
bridge="""<script>
let active='エスパス日拓新宿歌舞伎町店',listeners=new Set(),toggleCalls=0,backupCalls=0,restoreCalls=0;
const records=Array.from({length:26},(_,i)=>({id:i,date:'2026-09-'+String(5-(i%5)).padStart(2,'0'),entryLabel:i%2?'後ヅモ':'朝イチ',machineName:i%2?'マイジャグラーV':'アイムジャグラーEX',shopName:i%3?'エスパス日拓新宿歌舞伎町店':'マルハン蒲田7',tableNo:String(400+i),playedG:1500+i*80,expectedSetting:3.7+i%3*.4,hasActual:true,actualDiff:(i-10)*120}));
window.JUGEST_CORE_BRIDGE={
 getSummary(){return{storeCount:9,runCount:26,externalDayCount:253,linked:true,pending:2,enabledTargets:2,errorTargets:0,missingDays:1,unregistered:1,syncLabel:'18:40'}},getStores(){return[{name:active,latestDate:'2026-09-04',registered:true,error:false}]},getActiveStore(){return active},setActiveStore(n){active=n;listeners.forEach(f=>f())},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},
 getRecordsSummary(){return{n:26,totalG:68420,actualN:26,actualDiff:3280,expectedDiff:2410,expectedDiffActual:2410,winRate:57.7,actualRate:101.6,expectedRate:101.17,expectedSetting:4.18}},getRecentRecords(limit){return records.slice(0,limit)},
 getCalendarMonth(y,m){let first=new Date(y,m-1,1),start=new Date(y,m-1,1-first.getDay());return{summary:{n:12,actualN:12,actualDiff:1880,expectedDiff:1320},days:Array.from({length:42},(_,i)=>{let d=new Date(start);d.setDate(start.getDate()+i);return{day:d.getDate(),inMonth:d.getMonth()===m-1,count:i%4===0?1:0,hasActual:i%4===0,actualDiff:i%8===0?540:-220}})}},
 getDataStatus(){return{enabled:2,pending:2,missing:1,targets:[{name:'エスパス日拓新宿歌舞伎町店',registered:true,enabled:true,latestDate:'2026-09-04',missing:0,error:''},{name:'マルハン蒲田7',registered:true,enabled:false,latestDate:'2026-09-03',missing:1,error:''},{name:'PIA雑色',registered:false,enabled:false,latestDate:'',missing:0,error:''}]}},async setCollectorEnabled(){toggleCalls++;},async saveBackup(){backupCalls++;},async restoreBackup(){restoreCalls++;}
};</script>"""
html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#f9fbff}</style>'+bridge+'<jugest-app></jugest-app><script>'+js+'</script>'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.set_content(html,wait_until='domcontentloaded');page.wait_for_timeout(100);host=page.locator('jugest-app')
 def click(sel): host.evaluate(f"e=>e.shadowRoot.querySelector('{sel}').click()");page.wait_for_timeout(80)
 click('[data-workspace=records]');click('[data-action=records-log]');assert host.evaluate("e=>e.shadowRoot.querySelectorAll('[data-record-row]').length")==20
 dims=host.evaluate("e=>({s:e.shadowRoot.querySelector('.app-shell').scrollWidth,c:e.shadowRoot.querySelector('.app-shell').clientWidth})");assert dims['s']<=dims['c'],dims
 click('[data-workspace=records]');click('[data-action=records-calendar]');assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.calendar-cell').length")==42
 click('[data-workspace=records]');click('[data-action=records-analysis]');assert '4.18' in host.evaluate("e=>e.shadowRoot.querySelector('.analysis-grid').innerText")
 click('[data-workspace=data]');click('[data-action=data-collector]');assert host.evaluate("e=>e.shadowRoot.querySelectorAll('.collector-row').length")==3
 host.evaluate("e=>{let x=e.shadowRoot.querySelector('[data-collector-enabled]');x.checked=false;x.dispatchEvent(new Event('change',{bubbles:true}))}");page.wait_for_timeout(100);assert page.evaluate('toggleCalls')==1
 click('[data-workspace=data]');click('[data-action=data-backup]');click('[data-backup-save]');page.wait_for_timeout(80);assert page.evaluate('backupCalls')==1
 assert not errs,errs;b.close()
print('v5.1.0 Phase 3 browser harness PASS')
