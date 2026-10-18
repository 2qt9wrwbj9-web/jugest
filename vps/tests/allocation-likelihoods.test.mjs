import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureAllocationLikelihoods,getAllocationProbabilityTables} from '../src/allocation/likelihoods.mjs';
import {__test as runtime} from '../src/analysis/runtime-adapter.mjs';

const rootDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const keys=['my','my6','im','go','fk','hp','gg','mr','um'];
const row=(machine,patch={})=>({id:machine,tableNo:'123',machine,eligible:true,input:{games:6000,bb:25,rb:20,diff:500,...patch}});

test('allocation uses exactly the existing captured bonus likelihood and ordinary judgement',async()=>{
  const {ctx,bridge}=await runtime.bootRuntime(rootDir);
  const rows=keys.flatMap(machine=>[row(machine),{...row(machine,{diff:null}),id:machine+'-bonus'}]);
  const before=structuredClone(rows),actual=await captureAllocationLikelihoods({rootDir,rows});
  assert.deepEqual(rows,before);
  assert.equal(actual.rows.length,18);
  for(let i=0;i<rows.length;i++){
    const x=rows[i];let captured;
    ctx.V4_TEST.externalJudge(x.machine,x.input.games,x.input.bb,x.input.rb,null,value=>{captured=value});
    assert.deepEqual(actual.rows[i].bonusLogs,Array.from(captured.logs));
    assert.deepEqual(actual.rows[i].individual,structuredClone(bridge.judgeObservedMachine({...x.input,machine:x.machine,tableNo:x.tableNo})));
    assert.deepEqual(actual.rows[i].logs,actual.rows[i].individual.diagnostics.logs);
  }
  assert.match(actual.tableHash,/^[a-f0-9]{64}$/);
  assert.match(actual.sourceHash,/^[a-f0-9]{64}$/);
  assert.notDeepEqual(actual.rows[0].bonusLogs,actual.rows[0].logs);
});

test('verified real zero is neutral without inventing an individual posterior',async()=>{
  const r=await captureAllocationLikelihoods({rootDir,rows:[row('my',{games:0,bb:0,rb:0,diff:0})]});
  assert.deepEqual(r.rows[0].bonusLogs,[0,0,0,0,0,0]);
  assert.deepEqual(r.rows[0].logs,[0,0,0,0,0,0]);
  assert.equal(r.rows[0].individual,null);
  assert.equal(r.rows[0].neutral,true);
  await assert.rejects(captureAllocationLikelihoods({rootDir,rows:[{...row('my',{games:0,bb:0,rb:0}),eligible:false}]}),/unverified/);
});

test('missing and malformed observations never become zero',async()=>{
  for(const patch of [{games:null},{games:''},{bb:null},{bb:''},{rb:undefined},{games:1.5},{bb:-1},{games:0},{bb:6001},{diff:NaN}]){
    await assert.rejects(captureAllocationLikelihoods({rootDir,rows:[row('my',patch)]}),/invalid/);
  }
  await assert.rejects(captureAllocationLikelihoods({rootDir,rows:[row('unknown')]}),/unsupported/);
  await assert.rejects(captureAllocationLikelihoods({rootDir,rows:[row('my'),row('my')]}),/duplicate/);
});

test('simulation tables are snapshots of the unchanged authoritative runtime',async()=>{
  const {tables,tableHash,sourceHash}=await getAllocationProbabilityTables({rootDir});
  assert.deepEqual(Object.keys(tables),keys);
  const {bridge}=await runtime.bootRuntime(rootDir);
  for(const machine of keys)assert.deepEqual(tables[machine],structuredClone(bridge.judgeObservedMachine({machine,games:1,bb:0,rb:0}).engine.table));
  tables.my.settings[0].b=1;
  const next=await getAllocationProbabilityTables({rootDir});
  assert.equal(next.tableHash,tableHash);assert.equal(next.sourceHash,sourceHash);
  assert.notEqual(next.tables.my.settings[0].b,1);
});
