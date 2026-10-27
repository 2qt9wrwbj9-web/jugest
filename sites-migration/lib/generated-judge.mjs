// Generated from upstream fixed production source; do not edit by hand.
const globalThis={};
/* JUGEST machine display-name authority. Keys are permanent identifiers; aliases are input-only. */
(function (root) {
  'use strict';
  const entries = Object.freeze({
    my: { full: 'マイジャグラーⅤ', short: 'マイⅤ', variants: ['マイジャグラーⅤ'], aliases: ['マイジャグラーV', 'マイジャグラー5', 'マイジャグV', 'マイジャグ5'] },
    my6: { full: 'マイジャグラーVI', short: 'マイVI', variants: ['マイジャグラーVI'], aliases: ['マイジャグラーⅥ', 'マイジャグラー6', 'マイジャグⅥ', 'マイジャグVI', 'マイジャグ6'] },
    im: { full: 'ネオアイムジャグラーEX', short: 'ネオアイム', variants: ['ネオアイムジャグラーEX'], aliases: ['ネオアイムジャグラー', 'ネオアイム'] },
    go: { full: 'ゴーゴージャグラー3', short: 'ゴージャグ3', variants: ['ゴーゴージャグラー3'], aliases: ['ゴーゴージャグラーⅢ', 'ゴージャグ3', 'ゴージャグⅢ'] },
    fk: { full: 'ファンキージャグラー2', short: 'ファンキー2', variants: ['ファンキージャグラー2'], aliases: ['ファンキージャグラーⅡ', 'ファンキー2', 'ファンキーⅡ'] },
    hp: { full: 'ハッピージャグラーV Ⅲ', short: 'ハッピーVⅢ', variants: ['ハッピージャグラーV Ⅲ'], aliases: ['ハッピージャグラーVⅢ', 'ハッピージャグラーVIII', 'ハッピージャグラーV3', 'ハッピーVⅢ', 'ハッピーVIII', 'ハッピーV3'] },
    gg: { full: 'ジャグラーガールズSS', short: 'ガールズSS', variants: ['ジャグラーガールズSS'], aliases: ['ジャグラーガールズ', 'ガールズSS'] },
    mr: { full: 'ミスタージャグラー', short: 'ミスター', variants: ['ミスタージャグラー'], aliases: ['ミスター'] },
    um: { full: 'ウルトラミラクルジャグラー', short: 'ウルミラ', variants: ['ウルトラミラクルジャグラー'], aliases: ['ウルトラミラクル', 'ウルミラ'] },
    // A single JUGEST key currently covers multiple coin-size/smart-slot product variants.
    // Keep the shared label neutral and preserve distinct manufacturer names as metadata.
    houou: { full: 'ハナハナホウオウ〜天翔〜', short: 'ホウオウ天翔', variants: ['ハナハナホウオウ〜天翔〜', 'ハナハナホウオウ〜天翔〜-30'], aliases: ['ハナハナホウオウ-天翔-', 'ハナハナホウオウ天翔', 'ホウオウ〜天翔〜', 'ホウオウ天翔'] },
    king: { full: 'キングハナハナ-30', short: 'キングハナハナ', variants: ['キングハナハナ-30'], aliases: ['キングハナハナ'] },
    dragon: { full: 'ドラゴンハナハナ〜閃光〜', short: 'ドラゴン閃光', variants: ['ドラゴンハナハナ〜閃光〜', 'ドラゴンハナハナ〜閃光〜-30', 'スマート沖スロ ドラゴンハナハナ〜閃光〜'], aliases: ['ドラゴンハナハナ-閃光-', 'ドラゴンハナハナ閃光', 'Lドラゴンハナハナ〜閃光〜'] },
    star: { full: 'スターハナハナ', short: 'スターハナハナ', variants: ['スターハナハナ-30', 'スマート沖スロ スターハナハナ'], aliases: ['スターハナハナ', 'Lスターハナハナ'] },
    newkingv: { full: 'ニューキングハナハナV', short: 'ニューキングV', variants: ['ニューキングハナハナV-30', 'スマート沖スロ ニューキングハナハナV'], aliases: ['ニューキングハナハナV', 'LニューキングハナハナV', 'スマスロニューキングハナハナV'] }
  });
  const keys = Object.freeze(Object.keys(entries));
  function token(value) {
    let text = String(value ?? '');
    try { text = text.normalize('NFKC'); } catch {}
    return text.toUpperCase().replace(/\s+/g, '').replace(/[‐‑‒–—―]/g, '-').replace(/[〜～~]/g, '~').replace(/[・･]/g, '');
  }
  // The VI and New King V forms intentionally precede their substring families.
  const matchOrder = ['my6', 'newkingv', ...keys.filter(key => key!=='my6' && key!=='newkingv')];
  const matchers = matchOrder.map(key => [key, [entries[key].full, ...entries[key].variants, ...entries[key].aliases].map(token)]);
  const api = Object.freeze({
    keys,
    entries,
    full: key => entries[key]?.full ?? null,
    short: key => entries[key]?.short ?? null,
    variants: key => entries[key]?.variants.slice() ?? [],
    aliases: key => entries[key]?.aliases.slice() ?? [],
    token,
    resolve: name => { const s=token(name); if(!s)return null; for(const [key,words] of matchers) if(words.some(word=>s.includes(word)))return key; return null; }
  });
  root.JugestMachineNames = api;
})(globalThis);

(function(global){
'use strict';
const FIELDS=Object.freeze(['machine','tableNo','games','bb','rb','diff']);
const MACHINE_KEYS=Object.freeze(['my','my6','im','go','fk','hp','gg','mr','um']);
const MESSAGES={machine:'対応する機種を選択してください。',games:'通常Gを正の整数で入力してください。',bb:'BBを0以上の整数で入力してください。',rb:'RBを0以上の整数で入力してください。',diff:'差枚を整数で入力してください。',bonus:'BBとRBの合計が通常Gを超えています。'};
function inputRow(value={}){return Object.fromEntries(FIELDS.map(key=>[key,value[key]==null?'':String(value[key])]))}
function observedInteger(value){
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const text=String(value).trim();if(!/^[+-]?\d+$/.test(text))return null;
 const n=Number(text);return Number.isSafeInteger(n)?n:null;
}
function validateInput(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return{ok:false,errors:{result:'台データを入力してください。'}};
 const errors={},machine=raw.machine,tableNo=String(raw.tableNo??'').trim();
 if(!MACHINE_KEYS.includes(machine))errors.machine=MESSAGES.machine;
 const games=observedInteger(raw.games),bb=observedInteger(raw.bb),rb=observedInteger(raw.rb);
 const missingDiff=raw.diff==null||typeof raw.diff==='string'&&raw.diff.trim()==='';
 const diff=missingDiff?null:observedInteger(raw.diff);
 if(games==null||games<=0)errors.games=MESSAGES.games;
 if(bb==null||bb<0)errors.bb=MESSAGES.bb;
 if(rb==null||rb<0)errors.rb=MESSAGES.rb;
 if(!missingDiff&&diff==null)errors.diff=MESSAGES.diff;
 if(games!=null&&bb!=null&&rb!=null&&bb+rb>games)errors.bonus=MESSAGES.bonus;
 return Object.keys(errors).length?{ok:false,errors}:{ok:true,input:{machine,tableNo,games,bb,rb,diff}};
}
// This is the existing MCP posteriorSummary, shared without changing its arithmetic.
function posteriorSummary(q){return {
 expectedSetting:q.reduce((sum,value,index)=>sum+value*(index+1),0),
 p4:(q[3]||0)+(q[4]||0)+(q[5]||0),p5:(q[4]||0)+(q[5]||0),p6:q[5]||0
}}
function mostLikelySettings(q){const maximum=Math.max(...q);return q.flatMap((p,i)=>p===maximum?[i+1]:[])}
function resultModel(input,judged,{concentration,diagnostics={},engine={},machineName}={}){
 const q=Array.from(judged.q);
 return {ok:true,input:{...input},machineName,q,...posteriorSummary(q),mostLikelySettings:mostLikelySettings(q),
  distributionConcentration:concentration,method:judged.method,
  warnings:judged.reverseWarn?['差枚・通常G・BB・RBの組み合わせを確認してください。']:[],
  reverseWarn:!!judged.reverseWarn,estimatedGrape:judged.estimatedGrape,estimatedGrapeCount:judged.estimatedGrapeCount,
  grapeCountLo:judged.grapeCountLo,grapeCountHi:judged.grapeCountHi,diagnostics,engine};
}
global.JUGESTJudgement=Object.freeze({FIELDS,MACHINE_KEYS,inputRow,validateInput,posteriorSummary,mostLikelySettings,resultModel});
})(typeof globalThis!=='undefined'?globalThis:this);

const rare=[7281.8,7281.8,16384,10922.7,32768,16384].reduce((a,d)=>a+1/d,0);const rareHp=1/4096+3/6553.6;
const NAMES=globalThis.JugestMachineNames;
if(!NAMES)throw new Error("JUGEST機種名定義を読み込めませんでした");
const M={
my:{name:NAMES.full("my"),defs:[["grape","🍇 ぶどう","small"],["cherry","🍒 非重複","small"],["b0","単独BIG","big"],["bc","🍒BIG","big"],["bu","不明BIG","big"],["r0","単独REG","reg"],["rc","🍒REG","reg"],["ru","不明REG","reg"]],
T:[{s:1,g:5.90,c:38.10,b0:409.60,bc:1424.70,r0:655.36,rc:1092.27},{s:2,g:5.85,c:38.10,b0:407.06,bc:1394.38,r0:601.25,rc:1074.36},{s:3,g:5.80,c:36.82,b0:399.61,bc:1365.33,r0:492.75,rc:1057.03},{s:4,g:5.78,c:35.62,b0:378.82,bc:1285.02,r0:407.06,rc:1008.25},{s:5,g:5.76,c:35.62,b0:354.25,bc:1213.63,r0:390.10,rc:862.32},{s:6,g:5.66,c:35.62,b0:337.81,bc:1129.93,r0:327.68,rc:762.05}],
simple:[{g:5.90,b:273.07,r:409.60},{g:5.85,b:270.81,r:385.51},{g:5.80,b:266.41,r:336.08},{g:5.78,b:254.02,r:289.98},{g:5.76,b:240.06,r:268.59},{g:5.66,b:229.15,r:229.15}],
revch:[35.8884,35.8491,34.6769,33.5074,33.2693,33.0345], bell:1024,pier:1024,replay:7.298,bbpay:240,regpay:96,chpay:2,
note:"マイジャグV：詳細フラグを多項尤度で評価。"},
im:{name:NAMES.full("im"),defs:[["grape","🍇 ぶどう","small"],["big","BIG","small"],["reg","REG","small"]],
T:[{s:1,g:6.02,b:273.07,r:439.84},{s:2,g:6.02,b:269.70,r:399.61},{s:3,g:6.02,b:269.70,r:330.99},{s:4,g:6.02,b:259.04,r:315.08},{s:5,g:6.02,b:259.04,r:255.00},{s:6,g:5.78,b:255.00,r:255.00}],
simple:[{g:6.02,b:273.07,r:439.84},{g:6.02,b:269.70,r:399.61},{g:6.02,b:269.70,r:330.99},{g:6.02,b:259.04,r:315.08},{g:6.02,b:259.04,r:255.00},{g:5.78,b:255.00,r:255.00}],
revch:[33.488,33.437,33.267,33.149,32.900,32.900],bell:1092.267,pier:1092.267,replay:7.298,bbpay:252,regpay:96,chpay:2,
note:"アイムEX：🍇・BIG・REGで判別。"},
go:{name:NAMES.full("go"),defs:[["grape","🍇 ぶどう","small"],["big","BIG","small"],["reg","REG","small"]],
T:[{s:1,g:6.25,b:259.04,r:354.25},{s:2,g:6.20,b:258.02,r:332.67},{s:3,g:6.15,b:257.00,r:306.24},{s:4,g:6.07,b:254.02,r:268.59},{s:5,g:6.00,b:247.31,r:247.31},{s:6,g:5.92,b:234.90,r:234.90}],
simple:[{g:6.25,b:259.04,r:354.25},{g:6.20,b:258.02,r:332.67},{g:6.15,b:257.00,r:306.24},{g:6.07,b:254.02,r:268.59},{g:6.00,b:247.31,r:247.31},{g:5.92,b:234.90,r:234.90}],
revch:[33.403,33.301,33.200,33.099,32.900,32.801],bell:1092.27,pier:1092.27,replay:7.298,bbpay:240,regpay:96,chpay:2,
note:"ゴージャグ3：🍇・BIG・REGで判別。"},
fk:{name:NAMES.full("fk"),defs:[["grape","🍇 ぶどう","small"],["b0","単独BIG","big"],["bc","🍒BIG","big"],["bu","不明BIG","big"],["r0","単独REG","reg"],["rc","🍒REG","reg"],["ru","不明REG","reg"]],
T:[{s:1,g:5.94,b0:402.06,bc:1456.36,r0:636.27,rc:1424.70,ra:6553.6,rb:6553.6,rabp:16384},{s:2,g:5.92,b0:397.19,bc:1365.33,r0:574.88,rc:1394.38,ra:5957.8,rb:5957.8,rabp:16384},{s:3,g:5.88,b0:397.19,bc:1337.47,r0:512,rc:1285.02,ra:5461.3,rb:5461.3,rabp:16384}].filter(Boolean),
simple:[{g:5.94,b:266.41,r:439.84},{g:5.92,b:259.04,r:407.06},{g:5.88,b:256.00,r:366.12},{g:5.83,b:249.19,r:322.84},{g:5.76,b:240.06,r:299.25},{g:5.67,b:219.92,r:262.14}],
revch:[33.9413,33.8711,33.7838,33.6796,33.5933,33.4220],bell:1092.27,pier:1092.27,replay:7.298,bbpay:240,regpay:96,chpay:2,
note:"ファンキー2：詳細判別ではレアBIGを単独/🍒BIGへ50:50配分。"},
hp:{name:NAMES.full("hp"),defs:[["grape","🍇 ぶどう","small"],["cherry","🍒 非重複","small"],["b0","単独BIG等","big"],["bc","🍒BIG","big"],["bu","不明BIG","big"],["r0","単独REG","reg"],["rc","🍒REG","reg"],["ru","不明REG","reg"]],
T:[{s:1,g:6.04,c:62.24,b0:436.91,bc:1489.45,r0:636.27,rc:1057.03},{s:2,g:6.01,c:62.47,b0:431.16,bc:1489.45,r0:569.88,rc:992.97},{s:3,g:5.98,c:62.95,b0:412.18,bc:1489.45,r0:532.81,rc:885.62},{s:4,g:5.84,c:64.00,b0:414.78,bc:1213.63,r0:478.36,rc:809.09},{s:5,g:5.81,c:64.57,b0:376.64,bc:1213.63,r0:436.91,rc:728.18},{s:6,g:5.79,c:65.34,b0:344.93,bc:1213.63,r0:425.56,rc:642.51}],
simple:[{g:6.04,b:273.07,r:397.19},{g:6.01,b:270.81,r:362.08},{g:5.98,b:263.20,r:332.67},{g:5.84,b:254.02,r:300.62},{g:5.81,b:239.18,r:273.07},{g:5.79,b:225.99,r:256.00}],
revch:[56.55,56.55,56.55,56.55,56.55,56.55],bell:655.36,pier:655.36,replay:7.298,bbpay:240,regpay:96,chpay:4,
note:"ハッピーVⅢ：ガリぞう説。単独BIG等は単独BIGに4種のレアBIG（1枚役・レアチェリー）を合算。🍇・非重複🍒・単独BIG等・🍒BIG・単独REG・🍒REGを多項尤度で評価。"},
gg:{name:NAMES.full("gg"),defs:[["grape","🍇 ぶどう","small"],["cherry","🍒 チェリー","small"],["big","BIG","small"],["reg","REG","small"]],
T:[{s:1,g:5.98,c:33.56,b:273.07,r:381.02},{s:2,g:5.98,c:33.47,b:270.81,r:350.46},{s:3,g:5.98,c:33.32,b:260.06,r:316.60},{s:4,g:5.98,c:33.15,b:250.14,r:281.27},{s:5,g:5.88,c:33.10,b:243.63,r:270.81},{s:6,g:5.83,c:32.97,b:225.99,r:252.06}],
simple:[{g:5.98,b:273.07,r:381.02},{g:5.98,b:270.81,r:350.46},{g:5.98,b:260.06,r:316.60},{g:5.98,b:250.14,r:281.27},{g:5.88,b:243.63,r:270.81},{g:5.83,b:225.99,r:252.06}],
revch:[33.56,33.47,33.32,33.15,33.10,32.97],bell:1092.27,pier:1092.27,replay:7.298,bbpay:240,regpay:96,chpay:2,
note:"ジャグラーガールズSS：ガリぞう説。🍇・🍒・BIG・REGで判別。"},

mr:{name:NAMES.full("mr"),defs:[["grape","🍇 ぶどう","small"],["big","BIG","small"],["reg","REG","small"]],
T:[{s:1,g:6.29,b:268.59,r:374.49},{s:2,g:6.22,b:267.49,r:354.25},{s:3,g:6.15,b:260.06,r:330.99},{s:4,g:6.09,b:249.19,r:291.27},{s:5,g:6.02,b:240.94,r:257.00},{s:6,g:5.96,b:237.45,r:237.45}],
simple:[{g:6.29,b:268.59,r:374.49},{g:6.22,b:267.49,r:354.25},{g:6.15,b:260.06,r:330.99},{g:6.09,b:249.19,r:291.27},{g:6.02,b:240.94,r:257.00},{g:5.96,b:237.45,r:237.45}],
revch:[37.24,37.24,37.24,37.24,37.24,37.24],bell:655.4,pier:420.1,replay:7.298,bbpay:240,regpay:96,chpay:4,
note:"ミスタージャグラー：ガリぞう説。判別は🍇・BIG・REG。全チェリー1/37.24は設定差なしのため後ヅモ差枚復元だけに使用。"},

um:{name:NAMES.full("um"),defs:[["grape","🍇 ぶどう","small"],["cherry","🍒 非重複","small"],["big","BIG","small"],["reg","REG","small"]],
T:[{s:1,g:5.93,c:37.22,b:267.49,r:425.56},{s:2,g:5.93,c:37.22,b:261.10,r:402.06},{s:3,g:5.93,c:37.22,b:256.00,r:350.46},{s:4,g:5.93,c:37.09,b:242.73,r:322.84},{s:5,g:5.87,c:36.13,b:233.22,r:297.89},{s:6,g:5.81,c:35.48,b:216.29,r:277.69}],
simple:[{g:5.93,b:267.49,r:425.56},{g:5.93,b:261.10,r:402.06},{g:5.93,b:256.00,r:350.46},{g:5.93,b:242.73,r:322.84},{g:5.87,b:233.22,r:297.89},{g:5.81,b:216.29,r:277.69}],
revch:[35.1,35.0,34.8,34.6,33.5,33.0],bell:1024,pier:1024,replay:7.298,bbpay:240,regpay:96,chpay:2,
note:"ウルトラミラクルジャグラー：ガリぞう説。🍇・非重複🍒・BIG・REGで判別。後ヅモは設定別の全チェリー確率を使用。"}
};
// The My Juggler VI alias intentionally uses the same judgement parameters as V.
M.my6={...M.my,name:NAMES.full("my6"),defs:M.my.defs.map(row=>[...row]),T:M.my.T.map(row=>({...row})),simple:M.my.simple.map(row=>({...row})),revch:[...M.my.revch],note:"マイジャグⅥ：マイジャグⅤと同一の判別用スペックを使用。"};
// Restore full Funky detailed table
M.fk.T=[{s:1,g:5.94,b0:402.06,bc:1456.36,r0:636.27,rc:1424.70,ra:6553.6,rb:6553.6,rabp:16384},{s:2,g:5.92,b0:397.19,bc:1365.33,r0:574.88,rc:1394.38,ra:5957.8,rb:5957.8,rabp:16384},{s:3,g:5.88,b0:397.19,bc:1337.47,r0:512,rc:1285.02,ra:5461.3,rb:5461.3,rabp:16384},{s:4,g:5.83,b0:385.51,bc:1337.47,r0:448.88,rc:1149.75,ra:5041.2,rb:5041.2,rabp:16384},{s:5,g:5.76,b0:378.82,bc:1260.31,r0:409.60,rc:1110.78,ra:4681.1,rb:4681.1,rabp:10923},{s:6,g:5.67,b0:339.56,bc:1191.56,r0:356.17,rc:992.97,ra:4369.1,rb:4369.1,rabp:10923}];

const HANA=null;
const HANA_MACHINE_KEYS=['houou','king','dragon','star','newkingv'];
function styleRates(key,style){
 if(key==="hp"){
  if(style==="perfect")return{c:1,b:1,p:1};
  if(style==="cherry")return{c:1,b:0,p:0};
  return{c:.667,b:.444,p:.172};
 }
 if(key==="mr"){
  if(style==="perfect")return{c:1,b:1,p:1};
  if(style==="cherry")return{c:1,b:0,p:.3016};
  return{c:.6667,b:.1111,p:.4021};
 }
 if(key==="um"){
  if(style==="cherry")return{c:1,b:0,p:0};
  return{c:.6667,b:.2222,p:.1005};
 }
 if(style==="cherry")return{c:1,b:0,p:0};
 return{c:.667,b:.222,p:.101};
}
function styleAllowed(key){if(HANA_MACHINE_KEYS.includes(key))return["unknown","random","cherry","perfect"];return(key==="hp"||key==="mr")?["unknown","random","cherry","perfect"]:["unknown","random","cherry"]}
function normalizeStyle(key,style){return styleAllowed(key).includes(style)?style:"random"}
function norm(L){let m=Math.max(...L.filter(Number.isFinite)),w=L.map(v=>Number.isFinite(v)?Math.exp(v-m):0),z=w.reduce((a,b)=>a+b,0);return w.map(v=>v/z)}
function logBonus(n,b,r,pb,pr){let o=n-b-r,po=1-pb-pr;if(b<0||r<0||o<0||pb<=0||pr<=0||po<=0)return-Infinity;return b*Math.log(pb)+r*Math.log(pr)+o*Math.log(po)} // multinomial coefficient cancels
function reverseCoreKnown(key,Gg,B,R,D,style="random"){
 let m=M[key];if(!m||!Gg)return null;
 let rows=[],Ls=[];
 m.simple.forEach((t,i)=>{
  let pcg=1/m.revch[i],pr=1/m.replay,pb=1/m.bell,pp=1/m.pier;
  let bonus=m.bbpay*B+m.regpay*R,rt=styleRates(key,normalizeStyle(key,style));
  let cp=m.chpay||2,qc=rt.c*pcg,qb=rt.b*pb,qp=rt.p*pp;
  let other=3*Gg*pr+cp*(Gg*qc)+14*(Gg*qb)+10*(Gg*qp);
  let V=(3*Gg+D-bonus+(B+R)-other)/8;
  let vg=V>0?Gg/V:Infinity;
  let varOut=9*Gg*pr*(1-pr)+cp*cp*Gg*qc*(1-qc)+196*Gg*qb*(1-qb)+100*Gg*qp*(1-qp);
  let varV=varOut/64,pg=1/t.g,meanG=Gg*pg,varG=Gg*pg*(1-pg);
  let z=V-meanG,lg=-.5*z*z/(varV+varG)-.5*Math.log(varV+varG);
  lg+=logBonus(Gg,B,R,1/t.b,1/t.r);
  Ls.push(lg);rows.push({s:i+1,V,vg,tg:t.g,b:t.b,r:t.r,sd:Math.sqrt(varV)})
 });
 let q=norm(Ls),vbar=rows.reduce((a,x,i)=>a+q[i]*x.V,0),denom=vbar>0?Gg/vbar:Infinity;
 let mixVar=rows.reduce((a,x,i)=>a+q[i]*(x.sd*x.sd+(x.V-vbar)*(x.V-vbar)),0),sd=Math.sqrt(mixVar);
 let lo=Math.max(1,vbar-1.96*sd),hi=vbar+1.96*sd;
 return{q,rows,Ls:Ls.slice(),vbar,denom,lo,hi,warn:rows.some(x=>x.V<0||x.V>Gg)}
}

function logMix(vals,weights){
 let m=Math.max(...vals);
 if(!isFinite(m))return-Infinity;
 let z=0;for(let i=0;i<vals.length;i++)z+=weights[i]*Math.exp(vals[i]-m);
 return m+Math.log(z)
}
function reverseCore(key,Gg,B,R,D,style="random"){
 if(style!=="unknown")return reverseCoreKnown(key,Gg,B,R,D,style);
 let styles=(key==="hp"||key==="mr")?["random","cherry","perfect"]:["random","cherry"];
 let priors=(key==="hp"||key==="mr")?[.45,.45,.10]:[.5,.5];
 let cores=styles.map(st=>reverseCoreKnown(key,Gg,B,R,D,st));
 if(cores.some(x=>!x))return null;
 let Ls=M[key].T.map((_,i)=>logMix(cores.map(c=>c.Ls[i]),priors));
 let q=norm(Ls);
 let rows=M[key].T.map((t,i)=>{
  let ls=cores.map(c=>c.Ls[i]),mx=Math.max(...ls);
  let ws=ls.map((v,j)=>priors[j]*Math.exp(v-mx)),zw=ws.reduce((a,b)=>a+b,0);
  ws=ws.map(v=>v/zw);
  let V=cores.reduce((a,c,j)=>a+ws[j]*c.rows[i].V,0);
  let varWithin=cores.reduce((a,c,j)=>a+ws[j]*(c.rows[i].sd*c.rows[i].sd+(c.rows[i].V-V)*(c.rows[i].V-V)),0);
  return{s:i+1,V,vg:V>0?Gg/V:Infinity,tg:t.g,b:t.b,r:t.r,sd:Math.sqrt(varWithin)}
 });
 let vbar=rows.reduce((a,x,i)=>a+q[i]*x.V,0),denom=vbar>0?Gg/vbar:Infinity;
 let mixVar=rows.reduce((a,x,i)=>a+q[i]*(x.sd*x.sd+(x.V-vbar)*(x.V-vbar)),0),sd=Math.sqrt(mixVar);
 let lo=Math.max(1,vbar-1.96*sd),hi=vbar+1.96*sd;
 return{q,rows,Ls:Ls.slice(),vbar,denom,lo,hi,warn:cores.some(c=>c.warn),unknownMix:true}
}
function safeNorm(L){let good=L.filter(Number.isFinite);if(!good.length)return null;let q=norm(L);return q.every(Number.isFinite)?q:null}
function externalBonusJudgeQ(key,g,bb,rb,capture){
 if(!M[key]||!g)return null;bb=Math.max(0,+bb||0);rb=Math.max(0,+rb||0);let no=Math.max(0,(+g||0)-bb-rb);
 let L=M[key].simple.map(t=>{let pb=1/t.b,pr=1/t.r,p0=1-pb-pr;if(p0<=0)return-Infinity;return (bb?bb*Math.log(pb):0)+(rb?rb*Math.log(pr):0)+(no?no*Math.log(p0):0)});
 if(capture)capture({logs:L.slice(),style:"unknown"});
 return safeNorm(L)
}
function hanaQ6(key,q){if(!Array.isArray(q))return null;if(key==="newkingv")return[q[0]||0,q[1]||0,q[2]||0,q[3]||0,q[4]||0,0];return q.length===6?q.slice():null}
function externalJudge(key,g,bb,rb,diff,capture){
 if(HANA_MACHINE_KEYS.includes(key)&&HANA){
  g=+g||0;bb=Math.max(0,+bb||0);rb=Math.max(0,+rb||0);if(!g)return null;
  let r=HANA.numericJudge(key,{G:g,bb,rb,diff:(diff!=null&&Number.isFinite(+diff))?+diff:null,style:"unknown"}),q=hanaQ6(key,r.q);
  if(!q)return null;let z=r.reverse;
  return{q,method:r.bellMode==="reverse"?"reverse-bell":"bonus-only",estimatedGrape:Number.isFinite(z?.inferredDenom)?z.inferredDenom:NaN,estimatedGrapeCount:Number.isFinite(z?.inferredBell)?z.inferredBell:NaN,estimatedBell:Number.isFinite(z?.inferredDenom)?z.inferredDenom:NaN,estimatedBellCount:Number.isFinite(z?.inferredBell)?z.inferredBell:NaN,grapeCountLo:Number.isFinite(z?.range?.countLow)?z.range.countLow:NaN,grapeCountHi:Number.isFinite(z?.range?.countHigh)?z.range.countHigh:NaN,reverseWarn:(r.warnings||[]).some(x=>String(x).includes("物理範囲"))};
 }
 if(!M[key]||!g)return null;g=+g||0;bb=Math.max(0,+bb||0);rb=Math.max(0,+rb||0);
 if(diff!=null&&Number.isFinite(+diff)){
  let z=reverseCore(key,g,bb,rb,+diff,"unknown");
  if(z&&Array.isArray(z.q)&&z.q.every(Number.isFinite)){
   if(capture){const captured={...z,q:z.q.slice(),Ls:z.Ls.slice(),rows:z.rows.map(row=>({...row}))};capture({logs:captured.Ls,reverse:captured,style:"unknown"});}
   return{q:z.q,method:"reverse-diff",estimatedGrape:Number.isFinite(z.denom)?z.denom:NaN,estimatedGrapeCount:Number.isFinite(z.vbar)?z.vbar:NaN,grapeCountLo:Number.isFinite(z.lo)?z.lo:NaN,grapeCountHi:Number.isFinite(z.hi)?z.hi:NaN,reverseWarn:!!z.warn}
  }
 }
 let q=externalBonusJudgeQ(key,g,bb,rb,capture);
 return q?{q,method:"bonus-only",estimatedGrape:NaN,estimatedGrapeCount:NaN,grapeCountLo:NaN,grapeCountHi:NaN,reverseWarn:false}:null
}
export const JUGGLER_MACHINE_KEYS=Object.freeze(['my','my6','im','go','fk','hp','gg','mr','um']);

const MACHINE_NAMES=Object.freeze(Object.fromEntries(JUGGLER_MACHINE_KEYS.map(key=>[key,globalThis.JugestMachineNames.full(key)])));

export function jugglerMachineName(key){return MACHINE_NAMES[key]??null}

const {posteriorSummary}=globalThis.JUGESTJudgement;

function decorate(input,judged){
  if(!judged)return null;
  const machine=String(input?.machine??'').trim(),games=+input?.games||0;
  const bb=Math.max(0,+input?.bb||0),rb=Math.max(0,+input?.rb||0);
  const hasDiff=input?.diff!==null&&input?.diff!==undefined&&input?.diff!==''&&Number.isFinite(+input.diff);
  const q=Array.from(judged.q,Number);
  return {
    machine,machineName:jugglerMachineName(machine),games,bb,rb,diff:hasDiff?+input.diff:null,q,method:judged.method,
    ...posteriorSummary(q),
    estimatedGrape:judged.estimatedGrape,estimatedGrapeCount:judged.estimatedGrapeCount,
    grapeCountLo:judged.grapeCountLo,grapeCountHi:judged.grapeCountHi,reverseWarn:!!judged.reverseWarn
  };
}

async function judgeJugglerExternal(input={}) {
 const machine=String(input?.machine??'').trim(),games=Number(input?.games)||0;
 const bb=Math.max(0,Number(input?.bb)||0),rb=Math.max(0,Number(input?.rb)||0);
 const hasDiff=input?.diff!==null&&input?.diff!==undefined&&input?.diff!==''&&Number.isFinite(Number(input.diff));
 const raw=externalJudge(machine,games,bb,rb,hasDiff?Number(input.diff):null);
 if(!raw)return null; const q=Array.isArray(raw.q)?Array.from(raw.q,Number):null;
 if(!q||!q.length||q.some(value=>!Number.isFinite(value)))return null;
 return decorate(input,{q,method:String(raw.method||''),estimatedGrape:Number(raw.estimatedGrape),estimatedGrapeCount:Number(raw.estimatedGrapeCount),grapeCountLo:Number(raw.grapeCountLo),grapeCountHi:Number(raw.grapeCountHi),reverseWarn:!!raw.reverseWarn});
}
const MACHINE_KEYS=new Set(JUGGLER_MACHINE_KEYS);
const JUDGE_VERSION="external-juggler-browser-parity-v1";
function finite(value){const n=Number(value);return Number.isFinite(n)?n:null}
async function judgeRow(raw,index,rootDir){
  const tableNo=String(raw?.tableNo??'').trim().slice(0,80),base={ok:false,index,tableNo};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {...base,code:'bad_machine_row'};
  const machine=String(raw.machine??'').trim();if(!MACHINE_KEYS.has(machine))return {...base,machine,code:'unsupported_machine'};
  const games=finite(raw.games);if(games==null||games<=0)return {...base,machine,code:'bad_games'};
  const bb=raw.bb==null?0:finite(raw.bb),rb=raw.rb==null?0:finite(raw.rb);
  if(bb==null||rb==null||!Number.isInteger(bb)||!Number.isInteger(rb)||bb<0||rb<0)return {...base,machine,code:'bad_bonus_count'};
  if(bb+rb>games)return {...base,machine,code:'bonus_exceeds_games'};
  const hasDiff=raw.diff!==null&&raw.diff!==undefined&&raw.diff!=='';
  const diff=hasDiff?finite(raw.diff):null;if(hasDiff&&diff==null)return {...base,machine,code:'bad_diff'};
  const judged=await judgeJugglerExternal({machine,games,bb,rb,diff},{rootDir});if(!judged)return {...base,machine,code:'judge_unavailable'};
  return {ok:true,index,tableNo,...judged};
}

export async function judgeMachinesPublic(machines,{rootDir}={}){
  const judged=await Promise.all(machines.map((row,index)=>judgeRow(row,index,rootDir)));
  return {ok:true,judgeVersion:JUDGE_VERSION,machines:judged};
}
