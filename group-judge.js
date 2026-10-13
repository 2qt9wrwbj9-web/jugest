(function(global){
'use strict';

// Pure analysis of this invocation's observed judgements. No store or session data.
const VERSION='parallel-group-judge-v1';
const MACHINE_KEYS=Object.freeze(['my','my6','im','go','fk','hp','gg','mr','um']);
const HYPOTHESES=Object.freeze([
 Object.freeze({id:'all456',label:'全456',allowed:Object.freeze([4,5,6]),complementLabel:'非全456（少なくとも1台が設定1〜3）'}),
 Object.freeze({id:'all56',label:'全56',allowed:Object.freeze([5,6]),complementLabel:'非全56（少なくとも1台が設定1〜4）'}),
 Object.freeze({id:'all6',label:'全6',allowed:Object.freeze([6]),complementLabel:'非全6（少なくとも1台が設定1〜5）'})
]);
const WEIGHTS=Object.freeze([
 Object.freeze({id:'equal',label:'等重み（各設定1/6）',weights:Object.freeze([1/6,1/6,1/6,1/6,1/6,1/6])}),
 Object.freeze({id:'lower',label:'低設定寄り（3・3・2・1・1・1 / 11）',weights:Object.freeze([3/11,3/11,2/11,1/11,1/11,1/11])}),
 Object.freeze({id:'upper',label:'高設定寄り（1・1・1・2・3・3 / 11）',weights:Object.freeze([1/11,1/11,1/11,2/11,3/11,3/11])})
]);
const LOG3=Math.log(3),LOG05=Math.log(.05),LOG2PI=Math.log(2*Math.PI);
class NumericalError extends Error {}

function logAdd(a,b){
 if(a===-Infinity)return b;if(b===-Infinity)return a;
 return Math.max(a,b)+Math.log1p(Math.exp(-Math.abs(a-b)));
}
function logSum(values){let sum=-Infinity;for(const value of values)sum=logAdd(sum,value);return sum}
function log1mexp(value){
 if(value>0||Number.isNaN(value))throw new NumericalError('補集合の重みを安全に計算できませんでした。');
 if(value===0)return-Infinity;
 return value<-Math.LN2?Math.log1p(-Math.exp(value)):Math.log(-Math.expm1(value));
}
function logProduct(a,b){
 if(a===-Infinity||b===-Infinity)return-Infinity;
 const value=a+b;
 if(!Number.isFinite(value))throw new NumericalError('ログ値の合計が安全な計算範囲を超えています。');
 return value;
}
function normalizeLogs(logs){
 const maximum=Math.max(...logs);
 return logs.map(value=>{
  if(value===-Infinity)return value;
  const normalized=value-maximum;
  if(!Number.isFinite(normalized))throw new NumericalError('ログ値の差が安全な計算範囲を超えています。');
  return normalized;
 });
}
function probability(logP){return {p:Math.exp(logP),logP}}
function summary(q){return {expectedSetting:q.reduce((sum,p,i)=>sum+p*(i+1),0),p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]}}

// Loader's binomial normalization avoids subtraction of large log-gamma values.
// Integer Stirling errors below 16 are constants; the asymptotic remainder at 16
// is below double precision. The deviance series is used near its zero.
const SMALL_STIRLING=Object.freeze([0,.08106146679532726,.041340695955409295,.02767792568499834,
 .020790672103765093,.016644691189821192,.013876128823070748,.01189670994589177,
 .010411265261972096,.009255462182712733,.008330563433362872,.007573675487951841,
 .006942840107209529,.006408994188004207,.005951370112758848,.005554733551962801]);
function stirlingError(n){
 if(n<16)return SMALL_STIRLING[n];
 const inverse=1/n,square=inverse*inverse;
 return inverse*(1/12-square*(1/360-square*(1/1260-square*(1/1680-square/1188))));
}
function deviance(x,mean){
 if(x===0)return mean;
 if(Math.abs(x-mean)<.1*(x+mean)){
  let v=(x-mean)/(x+mean),sum=(x-mean)*v,term=2*x*v;
  const square=v*v;
  for(let j=1;j<1000;j++){
   term*=square;const next=sum+term/(2*j+1);
   if(next===sum)return sum;
   sum=next;
  }
  throw new NumericalError('二項分布の計算が収束しませんでした。');
 }
 return x*Math.log(x/mean)+mean-x;
}
function logBinomialPMF(n,k,p){
 if(k===0)return n*Math.log1p(-p);
 if(k===n)return n*Math.log(p);
 const failures=n-k;
 return stirlingError(n)-stirlingError(k)-stirlingError(failures)
  -deviance(k,n*p)-deviance(failures,n*(1-p))
  -.5*(LOG2PI+Math.log(k)+Math.log1p(-k/n));
}
function betaFraction(a,b,x){
 const tiny=1e-300,epsilon=8e-15;
 const floor=value=>Math.abs(value)<tiny?(value<0?-tiny:tiny):value;
 const total=a+b,plus=a+1,minus=a-1;
 let c=1,d=1/floor(1-total*x/plus),h=d;
 for(let m=1;m<=10000;m++){
  const twice=2*m;
  let aa=m*(b-m)*x/((minus+twice)*(a+twice));
  d=1/floor(1+aa*d);c=floor(1+aa/c);h*=d*c;
  aa=-(a+m)*(total+m)*x/((a+twice)*(plus+twice));
  d=1/floor(1+aa*d);c=floor(1+aa/c);
  const delta=d*c;h*=delta;
  if(Math.abs(delta-1)<=epsilon){
   if(!(h>0)||!Number.isFinite(h))throw new NumericalError('二項分布の計算結果を安全に取得できませんでした。');
   return h;
  }
 }
 throw new NumericalError('二項分布の計算が収束しませんでした。');
}
function binomialLowerTail(n,k,p){
 if(!Number.isSafeInteger(n)||n<0||n>10000000||!Number.isSafeInteger(k)||!Number.isFinite(p)||p<0||p>1)
  throw new NumericalError('二項分布の入力が計算範囲外です。');
 if(k<0)return probability(-Infinity);
 if(k>=n||p===0)return probability(0);
 if(p===1)return probability(-Infinity);
 if(k===0)return probability(n*Math.log1p(-p));
 if(k===n-1)return probability(log1mexp(n*Math.log(p)));
 const a=k+1,b=n-k;
 // x^a (1-x)^b / B(a,b) = (n-k) p Pr(X=k), with x=p.
 const logFront=logBinomialPMF(n,k,p)+Math.log(b)+Math.log(p);
 let logP;
 if(p<(a+1)/(a+b+2)){
  const logUpper=logFront+Math.log(betaFraction(a,b,p))-Math.log(a);
  if(logUpper>1e-11)throw new NumericalError('二項分布の上側確率を安全に計算できませんでした。');
  logP=log1mexp(Math.min(0,logUpper));
 }else logP=logFront+Math.log(betaFraction(b,a,1-p))-Math.log(b);
 if(!Number.isFinite(logP)||logP>1e-11)throw new NumericalError('二項分布の下側確率を安全に計算できませんでした。');
 return probability(Math.min(0,logP));
}

function checkedWeights(weights){
 if(!Array.isArray(weights)||weights.length!==6||Array.from(weights).some(w=>!Number.isFinite(w)||w<=0))
  throw new NumericalError('設定配分の重みが不正です。');
 const total=weights.reduce((sum,w)=>sum+w,0);
 if(!Number.isFinite(total)||Math.abs(total-1)>1e-10)throw new NumericalError('設定配分の重みの合計が1ではありません。');
 return {weights,total};
}
function logEvidenceRatio(logRows,allowed,weights=WEIGHTS[0].weights){
 const {total}=checkedWeights(weights),allowedSet=new Set(allowed);
 if(!allowed.length||allowed.length>=6||allowed.some(s=>!Number.isInteger(s)||s<1||s>6)||allowedSet.size!==allowed.length)
  throw new NumericalError('仮説の許容設定が不正です。');
 const mass=weights.reduce((sum,w,i)=>sum+(allowedSet.has(i+1)?w:0),0);
 const outsideMass=weights.reduce((sum,w,i)=>sum+(allowedSet.has(i+1)?0:w),0);
 const logMass=mass>outsideMass?Math.log1p(-outsideMass/total):Math.log(mass/total);
 const logComplementPrior=log1mexp(logRows.length*logMass);
 const logWeights=weights.map(w=>Math.log(w/total));
 let allInside=0,someOutside=-Infinity;
 for(const original of logRows){
  const logs=normalizeLogs(original);
  const inside=logSum(logs.flatMap((value,i)=>allowedSet.has(i+1)?[value+logWeights[i]]:[]));
  const outside=logSum(logs.flatMap((value,i)=>allowedSet.has(i+1)?[]:[value+logWeights[i]]));
  // Disjoint states: already outside (any next setting), or first outside now.
  someOutside=logAdd(logProduct(someOutside,logAdd(inside,outside)),logProduct(allInside,outside));
  allInside=logProduct(allInside,inside);
 }
 if(allInside===-Infinity)return-Infinity;
 if(someOutside===-Infinity)return Infinity;
 const ratio=(allInside-logRows.length*logMass)-(someOutside-logComplementPrior);
 if(!Number.isFinite(ratio))throw new NumericalError('根拠比が安全な計算範囲を超えています。');
 return ratio;
}

// Keep the exact individual validation semantics available in a standalone Node
// script too. Browser callers use the existing shared validator when loaded.
function localValidate(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,errors:{result:'台データを入力してください。'}};
 const integer=value=>{
  if(typeof value!=='string'&&typeof value!=='number')return null;
  const text=String(value).trim();if(!/^[+-]?\d+$/.test(text))return null;
  const n=Number(text);return Number.isSafeInteger(n)?n:null;
 };
 const errors={},games=integer(raw.games),bb=integer(raw.bb),rb=integer(raw.rb);
 const missing=raw.diff==null||typeof raw.diff==='string'&&raw.diff.trim()==='',diff=missing?null:integer(raw.diff);
 if(!MACHINE_KEYS.includes(raw.machine))errors.machine='対応する機種を選択してください。';
 if(games==null||games<=0)errors.games='通常Gを正の整数で入力してください。';
 if(bb==null||bb<0)errors.bb='BBを0以上の整数で入力してください。';
 if(rb==null||rb<0)errors.rb='RBを0以上の整数で入力してください。';
 if(!missing&&diff==null)errors.diff='差枚を整数で入力してください。';
 if(games!=null&&bb!=null&&rb!=null&&bb+rb>games)errors.bonus='BBとRBの合計が通常Gを超えています。';
 return Object.keys(errors).length?{ok:false,errors}:{ok:true,input:{machine:raw.machine,tableNo:String(raw.tableNo??'').trim(),games,bb,rb,diff}};
}
function validateEntries(entries){
 const errors=[],rows=[],ids=new Set(),tableNos=new Set(),machineTables=new Map();
 if(!Array.isArray(entries)||entries.length<2||entries.length>60)return {errors:['全台系は2〜60台をすべて判別してから確認してください。'],rows};
 for(let i=0;i<entries.length;i++){
  const entry=entries[i],prefix=`${i+1}台目：`;
  if(!entry||typeof entry!=='object'||Array.isArray(entry)){errors.push(prefix+'台の結果が不足しています。');continue}
  const id=entry.id,idValid=typeof id==='string'&&id.trim()!==''||typeof id==='number'&&Number.isSafeInteger(id);
  if(!idValid)errors.push(prefix+'行の識別番号が不足しています。');
  else {const key=String(id).trim();if(ids.has(key))errors.push(prefix+'行の識別番号が重複しています。');ids.add(key)}
  const result=entry.result;
  if(!result||result.ok!==true){errors.push(prefix+'成功した個別判別結果が必要です。');continue}
  const validator=global.JUGESTJudgement?.validateInput||localValidate,checked=validator(result.input);
  if(!checked.ok){errors.push(...Object.values(checked.errors).map(message=>prefix+message));continue}
  const input=checked.input;
  if(input.games>10000000)errors.push(prefix+'全台系の通常Gは10,000,000以下にしてください。');
  if(input.tableNo){if(tableNos.has(input.tableNo))errors.push(prefix+'入力済みの台番が重複しています。');tableNos.add(input.tableNo)}
  const logs=result.diagnostics?.logs;
  if(!Array.isArray(logs)||logs.length!==6||Array.from(logs).some(l=>typeof l!=='number'||!(Number.isFinite(l)||l===-Infinity))||!logs.some(Number.isFinite)){
   errors.push(prefix+'設定別のログ値が不足しているか不正です。');continue;
  }
  const q=result.q;
  if(!Array.isArray(q)||q.length!==6||Array.from(q).some(p=>!Number.isFinite(p)||p<0)||Math.abs(q.reduce((a,b)=>a+b,0)-1)>1e-7){
   errors.push(prefix+'個別判別結果の設定分布が不正です。');continue;
  }
  const table=result.engine?.table,settings=table?.settings;
  if(!Array.isArray(settings)||settings.length!==6||Array.from(settings).some((s,i)=>!s||s.setting!==i+1||!Number.isFinite(s.b)||s.b<=0||!Number.isFinite(s.r)||s.r<=0||!(1/s.b+1/s.r<1))){
   errors.push(prefix+'設定1〜6のボーナス確率表が不足しているか不正です。');continue;
  }
  if(table.key!=null&&table.key!==input.machine)errors.push(prefix+'機種と判別に使った設定表が一致しません。');
  const tableSignature=JSON.stringify(settings.map(s=>[s.b,s.r]));
  if(machineTables.has(input.machine)&&machineTables.get(input.machine)!==tableSignature)errors.push(prefix+'同じ機種の設定表が一致しません。個別判別をやり直してください。');
  machineTables.set(input.machine,tableSignature);
  rows.push({id,input,logs:Array.from(logs),settings:settings.map(s=>({setting:s.setting,b:s.b,r:s.r})),machineName:result.machineName||input.machine,reverseWarn:!!result.reverseWarn||!!result.warnings?.length});
 }
 if(errors.length)return {errors,rows};
 for(const field of ['games','bb','rb','diff']){
  const sum=rows.reduce((sum,row)=>sum+BigInt(row.input[field]??0),0n),limit=BigInt(Number.MAX_SAFE_INTEGER);
  if(sum>limit||sum<-limit)errors.push(`全台の${{games:'通常G',bb:'BB',rb:'RB',diff:'入力済み差枚'}[field]}の合計が安全な整数の範囲を超えています。`);
 }
 return {errors,rows};
}
function calculateBonusLogs(input,settings){
 const other=input.games-input.bb-input.rb;
 return settings.map(s=>{
  const pb=1/s.b,pr=1/s.r;
  return (input.bb?input.bb*Math.log(pb):0)+(input.rb?input.rb*Math.log(pr):0)+(other?other*Math.log(1-pb-pr):0);
 });
}
function aggregateRows(rows){
 const machines=new Map();let diffN=0,diff=0n;
 const aggregate={games:0,bb:0,rb:0};
 for(const row of rows){
  const x=row.input;aggregate.games+=x.games;aggregate.bb+=x.bb;aggregate.rb+=x.rb;
  if(x.diff!==null){diffN++;diff+=BigInt(x.diff)}
  if(!machines.has(x.machine))machines.set(x.machine,{key:x.machine,name:row.machineName,n:0});
  machines.get(x.machine).n++;
 }
 return {...aggregate,diff:diffN===rows.length?Number(diff):null,diffN,knownDiff:Number(diff),
  bbDenom:aggregate.bb?aggregate.games/aggregate.bb:null,rbDenom:aggregate.rb?aggregate.games/aggregate.rb:null,
  combinedDenom:aggregate.bb+aggregate.rb?aggregate.games/(aggregate.bb+aggregate.rb):null,
  mixedMachines:machines.size>1,machines:Array.from(machines.values())};
}
function aggregateJudgement(rows,aggregate){
 const sameMyBonusTables=rows.every(row=>row.input.machine==='my'||row.input.machine==='my6')&&rows.every(row=>row.settings.every((setting,i)=>setting.b===rows[0].settings[i].b&&setting.r===rows[0].settings[i].r));
 if(aggregate.mixedMachines&&!sameMyBonusTables)return {available:false,reason:'機種が混在しているため、同じ設定と仮定した合算判別は表示できません。',machine:null,q:null,expectedSetting:null,p4:null,p5:null,p6:null};
 const logs=normalizeLogs(calculateBonusLogs(aggregate,rows[0].settings)),z=logSum(logs),q=logs.map(l=>Math.exp(l-z));
 return {available:true,reason:'全台が同じ設定だった場合のボーナスだけの参考判別です。',machine:rows[0].input.machine,q,...summary(q)};
}
function conditional(rows,allowed){
 const distributions=[];
 for(const row of rows){
  const logs=normalizeLogs(row.logs),z=logSum(allowed.map(s=>logs[s-1]));
  if(z===-Infinity)return {available:false,reason:'この仮説で許される設定の尤度が0の台があり、条件付き配分は計算できません。',rows:[],expectedCounts:[0,0,0,0,0,0],topAllocations:[],mapAssignment:[]};
  const logQ=logs.map((l,i)=>allowed.includes(i+1)?l-z:-Infinity),q=logQ.map(Math.exp);
  distributions.push({id:row.id,tableNo:row.input.tableNo,q,expectedSetting:summary(q).expectedSetting,logQ});
 }
 let coefficients=new Map([[allowed.map(()=>0).join(','),0]]);
 for(const row of distributions){
  const next=new Map();
  for(const [key,value] of coefficients){
   const counts=key.split(',').map(Number);
   for(let j=0;j<allowed.length;j++){
    const term=logProduct(value,row.logQ[allowed[j]-1]);if(term===-Infinity)continue;
    counts[j]++;const target=counts.join(',');counts[j]--;
    next.set(target,logAdd(next.get(target)??-Infinity,term));
   }
  }
  coefficients=next;
 }
 const allocations=Array.from(coefficients,([key,logP])=>{
  const counts=[0,0,0,0,0,0];key.split(',').forEach((count,i)=>counts[allowed[i]-1]=Number(count));
  return {counts,label:counts.map((count,i)=>String(i+1).repeat(count)).join(''),probability:Math.exp(logP),logP};
 });
 allocations.sort((a,b)=>b.logP-a.logP||(a.label<b.label?-1:a.label>b.label?1:0));
 const expectedCounts=[0,0,0,0,0,0],mapAssignment=[];
 const conditionalRows=distributions.map(row=>{
  row.q.forEach((p,i)=>expectedCounts[i]+=p);
  let setting=allowed[0];for(const s of allowed)if(row.logQ[s-1]>row.logQ[setting-1])setting=s;
  mapAssignment.push({id:row.id,tableNo:row.tableNo,setting,probability:row.q[setting-1]});
  return {id:row.id,tableNo:row.tableNo,q:row.q,expectedSetting:row.expectedSetting};
 });
 return {available:true,rows:conditionalRows,expectedCounts,topAllocations:allocations.slice(0,8).map(({logP,...allocation})=>allocation),mapAssignment};
}
function cdfRows(rows){
 return rows.map(row=>row.settings.map(s=>{
  const x=row.input,channels={bb:binomialLowerTail(x.games,x.bb,1/s.b),rb:binomialLowerTail(x.games,x.rb,1/s.r),total:binomialLowerTail(x.games,x.bb+x.rb,1/s.b+1/s.r)};
  const logP=Math.min(0,LOG3+Math.min(channels.bb.logP,channels.rb.logP,channels.total.logP));
  return {setting:s.setting,...probability(logP),channels};
 }));
}
function precedes(a,b){return String(a.id)<String(b.id)}
function refutation(rows,cdfs,allowed){
 const tested=rows.map((row,i)=>{
  const settings=allowed.map(s=>cdfs[i][s-1]);let best=settings[0];
  for(const setting of settings)if(setting.logP>best.logP)best=setting;
  return {id:row.id,tableNo:row.input.tableNo,p:best.p,logP:best.logP,setting:best.setting,channels:best.channels,settings};
 });
 let weakest=tested[0];for(const row of tested)if(row.logP<weakest.logP||row.logP===weakest.logP&&precedes(row,weakest))weakest=row;
 const logP=Math.min(0,Math.log(rows.length)+weakest.logP),logFamilyP=Math.min(0,LOG3+logP);
 return {...probability(logP),familyP:Math.exp(logFamilyP),logFamilyP,weakestRow:{id:weakest.id,tableNo:weakest.tableNo,p:weakest.p,logP:weakest.logP},rows:tested,refuted:logFamilyP<LOG05};
}
function worstRow(rows,allowed){
 let worst=null;
 for(const row of rows){
  const logs=normalizeLogs(row.logs),value={id:row.id,tableNo:row.input.tableNo,logCompatibility:Math.max(...allowed.map(s=>logs[s-1]))};
  if(!worst||value.logCompatibility<worst.logCompatibility||value.logCompatibility===worst.logCompatibility&&precedes(value,worst))worst=value;
 }
 return worst;
}
function analyze(entries){
 try{
  const {errors,rows}=validateEntries(entries);if(errors.length)return {ok:false,errors};
  const aggregate=aggregateRows(rows),reference=aggregateJudgement(rows,aggregate),bonusLogs=rows.map(row=>calculateBonusLogs(row.input,row.settings));
  const capturedLogs=rows.map(row=>row.logs),cdfs=cdfRows(rows),warnings=[
   '設定配分の重みは等重みです。低設定寄り・高設定寄りは感度比較で、店舗実績から得た頻度ではありません。',
   '全台系の成立確率は計算していません。条件付き設定配分は仮説が成立した場合の値です。',
   'ボーナスの検査は独立試行を仮定し、停止時刻と台の集合を事前に決めた場合の検査です。結果を見てから選別した集合では解釈に限界があります。',
   '根拠比と反証検査は同じ観測の別計算です。独立した追加証拠として合成しません。'
  ];
  const low=rows.filter(row=>row.input.games<2000);if(low.length)warnings.push(`2000G未満の台が${low.length}/${rows.length}台あります。小稼働では設定の区別が難しくなります。`);
  if(aggregate.diffN<rows.length)warnings.push(`差枚は${aggregate.diffN}/${rows.length}台のみ入力済みです。入力済みの合計を別に表示し、欠損を0で補いません。`);
  if(aggregate.mixedMachines)warnings.push('機種が混在しています。合算BB・RB・合算分母は観測の参考値です。');
  else warnings.push('同じ設定と仮定した合算判別は参考値です。全台系の評価や追加証拠には使いません。');
  const reverseWarningRows=rows.filter(row=>row.reverseWarn).map(row=>({id:row.id,tableNo:row.input.tableNo}));
  for(const row of rows)if(row.reverseWarn)warnings.push(`台${row.input.tableNo||row.id}：差枚の逆算に警告があります。通常G・BB・RB・差枚の組み合わせを確認してください。`);
  if(aggregate.diffN)warnings.push('差枚を含む根拠比は既存の近似モデルによる値です。現実の全台系の成立確率として扱わないでください。');
  const hypotheses=HYPOTHESES.map(h=>{
   const sensitivity=WEIGHTS.map(w=>({id:w.id,label:w.label,weights:Array.from(w.weights),logEvidenceRatio:logEvidenceRatio(capturedLogs,h.allowed,w.weights),bonusLogEvidenceRatio:logEvidenceRatio(bonusLogs,h.allowed,w.weights)}));
   const distribution=conditional(rows,h.allowed);if(!distribution.available)warnings.push(`${h.label}：${distribution.reason}`);
   return {id:h.id,label:h.label,allowed:Array.from(h.allowed),complementLabel:h.complementLabel,
    logEvidenceRatio:sensitivity[0].logEvidenceRatio,bonusLogEvidenceRatio:sensitivity[0].bonusLogEvidenceRatio,sensitivity,
    worstRow:worstRow(rows,h.allowed),refutation:refutation(rows,cdfs,h.allowed),conditional:distribution};
  });
  return {ok:true,version:VERSION,n:rows.length,aggregate,aggregateJudgement:reference,hypotheses,warnings,reverseWarningRows};
 }catch(error){return {ok:false,errors:[error instanceof NumericalError?error.message:'集合の判別に必要な情報を安全に読み取れませんでした。']}}
}
global.JUGESTGroupJudge=Object.freeze({VERSION,analyze,__test:Object.freeze({binomialLowerTail,logEvidenceRatio,log1mexp})});
})(typeof globalThis!=='undefined'?globalThis:this);
