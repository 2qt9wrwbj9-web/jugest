import {createHash} from 'node:crypto';
import {runExistingAllocationBatch,allocationRuntimeFingerprint} from '../analysis/runtime-adapter.mjs';

export const LIKELIHOOD_VERSION='allocation-legacy-capture-v1';
const keys=new Set(['my','my6','im','go','fk','hp','gg','mr','um']);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const getAllocationLikelihoodSourceHash=allocationRuntimeFingerprint;

function checkedRow(row){
  const machine=String(row?.machine??'');
  if(!keys.has(machine))throw new TypeError('unsupported_allocation_machine');
  const x=row?.input;
  if(!x||!['games','bb','rb'].every(k=>typeof x[k]==='number'&&Number.isSafeInteger(x[k])&&x[k]>=0)||x.games>200000||x.bb+x.rb>x.games)throw new TypeError('invalid_allocation_observation');
  if(x.diff!=null&&(typeof x.diff!=='number'||!Number.isFinite(x.diff)))throw new TypeError('invalid_allocation_diff');
  if(x.games===0){
    if(row.eligible!==true)throw new TypeError('unverified_allocation_zero');
    if(x.diff!=null&&x.diff!==0)throw new TypeError('invalid_allocation_zero');
  }
  return {machine,tableNo:String(row.tableNo??''),games:x.games,bb:x.bb,rb:x.rb,diff:x.diff??null};
}

export async function captureAllocationLikelihoods({rootDir,rows}={}){
  if(!Array.isArray(rows)||rows.length>2000)throw new TypeError('invalid_allocation_rows');
  const ids=new Set();
  const machines=rows.map(row=>{
    const id=String(row?.id??row?.tableNo??'');
    if(!id||ids.has(id))throw new TypeError('duplicate_or_missing_allocation_id');
    ids.add(id);return checkedRow(row);
  });
  const captured=await runExistingAllocationBatch({rootDir,machines});
  const tableHash=digest(captured.tables);
  for(const row of captured.rows){
    if(![row.bonusLogs,row.logs].every(logs=>logs.length===6&&logs.every(value=>Number.isFinite(value)||value===-Infinity)))throw new Error('invalid_captured_likelihood');
  }
  return {version:LIKELIHOOD_VERSION,sourceHash:captured.sourceHash,tableHash,
    rows:rows.map((row,i)=>({...structuredClone(row),...captured.rows[i],tableHash}))};
}

export async function getAllocationProbabilityTables({rootDir}={}){
  const {tables,sourceHash}=await runExistingAllocationBatch({rootDir});
  return {tables,sourceHash,tableHash:digest(tables),version:LIKELIHOOD_VERSION};
}
