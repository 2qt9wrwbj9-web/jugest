import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

function fakeElement(){
  const base={value:'',checked:false,innerHTML:'',textContent:'',className:'',style:{},dataset:{},files:[],disabled:false,
    classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){},append(){},remove(){},click(){},focus(){},scrollIntoView(){},
    setAttribute(){},removeAttribute(){},addEventListener(){},removeEventListener(){},querySelectorAll(){return[]},querySelector(){return fakeElement()},closest(){return fakeElement()}};
  return new Proxy(base,{get(t,p){if(p in t)return t[p];if(p==='length')return 0;return undefined},set(t,p,v){t[p]=v;return true}});
}
function load(path){
  const html=fs.readFileSync(path,'utf8');
  const m=html.match(/<script>([\s\S]*?)<\/script>/i); assert.ok(m,`main script missing: ${path}`);
  let code=m[1];
  const cut=code.indexOf('let didRestore=restoreSavedState();'); assert.ok(cut>0,'restore cutoff missing');
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
function qFor(es){
  if(es>=4.2)return [.03,.07,.30,.34,.18,.08];
  if(es>=3.5)return [.05,.15,.40,.25,.10,.05];
  if(es>=3)return [.08,.22,.50,.14,.05,.01];
  return [.18,.35,.35,.09,.025,.005];
}
function makeDays(){
  const days=[],start=new Date('2026-01-01T12:00:00');
  for(let i=0;i<100;i++){
    const d=new Date(start); d.setDate(d.getDate()+i); const date=d.toISOString().slice(0,10),machines=[];
    for(let j=0;j<18;j++){
      let es=2.35+(((j*13+i*7)%23)/22)*1.55;
      if(j===3&&i%7===0)es=4.5;
      if(j===8&&i%5===0)es=4.2;
      const diff=Math.round((es-3)*1600+(((j*29+i*31)%100)-50)*10),q=qFor(es);
      machines.push({machine:['im','my','fk','hp','gg'][j%5],machineName:'x',tableNo:String(1000+j),games:3000+((j*37+i*41)%4500),diff,
        bb:15+((j+i)%20),rb:10+((j*3+i)%18),q,expectedSetting:es,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]});
    }
    days.push({id:i,shop:'PERF',date,machines});
  }
  const td=new Date(start); td.setDate(td.getDate()+100);
  return {days,target:td.toISOString().slice(0,10)};
}
function strictSnap(p){
  return {champion:p.champion,storeTargetP4:p.storeTargetP4,
    rows:p.rows.map(r=>({machine:r.machine,tableNo:r.tableNo,predP4:r.predP4})).sort((a,b)=>a.machine.localeCompare(b.machine)||a.tableNo.localeCompare(b.tableNo,undefined,{numeric:true}))};
}
function evidenceShape(p){
  const e=p.ranking.rootEvidence; return {conditionCount:e.conditionCount,usableCount:e.usableCount,confidence:e.confidence};
}

const currentHtml=fs.readFileSync('./index.html','utf8');
assert.match(currentHtml,/ジャグラー設定判別 v4\.\d+\.\d+/);
assert.match(currentHtml,/appVersion:"\d+\.\d+\.\d+"/);
assert.match(currentHtml,/BRUTE_SHIFT_DATE_CACHE/);
assert.match(currentHtml,/bruteForecastBaseFromPrep/);
assert.match(currentHtml,/V4_FIT_BASE_CACHE/);
assert.match(currentHtml,/singleEvidence\.ctx=null/);

const launcher=fs.readFileSync('./ana-launcher.js','utf8');
assert.match(launcher,/const VERSION=['"]4\.8\.6['"]/);
assert.match(launcher,/const PARSER_VERSION=4500/);

const {days,target}=makeDays();
const oldV=load('./index.before_v471.html');
const newV=load('./index.html');
let t=performance.now(); const oldPred=oldV.predictStore('PERF',target,days,{noCache:true}); const oldMs=performance.now()-t;
t=performance.now(); const newPred=newV.predictStore('PERF',target,days,{noCache:true}); const newMs=performance.now()-t;
assert.deepEqual(JSON.parse(JSON.stringify(strictSnap(newPred))),JSON.parse(JSON.stringify(strictSnap(oldPred))),
  'strict Champion/store-target/per-table P4 fields must remain unchanged by practical evidence aggregation changes');
const newEvidence=evidenceShape(newPred);
assert.ok(Number.isInteger(newEvidence.conditionCount)&&newEvidence.conditionCount>0,'v4.8.7 evidence catalog must remain populated');
assert.ok(Number.isInteger(newEvidence.usableCount)&&newEvidence.usableCount>=0,'v4.8.7 usable evidence count must remain valid');
assert.ok(Number.isFinite(newEvidence.confidence),'v4.8.7 evidence confidence must remain finite');
for(const r of newPred.rows){
  assert.ok(Number.isFinite(r.rankValue)&&Number.isFinite(r.rootRankES)&&Number.isFinite(r.rootEffectES)&&Number.isFinite(r.rootP4Effect)&&Number.isFinite(r.rootConfidence),'practical ranking fields must stay finite after alias dedup');
  assert.ok(Number.isInteger(r.rootFamilyCount)&&r.rootFamilyCount>=0,'deduplicated independent-root count must stay valid');
}
console.log(`PASS strict semantic parity + v4.8.7 practical evidence policy; old=${oldMs.toFixed(0)}ms new=${newMs.toFixed(0)}ms (timing informational only)`);
