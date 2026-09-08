#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAxisRegistry} from '../research/axis-auto-selector/registry.mjs';
import {runShadowEvaluation} from '../research/axis-auto-selector/shadow.mjs';

const VALUE_FLAGS=new Set(['--input','--store','--through','--profile','--output']);

function parseArgs(argv){
  const out={shadow:false};
  for(let i=0;i<argv.length;i+=1){
    const arg=argv[i];
    if(arg==='--shadow'){out.shadow=true;continue;}
    if(!VALUE_FLAGS.has(arg))throw new TypeError(`unknown argument: ${arg}`);
    const value=argv[++i];
    if(value===undefined||value.startsWith('--'))throw new TypeError(`${arg} requires a value`);
    out[arg.slice(2)]=value;
  }
  return out;
}
function requireText(value,field){
  if(typeof value!=='string'||value.trim()==='')throw new TypeError(`${field} is required`);
  return value;
}
function validYmd(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
async function readBundle(path){
  let parsed;
  try{parsed=JSON.parse(await readFile(path,'utf8'));}
  catch(error){throw new TypeError(`input JSON could not be read: ${error?.message||error}`);}
  if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed))throw new TypeError('input must be a normalized sample bundle object');
  if(parsed.schema!=='jugest-axis-samples-v1')throw new TypeError('input schema must be jugest-axis-samples-v1');
  if(typeof parsed.store!=='string'||parsed.store.length===0)throw new TypeError('input store must be a non-empty string');
  if(!Array.isArray(parsed.samples))throw new TypeError('input samples must be an array');
  if(parsed.rowSets!==undefined&&(parsed.rowSets===null||typeof parsed.rowSets!=='object'||Array.isArray(parsed.rowSets)))throw new TypeError('input rowSets must be an object when present');
  return parsed;
}
function materializeSamples(bundle){
  return bundle.samples.map((sample,index)=>{
    if(sample===null||typeof sample!=='object'||Array.isArray(sample))throw new TypeError(`input sample ${index} must be an object`);
    if(Array.isArray(sample.rows))return structuredClone(sample);
    if(typeof sample.rowsRef!=='string'||sample.rowsRef.length===0)throw new TypeError(`input sample ${index} requires rows or rowsRef`);
    const rows=bundle.rowSets?.[sample.rowsRef];
    if(!Array.isArray(rows))throw new TypeError(`input sample ${index} rowsRef is unknown: ${sample.rowsRef}`);
    const clone=structuredClone(sample);
    delete clone.rowsRef;
    clone.rows=structuredClone(rows);
    return clone;
  });
}

export async function main(argv=process.argv.slice(2)){
  const args=parseArgs(argv);
  if(!args.shadow)throw new TypeError('--shadow is required; Phase 1 cannot modify authoritative ranking');
  const input=requireText(args.input,'--input');
  const store=requireText(args.store,'--store');
  const through=requireText(args.through,'--through');
  const profile=requireText(args.profile,'--profile');
  const output=requireText(args.output,'--output');
  if(!validYmd(through))throw new TypeError('--through must be a valid YYYY-MM-DD date');
  if(resolve(profile)===resolve(output))throw new TypeError('--profile and --output must be different paths');
  const bundle=await readBundle(input);
  if(bundle.store!==store)throw new TypeError(`requested store ${store} does not match input store ${bundle.store}`);
  const samples=materializeSamples(bundle).filter(sample=>typeof sample?.targetDate==='string'&&sample.targetDate<=through);
  if(samples.length===0)throw new TypeError(`no samples are available for store ${store} through ${through}`);
  const result=await runShadowEvaluation({store,samples,registry:createAxisRegistry(),profilePath:profile});
  const audit={...result,through};
  await writeFile(output,`${JSON.stringify(audit,null,2)}\n`,'utf8');
  process.stdout.write(`JUGEST axis shadow store=${store} through=${through} decision=${result.profile.decision} profile=${result.profile.id} rows=${result.rows.length}\n`);
  return audit;
}

const invoked=process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url));
if(invoked){
  main().catch(error=>{
    process.stderr.write(`axis-auto-selector: ${error?.message||error}\n`);
    process.exitCode=1;
  });
}
