(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.JugestMissingInference=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='1.0.0';
  const LOG2PI=Math.log(2*Math.PI);
  function finite(x){return x!==''&&x!=null&&Number.isFinite(+x)}
  function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
  function logChoose(n,k){
    n=Math.round(+n);k=Math.round(+k);
    if(!Number.isFinite(n)||!Number.isFinite(k)||n<0||k<0||k>n)return-Infinity;
    k=Math.min(k,n-k);let z=0;
    for(let i=1;i<=k;i++)z+=Math.log(n-k+i)-Math.log(i);
    return z;
  }
  function logBonus(G,B,R,pb,pr){
    G=Math.round(+G);B=Math.round(+B);R=Math.round(+R);
    const o=G-B-R,po=1-pb-pr;
    if(!Number.isFinite(G)||G<0||B<0||R<0||o<0||pb<=0||pr<=0||po<=0)return-Infinity;
    // The multinomial coefficient cancels when G is fixed, but NOT while G itself is latent.
    // Keep it here so the inferred-game posterior is a real P(B,R | G, setting), not a length-biased score.
    const comb=logChoose(G,B)+logChoose(G-B,R);
    return comb+(B?B*Math.log(pb):0)+(R?R*Math.log(pr):0)+(o?o*Math.log(po):0);
  }
  function logNormal(x,mean,variance){
    variance=Math.max(1e-6,+variance||0);
    const z=x-mean;
    return -.5*(z*z/variance+Math.log(variance)+LOG2PI);
  }
  function logMix(vals,weights){
    const m=Math.max(...vals);
    if(!Number.isFinite(m))return-Infinity;
    let z=0;for(let i=0;i<vals.length;i++)z+=(+weights[i]||0)*Math.exp(vals[i]-m);
    return z>0?m+Math.log(z):-Infinity;
  }
  function normalizeLogs(logs){
    const f=logs.filter(Number.isFinite);if(!f.length)return logs.map(()=>0);
    const m=Math.max(...f),w=logs.map(v=>Number.isFinite(v)?Math.exp(v-m):0),z=w.reduce((a,b)=>a+b,0);
    return z>0?w.map(v=>v/z):w.map(()=>0);
  }
  function weightedQuantile(points,p){
    if(!points.length)return NaN;
    const a=points.filter(x=>Number.isFinite(x.value)&&x.weight>0).sort((x,y)=>x.value-y.value),z=a.reduce((s,x)=>s+x.weight,0);
    if(!z)return NaN;let c=0;for(const x of a){c+=x.weight/z;if(c>=p)return x.value}return a[a.length-1].value;
  }
  function settingDiffStats(spec,settingIndex,G,B,R){
    const s=spec.settings[settingIndex];if(!s)return null;
    const constant=(+spec.bigPay||0)*B+(+spec.regPay||0)*R+(+spec.perBonusAdjust||0)*(B+R);
    const comps=(s.components||[]).map(c=>({weight:+c.weight||0,mean:constant+(+c.meanSlope||0)*G,variance:Math.max(1e-6,(+c.varSlope||0)*G)}));
    if(!comps.length)return null;
    const wz=comps.reduce((a,c)=>a+c.weight,0)||1;for(const c of comps)c.weight/=wz;
    const mean=comps.reduce((a,c)=>a+c.weight*c.mean,0);
    const variance=comps.reduce((a,c)=>a+c.weight*(c.variance+(c.mean-mean)*(c.mean-mean)),0);
    return{mean,variance,components:comps};
  }
  function predictDiff(spec,G,B,R,settingQ){
    if(!spec||!finite(G)||+G<0)return null;G=+G;B=Math.max(0,+B||0);R=Math.max(0,+R||0);
    let q=Array.isArray(settingQ)?settingQ.slice(0,spec.settings.length):[];
    if(q.length!==spec.settings.length||!q.some(x=>Number.isFinite(+x)&&+x>0))q=Array(spec.settings.length).fill(1/spec.settings.length);
    let z=q.reduce((a,b)=>a+(Number.isFinite(+b)&&+b>0?+b:0),0)||1;q=q.map(x=>(Number.isFinite(+x)&&+x>0?+x:0)/z);
    const parts=[];
    for(let i=0;i<spec.settings.length;i++){
      const st=settingDiffStats(spec,i,G,B,R);if(!st)continue;
      for(const c of st.components)parts.push({weight:q[i]*c.weight,mean:c.mean,variance:c.variance,setting:i});
    }
    if(!parts.length)return null;
    const mean=parts.reduce((a,c)=>a+c.weight*c.mean,0);
    const variance=parts.reduce((a,c)=>a+c.weight*(c.variance+(c.mean-mean)*(c.mean-mean)),0);
    const sd=Math.sqrt(Math.max(0,variance));
    return{mean,sd,lo:mean-1.2815515655446004*sd,hi:mean+1.2815515655446004*sd,perSetting:spec.settings.map((_,i)=>settingDiffStats(spec,i,G,B,R))};
  }
  function inferGames(spec,B,R,D,opts={}){
    if(!spec||!finite(D))return null;B=Math.max(0,+B||0);R=Math.max(0,+R||0);D=+D;
    const hats=spec.settings.map(s=>{const p=(+s.pb||0)+(+s.pr||0);return p>0?(B+R)/p:NaN}).filter(Number.isFinite);
    let minG,maxG;
    if(B+R>0&&hats.length){
      const lo=Math.min(...hats),hi=Math.max(...hats);
      minG=Math.max(B+R,Math.floor(lo*0.45)-500);
      maxG=Math.min(+opts.maxG||20000,Math.ceil(hi*1.85)+1000);
    }else{
      minG=Math.max(B+R,+opts.minG||50);maxG=Math.min(+opts.maxG||20000,+opts.zeroBonusMaxG||12000);
    }
    minG=Math.max(B+R,Math.max(0,minG));maxG=Math.max(minG+25,maxG);
    const coarseStep=Math.max(10,+opts.step||25),joint=[];
    for(let G=Math.ceil(minG/coarseStep)*coarseStep;G<=maxG;G+=coarseStep){
      const o=G-B-R,comb=logChoose(G,B)+logChoose(G-B,R);
      if(o<0||!Number.isFinite(comb))continue;
      for(let i=0;i<spec.settings.length;i++){
        const s=spec.settings[i],pb=+s.pb||0,pr=+s.pr||0,po=1-pb-pr;
        if(pb<=0||pr<=0||po<=0)continue;
        const lb=comb+(B?B*Math.log(pb):0)+(R?R*Math.log(pr):0)+(o?o*Math.log(po):0),st=settingDiffStats(spec,i,G,B,R);
        if(!Number.isFinite(lb)||!st)continue;
        const lm=logMix(st.components.map(c=>logNormal(D,c.mean,c.variance)),st.components.map(c=>c.weight));
        if(Number.isFinite(lm))joint.push({G,i,log:lb+lm});
      }
    }
    if(!joint.length)return null;
    const probs=normalizeLogs(joint.map(x=>x.log));
    const q=Array(spec.settings.length).fill(0),gp=[];let meanG=0;
    for(let k=0;k<joint.length;k++){const w=probs[k],x=joint[k];q[x.i]+=w;meanG+=w*x.G;gp.push({value:x.G,weight:w})}
    const mapIndex=probs.indexOf(Math.max(...probs)),map=joint[mapIndex];
    const lo=weightedQuantile(gp,.10),hi=weightedQuantile(gp,.90),median=weightedQuantile(gp,.50);
    const relWidth=Number.isFinite(lo)&&Number.isFinite(hi)&&meanG>0?(hi-lo)/meanG:1;
    const confidence=clamp(1-relWidth/1.25,0,1);
    return{q,meanG,medianG:median,mapG:map?.G??NaN,lo,hi,confidence,minG,maxG,step:coarseStep};
  }
  return{VERSION,logChoose,logBonus,logNormal,normalizeLogs,settingDiffStats,predictDiff,inferGames};
});
