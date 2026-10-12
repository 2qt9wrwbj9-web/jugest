import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {boot} from './helpers/runtime.mjs';

const {ctx,bridge}=await boot({loadApp:false});
vm.runInContext(fs.readFileSync('group-judge.js','utf8'),ctx);
const engine=ctx.JUGESTGroupJudge;
const specs=Object.fromEntries(ctx.JUGESTJudgement.MACHINE_KEYS.map(machine=>[machine,bridge.judgeObservedMachine({machine,games:100,bb:0,rb:0}).engine.table.settings]));
let seed=0x20261010;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
function observation(machine,setting,games,tableNo){
 const t=specs[machine][setting-1],pb=1/t.b,pr=1/t.r;let bb=0,rb=0;
 for(let i=0;i<games;i++){const u=random();if(u<pb)bb++;else if(u<pb+pr)rb++}
 return{machine,tableNo,games,bb,rb,diff:null};
}
const trials=400;
const cases=[
 {id:'low-mixed',settings:[1,2,4,5,6],games:8000},
 {id:'all456',settings:[4,4,5,5,6],games:8000,trueHypotheses:['all456']},
 {id:'all56',settings:[5,5,6,6,6],games:8000,trueHypotheses:['all456','all56']},
 {id:'all6',settings:[6,6,6,6,6],games:8000,trueHypotheses:['all456','all56','all6']},
 {id:'all6-weak-observation',settings:[6,6,6,6,6],games:8000,forceWeak:true},
 {id:'low-exposure',settings:[4,4,5,5,6],games:100,trueHypotheses:['all456']},
 {id:'mixed-machines',settings:[4,4,5,5,6],games:8000,machines:['my','go','im','hp','mr'],trueHypotheses:['all456']}
];
const simulations=[];
for(const c of cases){
 const stats=Object.fromEntries(['all456','all56','all6'].map(id=>[id,{rejected:0,strongExistingEvidence:0,strongBonusEvidence:0,logEvidenceRatioSum:0}]));
 for(let t=0;t<trials;t++){
  const inputs=c.settings.map((setting,i)=>observation(c.machines?.[i]||'mr',setting,c.games,String(i+1)));
  if(c.forceWeak)inputs[4]={...inputs[4],bb:10,rb:6};
  const entries=inputs.map((x,i)=>({id:String(i),result:bridge.judgeObservedMachine(x)}));
  const before=JSON.stringify(entries),report=engine.analyze(entries);
  assert.equal(report.ok,true,JSON.stringify(report.errors));assert.equal(JSON.stringify(entries),before);
  for(const h of report.hypotheses){
   const s=stats[h.id];if(h.refutation.logFamilyP<Math.log(.05))s.rejected++;
   if(h.logEvidenceRatio>Math.log(10))s.strongExistingEvidence++;
   if(h.bonusLogEvidenceRatio>Math.log(10))s.strongBonusEvidence++;
   s.logEvidenceRatioSum+=h.logEvidenceRatio;
   assert.ok(Math.abs(h.conditional.rows[0].q.reduce((a,b)=>a+b,0)-1)<1e-12);
   assert.ok(Math.abs(h.conditional.expectedCounts.reduce((a,b)=>a+b,0)-5)<1e-10);
  }
  const [h4,h5,h6]=report.hypotheses;
  assert.ok(h4.refutation.logFamilyP>=h5.refutation.logFamilyP-1e-12);
  assert.ok(h5.refutation.logFamilyP>=h6.refutation.logFamilyP-1e-12);
 }
 for(const id of c.trueHypotheses||[])assert.ok(stats[id].rejected/trials<=.08,`${c.id} ${id}: excessive false rejection`);
 simulations.push({case:c.id,trials,trueSettings:c.settings,gamesPerRow:c.games,forcedWeakObservation:!!c.forceWeak,hypotheses:Object.fromEntries(Object.entries(stats).map(([id,s])=>[id,{rejectionRate:s.rejected/trials,evidenceAbove10Rate:s.strongExistingEvidence/trials,bonusEvidenceAbove10Rate:s.strongBonusEvidence/trials,meanLogEvidenceRatio:s.logEvidenceRatioSum/trials}]))});
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
console.log(JSON.stringify({seed:'0x20261010',simulationModel:'Fixed-exposure three-category multinomial, bonus only; event probabilities and reverse-difference calibration not estimated',simulations,weakRows,publicData}));
