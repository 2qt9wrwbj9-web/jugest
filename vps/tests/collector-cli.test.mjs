import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {persistCollectedDay} from '../src/collector/persist.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const SCRIPT=join(ROOT,'scripts','collector.mjs');
const NOW='2026-09-10T11:30:00.000Z';

function fixture(){const dir=mkdtempSync(join(tmpdir(),'jugest-collector-cli-'));return{dir,dbPath:join(dir,'jugest.sqlite'),rawRoot:join(dir,'raw'),cleanup(){rmSync(dir,{recursive:true,force:true})}}}
function run(args,{dbPath,rawRoot,extraEnv={}}={}){
  return spawnSync(process.execPath,[SCRIPT,...args],{cwd:ROOT,encoding:'utf8',env:{...process.env,JUGEST_DB_PATH:dbPath||'',JUGEST_COLLECTOR_RAW_ROOT:rawRoot||'',JUGEST_COLLECTOR_NOW:NOW,...extraEnv}});
}
function json(stdout){return JSON.parse(String(stdout).trim());}

test('malformed slug and date are rejected before collector DB work',()=>{
  const badSlug=run(['add','--store-id','abc','--slug','../oops','--name','ABC','--history-start','2026-08-01']);
  assert.equal(badSlug.status,2);assert.match(badSlug.stderr,/slug/i);
  const badDate=run(['reset-day','--store-id','abc','--date','2026-99-99']);
  assert.equal(badDate.status,2);assert.match(badDate.stderr,/date/i);
});

test('add defaults disabled; enable seeds history; disable only disables future collection',()=>{
  const f=fixture();try{
    const added=run(['add','--store-id','abc','--slug','abc-store','--name','ABC','--history-start','2026-09-08'],f);
    assert.equal(added.status,0,added.stderr);assert.equal(json(added.stdout).store.enabled,false);
    const listed=json(run(['list'],f).stdout);assert.equal(listed.stores.length,1);assert.equal(listed.stores[0].enabled,false);
    const enabled=run(['enable','--store-id','abc'],f);assert.equal(enabled.status,0,enabled.stderr);assert.equal(json(enabled.stdout).store.enabled,true);
    const status=json(run(['status'],f).stdout);assert.deepEqual(status.nextEligible,{storeId:'abc',businessDate:'2026-09-09'});
    const disabled=run(['disable','--store-id','abc'],f);assert.equal(disabled.status,0,disabled.stderr);assert.equal(json(disabled.stdout).store.enabled,false);
    const db=openDatabase(f.dbPath);try{const rows=db.prepare('SELECT business_date,state FROM collector_days WHERE store_id=? ORDER BY business_date').all('abc');assert.deepEqual(rows,[{business_date:'2026-09-08',state:'pending'},{business_date:'2026-09-09',state:'pending'}]);}finally{db.close()}
  }finally{f.cleanup()}
});

test('status is read-only and reset-day preserves canonical payload until a new success',()=>{
  const f=fixture();try{
    assert.equal(run(['add','--store-id','abc','--slug','abc-store','--name','ABC','--history-start','2026-09-09'],f).status,0);
    assert.equal(run(['enable','--store-id','abc'],f).status,0);
    const db=openDatabase(f.dbPath);migrate(db);
    try{
      persistCollectedDay(db,{store:{storeId:'abc',name:'ABC',slug:'abc-store'},day:{date:'2026-09-09',sourceUrl:'https://ana-slo.com/2026-09-09-abc-store-data/',machines:[{machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',tableNo:'1',games:6000,diff:300,bb:22,rb:20}],quality:{score:100,grade:'A',warnings:[],totalMachines:1}},rawArtifact:{path:'/raw/old.gz',sha256:'a'.repeat(64)},nowIso:NOW});
      const before=db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').normalized_payload_hash;
      db.close();
      const status=run(['status'],f);assert.equal(status.status,0,status.stderr);
      const db2=openDatabase(f.dbPath);const afterStatus=db2.prepare('SELECT state FROM collector_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').state;assert.equal(afterStatus,'collected');db2.close();
      const reset=run(['reset-day','--store-id','abc','--date','2026-09-09'],f);assert.equal(reset.status,0,reset.stderr);assert.equal(json(reset.stdout).day.state,'pending');
      const db3=openDatabase(f.dbPath);try{assert.equal(db3.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get('abc','2026-09-09').normalized_payload_hash,before);}finally{db3.close()}
    }finally{try{db.close()}catch{}}
  }finally{f.cleanup()}
});
