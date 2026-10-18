#!/usr/bin/env node
// Offline fixed-exposure screening. Ordinary per-setting tables are obtained
// from the existing authoritative runtime; no product table is copied here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import readline from 'node:readline';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {getAllocationProbabilityTables,captureAllocationLikelihoods} from '../../vps/src/allocation/likelihoods.mjs';
import '../../store-day-allocation.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const outdir=path.join(root,'docs/development/store-day-allocation-20261017');
fs.mkdirSync(outdir,{recursive:true});
const api=globalThis.JUGESTStoreDayAllocation;
const BAND_IDS=['456','56','6'],EVENT_IDS=['all','half','third'];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const tables=await getAllocationProbabilityTables({rootDir:root});
const probabilities=Object.fromEntries(Object.entries(tables.tables).map(([machine,table])=>[machine,table.settings.map(s=>[1/s.b,1/s.r])]));
const logCoefficients=Object.fromEntries(Object.entries(probabilities).map(([key,rows])=>[key,rows.map(([pb,pr])=>[Math.log(pb),Math.log(pr),Math.log(1-pb-pr)])]));
const sourceFiles=['store-day-allocation.js','scripts/allocation-validation/simulate.mjs','scripts/allocation-validation/generate.py','vps/src/allocation/likelihoods.mjs'];
const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,sha(p)]));
const bench=[];
for(const n of [6,12,24,58,60,120]){
  const rows=Array.from({length:n},(_,i)=>({bonusLogs:Array.from({length:6},(_,s)=>-Math.abs((i%6)-s)*.8)}));
  for(let i=0;i<5;i++)api.analyzeMachine({rows,familySize:81,includeSensitivity:false});
  const timings=[];
  for(let rep=0;rep<20;rep++){const t=performance.now();api.analyzeMachine({rows,familySize:81,includeSensitivity:false});timings.push(performance.now()-t);}
  timings.sort((a,b)=>a-b);
  bench.push({n,mode:'principal-no-sensitivities',iterations:20,medianMs:(timings[9]+timings[10])/2,p95Ms:timings[18]});
}
for(const n of [58,60,120])for(const detail of [false,true]){
  const rows=Array.from({length:n},(_,i)=>({bonusLogs:Array.from({length:6},(_,s)=>-Math.abs((i%6)-s)*.8)}));
  const t=performance.now();
  const result=api.analyzeMachine({rows,familySize:81,includeSensitivity:true,detail:detail?{band:'456',kind:'exact',count:Math.ceil(n/2)}:null});
  bench.push({n,mode:detail?'all-sensitivities-and-exact-detail':'all-sensitivities',iterations:1,elapsedMs:performance.now()-t,ok:result.ok});
}
console.log(JSON.stringify({stage:'benchmarked',benchmark:bench}));

function wilson(success,total){
  if(!total)return {success,total,rate:null,ci95:null};
  const z=1.959963984540054,rate=success/total,denominator=1+z*z/total;
  const center=(rate+z*z/(2*total))/denominator;
  const radius=z*Math.sqrt(rate*(1-rate)/total+z*z/(4*total*total))/denominator;
  return {success,total,rate,ci95:[Math.max(0,center-radius),Math.min(1,center+radius)]};
}
function blank(){return {groups:0,rows:0,anyPass:0,strongEnabled:0,ambiguity456:0,
  thirdBoundary:0,thirdPosteriorHalf:0,thirdModelHalf:0,halfTruth:0,halfPosteriorMiss:0,
  bands:BAND_IDS.map(id=>({id,coverage:0,width:0,error:0,squaredError:0,absError:0,
    events:EVENT_IDS.map(id=>({id,trueN:0,falseN:0,tp:0,fp:0,brier:0,bins:Array.from({length:10},()=>({n:0,p:0,y:0}))}))}))};}
const totals=new Map(),strata=new Map();
function inc(map,key,sample,result){let acc=map.get(key);if(!acc){acc=blank();map.set(key,acc);}update(acc,sample,result);}
function update(acc,sample,result){
  acc.groups++;acc.rows+=sample.n;acc.strongEnabled+=Number(result.strongEnabled!==false);
  let anyPass=false;
  const trueCounts=[sample.settings.filter(s=>s>=4).length,sample.settings.filter(s=>s>=5).length,sample.settings.filter(s=>s===6).length];
  for(let b=0;b<3;b++){
    const observed=result.bands[b],summary=acc.bands[b],truth=trueCounts[b];
    summary.coverage+=Number(observed.interval.lo<=truth&&observed.interval.hi>=truth);
    summary.width+=observed.interval.hi-observed.interval.lo;
    summary.error+=observed.expected-truth;summary.absError+=Math.abs(observed.expected-truth);summary.squaredError+=(observed.expected-truth)**2;
    for(let e=0;e<3;e++){
      const event=observed.events[e],item=summary.events[e],isTrue=truth>=event.count,p=event.posteriorProbability;
      if(isTrue){item.trueN++;item.tp+=Number(event.modelPass);}else{item.falseN++;item.fp+=Number(event.modelPass);}
      anyPass||=event.modelPass;
      item.brier+=(p-Number(isTrue))**2;
      const bin=item.bins[Math.min(9,Math.floor(p*10))];bin.n++;bin.p+=p;bin.y+=Number(isTrue);
      if(event.strongEnabled!==false)acc.strongEnabled++;
    }
  }
  acc.anyPass+=Number(anyPass);
  const band=result.bands[0],third=Math.ceil(sample.n/3),half=Math.ceil(sample.n/2),halfEvent=band.events[1];
  acc.ambiguity456+=Number(band.interval.lo<=third&&band.interval.hi>=half);
  if(third<half&&trueCounts[0]===third){acc.thirdBoundary++;acc.thirdPosteriorHalf+=Number(halfEvent.posteriorProbability>=.5);acc.thirdModelHalf+=Number(halfEvent.modelPass);}
  if(trueCounts[0]>=half){acc.halfTruth++;acc.halfPosteriorMiss+=Number(halfEvent.posteriorProbability<.5);}
}
function summarize(acc){return {groups:acc.groups,rows:acc.rows,modelAnyPass:wilson(acc.anyPass,acc.groups),
  referenceOnly:wilson(acc.groups,acc.groups),strongEnabledViolations:acc.strongEnabled,
  noPrincipalModelPass:wilson(acc.groups-acc.anyPass,acc.groups),intervalSpansThirdAndHalf456:wilson(acc.ambiguity456,acc.groups),
  thirdTruthPosteriorHalfOverstatement456:wilson(acc.thirdPosteriorHalf,acc.thirdBoundary),thirdTruthModelHalfFalsePass456:wilson(acc.thirdModelHalf,acc.thirdBoundary),
  halfTruthPosteriorHalfMiss456:wilson(acc.halfPosteriorMiss,acc.halfTruth),
  bands:acc.bands.map(b=>({id:b.id,interval90Coverage:wilson(b.coverage,acc.groups),meanIntervalWidth:b.width/acc.groups,
    expectedCountBias:b.error/acc.groups,expectedCountMAE:b.absError/acc.groups,expectedCountRMSE:Math.sqrt(b.squaredError/acc.groups),
    events:b.events.map(e=>({id:e.id,power:wilson(e.tp,e.trueN),misses:wilson(e.trueN-e.tp,e.trueN),falsePass:wilson(e.fp,e.falseN),
      posteriorBrier:e.brier/acc.groups,reliability:e.bins.map((bin,i)=>({bin:[i/10,(i+1)/10],n:bin.n,meanPosterior:bin.n?bin.p/bin.n:null,observedFraction:bin.n?bin.y/bin.n:null}))}))}))};}

const family=new Map();let currentStore=null;
function finishStore(){
  if(!currentStore)return;
  const key=`${currentStore.phase}|${currentStore.layout}`;
  let item=family.get(key);if(!item){item={stores:0,anyFalse:0,anyPass:0,groups:0};family.set(key,item);}
  if(currentStore.groups!==9)throw new Error(`Incomplete simulated store: ${currentStore.groups}`);
  item.stores++;item.anyFalse+=Number(currentStore.anyFalse);item.anyPass+=Number(currentStore.anyPass);item.groups+=currentStore.groups;
}
function storeResult(sample,result){
  const key=`${sample.phase}|${sample.layout}|${sample.store}`;
  if(currentStore?.key!==key){finishStore();currentStore={key,phase:sample.phase,layout:sample.layout,groups:0,anyFalse:false,anyPass:false};}
  currentStore.groups++;
  for(const band of result.bands){
    const truth=sample.settings.filter(s=>band.id==='456'?s>=4:band.id==='56'?s>=5:s===6).length;
    for(const event of band.events){currentStore.anyPass||=event.modelPass;if(event.modelPass&&truth<event.count)currentStore.anyFalse=true;}
  }
}

// Audit simulated formula logs through the legacy callback for each machine.
// This does not use q as an allocation input.
const auditInputs=[];
for(const machine of Object.keys(tables.tables))for(const games of [500,6000,9000]){
  const [pb,pr]=probabilities[machine][3];
  auditInputs.push({id:`simulation-audit-${machine}-${games}`,machine,tableNo:'1',eligible:true,input:{games,bb:Math.round(games*pb),rb:Math.round(games*pr),diff:null}});
}
const auditCapture=await captureAllocationLikelihoods({rootDir:root,rows:auditInputs});
let legacyLogMaxError=0;
for(const row of auditCapture.rows){
  const {games,bb,rb}=row.input;
  logCoefficients[row.machine].forEach(([b,r,x],i)=>{legacyLogMaxError=Math.max(legacyLogMaxError,Math.abs(bb*b+rb*r+(games-bb-rb)*x-row.bonusLogs[i]));});
}
if(legacyLogMaxError>1e-10)throw new Error(`Legacy likelihood audit error ${legacyLogMaxError}`);

const child=spawn('python3',[path.join(root,'scripts/allocation-validation/generate.py')],{stdio:['pipe','pipe','pipe']});
child.stdin.end(JSON.stringify({tables:tables.tables}));
let childError='';child.stderr.on('data',b=>{childError+=b.toString();});
const childDone=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`Generator exit ${code}/${signal}: ${childError}`)));});
const start=performance.now();let scored=0,lastProgress=start,protocol=null,generation=null,maximumScoreMs=0;
for await(const line of readline.createInterface({input:child.stdout,crlfDelay:Infinity})){
  const record=JSON.parse(line);
  if(record.kind==='protocol'){protocol=record;continue;}
  if(record.kind==='generation-complete'){generation=record;continue;}
  if(record.kind!=='sample')throw new Error(`Unknown generator record ${record.kind}`);
  const coefficients=logCoefficients[record.machine];
  const rows=record.bb.map((bb,i)=>({bonusLogs:coefficients.map(([b,r,x])=>bb*b+record.rb[i]*r+(record.games-bb-record.rb[i])*x)}));
  const t=performance.now();
  const result=api.analyzeMachine({rows,familySize:81,alpha:.05,includeSensitivity:false});
  maximumScoreMs=Math.max(maximumScoreMs,performance.now()-t);
  if(!result.ok)throw new Error(`Production engine rejected simulated input: ${JSON.stringify({...record,reason:result.reason})}`);
  inc(totals,`${record.phase}|${record.source}`,record,result);
  inc(strata,`${record.phase}|${record.source}|machine:${record.machine}|layout:${record.layout}`,record,result);
  if(record.source==='grid')inc(strata,`${record.phase}|grid|n:${record.n}|G:${record.games}|layout:${record.layout}`,record,result);
  if(record.source==='family')storeResult(record,result);
  scored++;
  if(performance.now()-lastProgress>30000){lastProgress=performance.now();console.log(JSON.stringify({stage:'scoring',scored,elapsedSeconds:(lastProgress-start)/1000,phase:record.phase,source:record.source}));}
}
await childDone;finishStore();
if(!protocol||!generation)throw new Error('Generator omitted protocol or final manifest');
const familySummary=Object.fromEntries([...family].map(([key,item])=>[key,{stores:item.stores,groups:item.groups,familyFalsePositive:wilson(item.anyFalse,item.stores),anyPrincipalModelPass:wilson(item.anyPass,item.stores)}]));
const totalSummary=Object.fromEntries([...totals].map(([key,item])=>[key,summarize(item)]));
const stratumSummary=Object.fromEntries([...strata].map(([key,item])=>[key,summarize(item)]));
const seedStrings=generation.seedManifest.flatMap(x=>[x.truthSeed128,x.observationSeed128]);
if(new Set(seedStrings).size!==seedStrings.length)throw new Error('Seed collision/overlap detected');
const strongViolations=[...totals.values()].reduce((sum,item)=>sum+item.strongEnabled,0);
if(strongViolations)throw new Error(`Strong declarations unexpectedly enabled: ${strongViolations}`);
if(Object.entries(sourceHashes).some(([p,hash])=>sha(p)!==hash))throw new Error('Validation source changed during simulation; rerun on fixed source');
const toolchain=spawnSync('python3',['-c','import sys,numpy,scipy; print(sys.version.split()[0]); print(numpy.__version__); print(scipy.__version__)'],{encoding:'utf8'}).stdout.trim().split('\n');
const elapsedMs=performance.now()-start;
const report={status:'completed-reference-only',generatedAt:new Date().toISOString(),protocol,engineVersion:api.version,
  familySize:81,alpha:.05,observationModel:'fixed settings; observed exposure fixed before outcomes; independent multinomial per row; complete row collection; bonus-only',
  generated:generation.generated,scoredGroups:scored,generatedGroups:Object.values(generation.generated).reduce((sum,x)=>sum+x.groups,0),
  generationFingerprint:generation.generationFingerprint,selectedByOutcome:false,maximumScoreMs,benchmark:bench,
  actualTables:{keys:Object.keys(tables.tables),tableHash:tables.tableHash,legacySourceHash:tables.sourceHash,legacyFormulaAuditRows:auditCapture.rows.length,legacyLogMaxError},
  totalSummary,familySummary,strata:stratumSummary,sourceHashes,
  toolchain:{node:process.version,python:toolchain[0],numpy:toolchain[1],scipy:toolchain[2],platform:process.platform,arch:process.arch,cpus:os.cpus().length},
  elapsedMs,strongEnabled:false,calibrationEnabled:false,confidenceInterval:'95% Wilson intervals; event-wise/group proportions are descriptive; family false positives use independent stores as units',
  limitations:['Generated and scored counts differ for the broad grid; only predeclared first 2 development / first 8 validation repetitions per grid cell were scored.',
    'Every targeted family observation was scored; each simulated store contains all nine supported machine groups and all81 principal declarations.',
    'Fixed layout posterior frequencies and central interval coverage are not a universal calibration test; prior-shared4 is the separately identified model-consistent calibration sample.',
    'Zero observed errors do not mean zero risk; report sample sizes and confidence bounds. Rare events, adversarial configurations beyond these layouts, and deployment data remain unverified.',
    'No simulated difference/coin observations, adaptive play, informative missingness, source errors, or real-store true setting labels are included.',
    'Strong display remains disabled regardless of modelPass; model-internal simulation does not establish a real-store error rate.']};
const seedReport={protocol,seedDerivation:generation.seedDerivation,seedCount:generation.seedManifest.length,uniqueRngStreams:seedStrings.length,disjointDevelopmentValidation:true,generationFingerprint:generation.generationFingerprint,seeds:generation.seedManifest};
fs.writeFileSync(path.join(outdir,'simulation-seeds.json'),JSON.stringify(seedReport,null,2)+'\n');
fs.writeFileSync(path.join(outdir,'simulation-validation.json'),JSON.stringify(report,null,2)+'\n');
const pct=value=>value===null?'—':`${(100*value).toFixed(2)}%`;
const interval=metric=>`${pct(metric.rate)} [${metric.ci95.map(pct).join(', ')}] (${metric.success}/${metric.total})`;
const lines=[`# Fixed-exposure simulation validation — 2026-10-17`,'',`Status: **reference only; strong display disabled**. Generated ${report.generatedGroups.toLocaleString()} machine-group observations and scored ${scored.toLocaleString()} with the production engine. No outcome-based selection. Development and validation RNG streams are disjoint.`,
  '',`The broad grid covers all9 supported machine tables, n=6/12/24/58/60/120, G=0/500/3000/6000/9000, and9 fixed layouts. Per cell,32 development +96 validation observations were generated; the first2 +8 respectively were scored. The targeted n12/G6000 study scores every observation for8 layouts,256 development and2,048 validation complete stores per layout. Each store has9 groups and a fixed M=81, alpha=.05.`,
  '',`All observations are independent fixed-exposure multinomial draws from the existing runtime's probability table, with fixed settings and complete collection. The legacy log formula was audited through27 real callback calls; maximum error ${legacyLogMaxError}.`,
  '',`## Validation store families`,'',`All reported bounds are95% Wilson intervals. Family false positive means at least one false principal modelPass in a complete simulated store; strong display was disabled for every group.`,
  '',`| Layout | Store family false positives | Any principal modelPass |`,`|---|---|---|`];
for(const [key,item] of Object.entries(familySummary))if(key.startsWith('validation|'))lines.push(`| ${key.split('|')[1]} | ${interval(item.familyFalsePositive)} | ${interval(item.anyPrincipalModelPass)} |`);
lines.push('',`## Power, misses and boundary ambiguity`,'',`The principal e-value rule is deliberately conservative. The following are validation group-level modelPass power for the456 band, with each event evaluated against its true count. These are model-internal passes, not released strong badges.`,'',`| Layout | All456 power | At least half456 power | At least third456 power |`,`|---|---|---|---|`);
for(const layout of ['half4','all4','all6','mixed46']){
  const items=[...strata].filter(([key])=>key.startsWith('validation|family|machine:')&&key.endsWith(`layout:${layout}`)).map(([,item])=>item);
  const powers=EVENT_IDS.map((_,e)=>wilson(items.reduce((s,a)=>s+a.bands[0].events[e].tp,0),items.reduce((s,a)=>s+a.bands[0].events[e].trueN,0)));
  lines.push(`| ${layout} | ${powers.map(p=>p.total?interval(p):'not true').join(' | ')} |`);
}
const boundary=[...strata].filter(([key])=>key.startsWith('validation|family|machine:')&&key.endsWith('layout:third6')).map(([,item])=>item);
const boundaryPosterior=wilson(boundary.reduce((s,a)=>s+a.thirdPosteriorHalf,0),boundary.reduce((s,a)=>s+a.thirdBoundary,0));
const boundaryPass=wilson(boundary.reduce((s,a)=>s+a.thirdModelHalf,0),boundary.reduce((s,a)=>s+a.thirdBoundary,0));
lines.push('',`For true exactly one-third setting6 (remaining setting3), the descriptive posterior P(K456≥half)≥.5 rate was ${interval(boundaryPosterior)}; the corrected modelPass false-half rate was ${interval(boundaryPass)}. A .5 posterior threshold is a diagnostic, not a release rule. Exact per-machine rates, band-specific false passes, power, misses, interval widths and expected-count error are retained in JSON.`,
  '',`## Model-consistent posterior calibration`,'',`The prior-shared4 family samples component, count, positions and settings from the declared coherent prior before observations. Only this stratum tests posterior calibration under the declared model. Other fixed layouts deliberately differ from that prior. Reliability bins and Brier scores are in JSON.`,
  '',`| Band | Central90% interval coverage (validation) |`,`|---|---|`);
const priorItems=[...strata].filter(([key])=>key.startsWith('validation|family|machine:')&&key.endsWith('layout:prior-shared4')).map(([,item])=>item);
for(let b=0;b<3;b++){const coverage=wilson(priorItems.reduce((s,a)=>s+a.bands[b].coverage,0),priorItems.reduce((s,a)=>s+a.groups,0));lines.push(`| ${BAND_IDS[b]} | ${interval(coverage)} |`);}
lines.push('',`## Performance and reproducibility`,'',`Scoring and streaming took ${(elapsedMs/1000).toFixed(1)} seconds on Node ${process.version}; Python ${toolchain[0]}, NumPy ${toolchain[1]}, SciPy ${toolchain[2]}. No-sensitivity n120 median: ${bench.find(x=>x.n===120&&x.mode==='principal-no-sensitivities').medianMs.toFixed(2)}ms; full sensitivity/detail benchmark samples are in JSON. Maximum observed single scoring time: ${maximumScoreMs.toFixed(2)}ms.`,
  '',`Table hash: \`${tables.tableHash}\`. Seed derivations, every stream identifier, selection counts and output fingerprint are in simulation-seeds.json. Fixed input source hashes are in simulation-validation.json.`,
  '',`Reproduce from repository root:`, '', '```bash','node scripts/allocation-validation/simulate.mjs','```','',`## Limits`,'',...report.limitations.map(x=>`- ${x}`),'');
fs.writeFileSync(path.join(outdir,'simulation-validation.md'),lines.join('\n'));
console.log(JSON.stringify({stage:'complete',generatedGroups:report.generatedGroups,scoredGroups:scored,elapsedSeconds:elapsedMs/1000,strongEnabled:false,familySummary}));
