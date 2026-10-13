import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './helpers/runtime.mjs';

const {ctx,bridge}=await boot({loadApp:false});
vm.runInContext(fs.readFileSync('group-judge.js','utf8'),ctx);
const engine=ctx.JUGESTGroupJudge;
const tables=Object.fromEntries(ctx.JUGESTJudgement.MACHINE_KEYS.map(machine=>[machine,bridge.judgeObservedMachine({machine,games:100,bb:0,rb:0}).engine.table]));
const specs=Object.fromEntries(Object.entries(tables).map(([key,t])=>[key,t.settings]));
// Reuse the unchanged legacy capture rates; this is a declared role simulator,
// not an empirical calibration of the approximate difference likelihood.
const source=fs.readFileSync('index.html','utf8'),styleStart=source.indexOf('function styleRates(key,style){'),styleEnd=source.indexOf('\nfunction ',styleStart+1);
assert.ok(styleStart>=0&&styleEnd>styleStart);
const styleRates=vm.runInNewContext('('+source.slice(styleStart,styleEnd)+')');
let seed=0x20261010;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
function observation(machine,setting,games,tableNo){
 const t=specs[machine][setting-1],m=tables[machine],rt=styleRates(machine,'random');
 const probabilities=[1/t.b,1/t.r,1/t.g,1/m.replay,rt.c/m.revch[setting-1],rt.b/m.bell,rt.p/m.pier];
 const limits=[];let total=0;for(const p of probabilities){assert.ok(p>=0&&p<1);limits.push(total+=p)}assert.ok(total<1);
 const counts=Array(8).fill(0);
 for(let i=0;i<games;i++){const u=random();const role=limits.findIndex(limit=>u<limit);counts[role<0?7:role]++}
 const [bb,rb,grape,replay,cherry,bell,pier]=counts;
 assert.equal(counts.reduce((a,b)=>a+b,0),games);
 const generatedDiff=-3*games+m.bbpay*bb+m.regpay*rb-(bb+rb)+8*grape+3*replay+(m.chpay||2)*cherry+14*bell+10*pier;
 assert.ok(Number.isSafeInteger(generatedDiff));
 return{input:{machine,tableNo,games,bb,rb,diff:null},generatedDiff};
}
const trials=400;
const cases=[
 {id:'low-mixed',settings:[1,2,4,5,6],games:8000},
 {id:'all456',settings:[4,4,5,5,6],games:8000,trueHypotheses:['all456']},
 {id:'all56',settings:[5,5,6,6,6],games:8000,trueHypotheses:['all456','all56']},
 {id:'all6',settings:[6,6,6,6,6],games:8000,trueHypotheses:['all456','all56','all6']},
 {id:'all6-weak-observation',settings:[6,6,6,6,6],games:8000,forceWeak:true},
 {id:'low-exposure',settings:[4,4,5,5,6],games:100,trueHypotheses:['all456']},
 {id:'mixed-machines',settings:[4,4,5,5,6],games:8000,machines:['my','go','im','hp','mr'],trueHypotheses:['all456']},
 {id:'deceptive-low-mixed',settings:[3,6,6,6,6],games:8000},
 {id:'two-all6',settings:[6,6],games:8000,trueHypotheses:['all456','all56','all6']},
 {id:'two-low-close',settings:[3,6],games:8000},
 {id:'two-low-exposure',settings:[1,6],games:100},
 {id:'two-all456',settings:[4,5],games:8000,trueHypotheses:['all456']}
];
const simulations=[];
for(const c of cases){
 const stats=Object.fromEntries(['all456','all56','all6'].map(id=>[id,{rejected:0,strongExistingEvidence:0,strongBonusEvidence:0,strongDifferenceEvidence:0,logEvidenceRatioSum:0,differenceLogRatioSum:0,truth:null}]));
 let minimumDiff=Infinity,maximumDiff=-Infinity,negativeDiffRows=0,positiveDiffRows=0;
 for(let t=0;t<trials;t++){
  const observations=c.settings.map((setting,i)=>observation(c.machines?.[i]||'mr',setting,c.games,String(i+1)));
  const inputs=observations.map(o=>o.input);
  if(c.forceWeak){const old=inputs[4],m=tables[old.machine];observations[4].generatedDiff+=(10-old.bb)*(m.bbpay-1)+(6-old.rb)*(m.regpay-1);inputs[4]={...old,bb:10,rb:6}}
  const entries=inputs.map((x,i)=>({id:String(i),result:bridge.judgeObservedMachine(x)}));
  const before=structuredClone(entries),report=engine.analyze(entries);
  assert.equal(report.ok,true,JSON.stringify(report.errors));assert.deepEqual(structuredClone(entries),before);
  const withDiff=inputs.map((x,i)=>({...x,diff:observations[i].generatedDiff}));
  for(const x of withDiff){minimumDiff=Math.min(minimumDiff,x.diff);maximumDiff=Math.max(maximumDiff,x.diff);if(x.diff<0)negativeDiffRows++;if(x.diff>0)positiveDiffRows++}
  const differenceEntries=withDiff.map((x,i)=>({id:String(i),result:bridge.judgeObservedMachine(x)}));
  const differenceBefore=structuredClone(differenceEntries),differenceReport=engine.analyze(differenceEntries);
  assert.equal(differenceReport.ok,true,JSON.stringify(differenceReport.errors));assert.deepEqual(structuredClone(differenceEntries),differenceBefore);
  assert.equal(differenceReport.aggregate.diffN,inputs.length);assert.equal(report.aggregate.diffN,0);
  for(const [index,h] of report.hypotheses.entries()){
   const dh=differenceReport.hypotheses[index];
   assert.equal(dh.bonusLogEvidenceRatio,h.bonusLogEvidenceRatio,'difference never changes bonus-only evidence');
   assert.equal(dh.refutation.logFamilyP,h.refutation.logFamilyP,'difference never changes the bonus refutation');
   const s=stats[h.id];if(h.refutation.logFamilyP<Math.log(.05))s.rejected++;
   s.truth=c.settings.every(setting=>h.allowed.includes(setting));
   if(h.logEvidenceRatio>Math.log(10))s.strongExistingEvidence++;
   if(h.bonusLogEvidenceRatio>Math.log(10))s.strongBonusEvidence++;
   if(dh.logEvidenceRatio>Math.log(10))s.strongDifferenceEvidence++;
   s.logEvidenceRatioSum+=h.logEvidenceRatio;
   s.differenceLogRatioSum+=dh.logEvidenceRatio;
   assert.ok(Math.abs(h.conditional.rows[0].q.reduce((a,b)=>a+b,0)-1)<1e-12);
   assert.ok(Math.abs(h.conditional.expectedCounts.reduce((a,b)=>a+b,0)-inputs.length)<1e-10);
  }
  const [h4,h5,h6]=report.hypotheses;
  assert.ok(h4.refutation.logFamilyP>=h5.refutation.logFamilyP-1e-12);
  assert.ok(h5.refutation.logFamilyP>=h6.refutation.logFamilyP-1e-12);
 }
 for(const id of c.trueHypotheses||[])assert.ok(stats[id].rejected/trials<=.08,`${c.id} ${id}: excessive false rejection`);
 simulations.push({case:c.id,trials,rows:c.settings.length,trueSettings:c.settings,gamesPerRow:c.games,machines:c.machines||c.settings.map(()=> 'mr'),forcedWeakObservation:!!c.forceWeak,difference:{style:'random',minimumDiff,maximumDiff,negativeDiffRows,positiveDiffRows,pairedTrials:trials},hypotheses:Object.fromEntries(Object.entries(stats).map(([id,s])=>[id,{trueHypothesis:s.truth,rejectionRate:s.rejected/trials,nonRejectionRate:1-s.rejected/trials,falseRejectionRate:s.truth&&!c.forceWeak?s.rejected/trials:null,falseHypothesisNonRejectionRate:!s.truth&&!c.forceWeak?1-s.rejected/trials:null,evidenceAbove10Rate:s.strongExistingEvidence/trials,bonusEvidenceAbove10Rate:s.strongBonusEvidence/trials,differenceEvidenceAbove10Rate:s.strongDifferenceEvidence/trials,meanLogEvidenceRatio:s.logEvidenceRatioSum/trials,meanDifferenceLogEvidenceRatio:s.differenceLogRatioSum/trials}]))});
}
// A weak individual posterior is not itself a hypothesis-level rejection.
// These fixed observations exercise that distinction without calibrating rates.
const weakRows=[];
for(const x of [{games:5000,bb:14,rb:10},{games:8000,bb:22,rb:16}]){
 const entries=Array.from({length:5},(_,i)=>({id:String(i),result:bridge.judgeObservedMachine({machine:'mr',tableNo:String(i+1),games:x.games,bb:i===4?x.bb:Math.round(x.games/220),rb:i===4?x.rb:Math.round(x.games/237),diff:null})}));
 const before=JSON.stringify(entries),report=engine.analyze(entries);
 assert.equal(report.ok,true);assert.equal(JSON.stringify(entries),before);
 assert.ok(entries[4].result.p4<.15,'fixed weak row has low ordinary P4+');
 const [h4,h5,h6]=report.hypotheses;
 assert.equal(h4.refutation.refuted,false,'low individual P4+ does not prove conflict with all456');
 assert.ok(h4.conditional.rows[4].q[3]>.7,'conditional inference explains the weak row mostly as setting4');
 if(x.games===5000){assert.equal(h5.refutation.refuted,false);assert.equal(h6.refutation.refuted,false)}
 else {assert.equal(h5.refutation.refuted,true);assert.equal(h6.refutation.refuted,true)}
 weakRows.push({observation:x,ordinaryP4:entries[4].result.p4,hypotheses:report.hypotheses.map(h=>({id:h.id,logEvidenceRatio:h.logEvidenceRatio,familyP:h.refutation.familyP,refuted:h.refutation.refuted,weakConditional:h.conditional.rows[4].q}))});
}
const archived=JSON.parse(fs.readFileSync('tests/fixtures/group-pia-observed-20260921.json','utf8'));
const publicData=[];
for(const machine of [...new Set(archived.rows.map(x=>x.machine))]){
 const rows=archived.rows.filter(x=>x.machine===machine),entries=rows.map(x=>({id:x.tableNo,result:bridge.judgeObservedMachine(x)})),report=engine.analyze(entries);
 assert.equal(report.ok,true,JSON.stringify(report.errors));
 publicData.push({storeName:archived.storeName,date:archived.date,machine,n:rows.length,knownSettings:false,warnings:report.warnings,hypotheses:report.hypotheses.map(h=>({id:h.id,logEvidenceRatio:h.logEvidenceRatio,bonusLogEvidenceRatio:h.bonusLogEvidenceRatio,logFamilyP:h.refutation.logFamilyP,worstRow:h.worstRow,topConditionalAllocation:h.conditional.topAllocations[0]}))});
}
console.log(JSON.stringify({seed:'0x20261010',trialsPerCase:trials,totalTrials:trials*cases.length,simulationModel:'Fixed exposure; mutually exclusive BB/RB/grape/replay/caught-cherry/bell/pierrot/other roles from existing tables, fixed random capture style. Bonus marginals exactly preserve the previous seed and observations. Difference uses the unchanged reverse equation; approximate difference scores are NOT empirically calibrated.',pairedDifferenceChecks:trials*cases.length,limits:['Forced weak observations are diagnostic checks, not false-rejection calibration.','Evidence above 10 can occur for false hypotheses; it is not an event probability.','Role multinomial and fixed capture style are declared simulation assumptions; actual overlap/covariance and play selection may differ.','Nonrejection measures missed contradictions and never proves all-high settings.'],simulations,weakRows,publicData}));
