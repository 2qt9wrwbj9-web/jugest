import{readFileSync,writeFileSync}from'node:fs';
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
const output=`// Generated from fixed production files; no eval/vm/fs at runtime.\nconst host=globalThis;\n${helpers}\nasync function bootCompiled(onStage=()=>{}){\n${context}\nctx.window=ctx;ctx.globalThis=ctx;ctx.__analysisStage=onStage;\n(function(${[...args,'__analysisStage'].join(',')}){\n${dependencies}\n;\n${inline}\n;\n})(${[...values,'ctx.__analysisStage'].join(',')});\nfor(let i=0;i<12;i++)await new Promise(resolve=>host.setTimeout(resolve,0));\nreturn ctx;\n}\nasync function importedStream({shop,sourceStoreId,days,onStage=()=>{}}){
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
  const checked=await bridge.previewExternalJson(JSON.stringify(payload));
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
export async function runCompiledStoreModelStream({shop,sourceStoreId,days,targetDate,onStage=()=>{}}){
 const target=String(targetDate??'').trim();
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(target)||!Number.isFinite(Date.parse(target+'T00:00:00Z')))throw new TypeError('targetDate must be YYYY-MM-DD');
 async function* beforeTarget(){for await(const day of days)if(day&&String(day.date||'')<target)yield day}
 const {ctx,name}=await importedStream({shop,sourceStoreId,days:beforeTarget(),onStage});
 onStage('analysis:begin');const model=ctx.V5_TEST.analyzeStore(name,target);
 if(!model?.prediction?.rows)throw Error('JUGEST current store ranking returned no result');
 onStage('analysis:complete');return model;
}
export async function runCompiledStoreAnalysisStream({shop,sourceStoreId,days,options={period:'180',minG:'2000',maxDims:'1',minDays:'4'},onStage=()=>{}}){
 const {bridge,name}=await importedStream({shop,sourceStoreId,days,onStage});
 onStage('analysis:begin');const result=await bridge.runStoreAnalysis(name,options);
 if(!result||result.error)throw Error(result?.error||'JUGEST store analysis returned no result');
 onStage('analysis:complete');return result;
}
export async function runCompiledStoreModel(args){
 if(!Array.isArray(args.days))throw new TypeError('days are required');
 return runCompiledStoreModelStream({...args,days:args.days.filter(Boolean).sort((a,b)=>String(a.date).localeCompare(String(b.date)))});
}
`;
writeFileSync(new URL('../lib/analysis/compiled-worker.mjs',import.meta.url),output);console.log('Statically compiled original normalizer and engines with day stream input.');
