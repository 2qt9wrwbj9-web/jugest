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

export function jugglerMachineName(key){return MACHINES[key]?.name??null}

function styleRates(key,style){
  if(key==='hp'){
    if(style==='perfect')return {c:1,b:1,p:1};
    if(style==='cherry')return {c:1,b:0,p:0};
    return {c:.667,b:.444,p:.172};
  }
  if(key==='mr'){
    if(style==='perfect')return {c:1,b:1,p:1};
    if(style==='cherry')return {c:1,b:0,p:.3016};
    return {c:.6667,b:.1111,p:.4021};
  }
  if(key==='um'){
    if(style==='cherry')return {c:1,b:0,p:0};
    return {c:.6667,b:.2222,p:.1005};
  }
  if(style==='cherry')return {c:1,b:0,p:0};
  return {c:.667,b:.222,p:.101};
}

function norm(values){
  const finite=values.filter(Number.isFinite);
  if(!finite.length)return null;
  const max=Math.max(...finite);
  const weights=values.map(value=>Number.isFinite(value)?Math.exp(value-max):0);
  const total=weights.reduce((sum,value)=>sum+value,0);
  const q=weights.map(value=>value/total);
  return q.every(Number.isFinite)?q:null;
}

function logBonus(n,b,r,pb,pr){
  const other=n-b-r,po=1-pb-pr;
  if(b<0||r<0||other<0||pb<=0||pr<=0||po<=0)return -Infinity;
  return b*Math.log(pb)+r*Math.log(pr)+other*Math.log(po);
}

function reverseCoreKnown(key,Gg,B,R,D,style='random'){
  const machine=MACHINES[key];
  if(!machine||!Gg)return null;
  const rows=[],Ls=[];
  machine.simple.forEach((theory,index)=>{
    const pcg=1/machine.revch[index],pr=1/machine.replay,pb=1/machine.bell,pp=1/machine.pier;
    const bonus=machine.bbpay*B+machine.regpay*R,rt=styleRates(key,style);
    const cp=machine.chpay||2,qc=rt.c*pcg,qb=rt.b*pb,qp=rt.p*pp;
    const other=3*Gg*pr+cp*(Gg*qc)+14*(Gg*qb)+10*(Gg*qp);
    const V=(3*Gg+D-bonus+(B+R)-other)/8;
    const vg=V>0?Gg/V:Infinity;
    const varOut=9*Gg*pr*(1-pr)+cp*cp*Gg*qc*(1-qc)+196*Gg*qb*(1-qb)+100*Gg*qp*(1-qp);
    const varV=varOut/64,pg=1/theory.g,meanG=Gg*pg,varG=Gg*pg*(1-pg);
    const z=V-meanG;
    let likelihood=-.5*z*z/(varV+varG)-.5*Math.log(varV+varG);
    likelihood+=logBonus(Gg,B,R,1/theory.b,1/theory.r);
    Ls.push(likelihood);
    rows.push({s:index+1,V,vg,tg:theory.g,b:theory.b,r:theory.r,sd:Math.sqrt(varV)});
  });
  const q=norm(Ls);
  if(!q)return null;
  const vbar=rows.reduce((sum,row,index)=>sum+q[index]*row.V,0),denom=vbar>0?Gg/vbar:Infinity;
  const mixVar=rows.reduce((sum,row,index)=>sum+q[index]*(row.sd*row.sd+(row.V-vbar)*(row.V-vbar)),0),sd=Math.sqrt(mixVar);
  const lo=Math.max(1,vbar-1.96*sd),hi=vbar+1.96*sd;
  return {q,rows,Ls:Ls.slice(),vbar,denom,lo,hi,warn:rows.some(row=>row.V<0||row.V>Gg)};
}

function logMix(values,weights){
  const max=Math.max(...values);
  if(!Number.isFinite(max))return -Infinity;
  let total=0;
  for(let index=0;index<values.length;index++)total+=weights[index]*Math.exp(values[index]-max);
  return max+Math.log(total);
}

function reverseCoreUnknown(key,Gg,B,R,D){
  const styles=(key==='hp'||key==='mr')?['random','cherry','perfect']:['random','cherry'];
  const priors=(key==='hp'||key==='mr')?[.45,.45,.10]:[.5,.5];
  const cores=styles.map(style=>reverseCoreKnown(key,Gg,B,R,D,style));
  if(cores.some(core=>!core))return null;
  const machine=MACHINES[key];
  const Ls=machine.simple.map((_,index)=>logMix(cores.map(core=>core.Ls[index]),priors));
  const q=norm(Ls);
  if(!q)return null;
  const rows=machine.simple.map((theory,index)=>{
    const ls=cores.map(core=>core.Ls[index]),max=Math.max(...ls);
    let weights=ls.map((value,styleIndex)=>priors[styleIndex]*Math.exp(value-max));
    const total=weights.reduce((sum,value)=>sum+value,0);
    weights=weights.map(value=>value/total);
    const V=cores.reduce((sum,core,styleIndex)=>sum+weights[styleIndex]*core.rows[index].V,0);
    const varWithin=cores.reduce((sum,core,styleIndex)=>sum+weights[styleIndex]*(core.rows[index].sd*core.rows[index].sd+(core.rows[index].V-V)*(core.rows[index].V-V)),0);
    return {s:index+1,V,vg:V>0?Gg/V:Infinity,tg:theory.g,b:theory.b,r:theory.r,sd:Math.sqrt(varWithin)};
  });
  const vbar=rows.reduce((sum,row,index)=>sum+q[index]*row.V,0),denom=vbar>0?Gg/vbar:Infinity;
  const mixVar=rows.reduce((sum,row,index)=>sum+q[index]*(row.sd*row.sd+(row.V-vbar)*(row.V-vbar)),0),sd=Math.sqrt(mixVar);
  const lo=Math.max(1,vbar-1.96*sd),hi=vbar+1.96*sd;
  return {q,rows,Ls:Ls.slice(),vbar,denom,lo,hi,warn:cores.some(core=>core.warn),unknownMix:true};
}

function bonusOnlyQ(key,games,bb,rb){
  const machine=MACHINES[key];
  if(!machine||!games)return null;
  const no=Math.max(0,games-bb-rb);
  const likelihoods=machine.simple.map(theory=>{
    const pb=1/theory.b,pr=1/theory.r,p0=1-pb-pr;
    if(p0<=0)return -Infinity;
    return (bb?bb*Math.log(pb):0)+(rb?rb*Math.log(pr):0)+(no?no*Math.log(p0):0);
  });
  return norm(likelihoods);
}

function posteriorSummary(q){
  return {
    expectedSetting:q.reduce((sum,value,index)=>sum+value*(index+1),0),
    p4:(q[3]||0)+(q[4]||0)+(q[5]||0),
    p5:(q[4]||0)+(q[5]||0),
    p6:q[5]||0
  };
}

export function judgeJugglerExternal(input={}){
  const machine=String(input.machine??'');
  const spec=MACHINES[machine];
  const games=+input.games||0;
  if(!spec||!games)return null;
  const bb=Math.max(0,+input.bb||0),rb=Math.max(0,+input.rb||0);
  const hasDiff=input.diff!==null&&input.diff!==undefined&&Number.isFinite(+input.diff);
  if(hasDiff){
    const reverse=reverseCoreUnknown(machine,games,bb,rb,+input.diff);
    if(reverse&&Array.isArray(reverse.q)&&reverse.q.every(Number.isFinite)){
      return {
        machine,machineName:spec.name,games,bb,rb,diff:+input.diff,q:reverse.q,method:'reverse-diff',
        ...posteriorSummary(reverse.q),
        estimatedGrape:Number.isFinite(reverse.denom)?reverse.denom:NaN,
        estimatedGrapeCount:Number.isFinite(reverse.vbar)?reverse.vbar:NaN,
        grapeCountLo:Number.isFinite(reverse.lo)?reverse.lo:NaN,
        grapeCountHi:Number.isFinite(reverse.hi)?reverse.hi:NaN,
        reverseWarn:!!reverse.warn
      };
    }
  }
  const q=bonusOnlyQ(machine,games,bb,rb);
  if(!q)return null;
  return {
    machine,machineName:spec.name,games,bb,rb,diff:hasDiff?+input.diff:null,q,method:'bonus-only',
    ...posteriorSummary(q),
    estimatedGrape:NaN,estimatedGrapeCount:NaN,grapeCountLo:NaN,grapeCountHi:NaN,reverseWarn:false
  };
}

export const __test={MACHINES,styleRates,norm,logBonus,reverseCoreKnown,reverseCoreUnknown,bonusOnlyQ};
