await import('../hanahana-judge.js');
const H=globalThis.HanaJudge;
let seed=0x9e3779b9;function rand(){seed=(1664525*seed+1013904223)>>>0;return (seed+.5)/2**32}
let spare=null;function gauss(){if(spare!=null){const x=spare;spare=null;return x}let u=0,v=0,s=0;do{u=2*rand()-1;v=2*rand()-1;s=u*u+v*v}while(!s||s>=1);const m=Math.sqrt(-2*Math.log(s)/s);spare=v*m;return u*m}
function binom(n,p){if(n<=0||p<=0)return 0;if(p>=1)return n;if(n<80){let k=0;for(let i=0;i<n;i++)if(rand()<p)k++;return k}const mu=n*p,sd=Math.sqrt(n*p*(1-p));return Math.max(0,Math.min(n,Math.round(mu+sd*gauss())))}
function cat(probs){let u=rand(),c=0;for(let i=0;i<probs.length;i++){c+=probs[i];if(u<c)return i}return probs.length-1}
function countsCat(n,probs){const a=Array(probs.length).fill(0);for(let i=0;i<n;i++)a[cat(probs)]++;return a}
function chooseStyle(){const u=rand();return u<.45?'random':u<.9?'cherry':'perfect'}
function p4(m,q){return q.reduce((a,p,i)=>a+(m.settingValues[i]>=4?p:0),0)}
function classHigh(v){return v>=4}
const rows=[];
for(const [key,m] of Object.entries(H.MACHINES)){
 let n=0,revOK=0,liveOK=0,revBrier=0,liveBrier=0,exactRev=0,exactLive=0;
 const NPER=1000,G=6000;
 for(let si=0;si<m.labels.length;si++)for(let rep=0;rep<NPER;rep++){
   n++;
   const pb=1/m.big[si],pr=1/m.reg[si];
   const bb=binom(G,pb),rb=binom(G-bb,pr/(1-pb));
   const bell=binom(G,1/m.bell[si]),style=chooseStyle(),st=m.reverseStyles[style];
   const replay=binom(G,1/m.replay),cherry=binom(G,1/st.cherryDenom),water=binom(G,1/st.watermelonDenom);
   const diff=m.bigPay*bb+m.regPay*rb+m.bellPay*bell+3*replay+m.cherryPay*cherry+m.watermelonPay*water-3*G;
   const rev=H.numericJudge(key,{G,bb,rb,diff,style:'unknown'});
   const trueHigh=classHigh(m.settingValues[si]);
   const revP=p4(m,rev.q);revBrier+=(revP-(trueHigh?1:0))**2;revOK+=(revP>=.5)===trueHigh;exactRev+=rev.q.indexOf(Math.max(...rev.q))===si;

   const bg=bb*m.bigGameDefault;let bw=0,bm=0;if(bg){bw=binom(bg,1/m.bigWater[si]);bm=binom(bg-bw,(1/m.bigMiss[si])/(1-1/m.bigWater[si]));}
   const sideN=m.sideContext.startsWith('REG')?rb:bb,side=countsCat(sideN,m.sideProb[si]);
   const baProb=m.bigAfterProb[si],white=1-baProb.reduce((a,b)=>a+b,0),baAll=countsCat(bb,[...baProb,white]),ba=baAll.slice(0,-1);
   const inp={G,bb,rb,bell,bigGames:bg,bigWater:bw,bigMiss:bm,sideCounts:side,normalBigTrials:bb,bigAfterCounts:ba};
   if(m.regWater){inp.regGames=rb*m.regGameDefault;inp.regWater=binom(inp.regGames,1/m.regWater[si]);}
   const live=H.liveJudge(key,inp),liveP=p4(m,live.q);liveBrier+=(liveP-(trueHigh?1:0))**2;liveOK+=(liveP>=.5)===trueHigh;exactLive+=live.q.indexOf(Math.max(...live.q))===si;
 }
 rows.push({key,n,revHighAcc:revOK/n,liveHighAcc:liveOK/n,revBrier:revBrier/n,liveBrier:liveBrier/n,revExact:exactRev/n,liveExact:exactLive/n});
}
console.table(rows.map(r=>({machine:r.key,n:r.n,'reverse high/low':(r.revHighAcc*100).toFixed(1)+'%','live high/low':(r.liveHighAcc*100).toFixed(1)+'%','reverse exact':(r.revExact*100).toFixed(1)+'%','live exact':(r.liveExact*100).toFixed(1)+'%','reverse brier':r.revBrier.toFixed(3),'live brier':r.liveBrier.toFixed(3)})));
if(rows.some(r=>!Number.isFinite(r.liveBrier)||!Number.isFinite(r.revBrier)))throw new Error('non-finite simulation metric');
console.log('hana simulation: ok');
