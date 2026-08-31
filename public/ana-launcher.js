(async()=>{
'use strict';
const VERSION='4.8.4';
const TARGET_DAYS=180;
const NIGHT_MONTHS=13;
const PARSER_VERSION=4500;
const MAX_SESSION=90;
const DB_NAME='jugglerAnaCollector';
const DB_VERSION=2;
const PROFILE_PREFIX='jugglerAnaProfile:v3:';
const CHECKPOINT_PREFIX='jugglerAnaCheckpoint:v3:';
const NIGHT_CHECKPOINT_PREFIX='jugglerAnaNightCheckpoint:v1:';
const ACCESS_RATE_KEY='jugglerAnaAccessRate:v1';
const ACCESS_RATE_COOKIE='jugglerAnaRateV1';
const ACCESS_WINDOW_MS=15*60*1000;
const ACCESS_LIMIT=30;
const ALLOWED_HOSTS=['ana-slo.com','www.ana-slo.com'];
const RELAY_API='https://jugglerest.netlify.app/api/relay';
const RELAY_BRIDGE='https://jugglerest.netlify.app/relay-bridge.html';
const RELAY_BRIDGE_ORIGIN='https://jugglerest.netlify.app';
const RELAY_TIMEOUT_MS=20000;
const RELAY_LINK_KEY='jugglerRelayLink:v1';
const RELAY_CHUNK_DAYS=45;
const RELAY_CHUNK_BYTES=2500000;
const SHOP_REGISTRY_KEY='jugglerAnaShopRegistry:v1';
const NIGHT_WAIT_MIN_MS=25000;
const NIGHT_WAIT_MAX_MS=35000;
if(!ALLOWED_HOSTS.includes(location.hostname.toLowerCase())){alert('アナスロ上で実行してね');return;}
if(document.getElementById('jugglerAnaRunner3160')){document.getElementById('jugglerAnaRunner3160').style.display='block';return;}

const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const pad=n=>String(n).padStart(2,'0');
const isoLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseDate=s=>{const d=new Date(String(s)+'T00:00:00');return Number.isFinite(d.getTime())?d:null};
const addDays=(s,n)=>{const d=parseDate(s);if(!d)return'';d.setDate(d.getDate()+n);return isoLocal(d)};
const addMonths=(s,n)=>{const d=parseDate(s);if(!d)return'';const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return isoLocal(d)};
const jstYesterday=()=>{const now=new Date(Date.now()+9*3600e3);const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));d.setUTCDate(d.getUTCDate()-1);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`};
const minDate=(a,b)=>!a?b:!b?a:(a<b?a:b);
const fmtTime=ms=>{ms=Math.max(0,Math.round(ms/1000));const m=Math.floor(ms/60),s=ms%60;return m?`${m}分${pad(s)}秒`:`${s}秒`};
const fmtCountdown=ms=>{const sec=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(sec/60),s=sec%60;return `${m}:${pad(s)}`};
const median=a=>{const x=a.filter(Number.isFinite).sort((p,q)=>p-q);if(!x.length)return NaN;const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2};
const avg=a=>{const x=a.filter(Number.isFinite);return x.length?x.reduce((p,q)=>p+q,0)/x.length:NaN};
const uniq=a=>[...new Set(a)];
const nowIso=()=>new Date().toISOString();

function parseCurrentPath(){
  const m=location.pathname.match(/^\/(\d{4}-\d{2}-\d{2})-(.+)-data\/?$/);
  if(!m)return null;
  return {date:m[1],slug:m[2]};
}
const pathInfo=parseCurrentPath();
if(!pathInfo){alert('アナスロの日別データページ（YYYY-MM-DD-店舗名-data/）で実行してね');return;}
const slug=pathInfo.slug;
const pageDate=pathInfo.date;
function inferShopName(){
  const h1=[...document.querySelectorAll('h1,h2')].map(x=>x.textContent.trim()).find(Boolean)||'';
  let t=h1||document.title||decodeURIComponent(slug||'');
  t=t.replace(/20\d{2}[年\/-]\d{1,2}[月\/-]\d{1,2}日?/g,' ').replace(/アナスロ|データ|出玉|差枚|結果|スロット/gi,' ').replace(/まとめ/gi,' ').replace(/\s+/g,' ').trim();
  if(t.length>2&&t.length<80)return t;
  try{return decodeURIComponent(slug).replace(/-/g,' ')}catch{return slug}
}
const shopName=inferShopName();
function loadRelayLink(){try{const x=JSON.parse(localStorage.getItem(RELAY_LINK_KEY)||'null');return x&&x.channelId&&x.senderToken?x:null}catch{return null}}
function saveRelayLink(x){try{if(x)localStorage.setItem(RELAY_LINK_KEY,JSON.stringify(x));else localStorage.removeItem(RELAY_LINK_KEY)}catch{}}
let relayLink=loadRelayLink();

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


const profileKey=PROFILE_PREFIX+slug;
const checkpointKey=CHECKPOINT_PREFIX+slug;
const nightCheckpointKey=NIGHT_CHECKPOINT_PREFIX+slug;
function loadProfile(){
  let p=null;try{p=JSON.parse(localStorage.getItem(profileKey)||'null')}catch{}
  p=p&&typeof p==='object'?p:{};
  return {version:3,slug,shopName,anchorDate:p.anchorDate||'',targetDays:TARGET_DAYS,createdAt:p.createdAt||Date.now(),updatedAt:Date.now(),sessions:Array.isArray(p.sessions)?p.sessions.slice(-40):[],nightSessions:Array.isArray(p.nightSessions)?p.nightSessions.slice(-20):[],failures:p.failures&&typeof p.failures==='object'?p.failures:{},paceMode:p.paceMode||'auto',...p,slug,shopName,updatedAt:Date.now()};
}
function saveProfile(p){p.updatedAt=Date.now();try{localStorage.setItem(profileKey,JSON.stringify(p))}catch{}}
function loadCheckpoint(){try{return JSON.parse(localStorage.getItem(checkpointKey)||'null')}catch{return null}}
function saveCheckpoint(c){try{localStorage.setItem(checkpointKey,JSON.stringify(c))}catch{}}
function clearCheckpoint(){try{localStorage.removeItem(checkpointKey)}catch{}}
function loadNightCheckpoint(){try{return JSON.parse(localStorage.getItem(nightCheckpointKey)||'null')}catch{return null}}
function saveNightCheckpoint(c){try{localStorage.setItem(nightCheckpointKey,JSON.stringify(c))}catch{}}
function clearNightCheckpoint(){try{localStorage.removeItem(nightCheckpointKey)}catch{}}
function pruneAccessTimes(a,now=Date.now()){
  const cut=now-ACCESS_WINDOW_MS;return [...new Set((Array.isArray(a)?a:[]).map(Number).filter(t=>Number.isFinite(t)&&t>cut&&t<=now+60000))].sort((x,y)=>x-y).slice(-ACCESS_LIMIT);
}
function readAccessCookie(){
  try{const m=document.cookie.match(new RegExp('(?:^|;\\s*)'+ACCESS_RATE_COOKIE+'=([^;]*)'));if(!m)return[];return decodeURIComponent(m[1]).split(',').map(Number).filter(Number.isFinite)}catch{return[]}
}
function loadAccessTimes(){
  let local=[];try{local=JSON.parse(localStorage.getItem(ACCESS_RATE_KEY)||'[]')}catch{}return pruneAccessTimes([...(Array.isArray(local)?local:[]),...readAccessCookie()]);
}
function saveAccessTimes(a){
  const x=pruneAccessTimes(a);try{localStorage.setItem(ACCESS_RATE_KEY,JSON.stringify(x));localStorage.removeItem('jugglerAnaNormalCooldown:v1')}catch{}try{document.cookie=`${ACCESS_RATE_COOKIE}=${encodeURIComponent(x.join(','))}; Max-Age=${Math.ceil(ACCESS_WINDOW_MS/1000)+60}; Path=/; Domain=.ana-slo.com; SameSite=Lax; Secure`}catch{}return x;
}
function accessRateState(now=Date.now()){
  const times=pruneAccessTimes(loadAccessTimes(),now),count=times.length,nextAt=count?times[0]+ACCESS_WINDOW_MS:0,wait=count>=ACCESS_LIMIT?Math.max(0,nextAt-now):0;return{times,count,nextAt,wait};
}
function recordAnaAccess(){const x=loadAccessTimes();x.push(Date.now());const times=saveAccessTimes(x);updateAccessUi();return times.length}
async function waitForAnaAccessSlot(){
  let lastLog=0;while(!stopped){while(paused&&!stopped)await sleep(250);if(stopped)break;const st=accessRateState();if(st.count<ACCESS_LIMIT)return st;const wait=Math.max(1,st.wait);if(!lastLog||Date.now()-lastLog>10000){log(`🧊 直近15分で${ACCESS_LIMIT}アクセス到達。あと ${fmtCountdown(wait)} 待って自動再開するよ`);lastLog=Date.now()}await waitSafe(wait)}const e=new Error('取得を中止したよ');e.userStopped=true;throw e;
}
let profile=loadProfile();

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('days')){const s=db.createObjectStore('days',{keyPath:'id'});s.createIndex('slug','slug',{unique:false});s.createIndex('slugDate',['slug','date'],{unique:true});}if(!db.objectStoreNames.contains('sync'))db.createObjectStore('sync',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDBを開けなかった'));});}
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


const decEnt=(s='')=>{const map={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};return String(s).replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16))).replace(/&#([0-9]+);/g,(_,x)=>String.fromCodePoint(parseInt(x,10))).replace(/&([a-z]+);/gi,(z,k)=>map[k.toLowerCase()]??z)};
const strip=(s='')=>decEnt(String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[\u00a0\t\r ]+/g,' ').replace(/\n\s+/g,'\n').trim();
const aliases=[
 ['my',['マイジャグラーV','マイジャグラー5','マイジャグV','マイジャグ5']],
 ['im',['ネオアイムジャグラーEX','ネオアイムジャグラー','ネオアイム']],
 ['go',['ゴーゴージャグラー3','ゴーゴージャグラーⅢ','ゴージャグ3','ゴージャグⅢ']],
 ['fk',['ファンキージャグラー2','ファンキージャグラーⅡ','ファンキー2','ファンキーⅡ']],
 ['hp',['ハッピージャグラーVⅢ','ハッピージャグラーVIII','ハッピージャグラーV3','ハッピーVⅢ','ハッピーVIII','ハッピーV3']],
 ['gg',['ジャグラーガールズSS','ジャグラーガールズ','ガールズSS']],
 ['mr',['ミスタージャグラー','ミスター']],
 ['um',['ウルトラミラクルジャグラー','ウルトラミラクル','ウルミラ']],
 // HANA HANA: put New King V before King because the latter is a substring of the former.
 ['newkingv',['ニューキングハナハナV','LニューキングハナハナV','スマート沖スロニューキングハナハナV','スマスロニューキングハナハナV']],
 ['houou',['ハナハナホウオウ～天翔～','ハナハナホウオウ-天翔-','ハナハナホウオウ天翔','ホウオウ～天翔～','ホウオウ天翔']],
 ['dragon',['ドラゴンハナハナ～閃光～','ドラゴンハナハナ-閃光-','ドラゴンハナハナ閃光','スマート沖スロドラゴンハナハナ～閃光～','Lドラゴンハナハナ～閃光～']],
 ['star',['スターハナハナ','スマート沖スロスターハナハナ','Lスターハナハナ']],
 ['king',['キングハナハナ','スマート沖スロキングハナハナ','Lキングハナハナ']]
];
const machineToken=(name='')=>{let s=String(name);try{s=s.normalize('NFKC')}catch{}return s.toUpperCase().replace(/\s+/g,'').replace(/[‐‑‒–—―]/g,'-').replace(/[・･]/g,'').replace(/[Φφ]/g,'Φ')};
const aliasTokens=aliases.map(([k,aa])=>[k,aa.map(machineToken)]);
const norm=(name='')=>{const s=machineToken(name);for(const [k,aa] of aliasTokens)if(aa.some(a=>s.includes(a)))return k;return''};
const num=(v,nullable=false)=>{const s=strip(String(v??'')).replace(/,/g,'').replace(/[＋+]/g,'+').replace(/[−－–—]/g,'-').trim();if(!s||/^[―ー\-–—]+$/.test(s))return nullable?null:NaN;const q=s.match(/[+-]?\d+(?:\.\d+)?/);if(!q)return nullable?null:NaN;const n=Number(q[0]);return Number.isFinite(n)?n:(nullable?null:NaN)};
const cells=(row)=>{const out=[];let q;const re=/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi;while((q=re.exec(row)))out.push({type:q[1].toLowerCase(),text:strip(q[2])});return out};
const rows=(table)=>{const out=[];let q;const re=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;while((q=re.exec(table))){const c=cells(q[1]);if(c.length)out.push(c)}return out};
const idx=(h,p)=>h.findIndex(x=>p.some(y=>x.includes(y)));
const infer=(prefix)=>{const txt=machineToken(strip(prefix.slice(-9000)));let best={key:'',idx:-1};for(const [key,aa] of aliasTokens)for(const a of aa){const i=txt.lastIndexOf(a);if(i>best.idx)best={key,idx:i}}return best.key};
function parseHtml(html,date,url,expectedMedian=NaN){
  const src=String(html||'');let q;const tables=[];const re=/<table\b[^>]*>[\s\S]*?<\/table>/gi;while((q=re.exec(src)))tables.push({html:q[0],index:q.index});
  const metas=[];
  for(const t of tables){
    const rr=rows(t.html);if(!rr.length)continue;
    const hr=rr.find(r=>r.some(c=>c.type==='h'))||rr[0],h=hr.map(c=>c.text.replace(/\s+/g,''));
    const no=idx(h,['台番号','台番']),g=idx(h,['G数','総回転数','回転数','ゲーム数']),df=idx(h,['差枚','総差枚']),bb=idx(h,['BB','BIG']),rb=idx(h,['RB','REG']),mi=idx(h,['機種名','機種']);
    if(no<0||g<0||df<0||bb<0||rb<0)continue;
    const scope=mi>=0?'':infer(src.slice(0,t.index));if(mi<0&&!scope)continue;
    metas.push({t,rr,hr,no,g,df,bb,rb,mi,scope});
  }
  // ana-slo の「全データ一覧」のように機種名列を持つ表がある場合はそれだけを使う。
  // 見出しから機種を推測する補助表まで同時に読むと同じ実台を二重計上し得るため。
  const explicitHasTarget=metas.some(m=>m.mi>=0&&m.rr.some(row=>row!==m.hr&&norm((row[m.mi]||{}).text)));
  const selected=explicitHasTarget?metas.filter(m=>m.mi>=0):metas;
  const machines=[];let candidateRows=0,invalidRows=0,duplicateRows=0,conflictRows=0,matchedTables=selected.length;const unmatchedJugglerNames=new Map(),unmatchedHanaNames=new Map();
  for(const m of selected){
    const {rr,hr,no,g,df,bb,rb,mi,scope}=m;
    for(const row of rr){
      if(row===hr)continue;const c=row.map(x=>x.text);if(c.length<=Math.max(no,g,df,bb,rb,mi))continue;
      const key=mi>=0?norm(c[mi]):scope;if(!key){if(mi>=0){const tok=machineToken(c[mi]),n=String(c[mi]||'').trim()||'不明';if(tok.includes('ジャグ'))unmatchedJugglerNames.set(n,(unmatchedJugglerNames.get(n)||0)+1);if(tok.includes('ハナハナ'))unmatchedHanaNames.set(n,(unmatchedHanaNames.get(n)||0)+1)}continue}candidateRows++;
      const tableNo=String(c[no]||'').replace(/[^0-9A-Za-z-]/g,'').trim(),games=num(c[g]),diff=num(c[df],true),b=num(c[bb]),r=num(c[rb]);
      if(!tableNo||!Number.isFinite(games)||games<0||!Number.isFinite(b)||b<0||!Number.isFinite(r)||r<0||(b+r>games&&games>0)){invalidRows++;continue}
      machines.push({machine:key,category:['houou','king','dragon','star','newkingv'].includes(key)?'hanahana':'juggler',sourceMachineName:mi>=0?c[mi]:(aliases.find(x=>x[0]===key)?.[1]?.[0]||key),tableNo,games,diff,bb:b,rb:r,_explicit:mi>=0});
    }
  }
  // 台番は店舗内の物理台を識別するキー。機種名が誤推測されても同じ台番を2台に増やさない。
  const byNo=new Map(),conflicts=new Set();
  const rowRank=x=>(x._explicit?1000000:0)+(x.diff!=null?100000:0)+Math.max(0,+x.games||0);
  for(const x of machines){
    const k=x.tableNo,prev=byNo.get(k);
    if(!prev){byNo.set(k,x);continue}
    duplicateRows++;
    if(prev.machine!==x.machine){conflictRows++;conflicts.add(k);continue}
    if(rowRank(x)>=rowRank(prev))byNo.set(k,x);
  }
  for(const k of conflicts)byNo.delete(k);
  const dedup=[...byNo.values()].map(({_explicit,...x})=>x),counts={};for(const x of dedup)counts[x.machine]=(counts[x.machine]||0)+1;
  const diffMissing=dedup.filter(x=>x.diff==null).length;
  let score=100;const warnings=[];
  if(Number.isFinite(expectedMedian)&&expectedMedian>=10){
    const ratio=dedup.length/expectedMedian;
    if(ratio<0.5){score-=50;warnings.push(`台数が通常の${Math.round(ratio*100)}%程度`)}
    else if(ratio<0.75){score-=25;warnings.push(`台数が通常よりかなり少ない`)}
    else if(ratio<0.9){score-=10;warnings.push(`台数が通常より少なめ`)}
    else if(ratio>1.35){score-=50;warnings.push(`台数が通常の${Math.round(ratio*100)}%で異常に多い`)}
    else if(ratio>1.2){score-=25;warnings.push(`台数が通常よりかなり多い`)}
    else if(ratio>1.1){score-=10;warnings.push(`台数が通常より多め`)}
  }
  if(candidateRows&&invalidRows/candidateRows>0.08){score-=15;warnings.push(`無効行${invalidRows}件`)}else if(invalidRows){score-=5;warnings.push(`無効行${invalidRows}件`)}
  if(duplicateRows){score-=5;warnings.push(`重複${duplicateRows}件を台番単位で統合`)}
  if(conflictRows){score-=20;warnings.push(`同一台番の機種競合${conflictRows}件を除外`)}
  const unmatchedJugglerRows=[...unmatchedJugglerNames.values()].reduce((a,b)=>a+b,0),unmatchedJugglerLabels=[...unmatchedJugglerNames.keys()];
  const unmatchedHanaRows=[...unmatchedHanaNames.values()].reduce((a,b)=>a+b,0),unmatchedHanaLabels=[...unmatchedHanaNames.keys()];
  if(unmatchedJugglerRows){score-=20;warnings.push(`未認識のジャグラー表記${unmatchedJugglerRows}台：${unmatchedJugglerLabels.slice(0,3).join(' / ')}`)}
  if(unmatchedHanaRows){score-=20;warnings.push(`未認識のハナハナ表記${unmatchedHanaRows}台：${unmatchedHanaLabels.slice(0,3).join(' / ')}`)}
  if(explicitHasTarget&&metas.length>selected.length)warnings.push(`機種名列つき表を優先（補助表${metas.length-selected.length}件を除外）`);
  if(dedup.length&&diffMissing/dedup.length>0.2){score-=15;warnings.push(`差枚欠損が多い`)}
  score=Math.max(0,Math.min(100,score));const grade=score>=90?'A':score>=75?'B':score>=60?'C':'D';
  return {date,sourceUrl:url,machines:dedup,quality:{score,grade,warnings,candidateRows,invalidRows,duplicateRows,conflictRows,unmatchedJugglerRows,unmatchedJugglerLabels,unmatchedHanaRows,unmatchedHanaLabels,diffMissing,matchedTables,machineCounts:counts,totalMachines:dedup.length,explicitTablePreferred:explicitHasTarget}};
}

function dateRangeBack(anchor,n){const a=[];for(let i=0;i<n;i++)a.push(addDays(anchor,-i));return a;}
function nightRange(anchor=jstYesterday()){const start=addMonths(anchor,-NIGHT_MONTHS),a=[];for(let d=anchor;d&&d>=start;d=addDays(d,-1))a.push(d);return a;}
function randMs(a,b){return a+Math.floor(Math.random()*(b-a+1))}
function recentSessions(n=8){return (profile.sessions||[]).slice(-n);}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const floor5=v=>Math.max(0,Math.floor((+v||0)/5)*5);
function recommendedPolicy(stored){
  const all=(profile.sessions||[]).filter(s=>(+s.planned||0)>0),ss=recentSessions(8);
  const learned=all.filter(s=>(+s.planned||0)>=10);
  const clean=s=>String(s.reason||'')==='complete'&&(+s.failed||0)===0&&(+s.success||0)>=(+s.planned||0)&&!([403,429].includes(+s.httpStatus))&&['A','B','—',''].includes(String(s.quality||''));
  let consecutiveClean=0;for(let i=learned.length-1;i>=0;i--){if(clean(learned[i]))consecutiveClean++;else break}
  const cleanRuns=learned.filter(clean),sizeCounts=new Map();for(const x of cleanRuns){const n=+x.planned||0;sizeCounts.set(n,(sizeCounts.get(n)||0)+1)}
  const stableSizes=[...sizeCounts.entries()].filter(([,n])=>n>=2).map(([size])=>+size).sort((a,b)=>a-b);
  const stableSession=stableSizes.at(-1)||0,largestClean=Math.max(0,...cleanRuns.map(x=>+x.planned||0));
  const last=learned.at(-1)||null;
  let recentBlock=null,recentHardError=null;
  for(let i=learned.length-1;i>=0;i--){const x=learned[i];if(!recentBlock&&[403,429].includes(+x.httpStatus)){const cleanAfter=learned.slice(i+1).filter(clean).length;if(cleanAfter<2)recentBlock=x;break}}
  if(!recentBlock){for(let i=learned.length-1;i>=0;i--){const x=learned[i];if(String(x.reason||'')==='error'){const cleanAfter=learned.slice(i+1).filter(clean).length;if(cleanAfter<2)recentHardError=x;break}}}
  const ms=stored.slice(-45).map(x=>+x.fetchMs).filter(x=>x>0),counts=stored.slice(-45).map(x=>x.machines?.length||0).filter(x=>x>0);
  const avgMs=avg(ms),avgMachines=avg(counts);
  let cap=90;if((avgMachines||0)>=180||(avgMs||0)>=3000)cap=45;else if((avgMachines||0)>=130||(avgMs||0)>=2000)cap=60;else if((avgMachines||0)>=95||(avgMs||0)>=1400)cap=75;
  let session=30,reason='初期推奨30日から安全側に学習';
  if(recentBlock){const ok=+recentBlock.success||0,planned=+recentBlock.planned||30;session=clamp(floor5(Math.min(planned-10,ok-5)),15,45);reason=`直近HTTP ${recentBlock.httpStatus}停止（${ok}/${planned}日）→取得量を縮小`;}
  else if(recentHardError&&last===recentHardError){const ok=+last.success||0,planned=+last.planned||30;session=clamp(floor5(Math.min(planned-10,Math.max(20,ok))),15,45);reason=`直近セッションが途中停止（${ok}/${planned}日）→安全側へ縮小`;}
  else if(stableSession>0){session=clamp(stableSession+10,30,cap);reason=`${stableSession}日セッションを2回以上完走 → 次は${session}日を試す`;}
  else if(consecutiveClean>=2&&largestClean>=30){session=clamp(largestClean,30,cap);reason=`直近${consecutiveClean}回連続完走 → ${session}日を維持`;}
  session=Math.min(session,cap,MAX_SESSION);
  let minWait=5000,maxWait=7500,fiveRest=25000,midRest=60000,label='標準';
  if(recentBlock){minWait=7500;maxWait=11000;fiveRest=40000;midRest=105000;label='かなり慎重'}
  else if(recentHardError&&last===recentHardError){minWait=6500;maxWait=10000;fiveRest=35000;midRest=90000;label='慎重'}
  else if((avgMachines||0)>=180||(avgMs||0)>=3000){minWait=7000;maxWait=10500;fiveRest=35000;midRest=90000;label='慎重'}
  else if((avgMachines||0)>=130||(avgMs||0)>=2000){minWait=6000;maxWait=9000;fiveRest=30000;midRest=75000;label='やや慎重'}
  else if((avgMachines||0)>=95||(avgMs||0)>=1400){minWait=5500;maxWait=8500;fiveRest=28000;midRest=70000;label='やや慎重'}
  const successRate=learned.length?learned.filter(clean).length/learned.length:NaN;
  const learningLevel=learned.length>=6?'高':learned.length>=3?'中':learned.length?'低':'未学習';
  return {session,minWait,maxWait,fiveRest,midRest,label,avgMs,avgMachines,reason,learningLevel,successRate,consecutiveClean,stableSession,largestClean,cap,sessionCount:learned.length,recentBlock:recentBlock||null};
}
function buildPlan(stored,policy){
  const yesterday=jstYesterday();
  if(!profile.anchorDate){profile.anchorDate=minDate(pageDate||yesterday,yesterday);saveProfile(profile)}
  const projectRange=dateRangeBack(profile.anchorDate,TARGET_DAYS),have=new Set(stored.map(x=>x.date)),missingProject=projectRange.filter(d=>!have.has(d));
  let mode='build',basePlan=missingProject;
  if(!missingProject.length){mode='maintenance';const rolling=dateRangeBack(yesterday,TARGET_DAYS);basePlan=rolling.filter(d=>!have.has(d));}
const cp=loadCheckpoint();
  if(cp&&cp.slug===slug&&Array.isArray(cp.dates)&&cp.dates.length&&cp.status!=='complete'){
    const rem=cp.dates.filter(d=>!have.has(d));if(rem.length)return {mode:'resume',dates:rem.slice(0,MAX_SESSION),originalDates:cp.dates,projectRange,projectProgress:projectRange.filter(d=>have.has(d)).length,missingProject:missingProject.length,checkpoint:cp};
  }
  return {mode,dates:basePlan.slice(0,policy.session),originalDates:basePlan.slice(0,policy.session),projectRange,projectProgress:projectRange.filter(d=>have.has(d)).length,missingProject:missingProject.length,checkpoint:null};
}

const panel=document.createElement('div');panel.id='jugglerAnaRunner3160';panel.innerHTML=`<style>
#jugglerAnaRunner3160{position:fixed;z-index:2147483647;inset:max(8px,env(safe-area-inset-top)) 8px 8px;background:#090909;color:#f7f1e7;border:1px solid #8a6a2f;border-radius:16px;box-shadow:0 16px 60px #000c;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;overflow:auto;overscroll-behavior:contain}
#jugglerAnaRunner3160 *{box-sizing:border-box}#jugglerAnaRunner3160 button,#jugglerAnaRunner3160 select{font:inherit}
.jac-head{position:sticky;top:0;z-index:4;background:#0d0d0df2;border-bottom:1px solid #342b20;padding:12px 12px 10px;backdrop-filter:blur(8px)}.jac-headrow{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.jac-title{font-size:17px;font-weight:950}.jac-sub{color:#aaa097;font-size:10px;margin-top:2px}.jac-close{border:1px solid #4a4034;background:#171717;color:#ddd;border-radius:9px;padding:6px 9px}
.jac-body{padding:10px}.jac-card{background:#121212;border:1px solid #302820;border-radius:12px;padding:10px;margin-bottom:8px}.jac-card.gold{border-color:#6c572e}.jac-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.jac-stat{background:#0b0b0b;border-radius:9px;padding:7px 4px;text-align:center}.jac-stat small{display:block;color:#948b81;font-size:8px}.jac-stat b{display:block;margin-top:2px;font-size:13px;color:#f5e6b8}.jac-progress{height:8px;background:#070707;border-radius:999px;overflow:hidden;margin-top:7px}.jac-progress i{display:block;height:100%;background:#9b7837;width:0;transition:width .2s}.jac-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.jac-btn{border:1px solid #574833;background:#1a1a1a;color:#fff;border-radius:9px;padding:9px 10px;font-weight:850}.jac-btn.primary{background:#741d1d;border-color:#a87b32}.jac-btn.gold{background:#3c311d;border-color:#8a6a2f;color:#f7e3a4}.jac-btn:disabled{opacity:.45}.jac-mini{color:#aaa097;font-size:9.5px}.jac-good{color:#b9d9b8}.jac-warn{color:#e4bd72}.jac-bad{color:#e6a3a3}.jac-log{max-height:120px;overflow:auto;background:#080808;border-radius:8px;padding:7px;font:9.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;color:#c9c1b7}.jac-quality{font-weight:950}.jac-quality.A{color:#b9d9b8}.jac-quality.B{color:#e3d184}.jac-quality.C{color:#e4b36f}.jac-quality.D{color:#e6a3a3}.jac-select{background:#0d0d0d;color:#fff;border:1px solid #554936;border-radius:8px;padding:8px}.jac-kv{display:grid;grid-template-columns:110px 1fr;gap:3px 8px;font-size:10px}.jac-kv span:nth-child(odd){color:#978f85}.jac-sep{height:1px;background:#2b251e;margin:8px 0}.jac-note{background:#0d0d0d;border-left:3px solid #8a6a2f;padding:7px 8px;border-radius:6px;color:#cfc4b6;font-size:10px}.jac-map{display:grid;grid-template-columns:repeat(30,1fr);gap:2px;margin-top:8px}.jac-dot{height:7px;border-radius:2px;background:#252525}.jac-dot.ok{background:#4e7852}.jac-dot.warn{background:#99713d}.jac-dot.fail{background:#8b3b3b}.jac-legend{display:flex;gap:9px;flex-wrap:wrap;color:#9e958b;font-size:9px;margin-top:6px}.jac-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:3px;vertical-align:-1px}
.jac-night{border-color:#39445f;background:linear-gradient(180deg,#111522,#101010)}.jac-night-title{display:flex;justify-content:space-between;gap:8px;align-items:center}.jac-night-title b{color:#cbd8ff}.jac-night-status{margin-top:7px;color:#aeb8ce;font-size:10px;line-height:1.55}.jac-night .jac-btn.primary{background:#27345f;border-color:#6170a0}.jac-export-mask{display:none;position:fixed;z-index:2147483647;inset:0;background:#000c;padding:max(12px,env(safe-area-inset-top)) 10px max(12px,env(safe-area-inset-bottom));align-items:center;justify-content:center}.jac-export-mask.open{display:flex}.jac-export-box{width:min(720px,100%);max-height:92vh;overflow:auto;background:#111;border:1px solid #8a6a2f;border-radius:14px;padding:12px;box-shadow:0 18px 70px #000}.jac-export-title{font-size:16px;font-weight:950;color:#f5e6b8}.jac-export-meta{font-size:10px;color:#aaa097;margin:4px 0 8px}.jac-export-text{width:100%;height:180px;resize:vertical;background:#070707;color:#eee;border:1px solid #50432f;border-radius:9px;padding:8px;font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-user-select:text;user-select:text}.jac-export-status{min-height:20px;margin-top:7px;font-size:11px;color:#d9c899}.jac-export-help{font-size:9.5px;color:#aaa097;margin-top:7px}.jac-code{width:120px;background:#080808;color:#fff;border:1px solid #6a5839;border-radius:9px;padding:9px;text-align:center;font-size:18px;font-weight:950;letter-spacing:4px}.jac-relay-status{font-size:10px;color:#b9d9b8;margin-top:7px}.jac-relay-status.bad{color:#e6a3a3}.jac-relay-status.warn{color:#e4bd72}.jac-relay-diag{margin-top:7px;border-top:1px solid #332b20;padding-top:6px}.jac-relay-diag summary{cursor:pointer;color:#d8bd75;font-size:10px;font-weight:850}.jac-relay-diag pre{white-space:pre-wrap;word-break:break-word;background:#080808;border-radius:7px;padding:7px;color:#c9c1b7;font:9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;max-height:190px;overflow:auto}
</style><div class="jac-head"><div class="jac-headrow"><div><div class="jac-title">アナスロ取得センター <span style="color:#c8a95d">${VERSION}</span></div><div class="jac-sub" id="jacShop"></div></div><button class="jac-close" id="jacClose">隠す</button></div></div><div class="jac-body">
<div class="jac-card gold"><div class="jac-row" style="justify-content:space-between"><b id="jacMode">準備中…</b><span class="jac-mini" id="jacPace"></span></div><div class="jac-grid" style="margin-top:7px"><div class="jac-stat"><small>180日構築</small><b id="jac180">—</b></div><div class="jac-stat"><small>今回</small><b id="jacSession">—</b></div><div class="jac-stat"><small>保存総日数</small><b id="jacStored">—</b></div><div class="jac-stat"><small>品質</small><b id="jacQuality">—</b></div></div><div class="jac-progress"><i id="jacProgress"></i></div><div class="jac-mini" id="jacEta" style="margin-top:5px">準備中…</div></div>
<div class="jac-card"><div class="jac-row"><button class="jac-btn primary" id="jacStart">取得開始</button><button class="jac-btn" id="jacPause" disabled>一時停止</button><button class="jac-btn" id="jacStop" disabled>中止</button><select class="jac-select" id="jacSize"><option value="auto">店舗プロファイルに任せる</option><option value="15">15日</option><option value="20">20日</option><option value="30">30日</option><option value="40">40日</option><option value="50">50日</option><option value="60">60日</option><option value="75">75日</option><option value="90">90日</option></select></div><div class="jac-note" id="jacCurrent" style="margin-top:8px">最新側の不足日から自動で選ぶよ。</div><div class="jac-note" id="jacCooldown" style="margin-top:6px;color:#c9b98c">安全装置：直近15分のアナスロアクセスは最大30回。上限時は自動待機して再開するよ。</div></div>
<div class="jac-card jac-night"><div class="jac-night-title"><b>🌙 夜間自動メンテナンス</b><span class="jac-mini">直近13か月＋全店舗</span></div><div class="jac-night-status" id="jacNightStatus">不足日を確認中…</div><div class="jac-row" style="margin-top:8px"><button class="jac-btn primary" id="jacNightStart">夜間自動メンテナンス開始</button><button class="jac-btn" id="jacNightRetry">残りを再計算</button></div><div class="jac-mini" style="margin-top:7px">夜間本体は1件完了ごと25〜35秒を均等ランダム待機し、15分30回のローカル制限は使わない。完了後は①失敗日再回収 → ②登録済み他店舗の最新差分 → ③新規登録店舗の13か月初回構築 → ④全店舗の未送信一括送信まで自動で進む。403/429は強いバックオフを維持。</div></div>
<div class="jac-card gold"><div class="jac-row" style="justify-content:space-between"><b>全店舗メンテナンス</b><span class="jac-mini" id="jacRegistryCount">登録0店</span></div><div class="jac-note" id="jacRegistryStatus" style="margin-top:7px">登録店舗を確認中…</div><div class="jac-row" style="margin-top:8px"><button class="jac-btn primary" id="jacAllLatest">登録済み店舗の最新差分を取得</button><button class="jac-btn gold" id="jacAllUnsent">未送信を全店舗送信</button><button class="jac-btn" id="jacAddShop">新規店舗を登録</button></div><div class="jac-mini" style="margin-top:7px">最新差分取得は通常の30回/15分制限内。新規登録は「地域 → 都道府県 → 店舗」でアナスロの一覧を読み込み、初回13か月構築待ちとして追加する。</div></div>
<div class="jac-card"><b>店舗プロファイル</b><div class="jac-kv" id="jacProfile" style="margin-top:7px"></div><div class="jac-sep"></div><div class="jac-row"><button class="jac-btn gold" id="jacExportSession">今回分JSON</button><button class="jac-btn gold" id="jacExport180">保存済み最新180日JSON</button><button class="jac-btn gold" id="jacExport13">保存済み最新13か月JSON</button><button class="jac-btn" id="jacShare">共有/保存</button></div><div class="jac-mini" style="margin-top:6px">各日データはアナスロ側IndexedDBに保存。JSON保存/コピーはバックアップ経路として残してあるよ。</div></div>
<div class="jac-card gold"><b>設定判別ツール連携</b><div id="jacRelayUnlinked" style="margin-top:8px"><div class="jac-mini">設定判別ツールで発行した6桁コードを初回だけ入力。</div><div class="jac-row" style="margin-top:7px"><input id="jacRelayCode" class="jac-code" inputmode="numeric" maxlength="6" placeholder="000000"><button class="jac-btn gold" id="jacRelayPair">連携する</button></div></div><div id="jacRelayLinked" style="display:none;margin-top:8px"><div class="jac-row"><button class="jac-btn primary" id="jacRelaySend">最新180日をツールへ送信</button><button class="jac-btn gold" id="jacRelaySend13">最新13か月をツールへ送信</button><button class="jac-btn" id="jacRelayForget">このSafariの連携を解除</button></div></div><div id="jacRelayStatus" class="jac-relay-status"></div><details id="jacRelayDiagWrap" class="jac-relay-diag" style="display:none"><summary>通信エラー詳細</summary><pre id="jacRelayDiag"></pre></details></div>
<div class="jac-card"><div class="jac-row" style="justify-content:space-between"><b>180日取得マップ</b><span class="jac-mini">左上が新しい日</span></div><div class="jac-map" id="jacMap"></div><div class="jac-legend"><span><i style="background:#4e7852"></i>取得済み</span><span><i style="background:#99713d"></i>品質注意</span><span><i style="background:#8b3b3b"></i>直近失敗</span><span><i style="background:#252525"></i>未取得</span></div></div>
<div class="jac-card"><div class="jac-row" style="justify-content:space-between"><b>品質・ログ</b><span class="jac-mini" id="jacWake">画面維持：—</span></div><div id="jacWarnings" class="jac-mini" style="margin:6px 0"></div><div class="jac-log" id="jacLog">起動したよ</div></div>
<div class="jac-card"><details><summary style="color:#d8bd75;font-weight:850">プロジェクト設定</summary><div style="margin-top:8px" class="jac-kv"><span>基準日</span><b id="jacAnchor">—</b><span>対象</span><b>基準日から180日</b><span>取得順</span><b>最新の未取得日 → 過去</b></div><div class="jac-row" style="margin-top:8px"><button class="jac-btn" id="jacResetProject">180日構築を今日基準でやり直す</button><button class="jac-btn" id="jacClearCheckpoint">中断状態だけ破棄</button><button class="jac-btn" id="jacExportAll">全保存データJSON</button></div></details></div>
</div>`;
document.body.appendChild(panel);
const $=id=>document.getElementById(id);
const exportMask=document.createElement('div');exportMask.id='jacExportMask';exportMask.className='jac-export-mask';exportMask.innerHTML=`<div class="jac-export-box"><div class="jac-export-title" id="jacExportTitle">JSON出力</div><div class="jac-export-meta" id="jacExportMeta"></div><textarea class="jac-export-text" id="jacExportText" readonly autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea><div class="jac-row" style="margin-top:8px"><button class="jac-btn gold" id="jacExportCopy">JSONをコピー</button><button class="jac-btn" id="jacExportShare">共有/ファイル保存</button><button class="jac-btn" id="jacExportSelect">全文を選択</button><button class="jac-btn" id="jacExportClose">閉じる</button></div><div class="jac-export-status" id="jacExportStatus"></div><div class="jac-export-help">iPhoneで自動コピーできない時は「全文を選択」→ 選択部分を長押し →「コピー」で確実にコピーできる。ファイルで渡すなら「共有/ファイル保存」を使ってね。</div></div>`;document.body.appendChild(exportMask);
const shopMask=document.createElement('div');shopMask.id='jacShopMask';shopMask.className='jac-export-mask';shopMask.innerHTML=`<div class="jac-export-box"><div class="jac-export-title">新規店舗を登録</div><div class="jac-export-meta">アナスロの店舗一覧をその場で読み込む。候補が取れない場合は店舗の日別URLを直接貼って登録できる。</div><div class="jac-kv"><span>地域</span><select class="jac-select" id="jacCatalogRegion"></select><span>都道府県</span><select class="jac-select" id="jacCatalogPref"></select><span>店舗</span><select class="jac-select" id="jacCatalogShop"><option value="">一覧を読み込んでね</option></select></div><div class="jac-row" style="margin-top:8px"><button class="jac-btn gold" id="jacCatalogLoad">店舗一覧を読み込む</button><button class="jac-btn primary" id="jacCatalogRegister">選択店舗を登録</button></div><div class="jac-sep"></div><div class="jac-mini">直接登録（例：現在見ている店舗の日別データURL）</div><div class="jac-row" style="margin-top:5px;align-items:stretch"><input id="jacCatalogUrl" type="url" style="flex:1;min-width:0;background:#080808;color:#fff;border:1px solid #554936;border-radius:8px;padding:9px;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default" inputmode="url" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="https://ana-slo.com/2026-08-30-xxxxx-data/"><button class="jac-btn gold" id="jacCatalogPaste" type="button">貼り付け</button></div><div class="jac-row" style="margin-top:7px"><button class="jac-btn" id="jacCatalogUrlRegister">URLから登録</button><button class="jac-btn" id="jacCatalogClose">閉じる</button></div><div class="jac-export-status" id="jacCatalogStatus"></div></div>`;document.body.appendChild(shopMask);
function fillCatalogRegions(){const r=$('jacCatalogRegion'),p=$('jacCatalogPref');r.innerHTML=Object.keys(REGION_PREFECTURES).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');const fill=()=>{const a=REGION_PREFECTURES[r.value]||[];p.innerHTML=a.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');$('jacCatalogShop').innerHTML='<option value="">一覧を読み込んでね</option>'};r.onchange=fill;fill()}
function catalogLabel(v=''){return String(v||'').replace(/\s+/g,' ').trim()}
function catalogLabelIsShop(v=''){const t=catalogLabel(v);if(!t||t.length>100)return false;if(/^\d{1,2}\/\d{1,2}(?:\s*\([^)]{1,6}\))?$/.test(t))return false;if(/^20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}(?:\s*\([^)]{1,6}\))?$/.test(t))return false;if(/^(?:詳細|データ|データを見る|他の日付のデータを見る|全データ一覧|全てのスケジュールはこちら|こちら|見る|Next|Previous)$/i.test(t))return false;return true}
function catalogListSlug(pathname,prefecture=''){try{const path=decodeURI(String(pathname||'')),prefix=`/ホールデータ/${prefecture}/`;if(!path.startsWith(prefix)||!path.endsWith('-データ一覧/'))return'';return path.slice(prefix.length,-'-データ一覧/'.length).replace(/^\/+|\/+$/g,'')}catch{return''}}
function parseCatalogShops(html,prefecture=''){const listed=new Map(),daily=new Map();try{const d=new DOMParser().parseFromString(html,'text/html');for(const a of d.querySelectorAll('a[href]')){let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}const txt=catalogLabel(a.textContent);const listSlug=catalogListSlug(u.pathname,prefecture);if(listSlug){const name=catalogLabelIsShop(txt)?txt:displayNameFromSlug(listSlug);if(!listed.has(listSlug))listed.set(listSlug,{slug:listSlug,shopName:name,prefecture});continue}let path;try{path=decodeURI(u.pathname)}catch{continue}const m=path.match(/^\/(\d{4}-\d{2}-\d{2})-(.+)-data\/?$/);if(!m)continue;const sg=m[2],name=catalogLabelIsShop(txt)?txt:displayNameFromSlug(sg);if(!daily.has(sg))daily.set(sg,{slug:sg,shopName:name,prefecture})}}catch{}const out=listed.size?listed:daily;if(!out.size){const re=/href=["']([^"']*\/(\d{4}-\d{2}-\d{2})-([^"'/?#]+)-data\/?)["']/gi;let m;while((m=re.exec(html))){const sg=m[3];if(!out.has(sg))out.set(sg,{slug:sg,shopName:displayNameFromSlug(sg),prefecture})}}return [...out.values()].sort((a,b)=>a.shopName.localeCompare(b.shopName,'ja'))}
async function loadCatalogShops(){const pref=$('jacCatalogPref').value;if(!pref)return;$('jacCatalogLoad').disabled=true;$('jacCatalogStatus').textContent=`${pref} の店舗一覧を読み込み中…`;try{await waitForAnaAccessSlot();recordAnaAccess();const url=new URL(`/ホールデータ/${encodeURIComponent(pref)}/`,location.origin).href,r=await fetch(url,{credentials:'include',cache:'no-store',redirect:'follow'});if(!r.ok){const e=new Error(`HTTP ${r.status}`);e.httpStatus=r.status;throw e}const html=await r.text(),shops=parseCatalogShops(html,pref);$('jacCatalogShop').innerHTML=shops.length?shops.map(x=>`<option value="${esc(x.slug)}" data-name="${esc(x.shopName)}">${esc(x.shopName)}</option>`).join(''):'<option value="">候補を検出できなかった</option>';$('jacCatalogStatus').textContent=shops.length?`✅ ${shops.length}店舗を検出。選んで登録してね。`:'⚠️ この一覧ページから店舗候補を検出できなかった。下のURL直接登録を使ってね。'}catch(e){$('jacCatalogStatus').textContent=`⚠️ 店舗一覧を取得できなかった：${e?.message||e}`}finally{$('jacCatalogLoad').disabled=false}}
function registerCatalogSelection(){const sel=$('jacCatalogShop'),sg=sel.value;if(!sg){$('jacCatalogStatus').textContent='⚠️ 店舗を選んでね';return}const opt=sel.options?.[sel.selectedIndex],name=opt?.dataset?.name||opt?.textContent||displayNameFromSlug(sg),pref=$('jacCatalogPref').value;upsertRegisteredShop({slug:sg,shopName:name,prefecture:pref,initialBuildDone:false});$('jacCatalogStatus').textContent=`✅ ${name} を登録。夜間メンテで13か月初回構築するよ。`;refreshMaintenanceUi()}
function parseDirectShopUrl(raw){try{const u=new URL(String(raw||'').trim(),location.origin);if(!ALLOWED_HOSTS.includes(u.hostname.toLowerCase()))return null;const m=decodeURI(u.pathname).match(/^\/(\d{4}-\d{2}-\d{2})-(.+)-data\/?$/);return m?{slug:m[2],shopName:displayNameFromSlug(m[2])}:null}catch{return null}}
function catalogUrlFeedback(raw,{pasted=false}={}){const row=parseDirectShopUrl(raw);$('jacCatalogStatus').textContent=row?`✅ ${row.shopName} のURL${pasted?'を貼り付けたよ':'を確認できたよ'}。このまま「URLから登録」でOK。`:`⚠️ ${pasted?'貼り付けた内容が':'入力内容が'}アナスロの日別データURLではないみたい。`;return row}
async function pasteCatalogUrl(){const input=$('jacCatalogUrl');input.focus();try{if(!navigator.clipboard?.readText)throw new Error('clipboard_unavailable');const text=String(await navigator.clipboard.readText()||'').trim();if(!text){$('jacCatalogStatus').textContent='⚠️ クリップボードが空みたい';return}input.value=text;catalogUrlFeedback(text,{pasted:true})}catch(e){$('jacCatalogStatus').textContent='📋 自動貼り付けが使えなかった。URL欄を長押し →「ペースト」なら貼れるよ。';try{input.setSelectionRange(input.value.length,input.value.length)}catch{}}}
function registerCatalogUrl(){const row=parseDirectShopUrl($('jacCatalogUrl').value);if(!row){$('jacCatalogStatus').textContent='⚠️ アナスロの日別データURLを貼ってね';return}upsertRegisteredShop({...row,initialBuildDone:false});$('jacCatalogStatus').textContent=`✅ ${row.shopName} を登録。夜間メンテで13か月初回構築するよ。`;refreshMaintenanceUi()}
function openShopCatalog(){if(running)return;fillCatalogRegions();$('jacCatalogStatus').textContent='地域と都道府県を選んで「店舗一覧を読み込む」を押してね。';shopMask.classList.add('open')}

$('jacClose').onclick=()=>panel.style.display='none';
$('jacShop').textContent=`${shopName} / ${slug}`;

let stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));
upsertRegisteredShop({slug,shopName,initialBuildDone:true,lastDate:stored.at(-1)?.date||'',lastFetchedAt:stored.at(-1)?.savedAt||0});
if(!profile.anchorDate){profile.anchorDate=minDate(pageDate||jstYesterday(),jstYesterday());saveProfile(profile)}
let policy=recommendedPolicy(stored),plan=buildPlan(stored,policy);
let running=false,paused=false,stopped=false,wakeLock=null,startAt=0,sessionSuccess=[],sessionFailed=[],sessionQuality=[],requestDurations=[],currentDate='',currentWait=0,runMode='normal',nightPlan=[],nightSkipped=[],accessUiTimer=null,lastNightFinishReason='';

const logs=[];
function log(msg,kind=''){const line=`${new Date().toLocaleTimeString('ja-JP',{hour12:false})} ${msg}`;logs.push(line);if(logs.length>80)logs.shift();$('jacLog').textContent=logs.join('\n');$('jacLog').scrollTop=$('jacLog').scrollHeight;if(kind==='bad')console.warn('[JugglerAna]',msg);else console.log('[JugglerAna]',msg)}
function sessionGrade(){if(!sessionQuality.length)return'—';const s=Math.round(avg(sessionQuality.map(x=>x.score)));return s>=90?'A':s>=75?'B':s>=60?'C':'D'}
function policyFromSize(){const v=$('jacSize').value;if(v==='auto')return policy.session;return Math.min(MAX_SESSION,Math.max(1,+v||policy.session))}
function buildNightPlan(){const have=new Set(stored.map(x=>x.date)),range=nightRange(),cp=loadNightCheckpoint();if(cp&&cp.slug===slug&&Array.isArray(cp.dates)&&cp.status!=='complete'){const rem=cp.dates.filter(d=>!have.has(d));if(rem.length)return rem}return range.filter(d=>!have.has(d))}
async function refreshPlan(force=false){stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));policy=recommendedPolicy(stored);let p=buildPlan(stored,policy);if(force||!running){const n=policyFromSize();p.dates=p.dates.slice(0,n);p.originalDates=p.originalDates.slice(0,n)}plan=p;nightPlan=buildNightPlan();render();}
function updateAccessUi(){
  if(accessUiTimer){clearTimeout(accessUiTimer);accessUiTimer=null}
  const st=accessRateState(),note=$('jacCooldown');if(!note)return;
  if(st.wait>0){note.innerHTML=`🧊 アクセス上限 <b>${st.count}/${ACCESS_LIMIT}</b>（直近15分）。あと <b>${fmtCountdown(st.wait)}</b> で1枠復活。実行中なら自動で再開するよ。`;if(!running){$('jacStart').disabled=true;$('jacStart').textContent=`アクセス待ち ${fmtCountdown(st.wait)}`;$('jacNightStart').disabled=true;$('jacNightStart').textContent=`アクセス待ち ${fmtCountdown(st.wait)}`;}accessUiTimer=setTimeout(updateAccessUi,1000);return}
  note.innerHTML=`🛡️ 取得安全装置：直近15分 <b>${st.count}/${ACCESS_LIMIT}</b> アクセス。最大${ACCESS_LIMIT}回まで。`;
  if(!running){$('jacStart').disabled=!plan.dates.length;$('jacStart').textContent='取得開始';$('jacNightStart').disabled=!nightPlan.length;$('jacNightStart').textContent='夜間取得を開始'}
  if(st.count>0){const ms=Math.max(250,Math.min(1000,st.nextAt-Date.now()+20));accessUiTimer=setTimeout(updateAccessUi,ms)}
}

function render(){
  const projectHave=new Set(stored.map(x=>x.date));const range=dateRangeBack(profile.anchorDate,TARGET_DAYS),progress=range.filter(d=>projectHave.has(d)).length;const total=plan.dates.length,done=sessionSuccess.length,fail=sessionFailed.length,pct=total?Math.round(100*(done+fail)/total):progress>=TARGET_DAYS?100:0;
  $('jac180').textContent=`${progress}/${TARGET_DAYS}`;$('jacSession').textContent=running?`${done+fail}/${total}`:`${total}日`;$('jacStored').textContent=String(stored.length);const g=sessionGrade();$('jacQuality').textContent=g;$('jacQuality').className='jac-quality '+(g==='—'?'':g);$('jacProgress').style.width=pct+'%';
  $('jacMode').textContent=plan.mode==='resume'?'前回の続き':progress<TARGET_DAYS?'180日構築中':'差分メンテナンス';$('jacPace').textContent=`${policy.label} / 推奨${policy.session}日 / ${Math.round(policy.minWait/1000)}〜${Math.round(policy.maxWait/1000)}秒`;
  $('jacEta').title=policy.reason||'';
  const elapsed=startAt?Date.now()-startAt:0,avgDay=done?elapsed/done:NaN,remain=Math.max(0,total-done-fail),eta=Number.isFinite(avgDay)?avgDay*remain:remain*((policy.minWait+policy.maxWait)/2+1500);$('jacEta').textContent=running?`経過 ${fmtTime(elapsed)} / 残り目安 ${fmtTime(eta)}${paused?' / 一時停止中':''}`:`${plan.dates.length?`次回 ${plan.dates[0]} から ${plan.dates.length}日`:'取得する不足日はないよ'}`;
  $('jacCurrent').innerHTML=running?`現在：<b>${esc(currentDate||'待機中')}</b>${currentWait?` / 次まで ${fmtTime(currentWait)}`:''}`:`今回候補：${plan.dates.length?esc(plan.dates.slice(0,3).join(' / '))+(plan.dates.length>3?' …':''):'なし'}`;
  $('jacProfile').innerHTML=`<span>学習レベル</span><b>${policy.learningLevel}（${policy.sessionCount}セッション）</b><span>推奨セッション</span><b>${policy.session}日 / 上限${policy.cap}日</b><span>推奨根拠</span><b>${esc(policy.reason)}</b><span>安定完走ライン</span><b>${policy.stableSession?policy.stableSession+'日×2回以上':'まだ未確定'}</b><span>連続完走</span><b>${policy.consecutiveClean}回</b><span>セッション成功率</span><b>${Number.isFinite(policy.successRate)?Math.round(policy.successRate*100)+'%':'未学習'}</b><span>平均ジャグ台数</span><b>${Number.isFinite(policy.avgMachines)?policy.avgMachines.toFixed(1):'未学習'}</b><span>平均応答</span><b>${Number.isFinite(policy.avgMs)?Math.round(policy.avgMs)+'ms':'未学習'}</b><span>推奨ペース</span><b>${policy.label}</b><span>前回</span><b>${profile.sessions?.length?`${profile.sessions.at(-1).success}/${profile.sessions.at(-1).planned}日 / ${profile.sessions.at(-1).reason||'—'} / 品質${profile.sessions.at(-1).quality||'—'}`:'—'}</b><span>IndexedDB</span><b>${db?'有効':'使用不可'}</b>`;
  const warns=uniq(sessionQuality.flatMap(x=>x.warnings||[]));$('jacWarnings').innerHTML=warns.length?`<span class="jac-warn">注意：${esc(warns.slice(0,5).join(' / '))}</span>`:'<span class="jac-good">現在、大きな品質警告なし</span>';
  const byDate=new Map(stored.map(x=>[x.date,x])),failures=profile.failures||{};const mapDates=dateRangeBack(profile.anchorDate,TARGET_DAYS);$('jacMap').innerHTML=mapDates.map(d=>{const rec=byDate.get(d),f=failures[d];let cls='';if(rec)cls=(rec.quality?.grade==='C'||rec.quality?.grade==='D')?'warn':'ok';else if(f)cls='fail';const title=rec?`${d} / ${rec.machines?.length||0}台 / 品質${rec.quality?.grade||'—'}`:f?`${d} / 失敗 ${f.httpStatus||''} ${f.message||''}`:`${d} / 未取得`;return `<span class="jac-dot ${cls}" title="${esc(title)}"></span>`}).join('');
  $('jacStart').disabled=running||!plan.dates.length;$('jacPause').disabled=!running;$('jacStop').disabled=!running;$('jacPause').textContent=paused?'再開':'一時停止';$('jacSize').disabled=running;$('jacAnchor').textContent=profile.anchorDate||'—';
  const nr=nightRange(),nhave=nr.length-nightPlan.length,nightDone=runMode==='night'?sessionSuccess.length:0,nightFail=runMode==='night'?nightSkipped.length:0;
  $('jacNightStart').disabled=running;$('jacNightRetry').disabled=running;$('jacNightStart').textContent=running&&String(runMode).startsWith('night')?'夜間自動メンテ中…':'夜間自動メンテナンス開始';
  $('jacNightStatus').innerHTML=running&&String(runMode).startsWith('night')?`進行 ${nightDone+nightFail}/${nightPlan.length}日 / 成功${nightDone} / 要再取得${nightFail}<br>現在 ${esc(currentDate||'待機中')}${currentWait?` / 次まで ${fmtTime(currentWait)}`:''}`:`直近13か月 ${nr.length}日中 <b>${nhave}日取得済み</b> / 未取得 ${nightPlan.length}日${nightPlan.length?`<br>25〜35秒/件で取得後、そのまま全店舗メンテへ移行`:' / すべて取得済み'}`;
  updateAccessUi();
}
async function acquireWake(){if(!('wakeLock'in navigator)){ $('jacWake').textContent='画面維持：非対応';return}try{wakeLock=await navigator.wakeLock.request('screen');$('jacWake').textContent='画面維持：ON';wakeLock.addEventListener?.('release',()=>{$('jacWake').textContent='画面維持：OFF'})}catch(e){$('jacWake').textContent='画面維持：取得できず'}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(running&&!wakeLock)acquireWake();updateAccessUi()});
async function waitSafe(ms,label){let left=ms;while(left>0&&!stopped){while(paused&&!stopped){currentWait=left;render();await sleep(250)}const step=Math.min(500,left);await sleep(step);left-=step;currentWait=left;render()}currentWait=0;if(label)log(`${label} 終了`)}
function fetchUrlForShop(date,targetSlug){return `https://ana-slo.com/${date}-${targetSlug}-data/`;}
function fetchUrl(date){return fetchUrlForShop(date,slug);}
async function fetchDayForShop(date,targetSlug=slug,targetStored=stored,opts={}){const url=fetchUrlForShop(date,targetSlug),t0=performance.now();let html='',status=200,statusText='OK',finalUrl=url;
  if(targetSlug===slug&&location.pathname===new URL(url).pathname){html=document.documentElement.outerHTML;finalUrl=location.href.split('#')[0]}else{if(!opts.bypassRateLimit){await waitForAnaAccessSlot();recordAnaAccess()}const r=await fetch(url,{credentials:'include',cache:'no-store',redirect:'follow'});status=r.status;statusText=r.statusText;finalUrl=r.url||url;if(status===403||status===429){const e=new Error(`HTTP ${status} ${statusText}`);e.httpStatus=status;throw e}if(!r.ok){const e=new Error(`HTTP ${status} ${statusText}`);e.httpStatus=status;throw e}html=await r.text()}
  const ms=Math.round(performance.now()-t0),expected=median((targetStored||[]).slice(-30).map(x=>x.machines?.length||0));const day=parseHtml(html,date,finalUrl,expected);if(!day.machines.length){const e=new Error('HTTP 200だが対象13機種（ジャグラー8＋ハナハナ5）の台データを検出できなかった');e.httpStatus=status;e.parseQuality=day.quality;throw e}return{day,ms,httpStatus:status};
}
async function fetchDay(date,opts={}){return fetchDayForShop(date,slug,stored,opts)}
function checkpoint(){return {version:3,mode:'normal',slug,shopName,status:running?'running':'paused',createdAt:startAt||Date.now(),updatedAt:Date.now(),dates:plan.originalDates||plan.dates,successDates:[...sessionSuccess],failed:[...sessionFailed],policy:{...policy}}}
function nightCheckpoint(dates){return {version:1,mode:'night',slug,shopName,status:running?'running':'paused',createdAt:startAt||Date.now(),updatedAt:Date.now(),dates:[...dates],successDates:[...sessionSuccess],failed:[...nightSkipped]}}
function buildBulk(days,requested){const sorted=[...days].sort((a,b)=>b.date.localeCompare(a.date));return{format:'juggler-external-import-bulk',version:5,source:'ana-slo',shop:shopName,requestedDays:requested??sorted.length,successDays:sorted.length,failedDays:[],days:sorted.map(d=>({date:d.date,sourceUrl:d.sourceUrl,machines:d.machines}))};}
function relayCompactDay(d){return{date:d.date,sourceUrl:d.sourceUrl||'',machines:(d.machines||[]).map(r=>({machine:r.machine,category:r.category||(['houou','king','dragon','star','newkingv'].includes(r.machine)?'hanahana':'juggler'),sourceMachineName:r.sourceMachineName||'',tableNo:r.tableNo,games:+r.games||0,diff:r.diff==null?null:+r.diff,bb:+r.bb||0,rb:+r.rb||0}))}}
function relayPayloadForShop(days,targetShop,targetSlug){const sorted=[...days].sort((a,b)=>b.date.localeCompare(a.date));return{format:'juggler-external-import-bulk',version:6,source:'ana-slo',shop:targetShop,sourceStoreId:targetSlug,requestedDays:sorted.length,successDays:sorted.length,failedDays:[],days:sorted.map(relayCompactDay)}}
function relayPayload(days){return relayPayloadForShop(days,shopName,slug)}
function relayChunksForShop(days,targetShop,targetSlug){const sorted=[...days].sort((a,b)=>b.date.localeCompare(a.date)),out=[];let cur=[];for(const day of sorted){const next=[...cur,day],payload=relayPayloadForShop(next,targetShop,targetSlug),bytes=new Blob([JSON.stringify(payload)]).size;if(cur.length&&(next.length>RELAY_CHUNK_DAYS||bytes>RELAY_CHUNK_BYTES)){out.push(relayPayloadForShop(cur,targetShop,targetSlug));cur=[day]}else cur=next}if(cur.length)out.push(relayPayloadForShop(cur,targetShop,targetSlug));return out}
function relayChunks(days){return relayChunksForShop(days,shopName,slug)}
let relayBridgeFrame=null,relayBridgeReady=null,relayLastDiag=null;
function relayDiagText(d){if(!d)return'';const rows=[['時刻',new Date(d.at||Date.now()).toLocaleString('ja-JP')],['段階',d.stage||'不明'],['通信方式',d.transport||'不明'],['操作',d.action||'不明'],['通信先',d.url||RELAY_API],['現在ページ',location.href],['origin',location.origin],['online',navigator.onLine===false?'false':'true'],['HTTP',d.httpStatus?`${d.httpStatus}${d.httpStatusText?' '+d.httpStatusText:''}`:'応答なし'],['server code',d.serverCode||'—'],['例外名',d.errorName||'—'],['内容',d.message||'—'],['応答先頭',d.responseSnippet||'—']];return rows.map(([k,v])=>`${k}: ${v}`).join('\n')}
function relaySetDiag(d){relayLastDiag=d||null;const w=$('jacRelayDiagWrap'),p=$('jacRelayDiag');if(!w||!p)return;if(!d){w.style.display='none';w.open=false;p.textContent='';return}p.textContent=relayDiagText(d);w.style.display='block';w.open=true;log(`連携エラー詳細 / ${d.stage||'?'} / ${d.errorName||''} ${d.message||''}`,'bad')}
function relayErr(message,d={}){const e=new Error(message);e.relayDiag={at:Date.now(),url:RELAY_API,action:d.action||'',...d,message:String(message||d.message||'通信エラー')};return e}
function relayEnsureBridge(){if(relayBridgeReady)return relayBridgeReady;relayBridgeReady=new Promise((resolve,reject)=>{let done=false,timer=null;const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('message',onmsg);fn(v)};const onmsg=e=>{if(e.origin!==RELAY_BRIDGE_ORIGIN||e.source!==relayBridgeFrame?.contentWindow)return;if(e.data?.type==='juggler-relay-bridge-ready')finish(resolve,true)};window.addEventListener('message',onmsg);try{relayBridgeFrame=document.createElement('iframe');relayBridgeFrame.src=RELAY_BRIDGE+'?v=4500&t='+Date.now();relayBridgeFrame.style.cssText='position:fixed;width:1px;height:1px;left:-100px;top:-100px;border:0;opacity:.01;pointer-events:none';relayBridgeFrame.setAttribute('aria-hidden','true');relayBridgeFrame.onerror=()=>finish(reject,relayErr('中継ページを読み込めなかった',{stage:'bridge-load',transport:'iframe',errorName:'BridgeLoadError'}));document.body.appendChild(relayBridgeFrame);timer=setTimeout(()=>finish(reject,relayErr('中継ページの準備がタイムアウトした',{stage:'bridge-ready',transport:'iframe',errorName:'TimeoutError'})),8000)}catch(e){finish(reject,relayErr(e?.message||String(e),{stage:'bridge-create',transport:'iframe',errorName:e?.name||'Error'}))}});relayBridgeReady.catch(()=>{relayBridgeReady=null;try{relayBridgeFrame?.remove()}catch{}relayBridgeFrame=null});return relayBridgeReady}
async function relayCallBridge(body){await relayEnsureBridge();return await new Promise((resolve,reject)=>{const id=`${Date.now()}-${Math.random().toString(36).slice(2,9)}`,started=Date.now();let done=false;const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('message',onmsg);fn(v)};const onmsg=e=>{if(e.origin!==RELAY_BRIDGE_ORIGIN||e.source!==relayBridgeFrame?.contentWindow)return;const d=e.data;if(d?.type!=='juggler-relay-bridge-result'||d.id!==id)return;if(d.ok&&d.json?.ok)return finish(resolve,d.json);const msg=d.json?.message||d.errorMessage||(d.httpStatus===404?'Launcher連携用の中継機能がNetlifyにまだ反映されてないみたい。v4.5.0のプロジェクト全体をデプロイしてね':d.httpStatus?`中継API HTTP ${d.httpStatus}`:'中継ページからAPI通信できなかった');finish(reject,relayErr(msg,{stage:d.httpStatus?'api-response':'bridge-api-fetch',transport:'bridge',action:body?.action||'',httpStatus:+d.httpStatus||0,httpStatusText:d.httpStatusText||'',serverCode:d.json?.code||'',responseSnippet:String(d.text||'').slice(0,500),durationMs:Date.now()-started,errorName:d.errorName||'RelayResponseError'}))};window.addEventListener('message',onmsg);const timer=setTimeout(()=>finish(reject,relayErr('中継APIの応答がタイムアウトした',{stage:'api-wait',transport:'bridge',action:body?.action||'',durationMs:Date.now()-started,errorName:'TimeoutError'})),RELAY_TIMEOUT_MS);try{relayBridgeFrame.contentWindow.postMessage({type:'juggler-relay-bridge-call',id,body},RELAY_BRIDGE_ORIGIN)}catch(e){finish(reject,relayErr(e?.message||String(e),{stage:'bridge-postMessage',transport:'bridge',action:body?.action||'',errorName:e?.name||'Error'}))}})}
async function relayCallDirect(body){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),RELAY_TIMEOUT_MS),started=Date.now();try{const r=await fetch(RELAY_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:ctl.signal});const text=await r.text();let j=null;try{j=text?JSON.parse(text):null}catch{}if(!r.ok||!j?.ok){const msg=j?.message||(r.status===404?'Launcher連携用の中継機能がNetlifyにまだ反映されてないみたい。v4.5.0のプロジェクト全体をデプロイしてね':`中継API HTTP ${r.status}`);throw relayErr(msg,{stage:'api-response',transport:'direct-fallback',action:body?.action||'',httpStatus:r.status,httpStatusText:r.statusText,serverCode:j?.code||'',responseSnippet:text.slice(0,500),durationMs:Date.now()-started,errorName:'RelayResponseError'})}return j}catch(e){if(e?.relayDiag)throw e;throw relayErr(e?.message||String(e),{stage:e?.name==='AbortError'?'api-timeout':'api-fetch',transport:'direct-fallback',action:body?.action||'',durationMs:Date.now()-started,errorName:e?.name||'Error'})}finally{clearTimeout(timer)}}
async function relayCall(body){relaySetDiag(null);try{return await relayCallBridge(body)}catch(first){if(first?.relayDiag?.stage==='api-response'){relaySetDiag(first.relayDiag);throw first}try{return await relayCallDirect(body)}catch(second){const d=second?.relayDiag||{};d.bridgeFailure=first?.relayDiag||null;if(d.bridgeFailure)d.responseSnippet=(d.responseSnippet?d.responseSnippet+'\n':'')+'bridge: '+(d.bridgeFailure.message||'failed')+' / '+(d.bridgeFailure.stage||'');const e=relayErr(d.message||second?.message||'中継通信に失敗した',d);relaySetDiag(e.relayDiag);throw e}}}
function relayRender(status=''){const linked=!!relayLink;$('jacRelayUnlinked').style.display=linked?'none':'block';$('jacRelayLinked').style.display=linked?'block':'none';if(status)$('jacRelayStatus').textContent=status;else $('jacRelayStatus').textContent=linked?'✅ 設定判別ツールと連携済み':'未連携。ツール側で6桁コードを発行してね';$('jacRelayStatus').className='jac-relay-status'}
async function relayPair(){const code=String($('jacRelayCode').value||'').replace(/\D/g,'').slice(0,6);if(!/^\d{6}$/.test(code)){relayRender('⚠️ 6桁コードを入れてね');$('jacRelayStatus').className='jac-relay-status warn';return}$('jacRelayPair').disabled=true;relayRender('連携中…');try{const j=await relayCall({action:'claimPair',code});relayLink={channelId:j.channelId,senderToken:j.senderToken,linkedAt:j.linkedAt||Date.now()};saveRelayLink(relayLink);$('jacRelayCode').value='';relayRender('✅ 連携できたよ。次回からコード入力は不要')}catch(e){relayRender('⚠️ '+(e?.message||e));$('jacRelayStatus').className='jac-relay-status bad'}finally{$('jacRelayPair').disabled=false}}
async function relaySendRange(range,label,buttonId){if(!relayLink){relayRender();return}const days=(await listDays()).filter(x=>range.has(x.date)).sort((a,b)=>b.date.localeCompare(a.date));if(!days.length){relayRender('⚠️ 送信できる保存データがまだないよ');$('jacRelayStatus').className='jac-relay-status warn';return}const chunks=relayChunks(days),batchId=`${Date.now()}-${Math.random().toString(36).slice(2,10)}`,btn=$(buttonId);if(btn)btn.disabled=true;try{for(let i=0;i<chunks.length;i++){relayRender(`${label}送信中 ${i+1}/${chunks.length}（${chunks[i].days.length}日）…`);await relayCall({action:'send',channelId:relayLink.channelId,senderToken:relayLink.senderToken,batchId,chunkIndex:i+1,chunkTotal:chunks.length,payload:chunks[i]});const sentDates=new Set(chunks[i].days.map(x=>x.date));await markDaysSent(days.filter(d=>sentDates.has(d.date)),batchId)}relayRender(`✅ ${days.length}日分を送信したよ（${chunks.length}便）。設定判別ツールで「新着を受信」を押してね`);refreshMaintenanceUi()}catch(e){relayRender('⚠️ '+(e?.message||e));$('jacRelayStatus').className='jac-relay-status bad';if(/連携が無効|unauthorized/i.test(String(e?.message||''))){relayLink=null;saveRelayLink(null)}}finally{if(btn)btn.disabled=false;if(!relayLink)relayRender()}}
async function relaySendLatest(){return relaySendRange(latestExportRange(),'180日','jacRelaySend')}
async function relaySend13Months(){return relaySendRange(new Set(nightRange()),'13か月','jacRelaySend13')}

async function relaySendAllUnsent(opts={}){if(!relayLink){relayRender('⚠️ 設定判別ツールと先に連携してね');$('jacRelayStatus').className='jac-relay-status warn';return{sent:0,skipped:true}}const all=(await listUnsentDaysAll()).sort((a,b)=>a.slug.localeCompare(b.slug)||b.date.localeCompare(a.date));if(!all.length){relayRender('✅ 全店舗とも未送信データはないよ');refreshMaintenanceUi();return{sent:0}}const groups=new Map();for(const d of all){if(!groups.has(d.slug))groups.set(d.slug,[]);groups.get(d.slug).push(d)}let sent=0,shopNo=0;const batchRoot=`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;$('jacAllUnsent').disabled=true;try{for(const [sg,days] of groups){shopNo++;const reg=registeredShop(sg),name=reg?.shopName||days[0]?.shop||displayNameFromSlug(sg),chunks=relayChunksForShop(days,name,sg),batchId=`${batchRoot}-${shopNo}`;for(let i=0;i<chunks.length;i++){relayRender(`全店舗未送信：${name} ${i+1}/${chunks.length}（${chunks[i].days.length}日）…`);await relayCall({action:'send',channelId:relayLink.channelId,senderToken:relayLink.senderToken,batchId,chunkIndex:i+1,chunkTotal:chunks.length,payload:chunks[i]});const ds=new Set(chunks[i].days.map(x=>x.date)),records=days.filter(d=>ds.has(d.date));await markDaysSent(records,batchId);sent+=records.length}}relayRender(`✅ 全店舗の未送信 ${sent}日分を送信したよ`);await refreshMaintenanceUi();return{sent}}catch(e){relayRender('⚠️ '+(e?.message||e));$('jacRelayStatus').className='jac-relay-status bad';if(/連携が無効|unauthorized/i.test(String(e?.message||''))){relayLink=null;saveRelayLink(null)}throw e}finally{$('jacAllUnsent').disabled=false;if(!relayLink)relayRender()}}

function relayForget(){if(!confirm('このSafariに保存した設定判別ツールとの連携を解除する？\nツール側の連携は残るので、完全解除はツール側でも「連携解除」を押してね。'))return;relayLink=null;saveRelayLink(null);relayRender('このSafariの連携情報を消したよ')}

async function finishSession(reason='complete',httpStatus=0){running=false;paused=false;try{await wakeLock?.release?.()}catch{}wakeLock=null;const planned=plan.originalDates?.length||plan.dates.length,quality=sessionGrade(),summary={at:Date.now(),planned,success:sessionSuccess.length,failed:sessionFailed.length,quality,httpStatus,avgFetchMs:Math.round(avg(requestDurations)||0),avgMachines:Math.round(avg(sessionQuality.map(x=>x.totalMachines))||0),reason};profile.sessions=[...(profile.sessions||[]),summary].slice(-40);saveProfile(profile);stored=await listDays();if(reason==='complete'&&!sessionFailed.length)clearCheckpoint();else{const cp=checkpoint();cp.status=reason;saveCheckpoint(cp)}
  const sessionDays=await getDaysByDates(sessionSuccess),bulk=buildBulk(sessionDays,planned);log(`終了：${sessionSuccess.length}/${planned}日 / 品質${quality}${reason!=='complete'?` / ${reason}`:''}`,reason==='complete'?'':'bad');await refreshPlan(true);render();document.title=originalTitle;
}
const originalTitle=document.title;
function upsertStoredDay(day,ms){const rec={id:`${slug}|${day.date}`,slug,date:day.date,shop:shopName,parserVersion:PARSER_VERSION,sourceUrl:day.sourceUrl,machines:day.machines,quality:day.quality,fetchMs:ms,savedAt:Date.now()};const i=stored.findIndex(x=>x.date===day.date);if(i>=0)stored[i]=rec;else stored.push(rec);stored.sort((a,b)=>a.date.localeCompare(b.date))}
function nightBaseWait(){return randMs(NIGHT_WAIT_MIN_MS,NIGHT_WAIT_MAX_MS)}
async function nightFetchWithRetryForShop(date,targetSlug,targetStored){let ordinary=0,blocked=0;while(!stopped){try{const r=await fetchDayForShop(date,targetSlug,targetStored,{bypassRateLimit:true});if(r.day.quality?.grade==='D'){const e=new Error(`品質D：${(r.day.quality.warnings||[]).join(' / ')||'取得内容を再確認'}`);e.qualityError=true;throw e}return r}catch(e){const hs=+e.httpStatus||0;if(hs===403||hs===429){blocked++;if(blocked>=2){e.nightFatal=true;throw e}const wait=randMs(45*60000,60*60000);log(`⚠ ${date} HTTP ${hs}。${fmtTime(wait)}休んで1回だけ再試行する`,'bad');await waitSafe(wait);continue}ordinary++;if(ordinary>=3){e.nightSkip=true;throw e}const wait=ordinary===1?randMs(15*60000,20*60000):randMs(30*60000,40*60000);log(`⚠ ${date} ${e.message||e}。${fmtTime(wait)}休んで再試行 ${ordinary}/2`,'bad');await waitSafe(wait)}}throw Object.assign(new Error('中止'),{nightSkip:true})}
async function nightFetchWithRetry(date){return nightFetchWithRetryForShop(date,slug,stored)}
async function finishNight(reason='complete',httpStatus=0){lastNightFinishReason=reason;running=false;paused=false;try{await wakeLock?.release?.()}catch{}wakeLock=null;const summary={at:Date.now(),planned:nightPlan.length,success:sessionSuccess.length,failed:nightSkipped.length,httpStatus,reason,avgFetchMs:Math.round(avg(requestDurations)||0),avgMachines:Math.round(avg(sessionQuality.map(x=>x.totalMachines))||0)};profile.nightSessions=[...(profile.nightSessions||[]),summary].slice(-20);saveProfile(profile);stored=await listDays();if(reason==='complete')clearNightCheckpoint();else{const cp=nightCheckpoint(nightPlan);cp.status=reason;saveNightCheckpoint(cp)}log(`🌙 夜間終了：成功${sessionSuccess.length}日 / 要再取得${nightSkipped.length}日${reason!=='complete'?` / ${reason}`:''}`,reason==='complete'?'':'bad');runMode='normal';await refreshPlan(true);document.title=originalTitle;render()}
async function runNight(){if(running)return;nightPlan=buildNightPlan();if(!nightPlan.length){lastNightFinishReason='complete';nightSkipped=[];log('🌙 現在店舗の直近13か月はすべて取得済み。後続メンテへ進むよ');render();return}lastNightFinishReason='';running=true;runMode='night';paused=false;stopped=false;startAt=Date.now();sessionSuccess=[];sessionFailed=[];sessionQuality=[];requestDurations=[];nightSkipped=[];const dates=[...nightPlan];saveNightCheckpoint(nightCheckpoint(dates));await acquireWake();log(`🌙 夜間取得開始：未取得${dates.length}日 / 直近13か月`);render();for(let i=0;i<dates.length&&!stopped;i++){while(paused&&!stopped)await sleep(250);if(stopped)break;const date=dates[i];currentDate=date;document.title=`[🌙${i+1}/${dates.length}] ${shopName}`;render();try{const r=await nightFetchWithRetry(date);await putDay(r.day,{fetchMs:r.ms});upsertStoredDay(r.day,r.ms);if(profile.failures?.[date]){delete profile.failures[date];saveProfile(profile)}sessionSuccess.push(date);sessionQuality.push(r.day.quality);requestDurations.push(r.ms);log(`✓ ${date} ${r.day.machines.length}台 / ${r.ms}ms / 品質${r.day.quality.grade}`)}catch(e){const hs=+e.httpStatus||0;profile.failures=profile.failures||{};profile.failures[date]={at:Date.now(),httpStatus:hs,message:e.message||String(e)};saveProfile(profile);if(e.nightFatal){nightSkipped.push({date,httpStatus:hs,message:e.message||String(e)});saveNightCheckpoint(nightCheckpoint(dates));await finishNight('blocked',hs);return}nightSkipped.push({date,httpStatus:hs,message:e.message||String(e)});log(`↷ ${date} は今夜は飛ばす：${e.message||e}`,'bad')}saveNightCheckpoint(nightCheckpoint(dates));render();if(i<dates.length-1&&!stopped){const wait=nightBaseWait(i+1);log(`🌙 待機 ${fmtTime(wait)}`);await waitSafe(wait)}}if(stopped){await finishNight('stopped',0);return}await finishNight('complete',0)}

function upsertStoredArray(arr,rec){const i=arr.findIndex(x=>x.date===rec.date);if(i>=0)arr[i]=rec;else arr.push(rec);arr.sort((a,b)=>a.date.localeCompare(b.date));}
function latestMissingDatesForShop(days,end=jstYesterday()){const a=[...(days||[])].sort((x,y)=>x.date.localeCompare(y.date)),last=a.at(-1)?.date||'';if(!last)return[];const out=[];for(let d=end;d&&d>last;d=addDays(d,-1))out.push(d);return out}
async function refreshMaintenanceUi(){const count=shopRegistry.length,pending=shopRegistry.filter(x=>!x.initialBuildDone).length,all=await listAllDays(),unsent=(await listUnsentDaysAll()).length,y=jstYesterday();let missing=0,shopsMissing=0;for(const reg of shopRegistry.filter(x=>x.initialBuildDone)){const ds=all.filter(d=>d.slug===reg.slug),m=latestMissingDatesForShop(ds,y);if(m.length){missing+=m.length;shopsMissing++}}if($('jacRegistryCount'))$('jacRegistryCount').textContent=`登録${count}店`;if($('jacRegistryStatus'))$('jacRegistryStatus').textContent=`最新未取得 ${shopsMissing}店 / ${missing}日　・　初回構築待ち ${pending}店　・　未送信 ${unsent}日`;}
async function fetchNightDatesForRegisteredShop(reg,dates,label='夜間'){let targetStored=await listDaysForSlug(reg.slug),ok=0,failed=[];for(let i=0;i<dates.length&&!stopped;i++){while(paused&&!stopped)await sleep(250);const date=dates[i];currentDate=`${reg.shopName} ${date}`;render();try{const r=await nightFetchWithRetryForShop(date,reg.slug,targetStored),rec=await putDayForShop(reg.slug,reg.shopName,r.day,{fetchMs:r.ms});upsertStoredArray(targetStored,rec);ok++;log(`✓ ${label} / ${reg.shopName} / ${date} / ${r.day.machines.length}台 / ${r.ms}ms`)}catch(e){const hs=+e.httpStatus||0;failed.push({date,httpStatus:hs,message:e.message||String(e)});log(`↷ ${label} / ${reg.shopName} / ${date}：${e.message||e}`,'bad');if(e.nightFatal)throw e}if(i<dates.length-1&&!stopped){const wait=nightBaseWait();log(`🌙 ${reg.shopName} 次まで ${fmtTime(wait)}`);await waitSafe(wait)}}const last=targetStored.at(-1);upsertRegisteredShop({...reg,lastDate:last?.date||reg.lastDate||'',lastFetchedAt:last?.savedAt||reg.lastFetchedAt||0,lastError:failed.at(-1)||null});return{ok,failed,targetStored}}
async function retryCurrentNightFailures(items){const dates=uniq((items||[]).filter(x=>![403,429].includes(+x.httpStatus||0)).map(x=>x.date)).filter(Boolean);if(!dates.length){log('🌙 ① 現在店舗の再回収対象なし');return}log(`🌙 ① 現在店舗の失敗 ${dates.length}日を最後に再回収`);const reg=registeredShop(slug)||{slug,shopName,initialBuildDone:true};await fetchNightDatesForRegisteredShop(reg,dates,'再回収')}
async function updateRegisteredLatestNight(){const regs=shopRegistry.filter(x=>x.slug!==slug&&x.initialBuildDone);if(!regs.length){log('🌙 ② 他の登録済み店舗なし');return}log(`🌙 ② 登録済み他店舗 ${regs.length}店の最新差分を確認`);for(const reg of regs){const ds=await listDaysForSlug(reg.slug),dates=latestMissingDatesForShop(ds);if(!dates.length){log(`・${reg.shopName} 最新済み`);continue}log(`・${reg.shopName} 未取得${dates.length}日`);await fetchNightDatesForRegisteredShop(reg,dates,'最新差分')}}
async function buildPendingShopsNight(){const regs=shopRegistry.filter(x=>x.slug!==slug&&!x.initialBuildDone);if(!regs.length){log('🌙 ③ 新規店舗の初回構築待ちなし');return}log(`🌙 ③ 新規登録 ${regs.length}店の13か月初回構築`);for(const reg of regs){const ds=await listDaysForSlug(reg.slug),have=new Set(ds.map(x=>x.date)),dates=nightRange().filter(d=>!have.has(d));if(dates.length){log(`・${reg.shopName} 初回構築 残り${dates.length}日`);await fetchNightDatesForRegisteredShop(reg,dates,'初回13か月')}const after=await listDaysForSlug(reg.slug),haveAfter=new Set(after.map(x=>x.date)),remaining=nightRange().filter(d=>!haveAfter.has(d));if(!remaining.length){upsertRegisteredShop({...reg,initialBuildDone:true,lastDate:after.at(-1)?.date||'',lastFetchedAt:after.at(-1)?.savedAt||0});log(`✅ ${reg.shopName} 初回13か月構築完了`)}else log(`⚠ ${reg.shopName} 初回構築 残り${remaining.length}日`,'bad')}}
async function runNightAutomation(){if(running)return;nightSkipped=[];lastNightFinishReason='';await runNight();if(stopped||lastNightFinishReason!=='complete')return;const retry=[...nightSkipped];running=true;runMode='night-maint';paused=false;stopped=false;await acquireWake();try{upsertRegisteredShop({slug,shopName,initialBuildDone:true});await retryCurrentNightFailures(retry);if(stopped)return;await updateRegisteredLatestNight();if(stopped)return;await buildPendingShopsNight();if(stopped)return;if(relayLink){log('🌙 ④ 全店舗の未送信データをJUGESTへ送信');await relaySendAllUnsent({auto:true})}else log('🌙 ④ JUGEST未連携なので未送信一括送信はスキップ');log('✅ 夜間自動メンテナンス完了')}catch(e){log(`⚠ 夜間自動メンテナンス中断：${e?.message||e}`,'bad')}finally{running=false;paused=false;runMode='normal';currentDate='';currentWait=0;try{await wakeLock?.release?.()}catch{}wakeLock=null;stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));await refreshPlan(true);await refreshMaintenanceUi();document.title=originalTitle;render()}}
async function runAllLatest(){if(running)return;const regs=shopRegistry.filter(x=>x.initialBuildDone);if(!regs.length){log('登録済みの構築済み店舗がないよ');return}running=true;runMode='all-latest';paused=false;stopped=false;await acquireWake();let total=0;try{for(const reg of regs){let targetStored=await listDaysForSlug(reg.slug),dates=latestMissingDatesForShop(targetStored);if(!dates.length){log(`・${reg.shopName} 最新済み`);continue}log(`▶ ${reg.shopName} 最新差分 ${dates.length}日`);for(let i=0;i<dates.length&&!stopped;i++){while(paused&&!stopped)await sleep(250);const date=dates[i];currentDate=`${reg.shopName} ${date}`;render();const r=await fetchDayForShop(date,reg.slug,targetStored,{bypassRateLimit:false}),rec=await putDayForShop(reg.slug,reg.shopName,r.day,{fetchMs:r.ms});upsertStoredArray(targetStored,rec);total++;log(`✓ ${reg.shopName} ${date} / ${r.day.machines.length}台`);if(i<dates.length-1&&!stopped)await waitSafe(randMs(5000,7500))}const last=targetStored.at(-1);upsertRegisteredShop({...reg,lastDate:last?.date||'',lastFetchedAt:last?.savedAt||0})}log(`✅ 全店舗最新差分 ${total}日取得`)}catch(e){log(`⚠ 全店舗最新差分を中断：${e?.message||e}`,'bad')}finally{running=false;paused=false;runMode='normal';currentDate='';try{await wakeLock?.release?.()}catch{}wakeLock=null;stored=await listDays();stored.sort((a,b)=>a.date.localeCompare(b.date));await refreshPlan(true);await refreshMaintenanceUi();document.title=originalTitle;render()}}

async function run(){if(running||!plan.dates.length)return;const rate=accessRateState();if(rate.wait>0){log(`🧊 直近15分で${ACCESS_LIMIT}アクセス済み。あと ${fmtCountdown(rate.wait)} で開始できるよ`);updateAccessUi();return}running=true;runMode='normal';paused=false;stopped=false;startAt=Date.now();sessionSuccess=[];sessionFailed=[];sessionQuality=[];requestDurations=[];plan.originalDates=[...plan.dates];saveCheckpoint(checkpoint());await acquireWake();log(`開始：${plan.dates.length}日 / ${policy.label}ペース`);render();
  for(let i=0;i<plan.dates.length&&!stopped;i++){
    while(paused&&!stopped){await sleep(250)}if(stopped)break;const date=plan.dates[i];currentDate=date;document.title=`[${i+1}/${plan.dates.length}] ${shopName}`;render();
    try{const r=await fetchDay(date);await putDay(r.day,{fetchMs:r.ms});upsertStoredDay(r.day,r.ms);if(profile.failures?.[date]){delete profile.failures[date];saveProfile(profile)}sessionSuccess.push(date);sessionQuality.push(r.day.quality);requestDurations.push(r.ms);log(`✓ ${date} ${r.day.machines.length}台 / ${r.ms}ms / 品質${r.day.quality.grade}`);saveCheckpoint(checkpoint());}
    catch(e){const hs=+e.httpStatus||0;sessionFailed.push({date,httpStatus:hs,message:e.message||String(e)});profile.failures=profile.failures||{};profile.failures[date]={at:Date.now(),httpStatus:hs,message:e.message||String(e)};saveProfile(profile);log(`✕ ${date} ${e.message||e}`,'bad');if(hs===403||hs===429){await finishSession('blocked',hs);return}else{await finishSession('error',hs);return}}
    render();
    if(i<plan.dates.length-1){let wait;if((i+1)%15===0)wait=policy.midRest;else if((i+1)%5===0)wait=policy.fiveRest;else wait=policy.minWait+Math.floor(Math.random()*(policy.maxWait-policy.minWait+1));const resp=requestDurations.at(-1)||0;if(resp>3000&&wait<policy.midRest)wait+=Math.min(3000,Math.round(resp/2));log(`待機 ${fmtTime(wait)}${(i+1)%15===0?'（長休憩）':(i+1)%5===0?'（小休憩）':''}`);await waitSafe(wait);}
  }
  if(stopped){await finishSession('stopped',0);return}await finishSession('complete',0);
}
$('jacStart').onclick=run;
$('jacNightStart').onclick=runNightAutomation;
$('jacAllLatest').onclick=runAllLatest;
$('jacAllUnsent').onclick=()=>relaySendAllUnsent();
$('jacAddShop').onclick=openShopCatalog;
$('jacNightRetry').onclick=async()=>{if(running)return;clearNightCheckpoint();await refreshPlan(true);log('🌙 夜間取得の残り日を再計算したよ')};
$('jacPause').onclick=()=>{if(!running)return;paused=!paused;log(paused?'一時停止したよ':'再開したよ');render()};
$('jacStop').onclick=()=>{if(!running)return;stopped=true;paused=false;log('中止を受け付けたよ');render()};
$('jacSize').onchange=()=>refreshPlan(true);
$('jacResetProject').onclick=async()=>{if(running)return;if(!confirm('180日構築の基準日を最新確定日でやり直す？ 保存済みデータ自体は消さないよ。'))return;profile.anchorDate=jstYesterday();saveProfile(profile);clearCheckpoint();await refreshPlan(true);log(`基準日を ${profile.anchorDate} に変更`)};
$('jacClearCheckpoint').onclick=async()=>{if(running)return;clearCheckpoint();await refreshPlan(true);log('中断状態だけ破棄したよ')};
function latestExportRange(){const all=[...stored].sort((a,b)=>b.date.localeCompare(a.date));const fixed=new Set(dateRangeBack(profile.anchorDate,TARGET_DAYS)),fixedDone=[...fixed].every(d=>all.some(x=>x.date===d));const end=fixedDone?(all[0]?.date||profile.anchorDate):profile.anchorDate;return new Set(dateRangeBack(end,TARGET_DAYS))}
function latest13MonthRange(){return new Set(nightRange(jstYesterday()))}
let exportState={json:'',label:'',fileLabel:'',days:0};
function safeFileShop(){return shopName.replace(/[\\/:*?"<>|]/g,'_')}
function showExportDialog(days,label,fileLabel){
  if(!days.length){alert('出力できる保存データがないよ');return}
  const json=JSON.stringify(buildBulk(days,days.length));exportState={json,label,fileLabel:fileLabel||'data',days:days.length};
  $('jacExportTitle').textContent=label;$('jacExportMeta').textContent=`${days.length}日分 / ${Math.max(1,Math.round(new Blob([json]).size/1024)).toLocaleString()} KB`;$('jacExportText').value=json;$('jacExportStatus').textContent='JSONを準備したよ。「JSONをコピー」を押してね。';exportMask.classList.add('open');
}
function selectExportText(){const ta=$('jacExportText');ta.focus({preventScroll:true});ta.select();try{ta.setSelectionRange(0,ta.value.length)}catch{}return ta}
function copyPreparedJson(){
  if(!exportState.json)return;
  const ta=selectExportText();let legacyOk=false;
  try{legacyOk=document.execCommand('copy')===true}catch{}
  if(legacyOk){$('jacExportStatus').textContent='✅ JSONをコピーしたよ';return}
  if(navigator.clipboard?.writeText){
    let p;try{p=navigator.clipboard.writeText(exportState.json)}catch(e){p=Promise.reject(e)}
    Promise.resolve(p).then(()=>{$('jacExportStatus').textContent='✅ JSONをコピーしたよ'}).catch(()=>{$('jacExportStatus').textContent='⚠️ Safariが自動コピーを許可しなかったよ。全文を選択済みなので、選択部分を長押し →「コピー」を押してね。';selectExportText()});
    return;
  }
  $('jacExportStatus').textContent='⚠️ このSafariでは自動コピーできなかったよ。全文を選択済みなので、選択部分を長押し →「コピー」を押してね。';selectExportText();
}
function downloadPreparedJson(){
  if(!exportState.json)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([exportState.json],{type:'application/json'}));a.href=url;a.download=`juggler_${safeFileShop()}_${exportState.fileLabel}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500)
}
function sharePreparedJson(){
  if(!exportState.json)return;const file=new File([exportState.json],`juggler_${safeFileShop()}_${exportState.fileLabel}.json`,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})&&navigator.share){
    let p;try{p=navigator.share({files:[file],title:`${shopName} ジャグラー・ハナハナデータ`})}catch(e){p=Promise.reject(e)}
    Promise.resolve(p).catch(e=>{if(e?.name!=='AbortError')downloadPreparedJson()});return;
  }
  downloadPreparedJson();
}
$('jacRelayCode').oninput=e=>{e.target.value=String(e.target.value||'').replace(/\D/g,'').slice(0,6)};
$('jacRelayPair').onclick=relayPair;
$('jacRelaySend').onclick=relaySendLatest;
$('jacRelaySend13').onclick=relaySend13Months;
$('jacRelayForget').onclick=relayForget;
$('jacCatalogLoad').onclick=loadCatalogShops;
$('jacCatalogRegister').onclick=registerCatalogSelection;
$('jacCatalogPaste').onclick=pasteCatalogUrl;
$('jacCatalogUrl').addEventListener('paste',e=>{const t=String(e.clipboardData?.getData?.('text/plain')||'').trim();if(!t)return;e.preventDefault();$('jacCatalogUrl').value=t;catalogUrlFeedback(t,{pasted:true})},true);
$('jacCatalogUrlRegister').onclick=registerCatalogUrl;
$('jacCatalogClose').onclick=()=>shopMask.classList.remove('open');
shopMask.addEventListener('click',e=>{if(e.target===shopMask)shopMask.classList.remove('open')});
$('jacExportCopy').onclick=copyPreparedJson;
$('jacExportShare').onclick=sharePreparedJson;
$('jacExportSelect').onclick=()=>{selectExportText();$('jacExportStatus').textContent='全文を選択したよ。選択部分を長押し →「コピー」でOK。'};
$('jacExportClose').onclick=()=>exportMask.classList.remove('open');
exportMask.addEventListener('click',e=>{if(e.target===exportMask)exportMask.classList.remove('open')});
$('jacExportSession').onclick=async()=>{const ds=await getDaysByDates(sessionSuccess.length?sessionSuccess:(loadCheckpoint()?.successDates||[]));if(!ds.length){alert('今回セッションの保存データがまだないよ');return}showExportDialog(ds,'今回分JSON','session')};
$('jacExport180').onclick=async()=>{const range=latestExportRange(),ds=(await listDays()).filter(x=>range.has(x.date)).sort((a,b)=>b.date.localeCompare(a.date));if(!ds.length){alert('保存済み180日範囲のデータがまだないよ');return}showExportDialog(ds,'保存済み最新180日JSON',`${ds.length}days`)};
$('jacExport13').onclick=async()=>{const range=latest13MonthRange(),ds=(await listDays()).filter(x=>range.has(x.date)).sort((a,b)=>b.date.localeCompare(a.date));if(!ds.length){alert('保存済み13か月範囲のデータがまだないよ');return}showExportDialog(ds,'保存済み最新13か月JSON',`${ds.length}days_13months`)};
$('jacExportAll').onclick=async()=>{const ds=(await listDays()).sort((a,b)=>b.date.localeCompare(a.date));if(!ds.length){alert('保存データがないよ');return}showExportDialog(ds,'全保存データJSON','all')};
$('jacShare').onclick=async()=>{const range=latestExportRange(),ds=(await listDays()).filter(x=>range.has(x.date)).sort((a,b)=>b.date.localeCompare(a.date));if(!ds.length){alert('共有できる保存データがないよ');return}showExportDialog(ds,'保存済み最新180日JSON',`${ds.length}days`)};

nightPlan=buildNightPlan();
updateAccessUi();
const cp=loadCheckpoint();if(cp&&cp.slug===slug&&Array.isArray(cp.dates)){const remain=cp.dates.filter(d=>!new Set(stored.map(x=>x.date)).has(d));if(remain.length)log(`前回 ${cp.successDates?.length||0}/${cp.dates.length}日で中断。残り${remain.length}日を続きから候補にしたよ`)}
render();relayRender();refreshMaintenanceUi();
})();
