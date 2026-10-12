import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot,plain} from './helpers/runtime.mjs';

const context=vm.createContext({});
for(const file of ['judgement-model.js','group-judge.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const engine=context.JUGESTGroupJudge;
const weights=[1/6,1/6,1/6,1/6,1/6,1/6];
const settings=Array.from({length:6},(_,i)=>({setting:i+1,g:6-i*.05,b:300-i*12,r:450-i*36}));
function fixture(id,logs=[0,0,0,0,0,0],input={},table=settings){
 const value={machine:'my',tableNo:String(id),games:4000,bb:15,rb:12,diff:null,...input};
 return {id:String(id),result:{ok:true,input:value,machineName:value.machine==='my'?'マイジャグV':'機種 '+value.machine,
  q:[1/6,1/6,1/6,1/6,1/6,1/6],method:value.diff==null?'bonus-only':'reverse-diff',reverseWarn:false,warnings:[],
  diagnostics:{logs:logs.slice()},engine:{table:{key:value.machine,settings:structuredClone(table)}}}};
}
function close(actual,expected,tolerance=2e-11){assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${actual} ≈ ${expected}`)}
function logAdd(a,b){if(a===-Infinity)return b;if(b===-Infinity)return a;return Math.max(a,b)+Math.log1p(Math.exp(-Math.abs(a-b)))}
function enumerateRatio(logs,allowed,w=weights){
 let inside=-Infinity,outside=-Infinity;
 function visit(i,value,inHypothesis){
  if(i===logs.length){if(inHypothesis)inside=logAdd(inside,value);else outside=logAdd(outside,value);return}
  for(let s=1;s<=6;s++)visit(i+1,value+Math.log(w[s-1])+logs[i][s-1],inHypothesis&&allowed.includes(s));
 }
 visit(0,0,true);
 const mass=allowed.reduce((sum,s)=>sum+w[s-1],0),prior=mass**logs.length;
 return inside-Math.log(prior)-outside+Math.log1p(-prior);
}
function bonusLogs(entry){const {games,bb,rb}=entry.result.input;return entry.result.engine.table.settings.map(s=>bb*Math.log(1/s.b)+rb*Math.log(1/s.r)+(games-bb-rb)*Math.log1p(-1/s.b-1/s.r))}
function enumerateAllocations(rows,allowed){
 const map=new Map();
 function visit(i,counts,p){
  if(i===rows.length){const key=counts.join(',');map.set(key,(map.get(key)||0)+p);return}
  for(const s of allowed){counts[s-1]++;visit(i+1,counts,p*rows[i].q[s-1]);counts[s-1]--}
 }
 visit(0,[0,0,0,0,0,0],1);
 return map;
}
function directCDF(n,k,p){
 if(k<0)return 0;if(k>=n)return 1;if(p===0)return 1;if(p===1)return 0;
 let term=(1-p)**n,sum=term;
 for(let j=1;j<=k;j++){term*=((n-j+1)/j)*(p/(1-p));sum+=term}
 return sum;
}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child)}return value}

test('two and three rows match finite enumeration for each hypothesis and weight sensitivity',()=>{
 for(const logs of [
  [[-1,-2,-3,-.2,-.3,-.6],[-.8,-2,-1,-1.4,-.6,0]],
  [[-.5,-.7,-1.2,-.4,-1,-2],[-2,-1,-.7,0,-.4,-.2],[-1,-.8,-.6,-.3,-.2,0]]
 ]){
  const entries=logs.map((l,i)=>fixture(i+1,l)),result=engine.analyze(entries);
  assert.equal(result.ok,true);assert.equal(result.version,engine.VERSION);assert.equal(result.n,entries.length);
  assert.deepEqual(Array.from(result.hypotheses,h=>h.id),['all456','all56','all6']);
  for(const h of result.hypotheses){
   close(h.logEvidenceRatio,enumerateRatio(logs,Array.from(h.allowed)));
   close(h.bonusLogEvidenceRatio,enumerateRatio(entries.map(bonusLogs),Array.from(h.allowed)));
   assert.deepEqual(Array.from(h.sensitivity,s=>s.id),['equal','lower','upper']);
   for(const sensitivity of h.sensitivity){
    assert.equal(sensitivity.weights.length,6);close(sensitivity.weights.reduce((a,b)=>a+b,0),1);
    close(sensitivity.logEvidenceRatio,enumerateRatio(logs,Array.from(h.allowed),Array.from(sensitivity.weights)));
    close(sensitivity.bonusLogEvidenceRatio,enumerateRatio(entries.map(bonusLogs),Array.from(h.allowed),Array.from(sensitivity.weights)));
   }
  }
 }
});

test('neutral logs give zero evidence ratios and conditional weight restrictions',()=>{
 const result=engine.analyze([fixture(1),fixture(2),fixture(3)]);assert.equal(result.ok,true);
 for(const h of result.hypotheses){
  close(h.logEvidenceRatio,0);
  for(const s of h.sensitivity)close(s.logEvidenceRatio,0);
  for(const row of h.conditional.rows)for(let s=1;s<=6;s++)close(row.q[s-1],h.allowed.includes(s)?1/h.allowed.length:0);
  close(h.conditional.expectedCounts.reduce((a,b)=>a+b,0),3);
 }
});

test('unordered allocation profiles include every assignment and preserve multiplicities',()=>{
 const result=engine.analyze([fixture(1),fixture(2),fixture(3)]);
 const h=result.hypotheses[0],expected=enumerateAllocations(h.conditional.rows,h.allowed);
 assert.equal(expected.size,10);assert.equal(h.conditional.topAllocations.length,8);
 for(const allocation of h.conditional.topAllocations){
  assert.equal(allocation.counts.length,6);close(allocation.probability,expected.get(allocation.counts.join(',')));
  assert.equal(allocation.counts.reduce((a,b)=>a+b,0),3);
 }
 assert.equal(h.conditional.topAllocations[0].label,'456');close(h.conditional.topAllocations[0].probability,6/27);
 assert.deepEqual(Array.from(h.conditional.mapAssignment,row=>row.setting),[4,4,4]);
 assert.equal(h.conditional.topAllocations[0].counts[3],1,'modal count profile is not the per-row argmax assignment');
});

test('nonuniform three-row allocation DP agrees with every profile of an independent full enumeration',()=>{
 const logs=[[-4,-3,-2,0,-.8,-2],[-3,-4,-2,-.6,0,-1],[-3,-2,-4,-1.5,-.4,0]];
 const result=engine.analyze(logs.map((l,i)=>fixture(i+1,l)));
 for(const h of result.hypotheses){
  const expected=enumerateAllocations(h.conditional.rows,h.allowed);
  for(const allocation of h.conditional.topAllocations)close(allocation.probability,expected.get(allocation.counts.join(',')));
  for(let s=0;s<6;s++)close(h.conditional.expectedCounts[s],h.conditional.rows.reduce((a,row)=>a+row.q[s],0));
  for(const row of h.conditional.rows)close(row.expectedSetting,row.q.reduce((a,q,i)=>a+q*(i+1),0));
 }
});

test('per-row offsets and entry order do not change evidence or conditional allocations',()=>{
 const entries=[fixture(1,[-4,-3,-2,-1,-.5,0]),fixture(2,[-1,0,-2,-3,-4,-5]),fixture(3,[-2,-3,-4,-1,0,-.4])];
 const shifted=structuredClone(entries).reverse();shifted.forEach((entry,i)=>entry.result.diagnostics.logs=entry.result.diagnostics.logs.map(v=>v+[10000,-5000,800][i]));
 const before=engine.analyze(entries),after=engine.analyze(shifted);
 assert.equal(after.ok,true);
 for(let i=0;i<3;i++){
  const a=before.hypotheses[i],b=after.hypotheses[i];close(a.logEvidenceRatio,b.logEvidenceRatio,2e-10);
  close(a.bonusLogEvidenceRatio,b.bonusLogEvidenceRatio);
  const counts=new Map(b.conditional.topAllocations.map(x=>[x.label,x.probability]));
  for(const x of a.conditional.topAllocations)close(x.probability,counts.get(x.label),2e-10);
  assert.equal(a.worstRow.id,b.worstRow.id);close(a.worstRow.logCompatibility,b.worstRow.logCompatibility);
 }
});

test('two-state complement DP remains finite at extreme all-high likelihood concentration',()=>{
 const logs=[[-900,-901,-902,0,-.1,-.2],[-920,-921,-922,-.1,0,-.2],[-930,-931,-932,-.2,-.1,0]];
 const result=engine.analyze(logs.map((l,i)=>fixture(i+1,l)));assert.equal(result.ok,true);
 const ratio=result.hypotheses[0].logEvidenceRatio;assert.ok(Number.isFinite(ratio));assert.ok(ratio>900);
 close(ratio,enumerateRatio(logs,[4,5,6]));
 const almostAllSix=[1e-12,1e-12,1e-12,1e-12,1e-12,1-5e-12];
 close(engine.__test.logEvidenceRatio([[0,0,0,0,0,0],[0,0,0,0,0,0]],[6],almostAllSix),0,2e-12);
});

test('zero support is represented as impossible evidence and unavailable conditional, not fake distributions',()=>{
 const entries=[fixture(1,[0,-Infinity,-Infinity,-Infinity,-Infinity,-Infinity]),fixture(2,[0,-1,-2,-3,-4,-5])];
 const result=engine.analyze(entries);assert.equal(result.ok,true);
 for(const h of result.hypotheses){assert.equal(h.logEvidenceRatio,-Infinity);assert.equal(h.conditional.available,false);assert.equal(h.conditional.rows.length,0);assert.equal(h.conditional.topAllocations.length,0)}
 const certain=engine.analyze([fixture(1,[-Infinity,-Infinity,-Infinity,0,0,0]),fixture(2,[-Infinity,-Infinity,-Infinity,0,0,0])]);
 assert.equal(certain.hypotheses[0].logEvidenceRatio,Infinity);
});

test('binomial lower CDF agrees with independent PMF sums and exact boundary identities',()=>{
 const tail=engine.__test.binomialLowerTail;
 for(const n of [1,2,10,30,100])for(const p of [0,.001,.1,.5,.9,1])for(let k=0;k<=n;k++)close(tail(n,k,p).p,directCDF(n,k,p),2e-12);
 assert.equal(tail(10,-1,.4).p,0);assert.equal(tail(10,10,.4).p,1);assert.equal(tail(0,0,.4).p,1);
 close(tail(10000000,0,.004).logP,10000000*Math.log1p(-.004));
 close(tail(10000000,9999999,.9999999).logP,Math.log(-Math.expm1(10000000*Math.log(.9999999))));
 for(const args of [[-1,0,.1],[1.5,0,.1],[10,1,-.1],[10,1,1.1],[10,1,NaN]])assert.throws(()=>tail(...args));
});

test('binomial CDF certified SciPy 1.17 / decimal reference vectors cover large n and extreme p',()=>{
 // SciPy binom.logcdf references; near-one cases and the extreme final tail use
 // Decimal(80-digit) PMF sums, beyond rounded CDF-to-log conversion precision.
 const vectors=[
  [100,5,.12,-4.185031520377106],
  [10000000,36000,.0036,-.6903476277798662],
  [10000000,34000,.0036,-60.07025793337349],
  [10000000,5000000,.5,-.6928948991396866],
  [10000000,4990000,.5,-22.784945856044214],
  [10000000,0,1e-12,-1.0000000000005e-5],
  [10000000,1,1e-12,-4.9999661669266644e-11],
  [10000000,9999998,1-1e-12,-23.719049120945105],
  [10000000,9963000,.9964,-16.41442114582744],
  [10000000,1,1e-7,-.3068528194400542],
  [10000000,40,1e-5,-25.613683862210966],
  [10000000,2,1e-12,-1.6666536667241998e-16],
  [10000000,10,.004,-39989.3117158913]
 ];
 for(const [n,k,p,expected] of vectors){const actual=engine.__test.binomialLowerTail(n,k,p);close(actual.logP,expected,2e-11);assert.ok(actual.p>=0&&actual.p<=1)}
 const almostOne=engine.__test.binomialLowerTail(10000000,1,1e-12);close(almostOne.logP/-4.9999661669266644e-11,1,1e-11);
 const nearOne=engine.__test.binomialLowerTail(10000000,2,1e-12);assert.ok(nearOne.logP<0);close(nearOne.logP/-1.6666536667241998e-16,1,1e-10);
 const tiny=engine.__test.binomialLowerTail(10000000,10,.004);assert.equal(tiny.p,0);assert.ok(Number.isFinite(tiny.logP));
});

test('refutation uses the setting-wise channel minimum, allowed-setting maximum, rows and three-hypothesis corrections',()=>{
 const entries=[fixture(1,[-6,-5,-4,-3,-2,-1],{games:80,bb:0,rb:0}),fixture(2,[-1,-2,-3,-4,-5,-6],{games:100,bb:1,rb:0})];
 const result=engine.analyze(entries);assert.equal(result.ok,true);
 for(const h of result.hypotheses){
  const ps=entries.map(entry=>{
   const {games,bb,rb}=entry.result.input;
   return Math.max(...Array.from(h.allowed,s=>{const row=entry.result.engine.table.settings[s-1];return Math.min(1,3*Math.min(directCDF(games,bb,1/row.b),directCDF(games,rb,1/row.r),directCDF(games,bb+rb,1/row.b+1/row.r)))}));
  });
  for(let i=0;i<ps.length;i++){close(h.refutation.rows[i].p,ps[i]);close(h.refutation.rows[i].logP,Math.log(ps[i]));assert.deepEqual(Object.keys(h.refutation.rows[i].channels),['bb','rb','total'])}
  close(h.refutation.p,Math.min(1,2*Math.min(...ps)));close(h.refutation.familyP,Math.min(1,3*h.refutation.p));
  close(h.refutation.logFamilyP,Math.log(h.refutation.familyP));
  assert.equal(h.refutation.weakestRow.id,String(ps[0]<=ps[1]?1:2));
 }
 const weak=engine.analyze([fixture(1,undefined,{games:10000000,bb:0,rb:0}),fixture(2)]);
 assert.ok(weak.hypotheses[0].refutation.logP<-10000);assert.ok(Number.isFinite(weak.hypotheses[0].refutation.logFamilyP));
 assert.equal(weak.hypotheses[0].refutation.refuted,true);
});

test('worst compatibility row uses maximum logs and not q or the lower-tail weakest row',()=>{
 const result=engine.analyze([fixture(1,[0,-1,-2,-8,-9,-10]),fixture(2,[-1,0,-2,-2,-3,-4])]);
 for(const h of result.hypotheses){assert.equal(h.worstRow.id,'1');close(h.worstRow.logCompatibility,Math.max(...Array.from(h.allowed,s=>[-8,-9,-10][s-4])))}
});

test('aggregates retain explicit zero differences and separate partial differences without zero filling',()=>{
 const entries=[fixture(1,undefined,{games:4000,bb:10,rb:8,diff:0}),fixture(2,undefined,{games:5000,bb:20,rb:15,diff:null})];
 const result=engine.analyze(entries);assert.equal(result.ok,true);
 assert.equal(result.aggregate.games,9000);assert.equal(result.aggregate.bb,30);assert.equal(result.aggregate.rb,23);
 assert.equal(result.aggregate.diff,null);assert.equal(result.aggregate.diffN,1);assert.equal(result.aggregate.knownDiff,0);
 close(result.aggregate.bbDenom,9000/30);close(result.aggregate.rbDenom,9000/23);close(result.aggregate.combinedDenom,9000/53);
 assert.ok(result.warnings.some(w=>w.includes('差枚')));
 entries[1].result.input.diff=-600;const complete=engine.analyze(entries);
 assert.equal(complete.aggregate.diff,-600);assert.equal(complete.aggregate.diffN,2);
 const zeroBonuses=engine.analyze([fixture(1,undefined,{bb:0,rb:0}),fixture(2,undefined,{bb:0,rb:0})]);
 assert.equal(zeroBonuses.aggregate.bbDenom,null);assert.equal(zeroBonuses.aggregate.rbDenom,null);assert.equal(zeroBonuses.aggregate.combinedDenom,null);
});

test('homogeneous reference is bonus-only same-setting aggregate, while mixed machines remain valid',()=>{
 const entries=[fixture(1,[-6,-5,-4,-3,-2,-1],{diff:-300}),fixture(2,[-1,-2,-3,-4,-5,-6],{diff:900})];
 const result=engine.analyze(entries);assert.equal(result.aggregateJudgement.available,true);
 const totalLogs=settings.map(s=>30*Math.log(1/s.b)+24*Math.log(1/s.r)+(8000-54)*Math.log1p(-1/s.b-1/s.r));
 const max=Math.max(...totalLogs),values=totalLogs.map(l=>Math.exp(l-max)),sum=values.reduce((a,b)=>a+b,0),q=values.map(x=>x/sum);
 q.forEach((x,i)=>close(result.aggregateJudgement.q[i],x));close(result.aggregateJudgement.p4,q[3]+q[4]+q[5]);close(result.aggregateJudgement.p5,q[4]+q[5]);close(result.aggregateJudgement.p6,q[5]);
 const mixed=structuredClone(entries);mixed[1].result.input.machine='go';mixed[1].result.engine.table.key='go';mixed[1].result.engine.table.settings.forEach(s=>{s.b*=.95;s.r*=.9});
 const analysis=engine.analyze(mixed);assert.equal(analysis.ok,true);assert.equal(analysis.aggregate.mixedMachines,true);assert.equal(analysis.aggregateJudgement.available,false);assert.ok(analysis.aggregateJudgement.reason.includes('混在'));
 close(analysis.hypotheses[0].bonusLogEvidenceRatio,enumerateRatio(mixed.map(bonusLogs),[4,5,6]));
});

test('complete input contract rejects duplicates, missing results, malformed logs/tables and limits',()=>{
 const invalid=[
  [],[fixture(1)],Array.from({length:61},(_,i)=>fixture(i)),
  [fixture(1),fixture(1)],
  [fixture(1),fixture(2,undefined,{tableNo:' 1 '})],
  [fixture(1),{id:'2',result:null}],
  [fixture(1),{...fixture(2),id:''}],
 ];
 for(const patch of [{games:0},{games:10000001},{games:'1.5'},{games:true},{bb:''},{bb:-1},{bb:4001},{rb:null},{diff:'oops'},{diff:9007199254740992},{machine:'unknown'}])invalid.push([fixture(1),fixture(2,undefined,patch)]);
 for(const patch of [
  r=>r.ok=false,
  r=>delete r.input,
  r=>delete r.diagnostics,
  r=>r.diagnostics.logs=[0,0,0,0,0],
  r=>r.diagnostics.logs=[0,0,0,0,0,NaN],
  r=>r.diagnostics.logs=[0,0,0,0,0,Infinity],
  r=>r.diagnostics.logs=Array(6).fill(-Infinity),
  r=>{r.q=Array(6);r.q[0]=1},
  r=>r.q=[1,0,0,0,0,NaN],
  r=>r.q=[0,0,0,0,0,0],
  r=>r.engine.table.settings.pop(),
  r=>r.engine.table.settings[0].setting=2,
  r=>r.engine.table.settings[0].b=0,
  r=>r.engine.table.settings[0].r=Infinity,
  r=>{r.engine.table.settings[0].b=1;r.engine.table.settings[0].r=1},
  r=>r.engine.table.key='go',
  r=>r.engine.table.settings[0].b+=1,
 ]){const entries=[fixture(1),fixture(2)];patch(entries[1].result);invalid.push(entries)}
 invalid.push([fixture(1,undefined,{diff:Number.MAX_SAFE_INTEGER}),fixture(2,undefined,{diff:1})]);
 for(const entries of invalid){const actual=engine.analyze(entries);assert.equal(actual.ok,false,JSON.stringify(entries));assert.ok(actual.errors.length>0);assert.ok(actual.errors.every(e=>typeof e==='string'&&/[ぁ-んァ-ヶ一-龯]/u.test(e)))}
 const blanks=engine.analyze([fixture(1,undefined,{tableNo:''}),fixture(2,undefined,{tableNo:' '})]);assert.equal(blanks.ok,true);
 const max=engine.analyze([fixture(1,undefined,{games:10000000}),fixture(2,undefined,{games:10000000})]);assert.equal(max.ok,true);
 const cancelling=engine.analyze([fixture(1,undefined,{diff:Number.MAX_SAFE_INTEGER}),fixture(2,undefined,{diff:Number.MAX_SAFE_INTEGER}),fixture(3,undefined,{diff:-Number.MAX_SAFE_INTEGER})]);assert.equal(cancelling.ok,true);assert.equal(cancelling.aggregate.diff,Number.MAX_SAFE_INTEGER);
});

test('60-row allocation and refutation calculations stay bounded and normalized',()=>{
 const entries=Array.from({length:60},(_,i)=>fixture(i+1));
 const result=engine.analyze(entries);assert.equal(result.ok,true);assert.equal(result.n,60);
 for(const h of result.hypotheses){
  close(h.logEvidenceRatio,0);close(h.conditional.expectedCounts.reduce((a,b)=>a+b,0),60);
  assert.equal(h.conditional.rows.length,60);assert.equal(h.refutation.rows.length,60);
  assert.equal(h.conditional.topAllocations.length,h.allowed.length===1?1:8);
  for(const allocation of h.conditional.topAllocations){assert.equal(allocation.counts.reduce((a,b)=>a+b,0),60);assert.ok(allocation.probability>0&&allocation.probability<=1)}
 }
 const h=result.hypotheses[0],balanced=h.conditional.topAllocations[0];
 assert.deepEqual(Array.from(balanced.counts),[0,0,0,20,20,20]);
 const logFactorial=n=>Array.from({length:n},(_,i)=>Math.log(i+1)).reduce((a,b)=>a+b,0);
 close(Math.log(balanced.probability),logFactorial(60)-3*logFactorial(20)-60*Math.log(3));
});

test('warnings describe low exposure, inverse warnings, weight assumptions and selected-after-observation limits',()=>{
 const entries=[fixture(1,undefined,{games:1000,bb:3,rb:2,diff:0}),fixture(2)];entries[0].result.reverseWarn=true;
 const result=engine.analyze(entries);assert.equal(result.ok,true);
 for(const marker of ['2000','差枚','重み','選別','同じ設定'])assert.ok(result.warnings.some(w=>w.includes(marker)),marker);
 assert.ok(result.warnings.some(w=>w.includes('独立')));
});

test('real adapter output works for all eight machines; analyze is pure and does not rewrite individual q',async()=>{
 const {ctx,bridge}=await boot({loadApp:false});
 for(const machine of ctx.JUGESTJudgement.MACHINE_KEYS){
  const entries=[1,2].map(id=>({id:String(id),result:bridge.judgeObservedMachine({machine,tableNo:String(id),games:7859,bb:31,rb:35,diff:id===1?1500:null})}));
  const before=structuredClone(entries);freeze(entries);
  const first=engine.analyze(entries),second=engine.analyze(entries);
  assert.equal(first.ok,true,machine);assert.deepEqual(plain(first),plain(second));assert.deepEqual(structuredClone(entries),before);
 }
 assert.ok(Object.isFrozen(engine));assert.ok(Object.isFrozen(engine.__test));
});
