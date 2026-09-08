import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {makeRawPredictionHistory,packPredictionHistory,predictionHistorySpec,predictionTargets} from './helpers/axis-auto-selector-baseline.mjs';
const execFileAsync=promisify(execFile);

test('historical CLI exposes bounded worker and memory controls in shadow research mode',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jugest-fast-cli-')),input=join(dir,'backup.json'),output=join(dir,'bundle.json');
 const raw=makeRawPredictionHistory(predictionHistorySpec),backup={app:'juggler-tool',backupVersion:1,state:{externalDays:packPredictionHistory(raw)}};
 await writeFile(input,JSON.stringify(backup),'utf8');
 const target=predictionTargets(predictionHistorySpec).historical;
 const {stdout}=await execFileAsync(process.execPath,['scripts/axis-historical-bundle.mjs','--input',input,'--store',predictionHistorySpec.shop,'--output',output,'--start',target,'--end',target,'--min-prior','20','--workers','1','--memory-budget-mb','512','--max-workers','2','--shadow'],{cwd:process.cwd(),maxBuffer:4*1024*1024});
 const bundle=JSON.parse(await readFile(output,'utf8'));
 assert.equal(bundle.buildAudit.execution.mode,'sequential');
 assert.equal(bundle.buildAudit.execution.workers,1);
 assert.match(stdout,/workers=1/);
});
