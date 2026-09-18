// Server-safe copy of the protected JUGEST externalJudge Juggler path.
// Keep constants/formulas in parity with index.html externalJudge/reverseCore.

export const JUGGLER_MACHINE_KEYS=Object.freeze(['my','im','go','fk','hp','gg','mr','um']);

const MACHINES=Object.freeze({
  my:{name:'マイジャグV',simple:[{g:5.90,b:273.07,r:409.60},{g:5.85,b:270.81,r:385.51},{g:5.80,b:266.41,r:336.08},{g:5.78,b:254.02,r:289.98},{g:5.76,b:240.06,r:268.59},{g:5.66,b:229.15,r:229.15}],revch:[35.8884,35.8491,34.6769,33.5074,33.2693,33.0345],bell:1024,pier:1024,replay:7.298,bbpay:240,regpay:96,chpay:2},
  im:{name:'ネオアイムジャグラー',simple:[{g:6.02,b:273.07,r:439.84},{g:6.02,b:269.70,r:399.61},{g:6.02,b:269.70,r:330.99},{g:6.02,b:259.04,r:315.08},{g:6.02,b:259.04,r:255.00},{g:5.78,b:255.00,r:255.00}],revch:[33.488,33.437,33.267,33.149,32.900,32.900],bell:1092.267,pier:1092.267,replay:7.298,bbpay:252,regpay:96,chpay:2},
  go:{name:'ゴーゴージャグラー3',simple:[{g:6.25,b:259.04,r:354.25},{g:6.20,b:258.02,r:332.67},{g:6.15,b:257.00,r:306.24},{g:6.07,b:254.02,r:268.59},{g:6.00,b:247.31,r:247.31},{g:5.92,b:234.90,r:234.90}],revch:[33.403,33.301,33.200,33.099,32.900,32.801],bell:1092.27,pier:1092.27,replay:7.298,bbpay:240,regpay:96,chpay:2},
  fk:{name:'ファンキージャグラー2',simple:[{g:5.94,b:266.41,r:439.84},{g:5.92,b:259.04,r:407.06},{g:5.88,b:256.00,r:366.12},{g:5.83,b:249.19,r:322.84},{g:5.76,b:240.06,r:299.25},{g:5.67,b:219.92,r:262.14}],revch:[33.9413,33.8711,33.7838,33.6796,33.5933,33.4220],bell:1092.27,pier:1092.27,replay:7.298,bbpay:240,regpay:96,chpay:2},
  hp:{name:'ハッピージャグラーVⅢ',simple:[{g:6.04,b:273.07,r:397.19},{g:6.01,b:270.81,r:362.08},{g:5.98,b:263.20,r:332.67},{g:5.84,b:254.02,r:300.62},{g:5.81,b:239.18,r:273.07},{g:5.79,b:225.99,r:256.00}],revch:[56.55,56.55,56.55,56.55,56.55,56.55],bell:655.36,pier:655.36,replay:7.298,bbpay:240,regpay:96,chpay:4},
  gg:{name:'ジャグラーガールズSS',simple:[{g:5.98,b:273.07,r:381.02},{g:5.98,b:270.81,r:350.46},{g:5.98,b:260.06,r:316.60},{g:5.98,b:250.14,r:281.27},{g:5.88,b:243.63,r:270.81},{g:5.83,b:225.99,r:252.06}],revch:[33.56,33.47,33.32,33.15,33.10,32.97],bell:1092.27,pier:1092.27,replay:7.298,bbpay:240,regpay:96,chpay:2},
  mr:{name:'ミスタージャグラー',simple:[{g:6.29,b:268.59,r:374.49},{g:6.22,b:267.49,r:354.25},{g:6.15,b:260.06,r:330.99},{g:6.09,b:249.19,r:291.27},{g:6.02,b:240.94,r:257.00},{g:5.96,b:237.45,r:237.45}],revch:[37.24,37.24,37.24,37.24,37.24,37.24],bell:655.4,pier:420.1,replay:7.298,bbpay:240,regpay:96,chpay:4},
  um:{name:'ウルトラミラクルジャグラー',simple:[{g:5.93,b:267.49,r:425.56},{g:5.93,b:261.10,r:402.06},{g:5.93,b:256.00,r:350.46},{g:5.93,b:242.73,r:322.84},{g:5.87,b:233.22,r:297.89},{g:5.81,b:216.29,r:277.69}],revch:[35.1,35.0,34.8,34.6,33.5,33.0],bell:1024,pier:1024,replay:7.298,bbpay:240,regpay:96,chpay:2}
});

const MACHINE_ALIASES=new Map([
  ...Object.entries(MACHINES).map(([key,value])=>[value.name,key]),
  ['マイジャグラーV','my'],['マイジャグ5','my'],['ネオアイム','im'],['アイムジャグラーEX','im'],
  ['ゴージャグ3','go'],['ファンキー2','fk'],['ハッピーV3','hp'],['ハッピーVⅢ','hp'],
  ['ガールズSS','gg'],['ジャグラーガールズ','gg'],['ミスター','mr'],['ウルミラ','um']
]);

export const JUGGLER_MACHINE_CATALOG=Object.freeze(JUGGLER_MACHINE_KEYS.map(key=>Object.freeze({key,name:MACHINES[key].name})));

export function resolveJugglerMachine(value){
  const raw=String(value??'').trim();
  if(JUGGLER_MACHINE_KEYS.includes(raw))return raw;
  return MACHINE_ALIASES.get(raw)??null;
}

function styleRates(key,style){
  if(key==='hp'){
    if(style==='perfect')return{c:1,b:1,p:1};
    if(style==='cherry')return{c:1,b:0,p:0};
    return{c:.667,b:.444,p:.172};
  }
  if(key==='mr'){
    if(style==='perfect')return{c:1,b:1,p:1};
    if(style==='cherry')return{c:1,b:0,p:.3016};
    return{c:.6667,b:.1111,p:.4021};
  }
  if(key==='um'){
    if(style==='cherry')return{c:1,b:0,p:0};
    return{c:.6667,b:.2222,p:.1005};
  }
  if(style==='cherry')return{c:1,b:0,p:0};
  return{c:.667,b:.222,p:.101};
}

function norm(values){
  const finite=values.filter(Number.isFinite);
  if(!finite.length)return null;
  const max=Math.max(...finite),weights=values.map(v=>Number.isFinite(v)?Math.exp(v-max):0),sum=weights.reduce((a,b)=>a+b,0);
  if(!(sum>0))return null;
  return weights.map(v=>v/sum);
}

function logBonus(games,bb,rb,pb,pr){
  const other=games-bb-rb,p0=1-pb-pr;
  if(bb<0||rb<0||other<0||pb<=0||pr<=0||p0<=0)return-Infinity;
  return bb*Math.log(pb)+rb*Math.log(pr)+other*Math.log(p0);
}

function reverseCoreKnown(key,games,bb,rb,diff,style='random'){
  const machine=MACHINES[key];
  if(!machine||!games)return null;
  const rows=[],likelihoods=[];
  machine.simple.forEach((theory,index)=>{
    const pCherryG=1/machine.revch[index],pReplay=1/machine.replay,pBell=1/machine.bell,pPier=1/machine.pier;
    const bonus=machine.bbpay*bb+machine.regpay*rb,rates=styleRates(key,style);
    const cherryPay=machine.chpay||2,qCherry=rates.c*pCherryG,qBell=rates.b*pBell,qPier=rates.p*pPier;
    const other=3*games*pReplay+cherryPay*(games*qCherry)+14*(games*qBell)+10*(games*qPier);
    const grapeCount=(3*games+diff-bonus+(bb+rb)-other)/8;
    const grapeDenom=grapeCount>0?games/grapeCount:Infinity;
    const varianceOut=9*games*pReplay*(1-pReplay)+cherryPay*cherryPay*games*qCherry*(1-qCherry)+196*games*qBell*(1-qBell)+100*games*qPier*(1-qPier);
    const varianceGrapeCount=varianceOut/64,pGrape=1/theory.g,meanGrape=games*pGrape,varianceGrape=games*pGrape*(1-pGrape);
    const delta=grapeCount-meanGrape;
    let likelihood=-.5*delta*delta/(varianceGrapeCount+varianceGrape)-.5*Math.log(varianceGrapeCount+varianceGrape);
    likelihood+=logBonus(games,bb,rb,1/theory.b,1/theory.r);
    likelihoods.push(likelihood);
    rows.push({s:index+1,V:grapeCount,vg:grapeDenom,tg:theory.g,b:theory.b,r:theory.r,sd:Math.sqrt(varianceGrapeCount)});
  });
  const q=norm(likelihoods);
  if(!q)return null;
  const vbar=rows.reduce((a,row,index)=>a+q[index]*row.V,0),denom=vbar>0?games/vbar:Infinity;
  const mixVariance=rows.reduce((a,row,index)=>a+q[index]*(row.sd*row.sd+(row.V-vbar)*(row.V-vbar)),0),sd=Math.sqrt(mixVariance);
  return{q,rows,Ls:likelihoods.slice(),vbar,denom,lo:Math.max(1,vbar-1.96*sd),hi:vbar+1.96*sd,warn:rows.some(row=>row.V<0||row.V>games)};
}

function logMix(values,weights){
  const max=Math.max(...values);
  if(!Number.isFinite(max))return-Infinity;
  let sum=0;for(let i=0;i<values.length;i++)sum+=weights[i]*Math.exp(values[i]-max);
  return max+Math.log(sum);
}

function reverseCore(key,games,bb,rb,diff){
  const styles=(key==='hp'||key==='mr')?['random','cherry','perfect']:['random','cherry'];
  const priors=(key==='hp'||key==='mr')?[.45,.45,.10]:[.5,.5];
  const cores=styles.map(style=>reverseCoreKnown(key,games,bb,rb,diff,style));
  if(cores.some(x=>!x))return null;
  const likelihoods=MACHINES[key].simple.map((_,index)=>logMix(cores.map(core=>core.Ls[index]),priors));
  const q=norm(likelihoods);
  if(!q)return null;
  const rows=MACHINES[key].simple.map((theory,index)=>{
    const settingLikelihoods=cores.map(core=>core.Ls[index]),max=Math.max(...settingLikelihoods);
    let weights=settingLikelihoods.map((value,j)=>priors[j]*Math.exp(value-max)),sum=weights.reduce((a,b)=>a+b,0);
    weights=weights.map(value=>value/sum);
    const V=cores.reduce((a,core,j)=>a+weights[j]*core.rows[index].V,0);
    const variance=cores.reduce((a,core,j)=>a+weights[j]*(core.rows[index].sd*core.rows[index].sd+(core.rows[index].V-V)*(core.rows[index].V-V)),0);
    return{s:index+1,V,vg:V>0?games/V:Infinity,tg:theory.g,b:theory.b,r:theory.r,sd:Math.sqrt(variance)};
  });
  const vbar=rows.reduce((a,row,index)=>a+q[index]*row.V,0),denom=vbar>0?games/vbar:Infinity;
  const mixVariance=rows.reduce((a,row,index)=>a+q[index]*(row.sd*row.sd+(row.V-vbar)*(row.V-vbar)),0),sd=Math.sqrt(mixVariance);
  return{q,rows,Ls:likelihoods.slice(),vbar,denom,lo:Math.max(1,vbar-1.96*sd),hi:vbar+1.96*sd,warn:cores.some(core=>core.warn),unknownMix:true};
}

function bonusOnlyQ(key,games,bb,rb){
  const machine=MACHINES[key],other=Math.max(0,games-bb-rb);
  const likelihoods=machine.simple.map(theory=>{
    const pb=1/theory.b,pr=1/theory.r,p0=1-pb-pr;
    if(p0<=0)return-Infinity;
    return (bb?bb*Math.log(pb):0)+(rb?rb*Math.log(pr):0)+(other?other*Math.log(p0):0);
  });
  return norm(likelihoods);
}

function validateInput(input){
  const machine=resolveJugglerMachine(input?.machine);
  if(!machine)throw new TypeError('unsupported_machine');
  const games=Number(input?.games),bb=Number(input?.bb??0),rb=Number(input?.rb??0);
  if(!Number.isFinite(games)||games<=0)throw new TypeError('invalid_games');
  if(!Number.isFinite(bb)||bb<0||!Number.isFinite(rb)||rb<0)throw new TypeError('invalid_bonus_count');
  if(bb+rb>games)throw new TypeError('bonus_count_exceeds_games');
  let diff=input?.diff;
  if(diff===undefined||diff===null||diff==='')diff=null;
  else{diff=Number(diff);if(!Number.isFinite(diff))throw new TypeError('invalid_diff');}
  return{machine,games,bb,rb,diff};
}

export function judgeJugglerMachine(input){
  const {machine,games,bb,rb,diff}=validateInput(input);
  let result=null;
  if(diff!==null){
    const reverse=reverseCore(machine,games,bb,rb,diff);
    if(reverse&&Array.isArray(reverse.q)&&reverse.q.every(Number.isFinite))result={q:reverse.q,method:'reverse-diff',estimatedGrape:Number.isFinite(reverse.denom)?reverse.denom:NaN,estimatedGrapeCount:Number.isFinite(reverse.vbar)?reverse.vbar:NaN,grapeCountLo:Number.isFinite(reverse.lo)?reverse.lo:NaN,grapeCountHi:Number.isFinite(reverse.hi)?reverse.hi:NaN,reverseWarn:!!reverse.warn};
  }
  if(!result){
    const q=bonusOnlyQ(machine,games,bb,rb);
    if(!q)throw new Error('judge_unavailable');
    result={q,method:'bonus-only',estimatedGrape:NaN,estimatedGrapeCount:NaN,grapeCountLo:NaN,grapeCountHi:NaN,reverseWarn:false};
  }
  const q=result.q,expectedSetting=q.reduce((sum,value,index)=>sum+value*(index+1),0);
  return{machine,machineName:MACHINES[machine].name,games,bb,rb,diff,...result,expectedSetting,p4:q[3]+q[4]+q[5],p5:q[4]+q[5],p6:q[5]};
}

export function judgeJugglerMachines(machines){
  if(!Array.isArray(machines))throw new TypeError('machines_must_be_array');
  return machines.map(row=>({...row,...judgeJugglerMachine(row)}));
}
