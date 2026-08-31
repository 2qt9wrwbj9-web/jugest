from pathlib import Path
import json, re, shutil, subprocess, sys

ROOT = Path('.')
LAUNCH = ROOT/'ana-launcher.js'


def replace_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, got {n}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    out, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, got {n}')
    return out

s = LAUNCH.read_text()
s = replace_once(s, "const VERSION='4.5.0';", "const VERSION='4.8.4';", 'launcher version')
s = replace_once(s, "const DB_VERSION=1;", "const DB_VERSION=2;", 'db version')
s = replace_once(s, "const ACCESS_WINDOW_MS=30*60*1000;", "const ACCESS_WINDOW_MS=15*60*1000;", 'access window')
s = replace_once(s, "const RELAY_CHUNK_BYTES=2500000;", "const RELAY_CHUNK_BYTES=2500000;\nconst SHOP_REGISTRY_KEY='jugglerAnaShopRegistry:v1';\nconst NIGHT_WAIT_MIN_MS=25000;\nconst NIGHT_WAIT_MAX_MS=35000;", 'new constants')
s = s.replace('直近30分', '直近15分')

registry_code = r'''
const REGION_PREFECTURES={
  '北海道・東北':['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県'],
  '関東':['茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県'],
  '甲信越・北陸':['新潟県','富山県','石川県','福井県','山梨県','長野県'],
  '東海':['岐阜県','静岡県','愛知県','三重県'],
  '近畿':['滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県'],
  '中国':['鳥取県','島根県','岡山県','広島県','山口県'],
  '四国':['徳島県','香川県','愛媛県','高知県'],
  '九州・沖縄':['福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']
};
function loadShopRegistry(){
  try{const a=JSON.parse(localStorage.getItem(SHOP_REGISTRY_KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&x.slug):[]}catch{return[]}
}
function saveShopRegistry(a){
  const clean=(Array.isArray(a)?a:[]).filter(x=>x&&x.slug).map(x=>({...x,slug:String(x.slug),shopName:String(x.shopName||x.slug)}));
  try{localStorage.setItem(SHOP_REGISTRY_KEY,JSON.stringify(clean))}catch{}
  shopRegistry=clean;return clean;
}
function upsertRegisteredShop(meta={}){
  if(!meta.slug)return null;const now=Date.now(),i=shopRegistry.findIndex(x=>x.slug===meta.slug),old=i>=0?shopRegistry[i]:{};
  const row={registeredAt:old.registeredAt||now,initialBuildDone:old.initialBuildDone===true,...old,...meta,slug:String(meta.slug),shopName:String(meta.shopName||old.shopName||meta.slug),updatedAt:now};
  if(i>=0)shopRegistry[i]=row;else shopRegistry.push(row);saveShopRegistry(shopRegistry);return row;
}
function registeredShop(targetSlug){return shopRegistry.find(x=>x.slug===targetSlug)||null}
function displayNameFromSlug(v=''){try{return decodeURIComponent(String(v)).replace(/-/g,' ')}catch{return String(v).replace(/-/g,' ')}}
let shopRegistry=loadShopRegistry();
'''
s = replace_once(s, "let relayLink=loadRelayLink();\n", "let relayLink=loadRelayLink();\n"+registry_code+"\n", 'registry insertion')

idb_code = r'''function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('days')){const s=db.createObjectStore('days',{keyPath:'id'});s.createIndex('slug','slug',{unique:false});s.createIndex('slugDate',['slug','date'],{unique:true});}if(!db.objectStoreNames.contains('sync'))db.createObjectStore('sync',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDBを開けなかった'));});}
let db=null;try{db=await openDb()}catch(e){console.warn('[JugglerAna] IndexedDB unavailable',e)}
function idbTx(mode,fn){return new Promise((resolve,reject)=>{if(!db){reject(new Error('IndexedDBが使えない'));return}const tx=db.transaction('days',mode),s=tx.objectStore('days');let result;try{result=fn(s,tx)}catch(e){reject(e);return}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB aborted'));});}
async function putDayForShop(targetSlug,targetShopName,day,meta={}){const rec={id:`${targetSlug}|${day.date}`,slug:targetSlug,date:day.date,shop:targetShopName,parserVersion:PARSER_VERSION,sourceUrl:day.sourceUrl,machines:day.machines,quality:day.quality||null,fetchMs:meta.fetchMs||0,savedAt:Date.now()};await idbTx('readwrite',s=>s.put(rec));return rec;}
async function putDay(day,meta={}){return putDayForShop(slug,shopName,day,meta)}
async function listDaysForSlug(targetSlug){if(!db)return[];return new Promise((resolve,reject)=>{const tx=db.transaction('days','readonly'),idx=tx.objectStore('days').index('slug'),r=idx.getAll(targetSlug);r.onsuccess=()=>resolve((r.result||[]).filter(x=>+x.parserVersion===PARSER_VERSION));r.onerror=()=>reject(r.error);});}
async function listDays(){return listDaysForSlug(slug)}
async function listAllDays(){if(!db)return[];return new Promise((resolve,reject)=>{const tx=db.transaction('days','readonly'),r=tx.objectStore('days').getAll();r.onsuccess=()=>resolve((r.result||[]).filter(x=>+x.parserVersion===PARSER_VERSION));r.onerror=()=>reject(r.error);});}
async function getDaysByDatesForSlug(targetSlug,dates){const wanted=new Set(dates);return (await listDaysForSlug(targetSlug)).filter(x=>wanted.has(x.date));}
async function getDaysByDates(dates){return getDaysByDatesForSlug(slug,dates)}
async function listSyncRecords(){if(!db||!db.objectStoreNames.contains('sync'))return[];return new Promise((resolve,reject)=>{const tx=db.transaction('sync','readonly'),r=tx.objectStore('sync').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
async function markDaysSent(days,batchId=''){if(!db||!days?.length||!db.objectStoreNames.contains('sync'))return;return new Promise((resolve,reject)=>{const tx=db.transaction('sync','readwrite'),st=tx.objectStore('sync'),sentAt=Date.now();for(const d of days)st.put({id:d.id||`${d.slug}|${d.date}`,slug:d.slug,date:d.date,savedAt:+d.savedAt||0,sentAt,batchId});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('送信状態を保存できなかった'));tx.onabort=()=>reject(tx.error||new Error('送信状態の保存が中断された'));});}
async function listUnsentDaysAll(){const [days,sync]=await Promise.all([listAllDays(),listSyncRecords()]),m=new Map(sync.map(x=>[x.id,x]));return days.filter(d=>{const x=m.get(d.id);return !x||(+x.savedAt||0)!==(+d.savedAt||0)});}
'''
s = sub_once(s, r"function openDb\(\)\{.*?async function getDaysByDates\(dates\)\{.*?\}\n", idb_code+"\n", 'idb block', re.S)

old_night_card = '''<div class="jac-card jac-night"><div class="jac-night-title"><b>🌙 夜間・超ゆっくり大量取得</b><span class="jac-mini">直近13か月</span></div><div class="jac-night-status" id="jacNightStatus">不足日を確認中…</div><div class="jac-row" style="margin-top:8px"><button class="jac-btn primary" id="jacNightStart">夜間取得を開始</button><button class="jac-btn" id="jacNightRetry">残りを再計算</button></div><div class="jac-mini" style="margin-top:7px">通常は1日ごと35〜55秒。15日ごと2〜4分、60日ごと8〜12分休憩。一般エラーは15〜20分→30〜40分待って再試行。403/429は45〜60分待って1回だけ再試行し、再発時は安全のため夜間取得を終了する。</div></div>'''
new_night_card = '''<div class="jac-card jac-night"><div class="jac-night-title"><b>🌙 夜間自動メンテナンス</b><span class="jac-mini">直近13か月＋全店舗</span></div><div class="jac-night-status" id="jacNightStatus">不足日を確認中…</div><div class="jac-row" style="margin-top:8px"><button class="jac-btn primary" id="jacNightStart">夜間自動メンテナンス開始</button><button class="jac-btn" id="jacNightRetry">残りを再計算</button></div><div class="jac-mini" style="margin-top:7px">夜間本体は1件完了ごと25〜35秒を均等ランダム待機し、15分30回のローカル制限は使わない。完了後は①失敗日再回収 → ②登録済み他店舗の最新差分 → ③新規登録店舗の13か月初回構築 → ④全店舗の未送信一括送信まで自動で進む。403/429は強いバックオフを維持。</div></div>
<div class="jac-card gold"><div class="jac-row" style="justify-content:space-between"><b>全店舗メンテナンス</b><span class="jac-mini" id="jacRegistryCount">登録0店</span></div><div class="jac-note" id="jacRegistryStatus" style="margin-top:7px">登録店舗を確認中…</div><div class="jac-row" style="margin-top:8px"><button class="jac-btn primary" id="jacAllLatest">登録済み店舗の最新差分を取得</button><button class="jac-btn gold" id="jacAllUnsent">未送信を全店舗送信</button><button class="jac-btn" id="jacAddShop">新規店舗を登録</button></div><div class="jac-mini" style="margin-top:7px">最新差分取得は通常の30回/15分制限内。新規登録は「地域 → 都道府県 → 店舗」でアナスロの一覧を読み込み、初回13か月構築待ちとして追加する。</div></div>'''
s = replace_once(s, old_night_card, new_night_card, 'night and maintenance cards')
s = s.replace('安全装置：直近30分のアナスロアクセスは最大30回。', '安全装置：直近15分のアナスロアクセスは最大30回。')

# add shop registration modal after export modal
anchor = "const exportMask=document.createElement('div');exportMask.id='jacExportMask';exportMask.className='jac-export-mask';exportMask.innerHTML=`<div class=\"jac-export-box\""
pos = s.find(anchor)
if pos < 0:
    raise RuntimeError('export modal anchor missing')
end_marker = ";document.body.appendChild(exportMask);"
end = s.find(end_marker, pos)
if end < 0:
    raise RuntimeError('export modal end missing')
end += len(end_marker)
shop_modal = r'''
const shopMask=document.createElement('div');shopMask.id='jacShopMask';shopMask.className='jac-export-mask';shopMask.innerHTML=`<div class="jac-export-box"><div class="jac-export-title">新規店舗を登録</div><div class="jac-export-meta">アナスロの店舗一覧をその場で読み込む。候補が取れない場合は店舗の日別URLを直接貼って登録できる。</div><div class="jac-kv"><span>地域</span><select class="jac-select" id="jacCatalogRegion"></select><span>都道府県</span><select class="jac-select" id="jacCatalogPref"></select><span>店舗</span><select class="jac-select" id="jacCatalogShop"><option value="">一覧を読み込んでね</option></select></div><div class="jac-row" style="margin-top:8px"><button class="jac-btn gold" id="jacCatalogLoad">店舗一覧を読み込む</button><button class="jac-btn primary" id="jacCatalogRegister">選択店舗を登録</button></div><div class="jac-sep"></div><div class="jac-mini">直接登録（例：現在見ている店舗の日別データURL）</div><input id="jacCatalogUrl" style="width:100%;margin-top:5px;background:#080808;color:#fff;border:1px solid #554936;border-radius:8px;padding:9px" inputmode="url" placeholder="https://ana-slo.com/2026-08-30-xxxxx-data/"><div class="jac-row" style="margin-top:7px"><button class="jac-btn" id="jacCatalogUrlRegister">URLから登録</button><button class="jac-btn" id="jacCatalogClose">閉じる</button></div><div class="jac-export-status" id="jacCatalogStatus"></div></div>`;document.body.appendChild(shopMask);
function fillCatalogRegions(){const r=$('jacCatalogRegion'),p=$('jacCatalogPref');r.innerHTML=Object.keys(REGION_PREFECTURES).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');const fill=()=>{const a=REGION_PREFECTURES[r.value]||[];p.innerHTML=a.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');$('jacCatalogShop').innerHTML='<option value="">一覧を読み込んでね</option>'};r.onchange=fill;fill()}
function parseCatalogShops(html,prefecture=''){const out=new Map();try{const d=new DOMParser().parseFromString(html,'text/html');for(const a of d.querySelectorAll('a[href]')){let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}const m=decodeURI(u.pathname).match(/^\/(\d{4}-\d{2}-\d{2})-(.+)-data\/?$/);if(!m)continue;const sg=m[2],txt=String(a.textContent||'').replace(/\s+/g,' ').trim(),name=txt&&txt.length<100&&!/^詳細|データ$/i.test(txt)?txt:displayNameFromSlug(sg);if(!out.has(sg))out.set(sg,{slug:sg,shopName:name,prefecture})}}catch{}if(!out.size){const re=/href=["']([^"']*\/(\d{4}-\d{2}-\d{2})-([^"'/?#]+)-data\/?)["']/gi;let m;while((m=re.exec(html))){const sg=m[3];if(!out.has(sg))out.set(sg,{slug:sg,shopName:displayNameFromSlug(sg),prefecture})}}return [...out.values()].sort((a,b)=>a.shopName.localeCompare(b.shopName,'ja'))}
async function loadCatalogShops(){const pref=$('jacCatalogPref').value;if(!pref)return;$('jacCatalogLoad').disabled=true;$('jacCatalogStatus').textContent=`${pref} の店舗一覧を読み込み中…`;try{await waitForAnaAccessSlot();recordAnaAccess();const url=new URL(`/ホールデータ/${encodeURIComponent(pref)}/`,location.origin).href,r=await fetch(url,{credentials:'include',cache:'no-store',redirect:'follow'});if(!r.ok){const e=new Error(`HTTP ${r.status}`);e.httpStatus=r.status;throw e}const html=await r.text(),shops=parseCatalogShops(html,pref);$('jacCatalogShop').innerHTML=shops.length?shops.map(x=>`<option value="${esc(x.slug)}" data-name="${esc(x.shopName)}">${esc(x.shopName)}</option>`).join(''):'<option value="">候補を検出できなかった</option>';$('jacCatalogStatus').textContent=shops.length?`✅ ${shops.length}店舗を検出。選んで登録してね。`:'⚠️ この一覧ページから店舗候補を検出できなかった。下のURL直接登録を使ってね。'}catch(e){$('jacCatalogStatus').textContent=`⚠️ 店舗一覧を取得できなかった：${e?.message||e}`}finally{$('jacCatalogLoad').disabled=false}}
function registerCatalogSelection(){const sel=$('jacCatalogShop'),sg=sel.value;if(!sg){$('jacCatalogStatus').textContent='⚠️ 店舗を選んでね';return}const opt=sel.options?.[sel.selectedIndex],name=opt?.dataset?.name||opt?.textContent||displayNameFromSlug(sg),pref=$('jacCatalogPref').value;upsertRegisteredShop({slug:sg,shopName:name,prefecture:pref,initialBuildDone:false});$('jacCatalogStatus').textContent=`✅ ${name} を登録。夜間メンテで13か月初回構築するよ。`;refreshMaintenanceUi()}
function parseDirectShopUrl(raw){try{const u=new URL(String(raw||'').trim(),location.origin);if(!ALLOWED_HOSTS.includes(u.hostname.toLowerCase()))return null;const m=decodeURI(u.pathname).match(/^\/(\d{4}-\d{2}-\d{2})-(.+)-data\/?$/);return m?{slug:m[2],shopName:displayNameFromSlug(m[2])}:null}catch{return null}}
function registerCatalogUrl(){const row=parseDirectShopUrl($('jacCatalogUrl').value);if(!row){$('jacCatalogStatus').textContent='⚠️ アナスロの日別データURLを貼ってね';return}upsertRegisteredShop({...row,initialBuildDone:false});$('jacCatalogStatus').textContent=`✅ ${row.shopName} を登録。夜間メンテで13か月初回構築するよ。`;refreshMaintenanceUi()}
function openShopCatalog(){if(running)return;fillCatalogRegions();$('jacCatalogStatus').textContent='地域と都道府県を選んで「店舗一覧を読み込む」を押してね。';shopMask.classList.add('open')}
'''
s = s[:end] + shop_modal + s[end:]

# auto-register current shop and track post-night reason
s = replace_once(s,
"let stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));\nif(!profile.anchorDate)",
"let stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));\nupsertRegisteredShop({slug,shopName,initialBuildDone:true,lastDate:stored.at(-1)?.date||'',lastFetchedAt:stored.at(-1)?.savedAt||0});\nif(!profile.anchorDate)", 'auto register current')
s = replace_once(s,
"let running=false,paused=false,stopped=false,wakeLock=null,startAt=0,sessionSuccess=[],sessionFailed=[],sessionQuality=[],requestDurations=[],currentDate='',currentWait=0,runMode='normal',nightPlan=[],nightSkipped=[],accessUiTimer=null;",
"let running=false,paused=false,stopped=false,wakeLock=null,startAt=0,sessionSuccess=[],sessionFailed=[],sessionQuality=[],requestDurations=[],currentDate='',currentWait=0,runMode='normal',nightPlan=[],nightSkipped=[],accessUiTimer=null,lastNightFinishReason='';", 'runtime vars')

# Generic fetch that can bypass the normal rolling limiter for night mode and target any registered shop.
fetch_block = r'''function fetchUrlForShop(date,targetSlug){return `https://ana-slo.com/${date}-${targetSlug}-data/`;}
function fetchUrl(date){return fetchUrlForShop(date,slug);}
async function fetchDayForShop(date,targetSlug=slug,targetStored=stored,opts={}){const url=fetchUrlForShop(date,targetSlug),t0=performance.now();let html='',status=200,statusText='OK',finalUrl=url;
  if(targetSlug===slug&&location.pathname===new URL(url).pathname){html=document.documentElement.outerHTML;finalUrl=location.href.split('#')[0]}else{if(!opts.bypassRateLimit){await waitForAnaAccessSlot();recordAnaAccess()}const r=await fetch(url,{credentials:'include',cache:'no-store',redirect:'follow'});status=r.status;statusText=r.statusText;finalUrl=r.url||url;if(status===403||status===429){const e=new Error(`HTTP ${status} ${statusText}`);e.httpStatus=status;throw e}if(!r.ok){const e=new Error(`HTTP ${status} ${statusText}`);e.httpStatus=status;throw e}html=await r.text()}
  const ms=Math.round(performance.now()-t0),expected=median((targetStored||[]).slice(-30).map(x=>x.machines?.length||0));const day=parseHtml(html,date,finalUrl,expected);if(!day.machines.length){const e=new Error('HTTP 200だが対象13機種（ジャグラー8＋ハナハナ5）の台データを検出できなかった');e.httpStatus=status;e.parseQuality=day.quality;throw e}return{day,ms,httpStatus:status};
}
async function fetchDay(date,opts={}){return fetchDayForShop(date,slug,stored,opts)}
'''
s = sub_once(s, r"function fetchUrl\(date\)\{.*?async function fetchDay\(date\)\{.*?return\{day,ms,httpStatus:status\};\n\}\n", fetch_block, 'generic fetch block', re.S)

# Generic relay payloads while preserving old relayPayload/relayChunks API for regression tests.
relay_old = r"function relayPayload\(days\)\{.*?function relayChunks\(days\)\{.*?return out\}\n"
relay_new = r'''function relayPayloadForShop(days,targetShop,targetSlug){const sorted=[...days].sort((a,b)=>b.date.localeCompare(a.date));return{format:'juggler-external-import-bulk',version:6,source:'ana-slo',shop:targetShop,sourceStoreId:targetSlug,requestedDays:sorted.length,successDays:sorted.length,failedDays:[],days:sorted.map(relayCompactDay)}}
function relayPayload(days){return relayPayloadForShop(days,shopName,slug)}
function relayChunksForShop(days,targetShop,targetSlug){const sorted=[...days].sort((a,b)=>b.date.localeCompare(a.date)),out=[];let cur=[];for(const day of sorted){const next=[...cur,day],payload=relayPayloadForShop(next,targetShop,targetSlug),bytes=new Blob([JSON.stringify(payload)]).size;if(cur.length&&(next.length>RELAY_CHUNK_DAYS||bytes>RELAY_CHUNK_BYTES)){out.push(relayPayloadForShop(cur,targetShop,targetSlug));cur=[day]}else cur=next}if(cur.length)out.push(relayPayloadForShop(cur,targetShop,targetSlug));return out}
function relayChunks(days){return relayChunksForShop(days,shopName,slug)}
'''
s = sub_once(s, relay_old, relay_new, 'generic relay payloads', re.S)

# Update current-store range sending so successful chunks establish sent-state.
relay_send_pattern = r"async function relaySendRange\(range,label,buttonId\)\{.*?\}\nasync function relaySendLatest"
relay_send_new = r'''async function relaySendRange(range,label,buttonId){if(!relayLink){relayRender();return}const days=(await listDays()).filter(x=>range.has(x.date)).sort((a,b)=>b.date.localeCompare(a.date));if(!days.length){relayRender('⚠️ 送信できる保存データがまだないよ');$('jacRelayStatus').className='jac-relay-status warn';return}const chunks=relayChunks(days),batchId=`${Date.now()}-${Math.random().toString(36).slice(2,10)}`,btn=$(buttonId);if(btn)btn.disabled=true;try{for(let i=0;i<chunks.length;i++){relayRender(`${label}送信中 ${i+1}/${chunks.length}（${chunks[i].days.length}日）…`);await relayCall({action:'send',channelId:relayLink.channelId,senderToken:relayLink.senderToken,batchId,chunkIndex:i+1,chunkTotal:chunks.length,payload:chunks[i]});const sentDates=new Set(chunks[i].days.map(x=>x.date));await markDaysSent(days.filter(d=>sentDates.has(d.date)),batchId)}relayRender(`✅ ${days.length}日分を送信したよ（${chunks.length}便）。設定判別ツールで「新着を受信」を押してね`);refreshMaintenanceUi()}catch(e){relayRender('⚠️ '+(e?.message||e));$('jacRelayStatus').className='jac-relay-status bad';if(/連携が無効|unauthorized/i.test(String(e?.message||''))){relayLink=null;saveRelayLink(null)}}finally{if(btn)btn.disabled=false;if(!relayLink)relayRender()}}
async function relaySendLatest'''
s = sub_once(s, relay_send_pattern, relay_send_new, 'relay range send', re.S)

# Add all-shop unsent sender before relayForget.
unsent_sender = r'''
async function relaySendAllUnsent(opts={}){if(!relayLink){relayRender('⚠️ 設定判別ツールと先に連携してね');$('jacRelayStatus').className='jac-relay-status warn';return{sent:0,skipped:true}}const all=(await listUnsentDaysAll()).sort((a,b)=>a.slug.localeCompare(b.slug)||b.date.localeCompare(a.date));if(!all.length){relayRender('✅ 全店舗とも未送信データはないよ');refreshMaintenanceUi();return{sent:0}}const groups=new Map();for(const d of all){if(!groups.has(d.slug))groups.set(d.slug,[]);groups.get(d.slug).push(d)}let sent=0,shopNo=0;const batchRoot=`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;$('jacAllUnsent').disabled=true;try{for(const [sg,days] of groups){shopNo++;const reg=registeredShop(sg),name=reg?.shopName||days[0]?.shop||displayNameFromSlug(sg),chunks=relayChunksForShop(days,name,sg),batchId=`${batchRoot}-${shopNo}`;for(let i=0;i<chunks.length;i++){relayRender(`全店舗未送信：${name} ${i+1}/${chunks.length}（${chunks[i].days.length}日）…`);await relayCall({action:'send',channelId:relayLink.channelId,senderToken:relayLink.senderToken,batchId,chunkIndex:i+1,chunkTotal:chunks.length,payload:chunks[i]});const ds=new Set(chunks[i].days.map(x=>x.date)),records=days.filter(d=>ds.has(d.date));await markDaysSent(records,batchId);sent+=records.length}}relayRender(`✅ 全店舗の未送信 ${sent}日分を送信したよ`);await refreshMaintenanceUi();return{sent}}catch(e){relayRender('⚠️ '+(e?.message||e));$('jacRelayStatus').className='jac-relay-status bad';if(/連携が無効|unauthorized/i.test(String(e?.message||''))){relayLink=null;saveRelayLink(null)}throw e}finally{$('jacAllUnsent').disabled=false;if(!relayLink)relayRender()}}
'''
s = replace_once(s, "function relayForget(){", unsent_sender+"\nfunction relayForget(){", 'all unsent sender')

# Night wait and retry: no rolling limiter, 25-35 seconds, no periodic long rests.
s = sub_once(s, r"function nightBaseWait\(done\)\{.*?\}\nasync function nightFetchWithRetry\(date\)\{.*?\}\nasync function finishNight", r'''function nightBaseWait(){return randMs(NIGHT_WAIT_MIN_MS,NIGHT_WAIT_MAX_MS)}
async function nightFetchWithRetryForShop(date,targetSlug,targetStored){let ordinary=0,blocked=0;while(!stopped){try{const r=await fetchDayForShop(date,targetSlug,targetStored,{bypassRateLimit:true});if(r.day.quality?.grade==='D'){const e=new Error(`品質D：${(r.day.quality.warnings||[]).join(' / ')||'取得内容を再確認'}`);e.qualityError=true;throw e}return r}catch(e){const hs=+e.httpStatus||0;if(hs===403||hs===429){blocked++;if(blocked>=2){e.nightFatal=true;throw e}const wait=randMs(45*60000,60*60000);log(`⚠ ${date} HTTP ${hs}。${fmtTime(wait)}休んで1回だけ再試行する`,'bad');await waitSafe(wait);continue}ordinary++;if(ordinary>=3){e.nightSkip=true;throw e}const wait=ordinary===1?randMs(15*60000,20*60000):randMs(30*60000,40*60000);log(`⚠ ${date} ${e.message||e}。${fmtTime(wait)}休んで再試行 ${ordinary}/2`,'bad');await waitSafe(wait)}}throw Object.assign(new Error('中止'),{nightSkip:true})}
async function nightFetchWithRetry(date){return nightFetchWithRetryForShop(date,slug,stored)}
async function finishNight''', 'night pace/retry', re.S)
s = replace_once(s, "async function finishNight(reason='complete',httpStatus=0){running=false;", "async function finishNight(reason='complete',httpStatus=0){lastNightFinishReason=reason;running=false;", 'night finish reason')
s = replace_once(s, "async function runNight(){if(running)return;const rate=accessRateState();if(rate.wait>0){log(`🧊 直近15分で${ACCESS_LIMIT}アクセス済み。あと ${fmtCountdown(rate.wait)} で開始できるよ`);updateAccessUi();return}nightPlan=buildNightPlan();if(!nightPlan.length){log('🌙 直近13か月はすべて取得済み');render();return}running=true;",
"async function runNight(){if(running)return;nightPlan=buildNightPlan();if(!nightPlan.length){lastNightFinishReason='complete';nightSkipped=[];log('🌙 現在店舗の直近13か月はすべて取得済み。後続メンテへ進むよ');render();return}lastNightFinishReason='';running=true;", 'night start bypass')
s = replace_once(s, "const label=(i+1)%60===0?'大休憩':(i+1)%15===0?'休憩':'低速待機';log(`🌙 ${label} ${fmtTime(wait)}`);", "log(`🌙 待機 ${fmtTime(wait)}`);", 'night wait label')

maintenance_code = r'''
function upsertStoredArray(arr,rec){const i=arr.findIndex(x=>x.date===rec.date);if(i>=0)arr[i]=rec;else arr.push(rec);arr.sort((a,b)=>a.date.localeCompare(b.date));}
function latestMissingDatesForShop(days,end=jstYesterday()){const a=[...(days||[])].sort((x,y)=>x.date.localeCompare(y.date)),last=a.at(-1)?.date||'';if(!last)return[];const out=[];for(let d=end;d&&d>last;d=addDays(d,-1))out.push(d);return out}
async function refreshMaintenanceUi(){const count=shopRegistry.length,pending=shopRegistry.filter(x=>!x.initialBuildDone).length,all=await listAllDays(),unsent=(await listUnsentDaysAll()).length,y=jstYesterday();let missing=0,shopsMissing=0;for(const reg of shopRegistry.filter(x=>x.initialBuildDone)){const ds=all.filter(d=>d.slug===reg.slug),m=latestMissingDatesForShop(ds,y);if(m.length){missing+=m.length;shopsMissing++}}if($('jacRegistryCount'))$('jacRegistryCount').textContent=`登録${count}店`;if($('jacRegistryStatus'))$('jacRegistryStatus').textContent=`最新未取得 ${shopsMissing}店 / ${missing}日　・　初回構築待ち ${pending}店　・　未送信 ${unsent}日`;}
async function fetchNightDatesForRegisteredShop(reg,dates,label='夜間'){let targetStored=await listDaysForSlug(reg.slug),ok=0,failed=[];for(let i=0;i<dates.length&&!stopped;i++){while(paused&&!stopped)await sleep(250);const date=dates[i];currentDate=`${reg.shopName} ${date}`;render();try{const r=await nightFetchWithRetryForShop(date,reg.slug,targetStored),rec=await putDayForShop(reg.slug,reg.shopName,r.day,{fetchMs:r.ms});upsertStoredArray(targetStored,rec);ok++;log(`✓ ${label} / ${reg.shopName} / ${date} / ${r.day.machines.length}台 / ${r.ms}ms`)}catch(e){const hs=+e.httpStatus||0;failed.push({date,httpStatus:hs,message:e.message||String(e)});log(`↷ ${label} / ${reg.shopName} / ${date}：${e.message||e}`,'bad');if(e.nightFatal)throw e}if(i<dates.length-1&&!stopped){const wait=nightBaseWait();log(`🌙 ${reg.shopName} 次まで ${fmtTime(wait)}`);await waitSafe(wait)}}const last=targetStored.at(-1);upsertRegisteredShop({...reg,lastDate:last?.date||reg.lastDate||'',lastFetchedAt:last?.savedAt||reg.lastFetchedAt||0,lastError:failed.at(-1)||null});return{ok,failed,targetStored}}
async function retryCurrentNightFailures(items){const dates=uniq((items||[]).filter(x=>![403,429].includes(+x.httpStatus||0)).map(x=>x.date)).filter(Boolean);if(!dates.length){log('🌙 ① 現在店舗の再回収対象なし');return}log(`🌙 ① 現在店舗の失敗 ${dates.length}日を最後に再回収`);const reg=registeredShop(slug)||{slug,shopName,initialBuildDone:true};await fetchNightDatesForRegisteredShop(reg,dates,'再回収')}
async function updateRegisteredLatestNight(){const regs=shopRegistry.filter(x=>x.slug!==slug&&x.initialBuildDone);if(!regs.length){log('🌙 ② 他の登録済み店舗なし');return}log(`🌙 ② 登録済み他店舗 ${regs.length}店の最新差分を確認`);for(const reg of regs){const ds=await listDaysForSlug(reg.slug),dates=latestMissingDatesForShop(ds);if(!dates.length){log(`・${reg.shopName} 最新済み`);continue}log(`・${reg.shopName} 未取得${dates.length}日`);await fetchNightDatesForRegisteredShop(reg,dates,'最新差分')}}
async function buildPendingShopsNight(){const regs=shopRegistry.filter(x=>x.slug!==slug&&!x.initialBuildDone);if(!regs.length){log('🌙 ③ 新規店舗の初回構築待ちなし');return}log(`🌙 ③ 新規登録 ${regs.length}店の13か月初回構築`);for(const reg of regs){const ds=await listDaysForSlug(reg.slug),have=new Set(ds.map(x=>x.date)),dates=nightRange().filter(d=>!have.has(d));if(dates.length){log(`・${reg.shopName} 初回構築 残り${dates.length}日`);await fetchNightDatesForRegisteredShop(reg,dates,'初回13か月')}const after=await listDaysForSlug(reg.slug),haveAfter=new Set(after.map(x=>x.date)),remaining=nightRange().filter(d=>!haveAfter.has(d));if(!remaining.length){upsertRegisteredShop({...reg,initialBuildDone:true,lastDate:after.at(-1)?.date||'',lastFetchedAt:after.at(-1)?.savedAt||0});log(`✅ ${reg.shopName} 初回13か月構築完了`)}else log(`⚠ ${reg.shopName} 初回構築 残り${remaining.length}日`,'bad')}}
async function runNightAutomation(){if(running)return;nightSkipped=[];lastNightFinishReason='';await runNight();if(stopped||lastNightFinishReason!=='complete')return;const retry=[...nightSkipped];running=true;runMode='night-maint';paused=false;stopped=false;await acquireWake();try{upsertRegisteredShop({slug,shopName,initialBuildDone:true});await retryCurrentNightFailures(retry);if(stopped)return;await updateRegisteredLatestNight();if(stopped)return;await buildPendingShopsNight();if(stopped)return;if(relayLink){log('🌙 ④ 全店舗の未送信データをJUGESTへ送信');await relaySendAllUnsent({auto:true})}else log('🌙 ④ JUGEST未連携なので未送信一括送信はスキップ');log('✅ 夜間自動メンテナンス完了')}catch(e){log(`⚠ 夜間自動メンテナンス中断：${e?.message||e}`,'bad')}finally{running=false;paused=false;runMode='normal';currentDate='';currentWait=0;try{await wakeLock?.release?.()}catch{}wakeLock=null;stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));await refreshPlan(true);await refreshMaintenanceUi();document.title=originalTitle;render()}}
async function runAllLatest(){if(running)return;const regs=shopRegistry.filter(x=>x.initialBuildDone);if(!regs.length){log('登録済みの構築済み店舗がないよ');return}running=true;runMode='all-latest';paused=false;stopped=false;await acquireWake();let total=0;try{for(const reg of regs){let targetStored=await listDaysForSlug(reg.slug),dates=latestMissingDatesForShop(targetStored);if(!dates.length){log(`・${reg.shopName} 最新済み`);continue}log(`▶ ${reg.shopName} 最新差分 ${dates.length}日`);for(let i=0;i<dates.length&&!stopped;i++){while(paused&&!stopped)await sleep(250);const date=dates[i];currentDate=`${reg.shopName} ${date}`;render();const r=await fetchDayForShop(date,reg.slug,targetStored,{bypassRateLimit:false}),rec=await putDayForShop(reg.slug,reg.shopName,r.day,{fetchMs:r.ms});upsertStoredArray(targetStored,rec);total++;log(`✓ ${reg.shopName} ${date} / ${r.day.machines.length}台`);if(i<dates.length-1&&!stopped)await waitSafe(randMs(5000,7500))}const last=targetStored.at(-1);upsertRegisteredShop({...reg,lastDate:last?.date||'',lastFetchedAt:last?.savedAt||0})}log(`✅ 全店舗最新差分 ${total}日取得`)}catch(e){log(`⚠ 全店舗最新差分を中断：${e?.message||e}`,'bad')}finally{running=false;paused=false;runMode='normal';currentDate='';try{await wakeLock?.release?.()}catch{}wakeLock=null;stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));await refreshPlan(true);await refreshMaintenanceUi();document.title=originalTitle;render()}}
'''
s = replace_once(s, "async function run(){if(running||!plan.dates.length)return;", maintenance_code+"\nasync function run(){if(running||!plan.dates.length)return;", 'maintenance logic')

# Render night UI should stay locked during every phase and allow auto maintenance even when current store has nothing missing.
s = s.replace("$('jacNightStart').disabled=running||!nightPlan.length;", "$('jacNightStart').disabled=running;")
s = s.replace("$('jacNightStart').textContent=running&&runMode==='night'?'夜間取得中…':'夜間取得を開始';", "$('jacNightStart').textContent=running&&String(runMode).startsWith('night')?'夜間自動メンテ中…':'夜間自動メンテナンス開始';")
s = s.replace("$('jacNightStatus').innerHTML=running&&runMode==='night'?", "$('jacNightStatus').innerHTML=running&&String(runMode).startsWith('night')?")
s = s.replace("目安：未取得${nightPlan.length}日を数時間かけて安全側に取得", "25〜35秒/件で取得後、そのまま全店舗メンテへ移行")

# Bind new UI/actions.
s = replace_once(s, "$('jacNightStart').onclick=runNight;", "$('jacNightStart').onclick=runNightAutomation;\n$('jacAllLatest').onclick=runAllLatest;\n$('jacAllUnsent').onclick=()=>relaySendAllUnsent();\n$('jacAddShop').onclick=openShopCatalog;", 'new handlers')
handler_anchor = "$('jacRelayForget').onclick=relayForget;"
extra_handlers = r'''$('jacCatalogLoad').onclick=loadCatalogShops;
$('jacCatalogRegister').onclick=registerCatalogSelection;
$('jacCatalogUrlRegister').onclick=registerCatalogUrl;
$('jacCatalogClose').onclick=()=>shopMask.classList.remove('open');
shopMask.addEventListener('click',e=>{if(e.target===shopMask)shopMask.classList.remove('open')});'''
s = replace_once(s, handler_anchor, handler_anchor+"\n"+extra_handlers, 'catalog handlers')

# Refresh maintenance state on boot.
s = replace_once(s, "render();relayRender();\n})();", "render();relayRender();refreshMaintenanceUi();\n})();", 'boot maintenance refresh')

LAUNCH.write_text(s)
shutil.copyfile(LAUNCH, ROOT/'public/ana-launcher.js')

# Bump app display/metadata to 4.8.4 without changing judgment math.
for p in [ROOT/'index.html', ROOT/'public/index.html']:
    t=p.read_text().replace('4.8.3','4.8.4').replace('v4830','v4840')
    p.write_text(t)

pkg_path=ROOT/'package.json'
pkg=json.loads(pkg_path.read_text())
pkg['name']='juggler-hanahana-tool-v4840'
pkg['version']='4.8.4'
if 'node tests/v484-launcher-maintenance.mjs' not in pkg['scripts']['test']:
    pkg['scripts']['test'] += ' && node tests/v484-launcher-maintenance.mjs'
pkg_path.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')

# Current bookmarklet is versioned with the project release; keep older files as history.
bookmark = 'javascript:(()=>{var s=document.createElement(\'script\');s.src="https://jugglerest.netlify.app/ana-launcher.js?v=4840"+\'&t=\'+Date.now();s.onerror=()=>alert(\'取得ランチャーを読み込めなかったよ\');document.documentElement.appendChild(s)})()\n'
(ROOT/'BOOKMARKLET_v4840.txt').write_text(bookmark)
(ROOT/'public/BOOKMARKLET_v4840.txt').write_text(bookmark)

# Update regression tests that intentionally pin the active release.
for p in [ROOT/'tests/launcher-relay.mjs', ROOT/'tests/v412-rate-limit.mjs']:
    t=p.read_text().replace("4.5.0","4.8.4").replace("30*60*1000","15*60*1000").replace('30 minutes','15 minutes').replace('1771000','871000')
    if p.name=='v412-rate-limit.mjs':
        t=t.replace("const W=30*60*1000,L=30;","const W=15*60*1000,L=30;")
        t=t.replace("st=state(hits,W);\nif(st.count!==29||st.wait!==0) throw new Error('slot must reopen exactly at 30 minutes: '+JSON.stringify(st));","st=state(hits,W);\nif(st.count!==29||st.wait!==0) throw new Error('slot must reopen exactly at 15 minutes: '+JSON.stringify(st));")
        t=t.replace("console.log('v4.8.4 rolling access limit: ok');","console.log('v4.8.4 rolling 30 accesses / 15 minutes: ok');")
    p.write_text(t)

pre=ROOT/'tests/netlify-deploy-preflight.mjs'
t=pre.read_text().replace("BOOKMARKLET_v4500.txt","BOOKMARKLET_v4840.txt").replace("v4\\.8\\.3","v4\\.8\\.4").replace("ana-launcher.js?v=4500","ana-launcher.js?v=4840")
pre.write_text(t)

# Extend VM smoke test for the new button handlers.
init=ROOT/'tests/launcher-init.mjs'
t=init.read_text()
needle="if(typeof elems.get('jacRelaySend13')?.onclick!=='function')throw new Error('13-month relay handler missing');"
insert=needle+"\nif(typeof elems.get('jacAllLatest')?.onclick!=='function')throw new Error('all-shop latest handler missing');\nif(typeof elems.get('jacAllUnsent')?.onclick!=='function')throw new Error('all-shop unsent handler missing');\nif(typeof elems.get('jacAddShop')?.onclick!=='function')throw new Error('shop registration handler missing');"
t=t.replace(needle,insert)
init.write_text(t)

v484 = r'''import fs from 'node:fs';
import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('../ana-launcher.js',import.meta.url),'utf8');
const must=[
  "const VERSION='4.8.4'",
  "const ACCESS_WINDOW_MS=15*60*1000",
  "const ACCESS_LIMIT=30",
  "const DB_VERSION=2",
  "const SHOP_REGISTRY_KEY='jugglerAnaShopRegistry:v1'",
  "const NIGHT_WAIT_MIN_MS=25000",
  "const NIGHT_WAIT_MAX_MS=35000",
  'function listUnsentDaysAll()',
  'function fetchUrlForShop(date,targetSlug)',
  'async function fetchDayForShop',
  "bypassRateLimit:true",
  'function relayPayloadForShop',
  'async function relaySendAllUnsent',
  'async function runAllLatest()',
  'async function runNightAutomation()',
  'async function retryCurrentNightFailures',
  'async function updateRegisteredLatestNight',
  'async function buildPendingShopsNight',
  'REGION_PREFECTURES',
  'parseCatalogShops',
  'jacAllLatest','jacAllUnsent','jacAddShop','jacCatalogRegion','jacCatalogPref','jacCatalogShop'
];
for(const x of must)assert.ok(s.includes(x),'missing v4.8.4 feature: '+x);
assert.ok(!s.includes('const ACCESS_WINDOW_MS=30*60*1000'),'old 30-minute limiter remains');
assert.ok(!s.includes('return randMs(35000,55000)'),'old night wait remains');
assert.ok(!s.includes('return randMs(8*60000,12*60000)'),'old 60-day night rest remains');
assert.ok(!s.includes('return randMs(2*60000,4*60000)'),'old 15-day night rest remains');
const nightRetry=s.slice(s.indexOf('async function nightFetchWithRetryForShop'),s.indexOf('async function finishNight'));
assert.ok(nightRetry.includes('{bypassRateLimit:true}'),'night fetch must bypass local rolling limiter');
const normal=s.slice(s.indexOf('async function run(){'),s.indexOf("$('jacStart').onclick"));
assert.ok(normal.includes('fetchDay(date)'),'normal acquisition must still use rate-limited fetch');
const bookmark=fs.readFileSync(new URL('../BOOKMARKLET_v4840.txt',import.meta.url),'utf8');
assert.ok(bookmark.includes('jugglerest.netlify.app/ana-launcher.js?v=4840'));
const root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),pub=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert.equal(root,pub,'root/public index diverged');
assert.equal(s,fs.readFileSync(new URL('../public/ana-launcher.js',import.meta.url),'utf8'),'root/public launcher diverged');
console.log('v4.8.4 launcher maintenance regression: ok');
'''
(ROOT/'tests/v484-launcher-maintenance.mjs').write_text(v484)

# README release note, intentionally concise.
readme=ROOT/'README.md'
r=readme.read_text()
if '## v4.8.4' not in r:
    r += '''\n## v4.8.4\n\nProject-wide v4.8.4 keeps the existing setting-judgment math unchanged and upgrades the Ana-Slo collector: normal rolling guard is 30 accesses / 15 minutes; night collection uses serial 25–35 second pacing without the local rolling guard; registered-shop latest-delta collection, shop registration, chained night maintenance, and all-shop unsent Relay delivery are included. Active production remains https://jugglerest.netlify.app.\n'''
readme.write_text(r)

# Synchronize package lock after package metadata bump.
subprocess.run(['npm','install','--package-lock-only','--ignore-scripts'],check=True)
print('v4.8.4 patch applied')
