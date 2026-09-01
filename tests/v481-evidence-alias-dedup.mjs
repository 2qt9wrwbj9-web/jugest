import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.equal(html, rootHtml, 'root/public index.html must remain byte-identical');
assert.match(html, /<title>ジャグラー設定判別 v4\.8\.8<\/title>/);
assert.match(html, /function bruteSingleAliasFingerprint\(c\)/);
assert.match(html, /function bruteSingleAliasGroups\(cands\)/);
assert.match(html, /aliasCount:x\.aliases\.length/);

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(scriptMatch, 'main script missing');
let code = scriptMatch[1];
const cut = code.indexOf('let didRestore=restoreSavedState();');
assert.ok(cut > 0, 'bootstrap cut point missing');
code = code.slice(0, cut) + 'globalThis.__V4=window.V4_TEST;\n})();';
function fakeElement(){const base={value:'',checked:false,innerHTML:'',textContent:'',className:'',style:{},dataset:{},files:[],disabled:false,classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){},append(){},remove(){},click(){},focus(){},scrollIntoView(){},setAttribute(){},removeAttribute(){},addEventListener(){},removeEventListener(){},querySelectorAll(){return[]},querySelector(){return fakeElement()},closest(){return fakeElement()}};return new Proxy(base,{get(t,p){if(p in t)return t[p];if(p==='length')return 0;return undefined},set(t,p,v){t[p]=v;return true}})}
const elems=new Map();const document={getElementById(id){if(!elems.has(id))elems.set(id,fakeElement());return elems.get(id)},querySelectorAll(){return[]},querySelector(){return fakeElement()},createElement(){return fakeElement()},body:fakeElement(),addEventListener(){},removeEventListener(){}};
const storage=new Map();const URLClass=URL;URLClass.createObjectURL=()=> 'blob:x';URLClass.revokeObjectURL=()=>{};
const sandbox={console,document,window:null,location:{protocol:'https:',origin:'https://example.netlify.app',reload(){}},localStorage:{setItem(k,v){storage.set(k,String(v))},getItem(k){return storage.has(k)?storage.get(k):null},removeItem(k){storage.delete(k)}},indexedDB:undefined,confirm(){return true},alert(){},prompt(){return null},navigator:{},Blob:function(){},URL:URLClass,FileReader:function(){},setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Promise,Number,String,Array,Object,Infinity,NaN,parseInt,isFinite,crypto:globalThis.crypto,fetch:async()=>{throw new Error('no net')},performance:globalThis.performance};sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.removeEventListener=()=>{};
vm.createContext(sandbox);vm.runInContext(code,sandbox,{timeout:30000});const V=sandbox.__V4;
assert.ok(V?.predictStore, 'predictStore export missing');

function qFor(es){if(es>=4.4)return [.02,.05,.25,.33,.22,.13];if(es>=3.4)return [.06,.16,.38,.24,.11,.05];return [.16,.34,.36,.10,.03,.01]}
function row(table,day){const hot=table===1088;const es=hot?4.65:2.85+((table+day)%3)*.05;const q=qFor(es);return{machine:'im',machineName:'ネオアイム',tableNo:String(table),games:6500,diff:hot?2200:-250+((table+day)%5)*100,bb:hot?30:20,rb:hot?31:17,q,expectedSetting:es,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]}}
const days=[];const start=new Date('2026-01-01T12:00:00');for(let i=0;i<180;i++){const d=new Date(start);d.setDate(d.getDate()+i);const date=d.toISOString().slice(0,10);days.push({id:i,shop:'ALIAS481',date,machines:Array.from({length:19},(_,j)=>row(1081+j,i))})}
const td=new Date(start);td.setDate(td.getDate()+180);const targetDate=td.toISOString().slice(0,10);
const pred=V.predictStore('ALIAS481',targetDate,days,{noCache:true});
assert.ok(pred, 'prediction missing');
const r=pred.rows.find(x=>x.tableNo==='1088');
assert.ok(r, '1088 forecast row missing');
const rootLabels=r.rootReasons.map(x=>x.label);
const practicalLabels=r.practicalRootReasons.map(x=>x.label);
const exact='台番＝1088', tail2='台番下2桁＝下2桁88';
assert.ok(!rootLabels.includes(exact)&&!rootLabels.includes(tail2), 'unconditional exact/tail table identity must not be a direct root reason: '+rootLabels.join(' | '));
assert.ok(!practicalLabels.includes(exact)&&!practicalLabels.includes(tail2), 'unconditional exact/tail table identity must not be a practical reason: '+practicalLabels.join(' | '));
const topLabels=pred.ranking.rootEvidence.topPositive.map(x=>x.label);
assert.ok(!topLabels.includes(exact)&&!topLabels.includes(tail2), 'rootEvidence topPositive must exclude unconditional table identity roots: '+topLabels.join(' | '));

console.log('PASS v4.8.7 baseline-table exclusion + alias-dedup regression');
console.log('1088 rootFamilies='+r.rootFamilyCount+' aliases='+r.rootReasons.filter(x=>x.aliasCount>1).map(x=>x.label+':'+x.aliasCount).join(','));
