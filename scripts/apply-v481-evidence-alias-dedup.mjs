import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const rootPath = 'index.html';
const publicPath = 'public/index.html';
const packagePath = 'package.json';
const testPath = 'tests/v481-evidence-alias-dedup.mjs';

function mustReplace(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function patchHtml(source) {
  let html = source;
  html = mustReplace(
    html,
    '<!--\nv4.8.0 data-page setting summary:',
    `<!--\nv4.8.1 single-evidence alias dedup:\n- Practical single-evidence ranking now collapses statistically identical aliases after the existing per-family winner selection. This prevents the same observed cohort from receiving multiple weighted contributions merely because it is expressible by different labels/families (for example exact table vs a unique lower-two-digit condition, or equivalent ratio/count conditions).\n- Alias detection is aggregation-only and uses the already-computed raw validation/effect fingerprint; it does not remove conditions from analysis, alter FDR diagnostics, or change strict Champion/calibration probability math. Surviving reasons expose aliasCount/aliasLabels for auditability.\n- Root-evidence topPositive is deduplicated with the same rule. externalJudge(), machine probability tables, HANA hard constraints, store-share constraint, acquisition/relay behavior and Launcher remain unchanged.\n\nv4.8.0 data-page setting summary:`,
    'changelog header'
  );
  html = mustReplace(html, '<title>ジャグラー設定判別 v4.8.0</title>', '<title>ジャグラー設定判別 v4.8.1</title>', 'title version');
  html = mustReplace(html, '>v4.8.0</span></h1>', '>v4.8.1</span></h1>', 'visible version');
  html = mustReplace(html, 'appVersion:"4.8.0"', 'appVersion:"4.8.1"', 'backup version');
  html = mustReplace(
    html,
    "note:'v4.7.9 uses one hybrid ranking for screen and JSON. Expensive walk-forward mixture learning is explicit and persisted per shop; ordinary prediction reuses a fresh saved profile or conservative fallback, preventing repeated historical re-prediction. Strict validated probability/Champion remains mathematically separate and no AI API is called.'",
    "note:'v4.8.1 uses one hybrid ranking for screen and JSON. Practical single-evidence aliases with an identical raw validation/effect fingerprint are collapsed before weighted aggregation, preventing the same observed cohort from being counted twice under different labels. Expensive walk-forward mixture learning remains explicit and persisted per shop; strict validated probability/Champion remains mathematically separate and no AI API is called.'",
    'AI payload note'
  );

  const rankStart = html.indexOf('function bruteSingleRankForRow(engine,row,{excludeFamilies=[],conditions=null,ctx=null}={}){');
  const rankEnd = html.indexOf('function bruteSingleCandidateLabel(c){', rankStart);
  if (rankStart < 0 || rankEnd < 0) throw new Error('Could not locate bruteSingleRankForRow block');
  const replacement = `function bruteSingleRankQuality(c){return Math.abs(c?.practicalEffect||0)*(.45+.55*(c?.confidence||0)/100)}\nfunction bruteSingleAliasNumber(v){return Number.isFinite(v)?String(Object.is(v,-0)?0:v):"—"}\nfunction bruteSingleAliasFingerprint(c){\n return [c?.scope||"",c?.machine||"",c?.days??"",c?.rows??"",c?.prevalence??"",c?.effect,c?.p4Delta,c?.discEffect,c?.valEffect,c?.oosEffect,c?.oosWinRate,c?.block6WinRate,c?.recent30,c?.recent60,c?.recent90].map((v,i)=>i<5?String(v):bruteSingleAliasNumber(v)).join("\\u001f")\n}\nfunction bruteSingleAliasGroups(cands){\n let aliases=new Map;for(let c of cands||[]){let k=bruteSingleAliasFingerprint(c),quality=bruteSingleRankQuality(c),old=aliases.get(k);if(!old){aliases.set(k,{c,quality,aliases:[c]});continue}old.aliases.push(c);if(quality>old.quality){old.c=c;old.quality=quality}}\n return [...aliases.values()].sort((a,b)=>(b.c?.rankScore||0)-(a.c?.rankScore||0)||b.quality-a.quality)\n}\nfunction bruteSingleRankForRow(engine,row,{excludeFamilies=[],conditions=null,ctx=null}={}){\n if(!engine||!row)return{effectES:0,p4Effect:0,confidence:0,reasons:[],matchedCount:0,familyCount:0};let ex=new Set(excludeFamilies),conds=conditions||engine.targetConditions?.get(\\`${'${row.machine}'}|${'${row.tableNo}'}|${'${row.date}'}\\`)||bruteSingleConditions(row,ctx||engine.ctx),matched=[];\n for(let m of conds){if(ex.has(m.family))continue;let a=engine.storeMap.get(m.id),b=engine.machineMap.get(\\`${'${row.machine}'}\\u001e${'${m.id}'}\\`);for(let c of [a,b])if(c&&c.directionStable&&c.confidence>=15&&Math.abs(c.practicalEffect)>=.003)matched.push(c)}\n let fam=new Map;for(let c of matched){let f=c.meta.family,quality=bruteSingleRankQuality(c),old=fam.get(f);if(!old||quality>old.quality)fam.set(f,{c,quality})}\n let roots=bruteSingleAliasGroups([...fam.values()].map(x=>x.c)).sort((a,b)=>Math.abs(b.c.practicalEffect)-Math.abs(a.c.practicalEffect)),weights=[1,.78,.62,.50,.40,.33,.27,.22,.18,.15],effectES=0,p4Effect=0,reasons=[],cw=0,cs=0;\n for(let i=0;i<Math.min(weights.length,roots.length);i++){let x=roots[i],c=x.c,w=weights[i];effectES+=c.practicalEffect*w;p4Effect+=(c.practicalP4Delta||0)*w;let mag=Math.abs(c.practicalEffect*w);cw+=mag;cs+=mag*c.confidence/100;let aliasLabels=[...new Set(x.aliases.map(a=>a.meta?.label).filter(Boolean))].filter(label=>label!==c.meta.label);reasons.push({label:c.meta.label,family:c.meta.family,scope:c.scope,machine:c.machine,confidence:c.confidence,days:c.days,rows:c.rows,effect:c.effect,p4Delta:c.p4Delta,practicalEffect:c.practicalEffect,practicalP4Delta:c.practicalP4Delta,contributionES:c.practicalEffect*w,contributionP4:(c.practicalP4Delta||0)*w,recent30:c.recent30,recent60:c.recent60,recent90:c.recent90,q:c.q,status:c.status,aliasCount:x.aliases.length,aliasLabels})}\n let baseConf=cw?cs/cw:0,confidence=bruteClamp(baseConf*(.55+.45*Math.min(1,roots.length/5)),0,1);\n return{effectES:bruteClamp(effectES,-.85,.85),p4Effect:bruteClamp(p4Effect,-.32,.32),confidence,reasons,matchedCount:matched.length,familyCount:roots.length}\n}\n`;
  html = html.slice(0, rankStart) + replacement + html.slice(rankEnd);

  html = mustReplace(
    html,
    'rootTop=singleEvidence.all.filter(c=>c.practicalEffect>0).slice(0,20).map(bruteSinglePublic),',
    'rootTop=bruteSingleAliasGroups(singleEvidence.all.filter(c=>c.practicalEffect>0)).slice(0,20).map(x=>({...bruteSinglePublic(x.c),aliasCount:x.aliases.length,aliasLabels:[...new Set(x.aliases.map(a=>a.meta?.label).filter(Boolean))].filter(label=>label!==x.c.meta.label)})),',
    'rootEvidence topPositive alias dedup'
  );

  return html;
}

const root = fs.readFileSync(rootPath, 'utf8');
const pub = fs.readFileSync(publicPath, 'utf8');
if (root !== pub) throw new Error('root/public index.html must be byte-identical before v4.8.1 patch');
const patched = patchHtml(root);
fs.writeFileSync(rootPath, patched);
fs.writeFileSync(publicPath, patched);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.name = 'juggler-hanahana-tool-v4810';
pkg.version = '4.8.1';
for (const key of ['test', 'check']) {
  if (!pkg.scripts?.[key]) throw new Error(`package script missing: ${key}`);
  if (!pkg.scripts[key].includes('tests/v481-evidence-alias-dedup.mjs')) pkg.scripts[key] += ' && node tests/v481-evidence-alias-dedup.mjs';
}
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

const test = String.raw`import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
assert.match(html, /<title>ジャグラー設定判別 v4\.8\.1<\/title>/);
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
assert.ok(rootLabels.includes(exact)||rootLabels.includes(tail2), `expected one table alias reason: ${rootLabels.join(' | ')}`);
assert.ok(!(rootLabels.includes(exact)&&rootLabels.includes(tail2)), `root ranking double-counted exact table and lower-two-digit aliases: ${rootLabels.join(' | ')}`);
assert.ok(!(practicalLabels.includes(exact)&&practicalLabels.includes(tail2)), `practical ranking double-counted exact table and lower-two-digit aliases: ${practicalLabels.join(' | ')}`);
assert.ok(r.rootReasons.some(x=>x.aliasCount>=2&&(x.label===exact||x.label===tail2)), 'surviving root reason must report collapsed aliasCount');
const topLabels=pred.ranking.rootEvidence.topPositive.map(x=>x.label);
assert.ok(!(topLabels.includes(exact)&&topLabels.includes(tail2)), `rootEvidence topPositive still exposes duplicate aliases: ${topLabels.join(' | ')}`);
assert.ok(pred.ranking.rootEvidence.topPositive.some(x=>x.aliasCount>=2&&(x.label===exact||x.label===tail2)), 'rootEvidence topPositive must expose aliasCount for the collapsed table alias');

console.log('PASS v4.8.1 single-evidence alias dedup regression');
console.log(`1088 rootFamilies=${r.rootFamilyCount} aliases=${r.rootReasons.filter(x=>x.aliasCount>1).map(x=>`${x.label}:${x.aliasCount}`).join(',')}`);
`;
fs.writeFileSync(testPath, test);

execFileSync(process.execPath, [testPath], { stdio: 'inherit' });
console.log('v4.8.1 patch applied; targeted regression passed');
