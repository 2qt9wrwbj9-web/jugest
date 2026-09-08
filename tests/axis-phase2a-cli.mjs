import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {makeRawPredictionHistory,packPredictionHistory,predictionHistorySpec,predictionTargets} from './helpers/axis-auto-selector-baseline.mjs';

const execFileAsync=promisify(execFile);
function shift(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function sampleBundle(count=32){
 return{schema:'jugest-axis-samples-v1',store:'A',samples:Array.from({length:count},(_,day)=>({
  targetDate:shift('2026-01-01',day),trainingCutoff:shift('2025-12-31',day),sourceSignature:`sig-${day}`,
  rows:Array.from({length:12},(_,i)=>{const practical=(11-i)/11;return{
   key:`my|${i+1}`,controlRank:12-i,controlScore:i/11,fixedBonus:0,
   axes:{'practical-v1':practical,'model-v1':((i*7+day*3)%12)/11,'strict-v1':((i*5+day*2+1)%12)/11},
   actualES:1+practical*5,actualP4:.05+practical*.9
  }})
 }))};
}

test('walk-forward CLI writes a shadow-only report from a normalized sample bundle',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jugest-phase2a-')),input=join(dir,'samples.json'),output=join(dir,'report.json');
 await writeFile(input,JSON.stringify(sampleBundle()),'utf8');
 const {stdout}=await execFileAsync(process.execPath,['scripts/axis-walk-forward-backtest.mjs','--input',input,'--store','A','--output',output,'--warmup','24','--shadow'],{cwd:process.cwd()});
 const report=JSON.parse(await readFile(output,'utf8'));
 assert.equal(report.schema,'jugest-axis-walk-forward-v1');
 assert.equal(report.shadowOnly,true);
 assert.equal(report.receipts.length,8);
 assert.match(stdout,/evaluated=8/);
});

test('walk-forward CLI refuses to run without explicit --shadow',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jugest-phase2a-')),input=join(dir,'samples.json'),output=join(dir,'report.json');
 await writeFile(input,JSON.stringify(sampleBundle()),'utf8');
 await assert.rejects(()=>execFileAsync(process.execPath,['scripts/axis-walk-forward-backtest.mjs','--input',input,'--store','A','--output',output],{cwd:process.cwd()}),/--shadow|shadow/i);
});

test('historical bundle CLI accepts a real JUGEST backup package with packed externalDays',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jugest-phase2a-')),input=join(dir,'backup.json'),output=join(dir,'bundle.json');
 const raw=makeRawPredictionHistory(predictionHistorySpec),backup={app:'juggler-tool',backupVersion:1,state:{externalDays:packPredictionHistory(raw)}};
 await writeFile(input,JSON.stringify(backup),'utf8');
 const target=predictionTargets(predictionHistorySpec).historical;
 const {stdout}=await execFileAsync(process.execPath,['scripts/axis-historical-bundle.mjs','--input',input,'--store',predictionHistorySpec.shop,'--output',output,'--start',target,'--end',target,'--min-prior','20','--shadow'],{cwd:process.cwd(),maxBuffer:1024*1024*4});
 const bundle=JSON.parse(await readFile(output,'utf8'));
 assert.equal(bundle.schema,'jugest-axis-samples-v1');
 assert.equal(bundle.samples.length,1);
 assert.equal(bundle.samples[0].targetDate,target);
 assert.match(stdout,/samples=1/);
});
