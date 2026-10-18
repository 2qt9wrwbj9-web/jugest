#!/usr/bin/env node
// Independent Python full-configuration oracle; this file never implements DP.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {captureAllocationLikelihoods,getAllocationProbabilityTables} from '../../vps/src/allocation/likelihoods.mjs';
import {__test as legacyRuntime} from '../../vps/src/analysis/runtime-adapter.mjs';
import '../../store-day-allocation.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const outdir=path.join(root,'docs/development/store-day-allocation-20261017');
const api=globalThis.JUGESTStoreDayAllocation;
const encode=(_key,x)=>typeof x==='number'&&!Number.isFinite(x)?String(x):x;
const decode=(_key,x)=>x==='-Infinity'?-Infinity:x==='Infinity'?Infinity:x;
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const tolerance={probability:3e-11,log:3e-9};
let checks=0,maxProbabilityError=0,maxLogError=0,sensitivityEventsCompared=0,sensitivityDetailsCompared=0;
const failures=[];
const quantile=(distribution,q)=>{for(let k=0;k<distribution.length;k++)if(distribution.slice(0,k+1).reduce((a,b)=>a+b,0)>=q-1e-12)return k;return distribution.length-1;};
function equal(actual,expected,label,kind='probability'){
  checks++;
  if(actual===expected)return;
  if(actual==null||expected==null||!Number.isFinite(actual)||!Number.isFinite(expected)){
    failures.push({label,actual,expected});return;
  }
  const error=Math.abs(actual-expected);
  if(kind==='log')maxLogError=Math.max(maxLogError,error);else maxProbabilityError=Math.max(maxProbabilityError,error);
  if(error>tolerance[kind])failures.push({label,actual,expected,error});
}
function arrayEqual(actual,expected,label,kind='probability'){
  if(!Array.isArray(actual)||actual.length!==expected.length){failures.push({label,reason:'array length mismatch'});return;}
  for(let i=0;i<expected.length;i++)equal(actual[i],expected[i],`${label}[${i}]`,kind);
}
function sensitivityComparison(actual,expected,label,id){
  if(!actual||typeof actual!=='object'){failures.push({label,reason:'sensitivity comparison missing'});return;}
  equal(actual.id,id,`${label}.id`);
  equal(actual.kind,expected.kind,`${label}.kind`);
  equal(actual.count,expected.count,`${label}.count`);
  for(const key of ['priorProbability','posteriorProbability'])equal(actual[key],expected[key],`${label}.${key}`);
  equal(actual.logBF,expected.logBF,`${label}.logBF`,'log');
  for(const [key,value] of Object.entries({eRegistered:false,logEValue:null,logThreshold:null,modelPass:false,strongEnabled:false}))equal(actual[key],value,`${label}.${key}`);
}
function rng(seed){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};}
const random=rng(0x1d1ce77a);
const randomLogs=n=>Array.from({length:n},()=>Array.from({length:6},()=>-12*random()));
const cases=[
  {name:'neutral-n1',logs:[Array(6).fill(0)]},
  {name:'neutral-n2',logs:Array.from({length:2},()=>Array(6).fill(0))},
  {name:'neutral-n5',logs:Array.from({length:5},()=>Array(6).fill(0))},
  {name:'sensitivity-bf-crosses-neutral',logs:[[0,Math.log(.1),Math.log(.1),Math.log(.5),Math.log(.5),Math.log(.5)]],detail:{band:'456',kind:'exact',count:1}},
  {name:'two-distinct-rows-binomial-division',logs:[[0,-1,-2,-3,-4,-5],[-5,-4,-3,-2,-1,0]],detail:{band:'456',kind:'exact',count:1}},
  {name:'full6-pure-components',logs:Array.from({length:5},()=>[-30,-24,-18,-12,-6,0]),detail:{band:'6',kind:'atLeast',count:5}},
  {name:'mixed46-shared-zero-event-components',logs:[[ -30,-20,-15,0,-10,-20],[-30,-20,-15,-20,-10,0],[ -30,-20,-15,0,-10,-20],[-30,-20,-15,-20,-10,0]],detail:{band:'56',kind:'exact',count:2}},
  {name:'forced-support',logs:[[0,-Infinity,-Infinity,-Infinity,-Infinity,-Infinity],[-Infinity,-Infinity,-Infinity,-Infinity,-Infinity,0],[-Infinity,-Infinity,-Infinity,0,-Infinity,-Infinity]],detail:{band:'456',kind:'exact',count:2}},
  {name:'impossible-conditional-event',logs:[[0,-Infinity,-Infinity,-Infinity,-Infinity,-Infinity],[0,-Infinity,-Infinity,-Infinity,-Infinity,-Infinity]],detail:{band:'6',kind:'exact',count:2}},
  {name:'extreme-log-scale',logs:[[-1e8,-1e8-700,-1e8-1,-1e8-1000,-1e8-2,-Infinity],[-1e9-500,-1e9-3,-1e9-1000,-1e9,-Infinity,-1e9-900],[-1e7-5000,-1e7-2000,-1e7-1000,-1e7-5,-1e7-2,-1e7]],detail:{band:'6',kind:'atLeast',count:1}},
];
for(let n=1;n<=5;n++)for(let rep=0;rep<2;rep++)cases.push({name:`fixed-seed-random-n${n}-${rep}`,logs:randomLogs(n)});
for(const band of ['456','56','6'])for(const kind of ['exact','atLeast'])cases.push({name:`conditional-${band}-${kind}`,logs:randomLogs(4),detail:{band,kind,count:2}});
cases.push({name:'prior-degenerate-detail',logs:randomLogs(3),detail:{band:'456',kind:'atLeast',count:0}});

// All likelihood tables below come from the unchanged existing runtime.
const tables=await getAllocationProbabilityTables({rootDir:root});
const actualInput=Object.keys(tables.tables).flatMap(machine=>[1200,6000,9000].map((games,i)=>({
  id:`${machine}-${games}`,tableNo:String(i+1),machine,eligible:true,
  input:{games,bb:Math.round(games/tables.tables[machine].settings[i*2].b),rb:Math.round(games/tables.tables[machine].settings[i*2].r),diff:null}
})));
const captured=await captureAllocationLikelihoods({rootDir:root,rows:actualInput});
let actualTableLogError=0;
for(const row of captured.rows){
  const {games,bb,rb}=row.input;
  const direct=tables.tables[row.machine].settings.map(s=>bb*Math.log(1/s.b)+rb*Math.log(1/s.r)+(games-bb-rb)*Math.log(1-1/s.b-1/s.r));
  direct.forEach((value,i)=>{actualTableLogError=Math.max(actualTableLogError,Math.abs(value-row.bonusLogs[i]));equal(value,row.bonusLogs[i],`existing-runtime-log-${row.id}-${i}`,'log');});
}
for(const machine of Object.keys(tables.tables))cases.push({name:`actual-existing-table-${machine}`,logs:captured.rows.filter(row=>row.machine===machine).map(row=>row.bonusLogs),detail:{band:'456',kind:'exact',count:1}});

// Broad preservation check against an independently booted legacy bridge.
// Allocation capture must return the exact existing ordinary result, including
// difference-based method/fallback/warnings, while separately capturing bonus.
const parityRandom=rng(0x77b9841d),parityRows=[];
for(const machine of Object.keys(tables.tables))for(let rep=0;rep<128;rep++){
  const games=[1,120,500,1500,3000,6000,9000,12000][rep%8],setting=tables.tables[machine].settings[rep%6];
  const eb=games/setting.b,er=games/setting.r;
  const bb=Math.min(games,Math.max(0,Math.round(eb+(parityRandom()-.5)*4*Math.sqrt(eb))));
  const rb=Math.min(games-bb,Math.max(0,Math.round(er+(parityRandom()-.5)*4*Math.sqrt(er))));
  parityRows.push({id:`parity-${machine}-${rep}`,tableNo:String(rep+1),machine,eligible:true,input:{games,bb,rb,diff:rep%2===0?null:Math.round((parityRandom()-.4)*8000)}});
}
const parityCaptured=await captureAllocationLikelihoods({rootDir:root,rows:parityRows});
const {ctx:parityContext,bridge:parityBridge}=await legacyRuntime.bootRuntime(root);
const parityMethods={};
for(let i=0;i<parityRows.length;i++){
  const row=parityRows[i],actual=parityCaptured.rows[i];
  const ordinary=parityBridge.judgeObservedMachine({...row.input,machine:row.machine,tableNo:row.tableNo});
  checks++;
  if(JSON.stringify(ordinary)!==JSON.stringify(actual.individual))failures.push({label:row.id,reason:'ordinary legacy result changed'});
  arrayEqual(actual.individual.q,Array.from(ordinary.q),`${row.id}.ordinaryQ`);
  equal(actual.individual.expectedSetting,ordinary.expectedSetting,`${row.id}.expectedSetting`);
  let legacyBonus;
  parityContext.V4_TEST.externalJudge(row.machine,row.input.games,row.input.bb,row.input.rb,null,value=>{legacyBonus=value;});
  arrayEqual(actual.bonusLogs,Array.from(legacyBonus.logs),`${row.id}.bonusCallback`,'log');
  arrayEqual(actual.logs,Array.from(ordinary.diagnostics.logs),`${row.id}.combinedLogs`,'log');
  parityMethods[ordinary.method]=(parityMethods[ordinary.method]??0)+1;
}

// Exhaustive finite observation space checks the e-value expectation against
// every fixed setting configuration, independently of asymptotic simulation.
const toyProbabilities=[[.80,.15,.05],[.65,.25,.10],[.50,.30,.20],[.30,.40,.30],[.20,.35,.45],[.10,.20,.70]];
for(let a=0;a<3;a++)for(let b=0;b<3;b++)cases.push({name:`finite-normalized-model-${a}${b}`,logs:[toyProbabilities.map(p=>Math.log(p[a])),toyProbabilities.map(p=>Math.log(p[b]))]});

const started=performance.now();
const python=spawnSync('python3',[path.join(root,'scripts/allocation-validation/reference.py')],{input:JSON.stringify({cases},encode),encoding:'utf8',maxBuffer:100*1024*1024});
if(python.status!==0)throw new Error(`Python reference failed: ${python.stderr}`);
const reference=JSON.parse(python.stdout,decode);
const results=[];
const baselineNames={'low-centered':'low','middle-centered':'middle','some-high':'someHigh'};
const outputs=new Map();
for(let i=0;i<cases.length;i++){
  const testCase=cases[i],oracle=reference.cases[i];
  const rows=testCase.logs.map((logs,j)=>({id:`row-${j}`,logs,individual:{q:[1/6,1/6,1/6,1/6,1/6,1/6]}}));
  const before=JSON.stringify(rows,encode);
  const result=api.analyzeMachine({rows,familySize:81,alpha:.05,detail:testCase.detail??null});
  outputs.set(testCase.name,result);
  if(!result.ok){failures.push({label:testCase.name,reason:result.reason});continue;}
  if(before!==JSON.stringify(rows,encode))failures.push({label:testCase.name,reason:'input mutated'});
  if(result.strongEnabled!==false)failures.push({label:testCase.name,reason:'strongEnabled changed'});
  equal(oracle.priorMass,1,`${testCase.name}.priorMass`);
  equal(oracle.decimalCoefficientMaxError,0,`${testCase.name}.decimal`);
  const normLogs=testCase.logs.map(row=>row.map(x=>x-Math.max(...row)));
  arrayEqual(api.__test.countLogLikelihoods(normLogs,[0,0,0,1/3,1/3,1/3],[1/3,1/3,1/3,0,0,0]),oracle.fixedCountLogLikelihoods,`${testCase.name}.fixedCount`,'log');
  for(const band of result.bands){
    const label=`${testCase.name}.${band.id}`;
    arrayEqual(band.distribution,oracle.distribution[band.id],`${label}.distribution`);
    arrayEqual(band.priorDistribution,oracle.priorDistribution[band.id],`${label}.prior`);
    equal(band.expected,oracle.distribution[band.id].reduce((sum,p,k)=>sum+k*p,0),`${label}.expected`);
    equal(band.median,quantile(oracle.distribution[band.id],.5),`${label}.median`);
    equal(band.interval.lo,quantile(oracle.distribution[band.id],.05),`${label}.interval.lo`);
    equal(band.interval.hi,quantile(oracle.distribution[band.id],.95),`${label}.interval.hi`);
    equal(band.sensitivityRange.lo,Math.min(...Object.values(oracle.sensitivities).map(m=>quantile(m.distribution[band.id],.05))),`${label}.sensitivityRange.lo`);
    equal(band.sensitivityRange.hi,Math.max(...Object.values(oracle.sensitivities).map(m=>quantile(m.distribution[band.id],.95))),`${label}.sensitivityRange.hi`);
    for(const event of band.events){
      const expected=oracle.events[band.id][event.id];
      for(const key of ['priorProbability','posteriorProbability'])equal(event[key],expected[key],`${label}.${event.id}.${key}`);
      for(const key of ['logBF','logEValue','logNullMaximum','logDetectionLikelihood'])equal(event[key],expected[key],`${label}.${event.id}.${key}`,'log');
      equal(event.logLikelihood,expected.logConditionalLikelihood,`${label}.${event.id}.logLikelihood`,'log');
      equal(api.__test.maximumNullLogLikelihood(normLogs,band.id,event.count),expected.logNullMaximum,`${label}.${event.id}.nullHelper`,'log');
      equal(api.__test.detectionLogLikelihood(normLogs,band.id,event.count),expected.logDetectionLikelihood,`${label}.${event.id}.detectionHelper`,'log');
      equal(expected.detectionPriorMass,1,`${label}.${event.id}.detectionPriorNormalization`);
      equal(event.logThreshold,Math.log(81/.05),`${label}.${event.id}.threshold`,'log');
      for(const baseline of event.baselines){
        const bl=oracle.baselineLogLikelihoods[baselineNames[baseline.id]];
        equal(baseline.logLikelihood,bl,`${label}.${event.id}.baseline.${baseline.id}`,'log');
        const bf=expected.logConditionalLikelihood===-Infinity&&bl===-Infinity?null:expected.logConditionalLikelihood-bl;
        equal(baseline.logBF,bf,`${label}.${event.id}.baselineBF.${baseline.id}`,'log');
      }
      const shouldPass=event.logEValue!==null&&event.logEValue>=Math.log(81/.05);
      if(event.modelPass!==shouldPass||event.strongEnabled!==false)failures.push({label:`${label}.${event.id}`,reason:'declaration mismatch'});
    }
  }
  for(let e=0;e<3;e++){
    const p=result.bands.map(b=>b.events[e].posteriorProbability);
    if(p[0]+1e-12<p[1]||p[1]+1e-12<p[2])failures.push({label:`${testCase.name}.band-inclusion`,p});
  }
  for(const band of result.bands){
    const p=band.events.map(e=>e.posteriorProbability);
    if(p[0]>p[1]+1e-12||p[1]>p[2]+1e-12)failures.push({label:`${testCase.name}.event-inclusion.${band.id}`,p});
  }
  equal(result.sensitivity.length,Object.keys(oracle.sensitivities).length,`${testCase.name}.sensitivity.count`);
  if(new Set(result.sensitivity.map(s=>s.id)).size!==result.sensitivity.length)failures.push({label:testCase.name,reason:'duplicate sensitivity model ids'});
  for(const sensitivity of result.sensitivity){
    const expected=oracle.sensitivities[sensitivity.id];
    if(!expected){failures.push({label:`${testCase.name}.sensitivity.${sensitivity.id}`,reason:'unrecognized fixed sensitivity'});continue;}
    equal(expected.priorMass,1,`${testCase.name}.${sensitivity.id}.priorMass`);
    for(const band of sensitivity.bands){
      arrayEqual(band.distribution,expected.distribution[band.id],`${testCase.name}.${sensitivity.id}.${band.id}.distribution`);
      arrayEqual(band.priorDistribution,expected.priorDistribution[band.id],`${testCase.name}.${sensitivity.id}.${band.id}.prior`);
      if(!Array.isArray(band.events)||band.events.length!==3){failures.push({label:`${testCase.name}.${sensitivity.id}.${band.id}.events`,reason:'all three sensitivity events required'});continue;}
      for(const id of ['all','half','third']){
        const event=band.events.find(e=>e.id===id);
        sensitivityComparison(event,expected.events[band.id][id],`${testCase.name}.${sensitivity.id}.${band.id}.${id}`,id);
        sensitivityEventsCompared++;
      }
    }
  }
  if(testCase.detail){
    const detail=result.detail,expected=oracle.detail;
    for(const key of ['priorProbability','posteriorProbability','logBF'])equal(detail[key],expected.event[key],`${testCase.name}.detail.${key}`,key==='logBF'?'log':'probability');
    for(let j=0;j<rows.length;j++){
      if(expected.rows[j].every(v=>v===null)){
        if(detail.rows[j].conditionalQ!==null)failures.push({label:`${testCase.name}.detail.${j}`,reason:'impossible conditional must be null'});
      }else{
        arrayEqual(detail.rows[j].conditionalQ,expected.rows[j],`${testCase.name}.detail.${j}.conditionalQ`);
        equal(detail.rows[j].logBFNeutralized,expected.neutralizedLogBF[j],`${testCase.name}.detail.${j}.neutralized`,'log');
        equal(detail.rows[j].logBFInfluence,expected.logBFInfluence[j],`${testCase.name}.detail.${j}.influence`,'log');
      }
    }
    if(testCase.detail.kind==='exact'&&detail.logEValue!==null)failures.push({label:testCase.name,reason:'exact event received e declaration'});
    if(!Array.isArray(detail.sensitivityComparisons)||detail.sensitivityComparisons.length!==9){
      failures.push({label:`${testCase.name}.detail.sensitivityComparisons`,reason:'all nine detail sensitivity models required'});
    }else{
      if(new Set(detail.sensitivityComparisons.map(s=>s.id)).size!==9)failures.push({label:testCase.name,reason:'duplicate detail sensitivity model ids'});
      for(const [id,expectedModel] of Object.entries(oracle.sensitivities)){
        sensitivityComparison(detail.sensitivityComparisons.find(s=>s.id===id),expectedModel.detail,`${testCase.name}.detail.sensitivity.${id}`,id);
        sensitivityDetailsCompared++;
      }
    }
  }
  results.push({name:testCase.name,n:rows.length,assignments:oracle.assignments,decimalCoefficientMaxError:oracle.decimalCoefficientMaxError});
}

const crossingFixture=outputs.get('sensitivity-bf-crosses-neutral');
const crossingValues=crossingFixture.sensitivity.map(s=>({id:s.id,logBF:s.bands.find(b=>b.id==='456').events?.find(e=>e.id==='all')?.logBF}));
const crossingDetailValues=crossingFixture.detail.sensitivityComparisons??[];
equal(crossingValues.find(x=>x.id==='shared4-flat')?.logBF,Math.log(.5/.4),'crossing-fixture.shared4-flat','log');
equal(crossingValues.find(x=>x.id==='shared4-low1')?.logBF,Math.log(.5/.73),'crossing-fixture.shared4-low1','log');
equal(crossingValues.find(x=>x.id==='shared4-low3')?.logBF,Math.log(.5/.19),'crossing-fixture.shared4-low3','log');
if(!crossingValues.some(x=>x.logBF<0)||!crossingValues.some(x=>x.logBF>0))failures.push({label:'crossing-fixture',reason:'principal BF must cross1 across declared assumptions'});
if(!crossingDetailValues.some(x=>x.logBF<0)||!crossingDetailValues.some(x=>x.logBF>0))failures.push({label:'crossing-fixture.detail',reason:'exact-detail BF must cross1 across declared assumptions'});
const noSensitivity=api.analyzeMachine({rows:cases[3].logs.map(logs=>({logs})),familySize:81,includeSensitivity:false,detail:cases[3].detail});
equal(noSensitivity.sensitivity.length,0,'sensitivity-disabled.models');
equal(noSensitivity.detail.sensitivityComparisons?.length,0,'sensitivity-disabled.detailComparisons');

const toy=[];
for(const band of ['456','56','6'])for(const eventId of ['all','half','third']){
  const count=eventId==='all'?2:1;
  let worstMean=0,worstTail=0,worstTruth=null;
  for(let s1=0;s1<6;s1++)for(let s2=0;s2<6;s2++){
    const inBand=s=>band==='456'?s>=3:band==='56'?s>=4:s===5;
    if(Number(inBand(s1))+Number(inBand(s2))>=count)continue;
    let mean=0,tail=0;
    for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      const event=outputs.get(`finite-normalized-model-${a}${b}`).bands.find(x=>x.id===band).events.find(x=>x.id===eventId);
      const density=toyProbabilities[s1][a]*toyProbabilities[s2][b];
      mean+=density*Math.exp(event.logEValue);
      if(event.modelPass)tail+=density;
    }
    if(mean>worstMean){worstMean=mean;worstTruth=[s1+1,s2+1];}
    worstTail=Math.max(worstTail,tail);
  }
  if(worstMean>1+1e-11||worstTail>.05/81+1e-11)failures.push({label:`finite-e-expectation.${band}.${eventId}`,worstMean,worstTail});
  toy.push({band,event:eventId,threshold:count,worstMean,worstTruth,worstTail,observationOutcomes:9,allSettingConfigurations:36});
}

const all6Priors=[];
for(const n of [1,2,5,19,58,60,120]){
  const result=api.analyzeMachine({rows:Array.from({length:n},()=>({logs:Array(6).fill(0)})),familySize:81,includeSensitivity:false});
  const prior=result.bands.find(b=>b.id==='6').events.find(e=>e.id==='all').priorProbability;
  const expected=(1+3**(-n))/(4*(n+1));
  equal(prior,expected,`nonvanishing-all6-prior-n${n}`);
  const band456=result.bands.find(b=>b.id==='456');
  equal(band456.median,Math.ceil((n+1)*.5)-1,`neutral-quantile-n${n}.median`);
  equal(band456.interval.lo,Math.ceil((n+1)*.05-1e-12)-1,`neutral-quantile-n${n}.lo`);
  equal(band456.interval.hi,Math.ceil((n+1)*.95-1e-12)-1,`neutral-quantile-n${n}.hi`);
  for(const band of result.bands)for(const event of band.events){equal(event.logBF,0,`neutral-n${n}-${band.id}-${event.id}.BF`,'log');equal(event.logEValue,0,`neutral-n${n}-${band.id}-${event.id}.e`,'log');}
  all6Priors.push({n,actual:prior,formula:expected});
}

const invalid=[[],[Array(6).fill(-Infinity)],[[NaN,0,0,0,0,0]],[[Infinity,0,0,0,0,0]]];
const rejected=invalid.map(logs=>{const result=api.analyzeMachine({rows:logs.map(x=>({logs:x}))});if(result.ok||result.strongEnabled!==false)failures.push({label:'invalid-input',logs});return {reason:result.reason};});
const toolchain=spawnSync('python3',['-c','import sys,numpy,scipy; print(sys.version.split()[0]); print(numpy.__version__); print(scipy.__version__)'],{encoding:'utf8'}).stdout.trim().split('\n');
const report={status:failures.length?'failed':'passed',generatedAt:new Date().toISOString(),checks,tolerance,maxProbabilityError,maxLogError,
  cases:results,exhaustiveAssignments:results.reduce((n,c)=>n+c.assignments,0),all6Priors,finiteModelExhaustiveE:toy,invalidInputRejections:rejected,
  actualTableLogError,actualTableRows:captured.rows.length,actualMachineKeys:Object.keys(tables.tables),tableHash:tables.tableHash,legacySourceHash:tables.sourceHash,
  legacyParity:{rows:parityRows.length,rowsPerMachine:128,machines:Object.keys(tables.tables),seedHex:'0x77b9841d',exactFullResult:true,methodCounts:parityMethods},
  sensitivityDiagnostics:{principalEventsCompared:sensitivityEventsCompared,selectedDetailsCompared:sensitivityDetailsCompared,models:9,diagnosticEDeclarations:false,disabledOptionEmpty:true,
    bfCrossesOneFixture:crossingValues},
  engineVersion:api.version,elapsedMs:performance.now()-started,toolchain:{node:process.version,python:toolchain[0],numpy:toolchain[1],scipy:toolchain[2],platform:process.platform,arch:process.arch,cpus:os.cpus().length},
  sourceHashes:Object.fromEntries(['store-day-allocation.js','scripts/allocation-validation/reference.py','scripts/allocation-validation/compare.mjs','vps/src/allocation/likelihoods.mjs'].map(p=>[p,sha(p)])),failures};
fs.mkdirSync(outdir,{recursive:true});
fs.writeFileSync(path.join(outdir,'numeric-validation.json'),JSON.stringify(report,encode,2)+'\n');
fs.writeFileSync(path.join(outdir,'numeric-validation.md'),`# Independent numeric validation — 2026-10-17\n\nStatus: **${report.status}**. ${checks.toLocaleString()} individual comparisons across ${results.length} cases, ${report.exhaustiveAssignments.toLocaleString()} explicitly enumerated six-setting configurations. This reference enumerates configurations and Decimal polynomial coefficients; it does not import or reproduce the production dynamic program.\n\n- Maximum absolute probability error: ${maxProbabilityError}.\n- Maximum absolute log-value error: ${maxLogError}.\n- Probability/log acceptance tolerances: ${tolerance.probability} / ${tolerance.log}.\n- All nine fixed sensitivity models, all three count marginals, medians, 90% intervals, sensitivity envelopes, event priors/posteriors/Bayes factors, normalized detection mixtures, exhaustive null maxima, baseline ratios, and exact/at-least conditional row distributions were compared. Conditional influence neutralizes one row's observation while preserving n, threshold and prior.\n- Existing ordinary results were preserved exactly for 9 machines × 128 fixed-seed observations (${parityRows.length} full results), including bonus and difference-based methods, callbacks and warnings; each is compared to a separately booted legacy runtime. This tests the capture boundary; it does not assert an independently maintained probability table.\n- All-nine actual-table observations: ${captured.rows.length}; bonus logs independently recomputed from the existing runtime's exported tables, maximum difference ${actualTableLogError}. Table hash: \`${tables.tableHash}\`.\n- Neutral inputs through n=120 preserve their prior, BF=1 and e=1. Shared all-six prior follows (1+3^-n)/(4(n+1)); the independent-only model is separately checked as a sensitivity. n=19 exercises exact cumulative quantile boundaries.\n- A complete finite observation space (two rows × three outcomes) independently checked each principal e-value against all 36 fixed setting assignments; the largest null expectation was ${Math.max(...toy.map(x=>x.worstMean))}. These are finite normalized toy probabilities, not real-world validation.\n- Zero support, impossible event conditioning, extreme log scale, zero prior component mass, and malformed input checks are included. Strong display remains disabled.\n\nReproduce from the repository root:\n\n\`\`\`bash\nnode scripts/allocation-validation/compare.mjs\n\`\`\`\n\nToolchain: Node ${process.version}; Python ${toolchain[0]}; NumPy ${toolchain[1]}; SciPy ${toolchain[2]}. Full case names, checks, hashes and outputs are in numeric-validation.json. Runtime: ${(report.elapsedMs/1000).toFixed(2)} seconds.\n\nLimits: arithmetic agreement and model-internal e-value checks do not establish true settings or real-store calibration. No production data, remote access, or production mutation is used.\n`);
fs.appendFileSync(path.join(outdir,'numeric-validation.md'),`\nSensitivity event diagnostics: compared ${sensitivityEventsCompared.toLocaleString()} principal-event summaries and ${sensitivityDetailsCompared.toLocaleString()} selected exact/at-least detail summaries across all nine declared models against separate full-configuration prior/observed-mass sums. Each prior probability, posterior probability and log Bayes factor was checked. Every diagnostic remains unregistered for e-values, with null e-value/threshold, false model-pass and disabled strong display. Disabling sensitivity returns empty model and detail-comparison arrays.\n\nA one-row fixture gives log BF = log(.5/.4) under the default low-group assumption, log(.5/.73) under the setting1-heavy assumption, and log(.5/.19) under the setting3-heavy assumption. The principal and exact-detail comparisons therefore cross BF=1 across the fixed assumptions, exercising the UI's assumption-dependence diagnostic without adding any new model.\n`);
console.log(JSON.stringify({status:report.status,cases:results.length,checks,sensitivityEventsCompared,sensitivityDetailsCompared,maxProbabilityError,maxLogError,failures:failures.slice(0,10),elapsedMs:report.elapsedMs},encode));
if(failures.length)process.exitCode=1;
