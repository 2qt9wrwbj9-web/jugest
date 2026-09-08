#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runWalkForwardBacktest} from '../research/axis-auto-selector/walk-forward.mjs';

const VALUE_FLAGS=new Set(['--input','--store','--output','--warmup','--start','--end']);
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
function integer(value,flag,defaultValue){if(value===undefined)return defaultValue;const n=Number(value);if(!Number.isInteger(n)||n<0)throw new TypeError(`${flag} must be a non-negative integer`);return n}
async function readJson(path){try{return JSON.parse(await readFile(path,'utf8'))}catch(error){throw new TypeError(`input JSON could not be read: ${error?.message||error}`)}}

export async function main(argv=process.argv.slice(2)){
 const args=parseArgs(argv);
 if(!args.shadow)throw new TypeError('--shadow is required; Phase 2A is shadow-only');
 const input=required(args.input,'--input'),store=required(args.store,'--store'),output=required(args.output,'--output');
 if(resolve(input)===resolve(output))throw new TypeError('--input and --output must be different paths');
 const warmup=integer(args.warmup,'--warmup',24),bundle=await readJson(input);
 const report=await runWalkForwardBacktest({bundle,store,warmupDays:warmup,startDate:args.start??null,endDate:args.end??null});
 await writeFile(output,`${JSON.stringify(report,null,2)}\n`,'utf8');
 process.stdout.write(`JUGEST axis Phase2A store=${store} evaluated=${report.summary.evaluatedDays} champion=${report.summary.shadowChampionDays} shadowWins=${report.summary.shadowWins} controlWins=${report.summary.controlWins} ties=${report.summary.ties}\n`);
 return report;
}
const invoked=process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url));
if(invoked)main().catch(error=>{process.stderr.write(`axis-walk-forward-backtest: ${error?.message||error}\n`);process.exitCode=1});
