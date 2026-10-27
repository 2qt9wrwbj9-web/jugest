import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
let src=readFileSync(new URL('../upstream/vps/src/analysis/runtime-adapter.mjs',import.meta.url),'utf8');
function replace(a,b){if(!src.includes(a))throw Error('runtime anchor missing');src=src.replace(a,b)}
replace('async function bootRuntime(rootDir){','async function bootRuntime(rootDir,{compact=false,onStage=()=>{}}={}){');
replace('    console,URL,','    __captureStage:onStage,console,URL,');
replace('    const source=match[1];',`    let source=match[1];
    if(compact){
     // Project only the fields this temporary work row reads. Original input
     // and all canonical fields remain intact in sourceDays; output identical.
     source=source.replace('map(r=>({...r,es:+r.expectedSetting,p4:Number.isFinite(+r.p4)?+r.p4:NaN,p5:+r.p5}))', 'map(r=>({date:r.date,machine:r.machine,tableNo:r.tableNo,games:r.games,bb:r.bb,rb:r.rb,diff:r.diff,es:+r.expectedSetting,p4:Number.isFinite(+r.p4)?+r.p4:NaN,p5:+r.p5}))');
     source=source.replace('let rows=current.map((r,_bruteIndex)=>{','const featureStrings=new Map;let rows=current.map((r,_bruteIndex)=>{');
     source=source.replace('BRUTE_DIM_DEFS.map(x=>features[x.key]??null)', 'BRUTE_DIM_DEFS.map(x=>{const value=features[x.key]??null;if(typeof value!=="string")return value;if(featureStrings.has(value))return featureStrings.get(value);featureStrings.set(value,value);return value})');
    }
    for(const name of ['brutePrepare','v4ModelTraining','v4SettingDistributionModel','v4CalendarLongMemory','bruteSingleGenerate','v5PrepareHistory','v5Backtest','v4PredictStore'])source=source.replace('function '+name+'(', 'function '+name+'(...args){const result='+name+'Original(...args);__captureStage('+JSON.stringify(name)+',result);return result}function '+name+'Original(');`);
replace('async function bootImportedRuntime({rootDir,shop,sourceStoreId,days}){','async function bootImportedRuntime({rootDir,shop,sourceStoreId,days,compact=false,onStage=()=>{}}){');
replace('  const {ctx,bridge}=await bootRuntime(rootDir);','  const {ctx,bridge}=await bootRuntime(rootDir,{compact,onStage});');
replace("new URL('../../../machine-names.js',import.meta.url)","new URL('../../upstream/machine-names.js',import.meta.url)");
const original=readFileSync(new URL('../upstream/vps/src/analysis/runtime-adapter.mjs',import.meta.url),'utf8');
const start=original.indexOf('export async function runExistingStorePlan('),end=original.indexOf('export async function runExistingLegacyStorePlan(',start);
const compactPlan=original.slice(start,end).replace('runExistingStorePlan','runCompactStorePlan').replace('days:history});','days:history,compact:true});');
const append=`
// Node-only parity harness. Not imported by any Worker route.
export async function runAnalysisAudit({rootDir,shop,sourceStoreId,days,targetDate,compact=false,captureStages=true}){
 const {createHash}=await import('node:crypto');
 function encode(v){if(typeof v==='number'){if(Number.isNaN(v))return {number:'NaN'};if(!Number.isFinite(v))return {number:String(v)};if(Object.is(v,-0))return {number:'-0'};return v}if(typeof v==='function')return undefined;if(!v||typeof v!=='object')return v;if(Array.isArray(v))return v.map(encode);const type=Object.prototype.toString.call(v);if(type==='[object Map]')return {map:[...v].map(([k,x])=>[encode(k),encode(x)])};if(type==='[object Set]')return {set:[...v].map(encode)};return Object.fromEntries(Object.keys(v).sort().filter(k=>typeof v[k]!=='function').map(k=>[k,encode(v[k])]))}
 const stages={};const onStage=(name,value)=>{if(captureStages)stages[name]=createHash('sha256').update(JSON.stringify(encode(value))).digest('hex')};
 const history=days.filter(day=>String(day?.date||'')<targetDate).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const {ctx,name}=await bootImportedRuntime({rootDir,shop,sourceStoreId,days:history,compact,onStage});
 const model=ctx.V5_TEST.analyzeStore(name,targetDate);if(!model?.prediction)throw Error('model unavailable');
 return {model:plain(model),stages};
}
`;
mkdirSync(new URL('../lib/analysis/',import.meta.url),{recursive:true});writeFileSync(new URL('../lib/analysis/runtime-node.mjs',import.meta.url),'// Generated fixed mathematical bodies; feature strings may be interned. Node-only audit harness.\n'+src+compactPlan+append);
console.log('Generated exact mathematical runtime with optional feature string sharing.');
