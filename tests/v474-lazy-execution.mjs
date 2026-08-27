import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const html=fs.readFileSync('./index.html','utf8');
const publicHtml=fs.readFileSync('./public/index.html','utf8');
assert.equal(html,publicHtml,'root/public index.html must stay byte-identical');
assert.match(html,/ジャグラー設定判別 v4\.7\.9/);
assert.match(html,/appVersion:"4\.7\.9"/);

const initStart=html.indexOf('async function initExternalStorage()');
const initEnd=html.indexOf('let externalStorageReadyResolve;',initStart);
assert.ok(initStart>0&&initEnd>initStart,'initExternalStorage bounds missing');
const initBody=html.slice(initStart,initEnd);
assert.doesNotMatch(initBody,/rejudgeAllExternalDays\s*\(/,'startup storage load must not synchronously rejudge the whole database');
assert.doesNotMatch(initBody,/modelMarkScoredForecasts\s*\(/,'startup storage load must not eagerly score forecast history');
assert.match(initBody,/unpackExternalDaysAsync/,'IndexedDB unpack should yield between chunks');
assert.match(html,/sinceYield>=1200/,'large IndexedDB unpack should yield by table-row volume');

const bootStart=html.indexOf('let didRestore=restoreSavedState();');
const bootEnd=html.indexOf('initExternalStorage().finally',bootStart);
assert.ok(bootStart>0&&bootEnd>bootStart,'startup bounds missing');
const boot=html.slice(bootStart,bootEnd);
assert.doesNotMatch(boot,/rejudgeAllExternalDays\s*\(/,'startup must not eagerly rejudge external data');
assert.match(boot,/externalRejudged=false/,'startup must explicitly stay lazy');
assert.match(boot,/v4RenderMoveRecommendation\(false\)/,'judge startup must use cached-only recommendation render');

const saveStart=html.indexOf('function queueAutoSave()');
const saveEnd=html.indexOf('function autoSaveState()',saveStart);
const saveBody=html.slice(saveStart,saveEnd);
assert.match(saveBody,/requestIdleCallback/,'autosave should prefer idle time');
assert.match(saveBody,/setTimeout\(autoSaveState,450\)/,'autosave fallback should be meaningfully deferred');
assert.doesNotMatch(saveBody,/setTimeout\(autoSaveState,40\)/,'old near-click 40ms autosave must not return');

assert.match(html,/id="V4_PLAN_SHOP"/);
assert.match(html,/全店舗比較（明示実行・重い）/);
assert.match(html,/else if\(p==="todayplan"\)v4RenderTodayPlan\(false\)/);
assert.match(html,/else if\(p==="shoptrend"\)renderShopTrend\(false\)/);
assert.match(html,/else if\(p==="bruteanalysis"\)\{renderBruteAnalysis\(\);v4RenderTwin\(false\)\}/);
assert.match(html,/else if\(p==="modelperf"\)renderModelPerformance\(false\)/);
assert.match(html,/id="TREND_RUN"/,'trend calculation needs an explicit operation');
assert.match(html,/id="MODELPERF_RUN"/,'model performance needs an explicit operation');
assert.match(html,/id="EXT_HISTORY_JUDGE"/,'external history judgement should be explicit');
assert.match(html,/data-ext-more/,'external history should be incremental');
assert.match(html,/data-trend-more/,'trend table rows should be incremental');
assert.match(html,/data-trend-date-more/,'trend date columns should be incremental');
assert.match(html,/data-single-more/,'single-evidence DOM should be incremental');
assert.match(html,/async function ensureExternalJudged\(/,'lazy external judging helper missing');

const launcher=fs.readFileSync('./ana-launcher.js');
assert.deepEqual(launcher,fs.readFileSync('./public/ana-launcher.js'),'root/public launcher must stay byte-identical');
assert.equal(crypto.createHash('sha256').update(launcher).digest('hex'),'964891a40f829bc73e12dfd4da2c486b775e2650535a97e702ca296f12cb13a4','Launcher changed unexpectedly');
assert.match(fs.readFileSync('./BOOKMARKLET_v4500.txt','utf8'),/ana-launcher\.js\?v=4500/);

function fakeElement(){
  const base={value:'',checked:false,innerHTML:'',textContent:'',className:'',style:{},dataset:{},files:[],disabled:false,
    classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){},append(){},remove(){},click(){},focus(){},scrollIntoView(){},
    setAttribute(){},removeAttribute(){},addEventListener(){},removeEventListener(){},querySelectorAll(){return[]},querySelector(){return fakeElement()},closest(){return fakeElement()}};
  return new Proxy(base,{get(t,p){if(p in t)return t[p];if(p==='length')return 0;return undefined},set(t,p,v){t[p]=v;return true}});
}
function load(file){
  const source=fs.readFileSync(file,'utf8');
  const m=source.match(/<script>([\s\S]*?)<\/script>/i); assert.ok(m,`main script missing: ${file}`);
  let code=m[1];
  const cut=code.indexOf('let didRestore=restoreSavedState();'); assert.ok(cut>0,`restore cutoff missing: ${file}`);
  code=code.slice(0,cut)+`globalThis.__V4=window.V4_TEST;\n})();`;
  const elems=new Map();
  const document={getElementById(id){if(!elems.has(id))elems.set(id,fakeElement());return elems.get(id)},querySelectorAll(){return[]},querySelector(){return fakeElement()},createElement(){return fakeElement()},body:fakeElement(),addEventListener(){},removeEventListener(){}};
  const storage=new Map(); const URLClass=URL; URLClass.createObjectURL=()=> 'blob:x'; URLClass.revokeObjectURL=()=>{};
  const sandbox={console,document,window:null,location:{protocol:'https:',origin:'https://example.netlify.app',reload(){}},
    localStorage:{setItem(k,v){storage.set(k,String(v))},getItem(k){return storage.has(k)?storage.get(k):null},removeItem(k){storage.delete(k)}},
    indexedDB:undefined,confirm(){return true},alert(){},prompt(){return null},navigator:{},Blob:function(){},URL:URLClass,FileReader:function(){},
    setTimeout,clearTimeout,Date,Math,JSON,Map,Set,WeakMap,Promise,Number,String,Array,Object,Infinity,NaN,parseInt,isFinite,crypto:globalThis.crypto,
    fetch:async()=>{throw new Error('no net')},performance:globalThis.performance};
  sandbox.window=sandbox; sandbox.window.addEventListener=()=>{}; sandbox.window.removeEventListener=()=>{};
  vm.createContext(sandbox); vm.runInContext(code,sandbox,{timeout:30000}); return sandbox.__V4;
}
function makeRawDays(){
  const days=[],start=new Date('2026-03-01T12:00:00'),machines=['im','my','fk','hp','gg'];
  for(let i=0;i<72;i++){
    const d=new Date(start);d.setDate(d.getDate()+i);const date=d.toISOString().slice(0,10),rows=[];
    for(let j=0;j<12;j++){
      const machine=machines[j%machines.length],games=2600+((i*61+j*97)%4300),bb=8+((i+j*3)%24),rb=6+((i*2+j*5)%21);
      let diff=Math.round(((bb*260+rb*95)-games*0.9)+(((i*29+j*37)%900)-450));
      if(j===4&&i%6===0)diff+=1800;if(j===9&&i%9===0)diff-=1600;
      rows.push({machine,machineName:'x',tableNo:String(1100+j),games,diff,bb,rb});
    }
    days.push({id:i,shop:'LAZY',date,machines:rows});
  }
  const td=new Date(start);td.setDate(td.getDate()+72);return{days,target:td.toISOString().slice(0,10)};
}
function judgedCopy(raw,newV){
  return raw.map(d=>({...d,machines:d.machines.map(r=>{const j=newV.externalJudge(r.machine,r.games,r.bb,r.rb,r.diff),q=[...j.q];return{...r,q,expectedSetting:q.reduce((s,p,i)=>s+p*(i+1),0),p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]}})}));
}
function snap(p){return{champion:p.champion,storeTargetP4:p.storeTargetP4,rootEvidence:p.ranking.rootEvidence,
  rows:p.rows.map(r=>({machine:r.machine,tableNo:r.tableNo,predP4:r.predP4,rankValue:r.rankValue,rootRankES:r.rootRankES,rootEffectES:r.rootEffectES,
    rootP4Effect:r.rootP4Effect,rootConfidence:r.rootConfidence,rootFamilyCount:r.rootFamilyCount,
    rootReasons:r.rootReasons.map(x=>[x.label,x.scope,x.effect,x.p4Delta,x.practicalEffect,x.practicalP4Delta,x.contributionES,x.contributionP4,x.confidence])})).sort((a,b)=>a.machine.localeCompare(b.machine)||a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}))};}

const oldV=load('./index.before_v474.html');
const newV=load('./index.html');
const {days:raw,target}=makeRawDays();
const judged=judgedCopy(raw,newV);
const oldPred=oldV.predictStore('LAZY',target,judged,{noCache:true});
const lazyRaw=structuredClone(raw);
assert.ok(lazyRaw.some(d=>d.machines.some(newV.externalNeedsJudge)),'raw fixture should begin unjudged');
const newPred=newV.predictStore('LAZY',target,lazyRaw,{noCache:true});
assert.ok(lazyRaw.every(d=>d.machines.every(r=>!newV.externalNeedsJudge(r))),'prediction should lazily derive missing judge fields only when requested');
assert.deepEqual(JSON.parse(JSON.stringify(snap(newPred))),JSON.parse(JSON.stringify(snap(oldPred))),
  'lazy raw-data execution must preserve v4.7.3 strict prediction values; final ordering is intentionally hybridized');

console.log('PASS v4.7.8 lazy execution regression; boot/navigation work deferred, ranking semantics preserved');
