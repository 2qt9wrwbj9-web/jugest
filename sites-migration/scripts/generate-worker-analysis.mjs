import{readFileSync,writeFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';
const root=new URL('../upstream/',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8');
let inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
for(const[a,b]of[["map(r=>({...r,es:+r.expectedSetting,p4:Number.isFinite(+r.p4)?+r.p4:NaN,p5:+r.p5}))","map(r=>({date:r.date,machine:r.machine,tableNo:r.tableNo,games:r.games,bb:r.bb,rb:r.rb,diff:r.diff,es:+r.expectedSetting,p4:Number.isFinite(+r.p4)?+r.p4:NaN,p5:+r.p5}))"],["let rows=current.map((r,_bruteIndex)=>{","const featureStrings=new Map;let rows=current.map((r,_bruteIndex)=>{"],["BRUTE_DIM_DEFS.map(x=>features[x.key]??null)",'BRUTE_DIM_DEFS.map(x=>{const value=features[x.key]??null;if(typeof value!=="string")return value;if(featureStrings.has(value))return featureStrings.get(value);featureStrings.set(value,value);return value})']]){if(!inline.includes(a))throw Error('missing fixed source anchor');inline=inline.replace(a,b)}
const dependencies=['machine-names.js','hanahana-judge.js','missing-inference.js','judgement-model.js','core-v510.js'].map(f=>readFileSync(new URL(f,root),'utf8')).join('\n;\n');
const adapter=readFileSync(new URL('vps/src/analysis/runtime-adapter.mjs',root),'utf8');
const helpers=adapter.slice(adapter.indexOf('function memoryStorage('),adapter.indexOf('function plain('));
let context=adapter.slice(adapter.indexOf('  const listeners=new Map()'),adapter.indexOf('  ctx.window=ctx;'));
context=context.replaceAll('globalThis.','host.').replace('crypto:webcrypto','crypto:host.crypto');
const args=['window','document','navigator','location','localStorage','globalThis','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','history','alert','confirm','prompt','fetch','HTMLElement','customElements'];
const values=['ctx',...args.slice(1).map(k=>k==='globalThis'?'ctx':'ctx.'+k)];
const stageNames=['brutePrepare','v4ModelTraining','v4SettingDistributionModel','v4CalendarLongMemory','bruteSingleGenerate','v5PrepareHistory','v5Backtest','v4PredictStore'];
for(const name of stageNames){
 const anchor='function '+name+'(';
 if(!inline.includes(anchor))throw Error('missing stage '+name);
 inline=inline.replace(anchor,'function '+name+'(...args){__analysisStage("before:'+name+'");const value='+name+'Original(...args);__analysisStage("'+name+'",value);return value}function '+name+'Original(');
}
// Split only the exact original v5 prefix; all arithmetic and suffix are reused.
const start=inline.indexOf('function v5AnalyzeStore('),begin=inline.indexOf('let history=v5PrepareHistory(',start),end=inline.indexOf(',pred=v4PredictStore(shop,targetDate,sourceDays);',begin);
if(start<0||begin<0||end<0)throw Error('missing v5 split anchors');
const prefix=inline.slice(begin,end);
inline=inline.slice(0,begin)+`let prepared=__prepared??v5StagePrepare(shop,targetDate,sourceDays);if(!prepared)return null;let {signals,typePcts,comb,gate,bootstrap,blend}=prepared,history={length:prepared.historyDays},bt={supports:prepared.supports},pred=v4PredictStore(shop,targetDate,sourceDays);`+inline.slice(end+',pred=v4PredictStore(shop,targetDate,sourceDays);'.length);
inline=inline.replace('function v5AnalyzeStore(shop,targetDate=localDateString(),sourceDays=externalDays){','function v5AnalyzeStore(shop,targetDate=localDateString(),sourceDays=externalDays,__prepared=null){');
inline=inline.replace('window.V5_TEST=',`\nfunction v5StagePrepare(shop,targetDate,sourceDays){ensureExternalJudgedSync(sourceDays,shop);${prefix};return{version:'v5-prefix-v1',historyDays:history.length,signals,typePcts,comb,gate,bootstrap,blend,supports:bt.supports}}\nwindow.JUGEST_V5_STAGE={prepare:(shop,date)=>v5StagePrepare(shop,date,externalDays),finish:(shop,date,state)=>v5AnalyzeStore(shop,date,externalDays,state)};window.V5_TEST=`);
// Only feature-row construction is partitioned. Full store/machine maps and
// original row indices are retained; global tests/ranking are never per-batch.
const mapAnchor='current.map((r,_bruteIndex)=>{';
if(!inline.includes(mapAnchor))throw Error('missing machine batch map anchor');
inline=inline.replace(mapAnchor,'current.map((r,_bruteIndex)=>({r,_bruteIndex})).filter(x=>!__bruteTableKeys||__bruteTableKeys.has(String(x.r.tableNo))).map(({r,_bruteIndex})=>{');
inline=inline.replace('function v4TargetPrep(shop,targetDate,sourceDays=externalDays){','function v4TargetPrep(shop,targetDate,sourceDays=externalDays){if(__fixedTargetPrep&&__fixedTargetPrep.prep.shop===shop&&__fixedTargetPrep.targetDate===targetDate)return __fixedTargetPrep;');
inline=inline.replace('window.V5_TEST=',`let __bruteTableKeys=null,__fixedTargetPrep=null;
window.JUGEST_MACHINE_BATCH={
 keys:(shop,date)=>[...new Set(v4StoreDays(shop,date,externalDays).slice(-180).flatMap(d=>(d.machines||[]).filter(r=>M[r.machine]).map(r=>String(r.tableNo))))].sort(),
 batch:(shop,date,keys)=>{__bruteTableKeys=new Set(keys);try{const tp=v4TargetPrep(shop,date,externalDays);return tp?{version:'v4-feature-rows-v1',rows:tp.prep.rows}:null}finally{__bruteTableKeys=null}},
 use:(shop,date,rows)=>{rows.sort((a,b)=>a._bid-b._bid);let storeDays=new Map,machineDays=new Map;for(let r of rows){bruteAddStat(storeDays,r.date,r);bruteAddStat(machineDays,r.machine+'|'+r.date,r)}let histDays=v4StoreDays(shop,date,externalDays).slice(-180),prep={shop,latest:date,from:'',rows,storeDays,machineDays,overall:bruteAggRows(rows),days:[...new Set(rows.map(r=>r.date))].sort()};__analysisStage('brutePrepare',prep);__fixedTargetPrep={prep,targetDate:date,targetRows:rows.filter(r=>r.date===date),histDays,latest:histDays.at(-1)}}
};window.V5_TEST=`);
// Drop only data no longer read by this caller, after the original training
// result has been observed at its unmodified audit boundary.
const trainingAnchor='let training=v4ModelTraining(tp.prep,targetDate);if(!training)return null;';
if(!inline.includes(trainingAnchor))throw Error('missing training lifetime anchor');
inline=inline.replace(trainingAnchor,trainingAnchor+`for(const value of Object.values(training.models||{}))delete value.validationFit;for(const value of Object.values(training.rankingModels||{}))delete value.validationFit;delete training.discovery;delete training.confirm;delete training.val;delete training.ensemblePoints;__analysisStage('v4:training-released');`);
inline=inline.replace('let scopes=bruteSingleScopes(histRows)',"__analysisStage('single:groups-built');let scopes=bruteSingleScopes(histRows)").replace('bruteBhAssign(store,x=>x.pVal??1',"__analysisStage('single:evaluated');bruteBhAssign(store,x=>x.pVal??1").replace('let all=store.concat(machine).sort',"__analysisStage('single:finalized');let all=store.concat(machine).sort");
const groupEnd='comparisonType:"same-machine-day",_group:mg})}}';if(!inline.includes(groupEnd))throw Error('missing single group release anchor');inline=inline.replace(groupEnd,'comparisonType:"same-machine-day",_group:mg})}delete g.machineGroups;}storeGroups.clear();__analysisStage("single:groups-released");');
const implementation=createHash('sha256').update(inline+dependencies+adapter+readFileSync(new URL(import.meta.url),'utf8')+readFileSync(new URL('../lib/analysis/feature-build.mjs',import.meta.url),'utf8')+readFileSync(new URL('vps/src/research/feature-builder.mjs',root),'utf8')+readFileSync(new URL('vps/src/canonical-json.mjs',root),'utf8')).update(readFileSync(new URL('../lib/analysis/model-prefix.mjs',import.meta.url),'utf8')+readFileSync(new URL('../lib/analysis/graph-codec.mjs',import.meta.url),'utf8')).update(['../lib/analysis/research-backtest.mjs','../lib/analysis/generated-backtest-kernel.mjs','../upstream/vps/src/research/backtest.mjs','../upstream/vps/src/research/model-search.mjs','../upstream/vps/src/research/axis-discovery.mjs'].map(p=>readFileSync(new URL(p,import.meta.url),'utf8')).join('')).update(readdirSync(new URL('../lib/analysis/',import.meta.url)).filter(f=>f.endsWith('.mjs')&&f!=='compiled-worker.mjs').sort().map(f=>f+readFileSync(new URL('../lib/analysis/'+f,import.meta.url),'utf8')).join('')).digest('hex');
const output=`export const WORKER_IMPLEMENTATION_HASH='${implementation}';\n// Generated from fixed production files; no eval/vm/fs at runtime.\nconst host=globalThis;\n${helpers}\nasync function bootCompiled(onStage=()=>{}){\n${context}\nctx.window=ctx;ctx.globalThis=ctx;ctx.__analysisStage=onStage;\n(function(${[...args,'__analysisStage'].join(',')}){\n${dependencies}\n;\n${inline}\n;\n})(${[...values,'ctx.__analysisStage'].join(',')});\nfor(let i=0;i<12;i++)await new Promise(resolve=>host.setTimeout(resolve,0));\nreturn ctx;\n}\nasync function importedStream({shop,sourceStoreId,days,rawJsonDays=false,onStage=()=>{}}){
 const name=String(shop??'').trim(),id=String(sourceStoreId??name).trim();
 if(!name||!id)throw new TypeError('shop and sourceStoreId required');
 const ctx=await bootCompiled(onStage),bridge=ctx.JUGEST_CORE_BRIDGE;
 const capturedAt=new Date().toISOString(),normalized=[],seen=new Set;let received=0;
 onStage('input:begin');
 for await(const day of days){
  if(++received>400)throw new RangeError('headless import requires 1..400 history days');
  // Same original normalizer, one day at a time. Raw R2 day can be released
  // after normalization; no second complete raw array/string/clone is kept.
  const payload={format:'juggler-external-import-bulk',version:7,source:'ana-slo',sourceStoreId:id,shop:name,requestedDays:1,capturedAt,days:[day]};
  const checked=await bridge.previewExternalJson(rawJsonDays?JSON.stringify({...payload,days:[]}).slice(0,-3)+'['+day.rawJson+']}':JSON.stringify(payload));
  if(!checked?.preview)throw Error('JUGEST runtime rejected canonical store payload');
  for(const value of checked.preview.days){const key=value.shop+'|'+value.date;if(!seen.has(key)){seen.add(key);normalized.push(value)}}
  if(normalized.length>400)throw new RangeError('headless import requires 1..400 history days');
  onStage('input:day');
 }
 if(!normalized.length)throw new RangeError('headless import requires 1..400 history days');
 normalized.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 await bridge.saveExternalJsonPreview({bulk:true,source:'ana-slo',shop:name,capturedAt,requestedDays:normalized.length,failedDays:[],days:normalized});
 onStage('input:normalized');return{ctx,bridge,name};
}
export async function runCompiledStoreModelStream({shop,sourceStoreId,days,rawJsonDays=false,targetDate,onStage=()=>{}}){
 const target=String(targetDate??'').trim();
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(target)||!Number.isFinite(Date.parse(target+'T00:00:00Z')))throw new TypeError('targetDate must be YYYY-MM-DD');
 async function* beforeTarget(){for await(const day of days)if(day&&String(day.date||'')<target)yield day}
 const {ctx,name}=await importedStream({shop,sourceStoreId,days:beforeTarget(),rawJsonDays,onStage});
 onStage('analysis:begin');const model=ctx.V5_TEST.analyzeStore(name,target);
 if(!model?.prediction?.rows)throw Error('JUGEST current store ranking returned no result');
 onStage('analysis:complete');return model;
}
export async function runCompiledStoreAnalysisStream({shop,sourceStoreId,days,rawJsonDays=false,options={period:'180',minG:'2000',maxDims:'1',minDays:'4'},onStage=()=>{}}){
 const {bridge,name}=await importedStream({shop,sourceStoreId,days,rawJsonDays,onStage});
 onStage('analysis:begin');const result=await bridge.runStoreAnalysis(name,options);
 if(!result||result.error)throw Error(result?.error||'JUGEST store analysis returned no result');
 onStage('analysis:complete');return result;
}
export async function runCompiledStoreModelPrefixStream({shop,sourceStoreId,days,rawJsonDays=false,targetDate,onStage=()=>{}}){
 async function* beforeTarget(){for await(const day of days)if(day&&String(day.date||'')<targetDate)yield day}
 const {ctx,name}=await importedStream({shop,sourceStoreId,days:beforeTarget(),rawJsonDays,onStage});
 onStage('model-prefix:begin');const state=ctx.JUGEST_V5_STAGE.prepare(name,targetDate);onStage('model-prefix:complete');return state;
}
export async function runCompiledStoreModelResumeStream({shop,sourceStoreId,days,rawJsonDays=false,targetDate,prefixState,machineRows=null,onStage=()=>{}}){
 if(prefixState?.version!=='v5-prefix-v1')throw Error('model_stage_invalid');
 async function* beforeTarget(){for await(const day of days)if(day&&String(day.date||'')<targetDate)yield day}
 const {ctx,name}=await importedStream({shop,sourceStoreId,days:beforeTarget(),rawJsonDays,onStage});
 if(machineRows){onStage('machine-batch:merge');ctx.JUGEST_MACHINE_BATCH.use(name,targetDate,machineRows);onStage('machine-batch:merged')}\n onStage('analysis:begin');const model=ctx.JUGEST_V5_STAGE.finish(name,targetDate,prefixState);
 if(!model?.prediction?.rows)throw Error('JUGEST current store ranking returned no result');onStage('analysis:complete');return model;
}
export async function runCompiledMachineBatchStream({shop,sourceStoreId,days,rawJsonDays=false,targetDate,keys=null,onStage=()=>{}}){
 const {ctx,name}=await importedStream({shop,sourceStoreId,days,rawJsonDays,onStage});
 if(keys===null)return ctx.JUGEST_MACHINE_BATCH.keys(name,targetDate);
 onStage('machine-batch:begin');const batch=ctx.JUGEST_MACHINE_BATCH.batch(name,targetDate,keys);onStage('machine-batch:complete');return batch;
}
export async function runCompiledStoreModel(args){
 if(!Array.isArray(args.days))throw new TypeError('days are required');
 return runCompiledStoreModelStream({...args,days:args.days.filter(Boolean).sort((a,b)=>String(a.date).localeCompare(String(b.date)))});
}
`;
writeFileSync(new URL('../lib/analysis/compiled-worker.mjs',import.meta.url),output);console.log('Statically compiled original normalizer and engines with day stream input.');
