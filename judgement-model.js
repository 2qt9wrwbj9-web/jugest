(function(global){
'use strict';
const FIELDS=Object.freeze(['machine','tableNo','games','bb','rb','diff']);
const MACHINE_KEYS=Object.freeze(['my','im','go','fk','hp','gg','mr','um']);
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
