import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {requestHistoricalComparisonRefresh} from '../src/analysis/historical-refresh-state.mjs';
import {executeHistoricalCompare} from '../src/jobs/historical-compare.mjs';
import {getHistoricalComparisonRun} from '../src/research/historical-comparison.mjs';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const T0='2026-09-13T12:00:00.000Z';
function day(index){return new Date(Date.UTC(2026,0,1)+index*86400000).toISOString().slice(0,10)}
function seed(db,count=12){
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','研究店','{}',T0,T0);
  const putDay=db.prepare('INSERT INTO store_days(store_id,business_date,quality_status,created_at,updated_at) VALUES(?,?,?,?,?)');
  const putMachine=db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)');
  for(let i=0;i<count;i+=1){
    const date=day(i);putDay.run('s1',date,'valid',T0,T0);
    putMachine.run('s1',date,'101',JSON.stringify({machine:'my',category:'juggler',tableNo:'101',sourceMachineName:'マイジャグラーV',games:5000+i*10,bb:20+(i%3),rb:18+(i%2),diff:i*25}));
  }
}

test('historical worker commits one target with cursor atomically and duplicate execution is a no-op',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-historical-resume-')),dbPath=join(dir,'jugest.sqlite');
  try{
    let db=openDatabase(dbPath);migrate(db);seed(db);
    const first=requestHistoricalComparisonRefresh(db,{storeId:'s1',nowIso:T0});
    const firstJob=first.job,firstTarget=first.run.nextTargetDate;db.close();

    const one=await executeHistoricalCompare({dbPath,job:firstJob,rootDir:ROOT,now:()=>new Date('2026-09-13T12:01:00.000Z')});
    assert.ok(['scored','excluded'].includes(one.status));

    db=openDatabase(dbPath);migrate(db);
    let run=getHistoricalComparisonRun(db,{storeId:'s1'});
    assert.equal(run.processedCount,1);
    assert.notEqual(run.nextTargetDate,firstTarget);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM historical_comparison_days WHERE run_id=?').get(run.id).n,1);
    const secondJob=db.prepare("SELECT * FROM jobs WHERE type='HISTORICAL_COMPARE' AND state='queued' ORDER BY id DESC LIMIT 1").get();
    assert.ok(secondJob);
    const second={id:secondJob.id,type:secondJob.type,payload:JSON.parse(secondJob.payload_json)};
    db.close();

    const duplicate=await executeHistoricalCompare({dbPath,job:firstJob,rootDir:ROOT,now:()=>new Date('2026-09-13T12:02:00.000Z')});
    assert.equal(duplicate.status,'stale');
    db=openDatabase(dbPath);migrate(db);
    run=getHistoricalComparisonRun(db,{storeId:'s1'});
    assert.equal(run.processedCount,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM historical_comparison_days WHERE run_id=?').get(run.id).n,1);
    db.close();

    await executeHistoricalCompare({dbPath,job:second,rootDir:ROOT,now:()=>new Date('2026-09-13T12:03:00.000Z')});
    db=openDatabase(dbPath);migrate(db);
    run=getHistoricalComparisonRun(db,{storeId:'s1'});
    assert.equal(run.processedCount,2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM historical_comparison_days WHERE run_id=?').get(run.id).n,2);
    db.close();
  }finally{rmSync(dir,{recursive:true,force:true})}
});
