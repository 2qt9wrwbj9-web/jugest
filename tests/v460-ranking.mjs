import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../public/ana-launcher.js', import.meta.url), 'utf8');

// Static release / invariant checks. The exact app version is intentionally not pinned here;
// this regression protects the v4.6 ranking contracts across later releases.
const titleVersion = html.match(/<title>ジャグラー設定判別 v(\d+\.\d+\.\d+)<\/title>/)?.[1];
const visibleVersion = html.match(/ジャグラー・ハナハナ設定判別 <span[^>]*>v(\d+\.\d+\.\d+)<\/span>/)?.[1];
const backupVersion = html.match(/appVersion:"(\d+\.\d+\.\d+)"/)?.[1];
assert.ok(titleVersion, 'release title version missing');
assert.equal(visibleVersion, titleVersion, 'visible version must match title');
assert.equal(backupVersion, titleVersion, 'backup appVersion must match title');
assert.match(launcher, /const VERSION='4\.8\.6';/);
assert.match(launcher, /const PARSER_VERSION=4500;/);
assert.match(html, /function v4ModelEligibleScore\(x\)\{return!!x&&\(\(x\.score>=53\.5&&\(x\.adjP\?\?1\)<=\.05&&x\.winRate>=\.58&&x\.blockWinRate>=\.75&&x\.esLift>=\.07\)\|\|x\.rareValidated===true\)\}/);
assert.match(html, /const V4_RANK_MODEL_DEFS=/);
assert.match(html, /tableProfile:\{label:"台固有履歴"/);
assert.match(html, /"prev2Band","histDiff2","prevES2Seq","prevDiff2Seq"/);
assert.match(html, /"diffTrend27","esTrend27"/);
assert.doesNotMatch(html.match(/recent:\{label:"直近2日履歴"[\s\S]*?\}\n\};/)?.[0] || '', /histES3|histDiff3|lossRatio3|highRatio3|diffTrend37|esTrend37/);
assert.match(html, /softEffects/);
assert.match(html, /ranking:\{version:4,separatedFromStrict:true/);
assert.match(html, /schema:'juggler-v4-ai-analysis-payload',version:4/);
assert.match(html, /rejectedBy:/);
assert.match(html, /rankingEngine:/);

// Evaluate the app's pure v4 test surface under a minimal DOM.
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(scriptMatch, 'main script missing');
let code = scriptMatch[1];
const cut = code.indexOf('let didRestore=restoreSavedState();');
assert.ok(cut > 0, 'app bootstrap cut point missing');
code = code.slice(0, cut) + `globalThis.__V4=window.V4_TEST;\n})();`;

function fakeElement() {
  const base = {
    value:'', checked:false, innerHTML:'', textContent:'', className:'', style:{}, dataset:{}, files:[], disabled:false,
    classList:{add(){},remove(){},toggle(){},contains(){return false}}, appendChild(){}, append(){}, remove(){}, click(){}, focus(){},
    scrollIntoView(){}, setAttribute(){}, removeAttribute(){}, addEventListener(){}, removeEventListener(){}, querySelectorAll(){return[]},
    querySelector(){return fakeElement()}, closest(){return fakeElement()}
  };
  return new Proxy(base,{get(t,p){if(p in t)return t[p];if(p==='length')return 0;return undefined},set(t,p,v){t[p]=v;return true}});
}
const elems = new Map();
const document = {
  getElementById(id){if(!elems.has(id))elems.set(id,fakeElement());return elems.get(id)}, querySelectorAll(){return[]},
  querySelector(){return fakeElement()}, createElement(){return fakeElement()}, body:fakeElement(), addEventListener(){}, removeEventListener(){}
};
const storage = new Map();
const URLClass = URL; URLClass.createObjectURL=()=> 'blob:x'; URLClass.revokeObjectURL=()=>{};
const sandbox = {
  console, document, window:null, location:{protocol:'https:',origin:'https://example.netlify.app',reload(){}},
  localStorage:{setItem(k,v){storage.set(k,String(v))},getItem(k){return storage.has(k)?storage.get(k):null},removeItem(k){storage.delete(k)}},
  indexedDB:undefined, confirm(){return true}, alert(){}, prompt(){return null}, navigator:{}, Blob:function(){}, URL:URLClass,
  FileReader:function(){}, setTimeout, clearTimeout, Date, Math, JSON, Map, Set, Promise, Number, String, Array, Object, Infinity, NaN,
  parseInt, isFinite, crypto:globalThis.crypto, fetch:async()=>{throw new Error('no net')}, performance:globalThis.performance
};
sandbox.window=sandbox; sandbox.window.addEventListener=()=>{}; sandbox.window.removeEventListener=()=>{};
vm.createContext(sandbox);
vm.runInContext(code,sandbox,{timeout:20000});
const V=sandbox.__V4;
assert.ok(V?.predictStore && V?.rankModelDefs?.tableProfile, 'v4 test exports missing');

function qFor(es){
  if(es>=4.2)return [.03,.07,.30,.34,.18,.08];
  if(es>=3.5)return [.05,.15,.40,.25,.10,.05];
  if(es>=3)return [.08,.22,.50,.14,.05,.01];
  return [.18,.35,.35,.09,.025,.005];
}
function row(table,day){
  const d=day%14;
  let es=3.0;
  if(table===1001) es=3.55+(day%5===0?.35:0);
  else if(table===1002&&d<3) es=3.6;
  else if(table===1003&&day%7===2) es=3.7;
  if(table===1004){const mod=day%4;es=mod===0?3.9:mod===3?2.35:3.0;}
  const q=qFor(es), p4=q[3]+q[4]+q[5], p5=q[4]+q[5];
  return {machine:'im',machineName:'アイムジャグラーEX',tableNo:String(table),games:6500,diff:Math.round((es-3)*900),
    bb:22+Math.round((es-3)*3),rb:18+Math.round((es-3)*5),q,expectedSetting:es,p4,p5,p6:q[5]};
}
const days=[];
const start=new Date('2026-03-01T12:00:00');
for(let i=0;i<170;i++){
  const d=new Date(start); d.setDate(d.getDate()+i); const date=d.toISOString().slice(0,10);
  days.push({id:i,shop:'SYN',date,machines:Array.from({length:20},(_,j)=>row(1001+j,i))});
}
const targetDate='2026-08-18';
const pred=V.predictStore('SYN',targetDate,days,{noCache:true});
assert.ok(pred, 'synthetic prediction missing');
assert.equal(pred.ranking?.separatedFromStrict,true);
assert.ok(pred.ranking.confidence>0, 'practical ranking confidence should be nonzero');
assert.ok(pred.ranking.models.tableProfile.weight>0, 'exact-table ranking model should receive evidence weight');
assert.equal(pred.rows[0].tableNo,'1001', 'persistent strong table should rank first');
assert.ok(new Set(pred.rows.slice(0,8).map(r=>r.rootRankES.toFixed(8))).size>=3, 'single-first practical ranking should differentiate table scores');
assert.ok(pred.rows.some(r=>Array.isArray(r.rankReasons)&&r.rankReasons.length), 'practical ranking reasons should be surfaced');

const tp=V.targetPrep('SYN',targetDate,days);
const row1004=tp.targetRows.find(r=>r.tableNo==='1004');
assert.ok(row1004, 'two-day target row missing');
const defs=V.dimDefs;
const get=k=>row1004.features[defs.findIndex(x=>x.key===k)];
for(const k of ['prev2Band','prevES2Seq','prevDiff2Seq','diffTrend27']) assert.ok(get(k), `two-day feature ${k} should be populated`);

const flatDays=[];
for(let i=0;i<100;i++){
  const d=new Date(start); d.setDate(d.getDate()+i); const date=d.toISOString().slice(0,10);
  flatDays.push({id:i,shop:'FLAT',date,machines:Array.from({length:20},(_,j)=>{
    const q=qFor(3.0); return {machine:'im',machineName:'アイムジャグラーEX',tableNo:String(2001+j),games:6500,diff:0,bb:22,rb:18,q,expectedSetting:3,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]};
  })});
}
const flatTarget='2026-06-09';
const flat=V.predictStore('FLAT',flatTarget,flatDays,{noCache:true});
assert.ok(flat, 'flat control prediction missing');
assert.equal(flat.ranking.confidence,0,'flat control should not create ranking confidence');
assert.ok(new Set(flat.rows.map(r=>r.rankValue.toFixed(10))).size===1,'flat control should not create table differences');

console.log('PASS v4.6.x practical ranking + 2-day history regression');
console.log(`ranking confidence=${pred.ranking.confidence.toFixed(3)} tableProfileWeight=${pred.ranking.models.tableProfile.weight.toFixed(3)} top=${pred.rows[0].tableNo} flatConfidence=${flat.ranking.confidence.toFixed(3)}`);
