import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../public/ana-launcher.js', import.meta.url), 'utf8');

assert.match(html, /<title>ジャグラー設定判別 v4\.\d+\.\d+<\/title>/);
assert.match(html, /ジャグラー・ハナハナ設定判別 <span[^>]*>v4\.\d+\.\d+<\/span>/);
assert.match(html, /appVersion:"\d+\.\d+\.\d+"/);
assert.match(launcher, /const VERSION='4\.8\.4';/);
assert.match(launcher, /const PARSER_VERSION=4500;/);
assert.match(html, /単一条件のみ（最速・推奨）/);
assert.match(html, /id="BRUTE_TAB_SINGLE"/);
assert.match(html, /const BRUTE_SINGLE_BASE_KEYS=/);
assert.match(html, /7:\[3000,5000,7000,10000,14000\]/);
assert.match(html, /過去\$\{n\}日累計差枚/);
assert.match(html, /singleFirst:true/);
assert.match(html, /ranking:\{version:4/);
assert.match(html, /schema:'juggler-v4-ai-analysis-payload',version:4/);
assert.doesNotMatch(html.match(/const BRUTE_SINGLE_BASE_KEYS=\[[\s\S]*?\];/)?.[0] || '', /histES3|histDiff3|lossRatio3|highRatio3|zeroBonus3|avgGames3/);
assert.match(html, /function v4ModelEligibleScore\(x\)\{return!!x&&\(\(x\.score>=53\.5&&\(x\.adjP\?\?1\)<=\.05&&x\.winRate>=\.58&&x\.blockWinRate>=\.75&&x\.esLift>=\.07\)\|\|x\.rareValidated===true\)\}/);

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(scriptMatch, 'main script missing');
let code = scriptMatch[1];
const cut = code.indexOf('let didRestore=restoreSavedState();');
assert.ok(cut > 0, 'bootstrap cut point missing');
code = code.slice(0, cut) + `globalThis.__V4=window.V4_TEST;\n})();`;
function fakeElement(){const base={value:'',checked:false,innerHTML:'',textContent:'',className:'',style:{},dataset:{},files:[],disabled:false,classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(){},append(){},remove(){},click(){},focus(){},scrollIntoView(){},setAttribute(){},removeAttribute(){},addEventListener(){},removeEventListener(){},querySelectorAll(){return[]},querySelector(){return fakeElement()},closest(){return fakeElement()}};return new Proxy(base,{get(t,p){if(p in t)return t[p];if(p==='length')return 0;return undefined},set(t,p,v){t[p]=v;return true}})}
const elems=new Map();const document={getElementById(id){if(!elems.has(id))elems.set(id,fakeElement());return elems.get(id)},querySelectorAll(){return[]},querySelector(){return fakeElement()},createElement(){return fakeElement()},body:fakeElement(),addEventListener(){},removeEventListener(){}};
const storage=new Map();const URLClass=URL;URLClass.createObjectURL=()=> 'blob:x';URLClass.revokeObjectURL=()=>{};
const sandbox={console,document,window:null,location:{protocol:'https:',origin:'https://example.netlify.app',reload(){}},localStorage:{setItem(k,v){storage.set(k,String(v))},getItem(k){return storage.has(k)?storage.get(k):null},removeItem(k){storage.delete(k)}},indexedDB:undefined,confirm(){return true},alert(){},prompt(){return null},navigator:{},Blob:function(){},URL:URLClass,FileReader:function(){},setTimeout,clearTimeout,Date,Math,JSON,Map,Set,Promise,Number,String,Array,Object,Infinity,NaN,parseInt,isFinite,crypto:globalThis.crypto,fetch:async()=>{throw new Error('no net')},performance:globalThis.performance};sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.removeEventListener=()=>{};
vm.createContext(sandbox);vm.runInContext(code,sandbox,{timeout:30000});const V=sandbox.__V4;
assert.ok(V?.predictStore && V?.singleGenerate && V?.singleRank && V?.singleConditions, 'single-evidence test exports missing');
assert.ok(!V.singleBaseKeys.some(k=>String(k).includes('3')), 'new single-evidence base must not use legacy 3-day dimensions');

function qFor(es){if(es>=4.2)return [.03,.07,.30,.34,.18,.08];if(es>=3.5)return [.05,.15,.40,.25,.10,.05];if(es>=3)return [.08,.22,.50,.14,.05,.01];return [.18,.35,.35,.09,.025,.005]}
function mkRow(table,day){let es=3,diff=0;if(table===3001){if(day%8===7){es=4.6;diff=2800}else{es=2.5;diff=-950}}const q=qFor(es);return{machine:'im',machineName:'アイムジャグラーEX',tableNo:String(table),games:6500,diff,bb:22+Math.round((es-3)*3),rb:18+Math.round((es-3)*5),q,expectedSetting:es,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]}}
const days=[];const start=new Date('2026-01-01T12:00:00');for(let i=0;i<175;i++){const d=new Date(start);d.setDate(d.getDate()+i);const date=d.toISOString().slice(0,10);days.push({id:i,shop:'SLUMP7',date,machines:Array.from({length:20},(_,j)=>mkRow(3001+j,i))})}
const td=new Date(start);td.setDate(td.getDate()+175);const targetDate=td.toISOString().slice(0,10);assert.equal(175%8,7);
const pred=V.predictStore('SLUMP7',targetDate,days,{noCache:true});
assert.ok(pred,'7-day slump prediction missing');
assert.equal(pred.ranking.singleFirst,true);
assert.ok(pred.ranking.rootEvidence.conditionCount>80,`expected broad single condition catalog, got ${pred.ranking.rootEvidence.conditionCount}`);
assert.equal(pred.rows[0].tableNo,'3001','7-day slump->raise table should rank first');
const top=pred.rows[0];assert.ok(top.rootEffectES>0,'root ES effect should be positive');assert.ok(top.rootFamilyCount>0,'root reason families missing');
assert.ok(top.rootReasons.some(r=>/過去7日累計差枚/.test(r.label)||(r.aliasLabels||[]).some(x=>/過去7日累計差枚/.test(x))),`7-day cumulative-diff slump reason missing (including collapsed aliases): ${top.rootReasons.map(r=>[r.label,...(r.aliasLabels||[])].join(' / ')).join(' | ')}`);
assert.match(html, /7:\[3000,5000,7000,10000,14000\]/, '7-day single-condition catalog must include the -5,000 threshold');



// Previous-day dip -> raise: a simple one-day root must be independently discoverable.
function patternedDays(shop,count,tableBase,patternFn){const out=[];for(let i=0;i<count;i++){const d=new Date(start);d.setDate(d.getDate()+i);const date=d.toISOString().slice(0,10);out.push({id:i,shop,date,machines:Array.from({length:14},(_,j)=>{let es=3,diff=0;if(j===0){({es,diff}=patternFn(i))}const q=qFor(es);return{machine:'im',machineName:'アイムジャグラーEX',tableNo:String(tableBase+j),games:6500,diff,bb:22+Math.round((es-3)*3),rb:18+Math.round((es-3)*5),q,expectedSetting:es,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]}})})}return out}
const raise=patternedDays('RAISE1',121,5001,i=>i%2===0?{es:2.2,diff:-1800}:{es:4.3,diff:1900});
const raiseDate=(()=>{const d=new Date(start);d.setDate(d.getDate()+121);return d.toISOString().slice(0,10)})();
const raisePred=V.predictStore('RAISE1',raiseDate,raise,{noCache:true});
assert.ok(raisePred);assert.equal(raisePred.rows[0].tableNo,'5001','previous-day dip -> raise table should rank first');
assert.ok(raisePred.rows[0].rootReasons.some(r=>/前日差枚|過去1日差枚/.test(r.label)||/前日推定設定|過去1日設定/.test(r.label)),`previous-day raise reason missing: ${raisePred.rows[0].rootReasons.map(r=>r.label).join(' | ')}`);

// Previous-day high -> one-day hold: repeated high runs must create a simple hold root.
const hold=patternedDays('HOLD1',130,6001,i=>i%8<=3?{es:4.25,diff:1500}:{es:2.25,diff:-1500});
const holdDate=(()=>{const d=new Date(start);d.setDate(d.getDate()+130);return d.toISOString().slice(0,10)})();
const holdPred=V.predictStore('HOLD1',holdDate,hold,{noCache:true});
assert.ok(holdPred);assert.equal(holdPred.rows[0].tableNo,'6001','previous-day high -> hold table should rank first');
assert.ok(holdPred.rows[0].rootReasons.some(r=>/前日推定設定|過去1日設定/.test(r.label)||/前日P4\+/.test(r.label)),`one-day hold reason missing: ${holdPred.rows[0].rootReasons.map(r=>r.label).join(' | ')}`);

// Flat control: broad condition catalog must not manufacture usable root differences.
const flat=[];for(let i=0;i<100;i++){const d=new Date(start);d.setDate(d.getDate()+i);const date=d.toISOString().slice(0,10);flat.push({id:i,shop:'FLAT47',date,machines:Array.from({length:20},(_,j)=>{const q=qFor(3);return{machine:'im',machineName:'アイムジャグラーEX',tableNo:String(4001+j),games:6500,diff:0,bb:22,rb:18,q,expectedSetting:3,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]}})})}
const ftd=new Date(start);ftd.setDate(ftd.getDate()+100);const flatPred=V.predictStore('FLAT47',ftd.toISOString().slice(0,10),flat,{noCache:true});
assert.ok(flatPred);assert.ok(flatPred.rows.every(r=>Math.abs(r.rootEffectES)<1e-12),'flat control created root effect');assert.ok(new Set(flatPred.rows.map(r=>r.rootRankES.toFixed(10))).size===1,'flat control created root rank differences');

console.log('PASS v4.7.8 single-condition evidence regression');
console.log(`conditions=${pred.ranking.rootEvidence.conditionCount} usable=${pred.ranking.rootEvidence.usableCount} top=${top.tableNo} rootES=${top.rootEffectES.toFixed(3)} reasons=${top.rootFamilyCount}`);
