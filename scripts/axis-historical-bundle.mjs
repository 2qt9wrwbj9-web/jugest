#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractExternalDays} from '../research/axis-auto-selector/input.mjs';
import {buildHistoricalSampleBundleParallel} from '../research/axis-auto-selector/historical-parallel.mjs';

const VALUE_FLAGS=new Set(['--input','--store','--output','--start','--end','--min-prior','--workers','--memory-budget-mb','--max-workers']);
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
function positiveInteger(value,flag,defaultValue){if(value===undefined)return defaultValue;const n=Number(value);if(!Number.isInteger(n)||n<1)throw new TypeError(`${flag} must be a positive integer`);return n}
function positiveNumber(value,flag,defaultValue){if(value===undefined)return defaultValue;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw new TypeError(`${flag} must be a positive number`);return n}
function workerSetting(value){if(value===undefined||value==='auto')return'auto';return positiveInteger(value,'--workers',1)}
async function readJson(path){try{return JSON.parse(await readFile(path,'utf8'))}catch(error){throw new TypeError(`input JSON could not be read: ${error?.message||error}`)}}

export async function main(argv=process.argv.slice(2)){
 const args=parseArgs(argv);
 if(!args.shadow)throw new TypeError('--shadow is required; historical replay is research-only');
 const input=required(args.input,'--input'),store=required(args.store,'--store'),output=required(args.output,'--output');
 if(resolve(input)===resolve(output))throw new TypeError('--input and --output must be different paths');
 let raw=await readJson(input);const days=extractExternalDays(raw,{store});raw=null;
 const bundle=await buildHistoricalSampleBundleParallel({
  store,days,startDate:args.start??null,endDate:args.end??null,
  minPriorDays:positiveInteger(args['min-prior'],'--min-prior',1),
  workers:workerSetting(args.workers),memoryBudgetMB:positiveNumber(args['memory-budget-mb'],'--memory-budget-mb',undefined),
  maxWorkers:positiveInteger(args['max-workers'],'--max-workers',3)
 });
 await writeFile(output,`${JSON.stringify(bundle,null,2)}\n`,'utf8');
 const execution=bundle.buildAudit.execution;
 process.stdout.write(`JUGEST axis historical bundle store=${store} samples=${bundle.samples.length} skipped=${bundle.buildAudit.skipped.length} workers=${execution.workers} buildMs=${Math.round(execution.elapsedMs)}\n`);
 return bundle;
}
const invoked=process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url));
if(invoked)main().catch(error=>{process.stderr.write(`axis-historical-bundle: ${error?.message||error}\n`);process.exitCode=1});
