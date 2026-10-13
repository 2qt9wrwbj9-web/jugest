import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {boot} from './helpers/runtime.mjs';

const BASE='f728b2587a9bdd81541ccb50d3ae802a8492486a';
const APPROVED_NAMES_BASE='6945776435f698c61c7e27c90c67beafbc5eb2a1';
const approvedNames={};
vm.runInNewContext(execFileSync('git',['show',`${APPROVED_NAMES_BASE}:machine-names.js`]).toString(),approvedNames);
const root=process.cwd(),oldDir=mkdtempSync(path.join(tmpdir(),'jugest-group-baseline-'));
const files=['hanahana-judge.js','missing-inference.js','judgement-model.js','judgement-view.js','core-v510.js','sync-core.js','index.html'];
let seed=0x20261010;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
try{
 for(const name of files)writeFileSync(path.join(oldDir,name),execFileSync('git',['show',`${BASE}:${name}`],{cwd:root,maxBuffer:20*1024*1024}));
 // The current loader needs the already-approved display registry. The frozen
 // baseline model/index remain unchanged and do not consume that new registry.
 writeFileSync(path.join(oldDir,'machine-names.js'),execFileSync('git',['show','6945776435f698c61c7e27c90c67beafbc5eb2a1:machine-names.js'],{cwd:root}));
 // A current loader may include the newly added pure files; old individual
 // outputs still execute the exact baseline index/model/core source above.
 for(const name of ['group-judge.js','group-judge-view.js']){
  try{writeFileSync(path.join(oldDir,name),execFileSync('git',['show',`HEAD:${name}`],{cwd:root,stdio:['ignore','pipe','ignore']}))}catch{writeFileSync(path.join(oldDir,name),'')}
 }
 process.chdir(oldDir);const old=await boot({loadApp:false});
 process.chdir(root);const current=await boot({loadApp:false});
 let checked=0,rawExactlyEqual=0;
 for(const machine of old.ctx.JUGESTJudgement.MACHINE_KEYS){
  const observations=[];
  for(let i=0;i<128;i++){
   const games=[1,50,500,1500,4000,8000,12500,100000][i%8];
   const bb=i%16===0?0:Math.min(games,Math.floor(games*(.001+random()*.008)));
   const rb=i%16===1?0:Math.min(games-bb,Math.floor(games*(.0005+random()*.009)));
   const diff=[null,undefined,'',0,-2000,2000,Math.round((random()-.5)*games*2)][i%7];
   observations.push({machine,tableNo:String(i),games,bb,rb,diff});
  }
  for(const x of observations){
   // Retain undefined and nonfinite numbers; JSON would silently turn them
   // into missing fields/null and could hide an output regression.
   const before=structuredClone(old.bridge.judgeObservedMachine(x));
   const after=structuredClone(current.bridge.judgeObservedMachine(x));
   const expected=structuredClone(before);
   if(Object.prototype.hasOwnProperty.call(expected,'machineName')){
    const approved=approvedNames.JugestMachineNames.full(machine);assert.equal(typeof approved,'string');
    expected.machineName=approved;
   }
   assert.deepEqual(after,expected,`${machine} ${JSON.stringify(x)}: only the already-approved production machineName may differ`);
   if(before.machineName===after.machineName)rawExactlyEqual++;checked++;
  }
 }
 console.log(JSON.stringify({baseline:BASE,approvedProductionNames:APPROVED_NAMES_BASE,machines:8,inputsPerMachine:128,allFieldsWithOnlyApprovedMachineNameUpdateExactlyEqual:checked,rawFullOutputsExactlyEqual:rawExactlyEqual}));
}finally{process.chdir(root);rmSync(oldDir,{recursive:true,force:true})}
