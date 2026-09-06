await import('../missing-inference.js');
const M=globalThis.JugestMissingInference;
if(!M||typeof M.inferGames!=='function'||typeof M.predictDiff!=='function')throw new Error('missing inference API');

function near(a,b,t,msg){if(!Number.isFinite(a)||Math.abs(a-b)>t)throw new Error(`${msg}: ${a} vs ${b}`)}
function sum(a){return a.reduce((x,y)=>x+y,0)}

// Synthetic two-setting model. Use setting 2's own expected difference at 8,000G,
// then verify joint inference recovers a nearby game count and a normalized setting posterior.
const spec={
  bigPay:240,regPay:96,perBonusAdjust:-1,
  settings:[
    {pb:1/300,pr:1/390,components:[{weight:1,meanSlope:-1.30,varSlope:10}]},
    {pb:1/250,pr:1/300,components:[{weight:1,meanSlope:-1.18,varSlope:10}]}
  ]
};
const G=8000,B=32,R=27;
const pred=M.predictDiff(spec,G,B,R,[0,1]);
if(!pred||!Number.isFinite(pred.mean)||!(pred.hi>pred.lo))throw new Error('predictDiff finite/range');
const inf=M.inferGames(spec,B,R,pred.mean,{step:25,maxG:16000});
if(!inf||!Array.isArray(inf.q)||inf.q.length!==2)throw new Error('inferGames result');
near(sum(inf.q),1,1e-9,'q normalized');
near(inf.meanG,G,1200,'latent G recovery');
if(!(inf.lo<=inf.meanG&&inf.meanG<=inf.hi))throw new Error('G interval');
if(!(inf.confidence>=0&&inf.confidence<=1))throw new Error('confidence range');

// Crucial regression: the multinomial coefficient must be present when G varies.
// With fixed observed bonus counts, the true count likelihood should have an interior peak,
// not monotonically reward the smallest possible G.
const pb=1/300,pr=1/400,b=20,r=15;
const lSmall=M.logBonus(1000,b,r,pb,pr),lMid=M.logBonus(6000,b,r,pb,pr),lHuge=M.logBonus(18000,b,r,pb,pr);
if(!(lMid>lSmall&&lMid>lHuge))throw new Error(`latent-G count likelihood malformed: ${lSmall}, ${lMid}, ${lHuge}`);

console.log('missing value inference PASS');
