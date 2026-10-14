// Isolated synthetic benchmark: no source requests, production paths or services.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork} from 'node:child_process';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {persistLivePrediction} from '../src/research/live-comparison.mjs';
import {inspectDay,saveDayIntegrity} from '../src/ingest/day-integrity.mjs';
import {requestPredictionEvaluation} from '../src/analysis/prediction-refresh-state.mjs';
import {claimNextJob,markJobRunning,completeJob} from '../src/queue.mjs';
import {activateStoreModel} from '../src/research/store-read-output.mjs';
import {baselineModel} from '../src/research/model-search.mjs';
import {loadStoreDays} from '../src/analysis/store-data.mjs';
import {buildPredictionPerformance} from '../src/research/prediction-performance.mjs';
const count=Math.min(366,Math.max(7,Number(process.argv[2])||180)),machinesPerDay=Math.min(500,Math.max(10,Number(process.argv[3])||120));
const dir=mkdtempSync(join(tmpdir(),'jugest-measure-')),file=join(dir,'canonical.sqlite'),db=openDatabase(file),nowIso=new Date().toISOString(),now=Date.parse(nowIso);
const today=new Date(now+9*3600000).toISOString().slice(0,10),offset=d=>new Date(Date.parse(today+'T00:00:00Z')+d*86400000).toISOString().slice(0,10);
try{
 migrate(db);db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').run('synthetic','資源検証用の架空店','{}',nowIso,nowIso);
 const rowInsert=db.prepare('INSERT INTO machine_day_data VALUES(?,?,?,?)');
 db.exec('BEGIN IMMEDIATE');
 for(let d=-count;d<0;d++){
  const date=offset(d),machines=Array.from({length:machinesPerDay},(_,i)=>({tableNo:String(100+i),machine:'my',sourceMachineName:'マイジャグラーV',games:2000+(i*137-d*13)%5000,bb:25,rb:20,diff:(i*937-d*19)%3001-1500}));
  db.prepare("INSERT INTO store_days VALUES(?,?,?,'synthetic',?,'valid','fixture',?,?)").run('synthetic',date,'v1',`day-${d}`,nowIso,nowIso);
  for(const row of machines)rowInsert.run('synthetic',date,row.tableNo,JSON.stringify(row));
  saveDayIntegrity(db,{storeId:'synthetic',date,normalizedHash:`day-${d}`,check:inspectDay(db,{storeId:'synthetic',date,day:{machines,quality:{expectedMachineKeys:machines.map(r=>r.tableNo)}},nowIso}),nowIso});
  for(const engine of ['current_shadow','pre_research'])persistLivePrediction(db,{storeId:'synthetic',targetDate:date,sourceFrontierDate:offset(d-1),createdAt:offset(d-1)+'T10:00:00Z',engine,engineVersion:'synthetic-v1',inputHash:`input-${d}`,rankings:machines.map((row,i)=>({machineKey:row.tableNo,tableNo:row.tableNo,machineName:row.sourceMachineName,rank:i+1,score:machines.length-i}))});
 }
 db.exec('COMMIT');
 const model=baselineModel(),days=loadStoreDays(db,'synthetic',{limit:180}).days;
 activateStoreModel(db,{storeId:'synthetic',fingerprint:model.fingerprint,model,featureVersion:'v1',frontierDate:offset(-1),days,nowIso});
 const results=[];
 for(const label of ['initial','cached']){
  requestPredictionEvaluation(db,{storeId:'synthetic',dirty:label==='cached',nowIso:new Date().toISOString()});
  let job=claimNextJob(db,{owner:'isolated-measure',nowIso:new Date().toISOString()});assert.equal(job.type,'PREDICTION_EVALUATE');job=markJobRunning(db,{jobId:job.id,owner:'isolated-measure',nowIso:new Date().toISOString()});
  const child=fork(fileURLToPath(new URL('../src/jobs/prediction-evaluate.mjs',import.meta.url)),[Buffer.from(JSON.stringify(job)).toString('base64url')],{env:{...process.env,JUGEST_DB_PATH:file,JUGEST_WEB_ROOT:fileURLToPath(new URL('../..',import.meta.url))},stdio:['ignore','ignore','pipe','ipc']});
  let output=null,errors='';child.stderr.on('data',chunk=>{errors+=chunk});child.on('message',message=>{if(message.type==='complete')output=message;if(message.type==='error')errors+=message.message});
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0&&output?resolve():reject(new Error(`isolated worker failed ${code}: ${errors}`)))});
  assert.ok(output.peakRssMiB<384,`peak ${output.peakRssMiB} exceeds existing 384MiB lease`);
  completeJob(db,{jobId:job.id,owner:'isolated-measure',nowIso:new Date().toISOString()});results.push({label,...output});
 }
 const started=performance.now(),summary=buildPredictionPerformance(db,{storeId:'synthetic'}),readDurationMs=performance.now()-started;
 assert.equal(summary.periods.all.evaluatedDays,count);
 const bytes=statSync(file).size+(function(){try{return statSync(file+'-wal').size}catch{return 0}})();
 console.log(JSON.stringify({synthetic:true,days:count,machinesPerDay,rows:count*machinesPerDay,results,readDurationMs,responseBytes:Buffer.byteLength(JSON.stringify(summary)),dbAndWalMiB:bytes/1048576,parentPeakRssMiB:process.resourceUsage().maxRSS/1024,leaseMiB:384},null,2));
}finally{db.close();rmSync(dir,{recursive:true,force:true})}
