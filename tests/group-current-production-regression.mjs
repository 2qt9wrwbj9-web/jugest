import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {boot} from './helpers/runtime.mjs';
import {historicalSource} from './helpers/historical-source.mjs';
const BASE='6945776435f698c61c7e27c90c67beafbc5eb2a1';
const root=process.cwd(),snapshot=mkdtempSync(path.join(tmpdir(),'jugest-current-compat-'));
const files=['machine-names.js','hanahana-judge.js','missing-inference.js','judgement-model.js','judgement-view.js','core-v510.js','sync-core.js','index.html'];
let seed=0x20261010;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
try{
 for(const file of files)writeFileSync(path.join(snapshot,file),await historicalSource(BASE,file,{cwd:root}));
 for(const file of ['group-judge.js','group-judge-view.js'])writeFileSync(path.join(snapshot,file),'');
 process.chdir(snapshot);const old=await boot({loadApp:false});process.chdir(root);const current=await boot({loadApp:false});
 assert.deepEqual(structuredClone(current.ctx.JUGESTJudgement.MACHINE_KEYS),structuredClone(old.ctx.JUGESTJudgement.MACHINE_KEYS));
 let checked=0;
 for(const machine of old.ctx.JUGESTJudgement.MACHINE_KEYS)for(let i=0;i<128;i++){
  const games=[1,50,500,1500,4000,8000,12500,100000][i%8];
  const bb=i%16===0?0:Math.min(games,Math.floor(games*(.001+random()*.008)));
  const rb=i%16===1?0:Math.min(games-bb,Math.floor(games*(.0005+random()*.009)));
  const diff=[null,undefined,'',0,-2000,2000,Math.round((random()-.5)*games*2)][i%7];
  const input={machine,tableNo:String(i),games,bb,rb,diff};
  assert.deepEqual(structuredClone(current.bridge.judgeObservedMachine(input)),structuredClone(old.bridge.judgeObservedMachine(input)),`${machine} ${JSON.stringify(input)}`);checked++;
 }
 assert.equal(checked,1152);
 console.log(JSON.stringify({baseline:BASE,machines:9,inputsPerMachine:128,fullOutputsExactlyEqual:checked}));
}finally{process.chdir(root);rmSync(snapshot,{recursive:true,force:true})}
