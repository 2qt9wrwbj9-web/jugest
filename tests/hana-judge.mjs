import assert from 'node:assert/strict';
await import('../hanahana-judge.js');
const H=globalThis.HanaJudge;
const keys=['houou','king','dragon','star','newkingv'];
function near(a,b,e=1e-9){assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`)}
for(const k of keys){
  const m=H.MACHINES[k];
  assert.ok(m);
  assert.equal(m.big.length,m.labels.length);
  assert.equal(m.reg.length,m.labels.length);
  assert.equal(m.bell.length,m.labels.length);
  m.sideProb.forEach(r=>near(r.reduce((a,b)=>a+b,0),1,1e-12));
  m.bigAfterProb.forEach(r=>assert.ok(r.reduce((a,b)=>a+b,0)<1));
  const r=H.numericJudge(k,{G:6000,bb:20,rb:15,diff:200,style:'unknown'});
  near(r.q.reduce((a,b)=>a+b,0),1,1e-12);
  assert.ok(Number.isFinite(r.metrics.expectedSetting));
  assert.ok(Number.isFinite(r.reverse.inferredBell));
}
assert.deepEqual([H.defaultBigGames('houou',10),H.defaultBigGames('king',10),H.defaultBigGames('dragon',10),H.defaultBigGames('star',10),H.defaultBigGames('newkingv',10)],[240,200,210,200,140]);
assert.equal(H.defaultRegGames('newkingv',10),100);

// HANA reverse diff must not add a fixed per-bonus alignment bet outside normal G.
// Normal-game stake is already represented by 3*G; announcement may occur on the same or next normal game.
{
  const m=H.MACHINES.king,G=6000,B=20,R=15,D=250,st=m.reverseStyles.random;
  const expectedOther=3*(G/m.replay)+m.cherryPay*(G/st.cherryDenom)+m.watermelonPay*(G/st.watermelonDenom);
  const expected=(3*G+D-(m.bigPay*B+m.regPay*R)-expectedOther)/m.bellPay;
  const z=H.reverseBell(m,G,B,R,D,'random');
  near(z.rows[0].inferredBell,expected,1e-9);
}

// Actual bell must replace, not stack with, reverse-difference evidence.
const a=H.liveJudge('king',{G:6000,bb:22,rb:18,bell:850,diff:-4000});
const b=H.liveJudge('king',{G:6000,bb:22,rb:18,bell:850,diff:4000});
a.q.forEach((x,i)=>near(x,b.q[i],1e-12));
assert.ok(a.factors.some(f=>f.id==='diff'&&!f.used));

// REG-after “濃厚” is a hard minimum-setting constraint.
const g=H.liveJudge('star',{G:5000,bb:20,rb:15,regAfterCounts:[0,0,1,0,0]}); // green >=4
near(g.q[0]+g.q[1]+g.q[2],0,1e-15);
const red=H.liveJudge('star',{G:5000,bb:20,rb:15,regAfterCounts:[0,0,0,1,0]}); // red >=5
near(red.q[0]+red.q[1]+red.q[2]+red.q[3],0,1e-15);
const v=H.liveJudge('newkingv',{G:5000,bb:20,rb:15,regAfterCounts:[0,0,0,1]}); // purple=V
near(v.q[4],1,1e-12);near(v.metrics.expectedSetting,5,1e-12);

// First BIG lamp is deliberately non-evidence.
const f1=H.liveJudge('king',{G:5000,bb:20,rb:15,normalBigTrials:19,bigAfterCounts:[1,1,0,0,0],firstBigSeparated:true,firstBigColor:'青'});
const f2=H.liveJudge('king',{G:5000,bb:20,rb:15,normalBigTrials:19,bigAfterCounts:[1,1,0,0,0],firstBigSeparated:true,firstBigColor:'虹'});
f1.q.forEach((x,i)=>near(x,f2.q[i],1e-12));

// Side-lamp categorical evidence should move odd/even in the expected directions.
const cold=H.liveJudge('houou',{G:4000,bb:15,rb:12,sideCounts:[6,0,2,0,0]});
const warm=H.liveJudge('houou',{G:4000,bb:15,rb:12,sideCounts:[0,6,0,2,0]});
assert.ok(cold.metrics.odd>warm.metrics.odd);

// Impossible lamp counts must warn and be excluded rather than distort the posterior.
{
  const base=H.liveJudge('king',{G:4000,bb:10,rb:8});
  const badSide=H.liveJudge('king',{G:4000,bb:10,rb:8,sideCounts:[9,0,0,0,0]});
  base.q.forEach((x,i)=>near(x,badSide.q[i],1e-12));
  assert.ok(badSide.warnings.some(x=>x.includes('ランプ判別には使ってない')));
  const badAfter=H.liveJudge('king',{G:4000,bb:10,rb:8,normalBigTrials:11,bigAfterCounts:[1,0,0,0,0]});
  base.q.forEach((x,i)=>near(x,badAfter.q[i],1e-12));
  const badReg=H.liveJudge('king',{G:4000,bb:10,rb:8,regAfterCounts:[0,0,9,0,0]});
  assert.ok(badReg.q[0]>0&&badReg.q[1]>0&&badReg.q[2]>0);
}

// Current New King V empirical / predicted values that were explicitly selected for this build.
near(H.MACHINES.newkingv.bell[4],7.238,1e-12);
near(H.MACHINES.newkingv.bigWater[4],19.86,1e-12);
near(H.MACHINES.newkingv.regWater[1],81.35,1e-12);
near(H.MACHINES.newkingv.sideProb[4][4],.0078,3e-5); // normalized rounding table

// Random stress: no NaN/negative probabilities, all posteriors normalize.
let seed=0x12345678;function rand(){seed=(1664525*seed+1013904223)>>>0;return seed/2**32}
for(let t=0;t<20000;t++){
  const k=keys[t%keys.length],m=H.MACHINES[k],G=500+Math.floor(rand()*9000),bb=Math.floor(rand()*Math.min(50,G/20)),rb=Math.floor(rand()*Math.min(40,G/25));
  const inp={G,bb,rb,diff:Math.round((rand()-.5)*6000),style:['unknown','random','cherry','perfect'][t%4]};
  const r=H.numericJudge(k,inp);assert.ok(r.q.every(Number.isFinite));near(r.q.reduce((a,b)=>a+b,0),1,1e-9);
}
console.log('hana judge: ok',H.VERSION,keys.length,'machines');
