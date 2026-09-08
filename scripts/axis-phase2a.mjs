#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractExternalDays} from '../research/axis-auto-selector/input.mjs';
import {buildHistoricalSampleBundleParallel} from '../research/axis-auto-selector/historical-parallel.mjs';
import {runWalkForwardBacktest} from '../research/axis-auto-selector/walk-forward.mjs';

const VALUE_FLAGS=new Set(['--input','--store','--output','--bundle-output','--start','--end','--warmup','--min-prior','--workers','--memory-budget-mb','--max-workers']);
function parseArgs(argv){
 const out={shadow:false};
 for(let i=0;i<argv.length;i+=1){
  const arg=argv[i];
  if(arg==='--shadow'){out.shadow=true;continue}
  if(!VALUE_FLAGS.has(arg))throw new TypeError(`unknown argument: ${arg}`);
  const value=argv[++i];if(value===undefined||value.startsWith('--'))throw new TypeError(`${arg} requires a value`);
  out[arg.slice(2)]=value;
 }
 return out;
}
function required(value,flag){if(typeof value!=='string'||value.trim()==='')throw new TypeError(`${flag} is required`);return value}
function int(value,flag,{min,defaultValue}){if(value===undefined)return defaultValue;const n=Number(value);if(!Number.isInteger(n)||n<min)throw new TypeError(`${flag} must be an integer >= ${min}`);return n}
function positiveNumber(value,flag,defaultValue){if(value===undefined)return defaultValue;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw new TypeError(`${flag} must be a positive number`);return n}
function workerSetting(value){if(value===undefined||value==='auto')return'auto';return int(value,'--workers',{min:1,defaultValue:1})}
async function readJson(path){try{return JSON.parse(await readFile(path,'utf8'))}catch(error){throw new TypeError(`input JSON could not be read: ${error?.message||error}`)}}

export async function main(argv=process.argv.slice(2)){
 const args=parseArgs(argv);
 if(!args.shadow)throw new TypeError('--shadow is required; Phase 2A cannot modify authoritative ranking');
 const input=required(args.input,'--input'),store=required(args.store,'--store'),output=required(args.output,'--output');
 const bundleOutput=args['bundle-output']??null;
 const paths=[input,output,...(bundleOutput?[bundleOutput]:[])].map(value=>resolve(value));
 if(new Set(paths).size!==paths.length)throw new TypeError('--input, --output and --bundle-output must be different paths');
 let raw=await readJson(input);const days=extractExternalDays(raw,{store});raw=null;
 const minPriorDays=int(args['min-prior'],'--min-prior',{min:1,defaultValue:1});
 const warmupDays=int(args.warmup,'--warmup',{min:0,defaultValue:24});
 // Do not apply --start while building: earlier point-in-time samples are needed as warm-up/training history.
 const bundle=await buildHistoricalSampleBundleParallel({
  store,days,endDate:args.end??null,minPriorDays,
  workers:workerSetting(args.workers),memoryBudgetMB:positiveNumber(args['memory-budget-mb'],'--memory-budget-mb',undefined),
  maxWorkers:int(args['max-workers'],'--max-workers',{min:1,defaultValue:3})
 });
 if(bundleOutput)await writeFile(bundleOutput,`${JSON.stringify(bundle,null,2)}\n`,'utf8');
 const report=await runWalkForwardBacktest({bundle,store,warmupDays,startDate:args.start??null,endDate:args.end??null});
 const outputReport={...report,historicalBuild:{...bundle.buildAudit,availableDays:bundle.range.availableDays,builtSamples:bundle.samples.length}};
 await writeFile(output,`${JSON.stringify(outputReport,null,2)}\n`,'utf8');
 const execution=bundle.buildAudit.execution;
 process.stdout.write(`JUGEST axis Phase2A store=${store} samples=${bundle.samples.length} evaluated=${report.summary.evaluatedDays} champion=${report.summary.shadowChampionDays} shadowWins=${report.summary.shadowWins} controlWins=${report.summary.controlWins} ties=${report.summary.ties} workers=${execution.workers} buildMs=${Math.round(execution.elapsedMs)}\n`);
 return outputReport;
}
const invoked=process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url));
if(invoked)main().catch(error=>{process.stderr.write(`axis-phase2a: ${error?.message||error}\n`);process.exitCode=1});
