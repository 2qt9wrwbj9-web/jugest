import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {ingestCollectorDay} from '../src/ingest/canonical-ingest.mjs';
import {normalizePiaJugglerRow,derivePiaBusinessDay} from '../src/collectors/pia-public.mjs';
import {runPiaCollectorTick} from '../src/collectors/pia-scheduler.mjs';

const AT='2026-10-08T15:40:00.000Z';
const machine=(no,diff=0)=>({tableNo:String(no),machine:'my',sourceMachineName:'マイジャグラーV',category:'juggler',games:6000,bb:24,rb:22,diff});
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'jugest-integrity-')),db=openDatabase(join(dir,'db.sqlite'));migrate(db);
  t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true})});
  const ingest=(machines,extra={},inputExtra={})=>ingestCollectorDay(db,{rawRoot:join(dir,'raw'),source:'fixture',sourceStoreId:'s1',shop:'検品店',date:'2026-10-08',nowIso:AT,rawText:JSON.stringify(machines),day:{date:'2026-10-08',machines,...extra},...inputExtra});
  return{db,dir,ingest};
}

test('ingest records confirmed inventory and verifies actual saved machine count',async t=>{
  const f=await fixture(t),out=await f.ingest([machine(1),machine(2)],{quality:{expectedMachineKeys:['1','2'],publicationStatus:'final'}});
  assert.equal(out.integrity.status,'complete');assert.equal(out.integrity.expectedCount,2);assert.equal(out.integrity.actualCount,2);
  assert.equal(out.integrity.eligibleForEvaluation,true);
});
test('zero diff and missing diff remain distinct in stored payload and integrity',async t=>{
  const f=await fixture(t),out=await f.ingest([machine(1,0),machine(2,null)],{quality:{expectedMachineKeys:['1','2']}});
  const rows=f.db.prepare('SELECT payload_json FROM machine_day_data ORDER BY machine_key').all().map(r=>JSON.parse(r.payload_json));
  assert.equal(rows[0].diff,0);assert.equal(rows[1].diff,null);
  assert.equal(out.integrity.missingFields.diff,1);assert.equal(out.integrity.eligibleForEvaluation,false);
});
test('duplicate table numbers cannot be published as valid data',async t=>{
  const f=await fixture(t),out=await f.ingest([machine(1),machine(1)]);
  assert.equal(out.integrity.status,'invalid');
  assert.equal(f.db.prepare('SELECT quality_status FROM store_days').get().quality_status,'invalid');
  assert.equal(f.db.prepare("SELECT count(*) n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,0);
});
test('partial resend cannot replace the saved complete day',async t=>{
  const f=await fixture(t),quality={expectedMachineKeys:['1','2'],publicationStatus:'final'};
  const good=await f.ingest([machine(1,100),machine(2,200)],{quality});
  const bad=await f.ingest([machine(1,-900)],{quality});
  assert.equal(bad.accepted,false);assert.equal(bad.integrity.status,'partial');
  assert.equal(f.db.prepare('SELECT normalized_payload_hash FROM store_days').get().normalized_payload_hash,good.normalizedHash);
  assert.equal(f.db.prepare('SELECT count(*) n FROM machine_day_data').get().n,2);
});
for(const legacy of [false,true])test(`resend cannot erase observed fields in ${legacy?'migrated':'unverified'} canonical data`,async t=>{
  const f=await fixture(t);await f.ingest([machine(1,100),machine(2,200)]);
  if(legacy)f.db.exec('DELETE FROM store_day_integrity');
  const before=f.db.prepare('SELECT payload_json FROM machine_day_data ORDER BY machine_key').all();
  const bad=await f.ingest([machine(1,null),machine(2,null)]);
  assert.equal(bad.accepted,false);assert.deepEqual(f.db.prepare('SELECT payload_json FROM machine_day_data ORDER BY machine_key').all(),before);
});
test('same canonical machine with a different display alias still cannot erase observed diff',async t=>{
 const f=await fixture(t);await f.ingest([machine(1,100)]);
 const out=await f.ingest([{...machine(1,null),sourceMachineName:'マイジャグラー5'}]);assert.equal(out.accepted,false);
 assert.equal(JSON.parse(f.db.prepare('SELECT payload_json FROM machine_day_data').get().payload_json).diff,100);
});
test('verified inventory arriving with identical data schedules the held evaluation again',async t=>{
  const f=await fixture(t);await f.ingest([machine(1,100),machine(2,200)]);
  const prior=f.db.prepare('SELECT * FROM prediction_refresh_state').get();
  f.db.prepare('UPDATE prediction_refresh_state SET completed_generation=generation,active_job_id=NULL').run();
  f.db.prepare("UPDATE jobs SET state='succeeded'").run();
  const out=await f.ingest([machine(1,100),machine(2,200)],{},{expectedMachineKeys:['1','2']});
  assert.equal(out.changed,false);assert.equal(out.verificationChanged,true);assert.equal(out.integrity.status,'complete');
  const after=f.db.prepare('SELECT * FROM prediction_refresh_state').get();assert.equal(after.generation,prior.generation+1);assert.ok(after.active_job_id);
});
test('confirmed corrected data replaces canonical rows once without duplicate aggregation',async t=>{
  const f=await fixture(t),quality={expectedMachineKeys:['1','2']};
  await f.ingest([machine(1,100),machine(2,200)],{quality});
  const corrected=await f.ingest([machine(1,101),machine(2,200)],{quality});
  const again=await f.ingest([machine(1,101),machine(2,200)],{quality});
  assert.equal(corrected.changed,true);assert.equal(again.changed,false);
  assert.equal(f.db.prepare('SELECT count(*) n FROM machine_day_data').get().n,2);
});
test('current business day stays provisional and is not sent to analysis',async t=>{
  const f=await fixture(t),out=await f.ingest([machine(1)],{quality:{expectedMachineKeys:['1']},date:'2026-10-08'});
  // This fixture is final by time; explicitly non-final publication must override that.
  const partial=await f.ingest([machine(1,30)],{quality:{expectedMachineKeys:['1'],publicationStatus:'in_progress'}});
  assert.equal(partial.integrity.status,'provisional');assert.equal(partial.accepted,false);
  assert.equal(out.integrity.eligibleForAnalysis,true);
});
test('unknown inventory is disclosed instead of pretending the reported count is expected',async t=>{
  const f=await fixture(t),out=await f.ingest([machine(1)],{quality:{totalMachines:1}});
  assert.equal(out.integrity.inventoryBasis,'unknown');assert.equal(out.integrity.expectedCount,null);
});
test('explicit changed inventory can reduce machine count without historical maximum lock',async t=>{
  const f=await fixture(t);
  await f.ingest([machine(1),machine(2)],{quality:{expectedMachineKeys:['1','2']}});
  const changed=await f.ingest([machine(1)],{quality:{expectedMachineKeys:['1'],publicationStatus:'final'}});
  assert.equal(changed.accepted,true);assert.equal(changed.integrity.status,'complete');
  assert.equal(f.db.prepare('SELECT count(*) n FROM machine_day_data').get().n,1);
});
test('raw archive failure leaves previous rows and jobs intact',async t=>{
  const f=await fixture(t);await f.ingest([machine(1)]);
  const bad=join(f.dir,'bad-root');await writeFile(bad,'not a directory');
  await assert.rejects(ingestCollectorDay(f.db,{rawRoot:bad,source:'fixture',sourceStoreId:'s1',shop:'検品店',date:'2026-10-08',nowIso:AT,rawText:'bad',day:{date:'2026-10-08',machines:[machine(2)]}}));
  assert.equal(JSON.parse(f.db.prepare('SELECT payload_json FROM machine_day_data').get().payload_json).tableNo,'1');
});
test('analysis enqueue failure rolls canonical publication back',async t=>{
  const f=await fixture(t);await f.ingest([machine(1)]);
  f.db.exec("CREATE TRIGGER reject_dirty BEFORE UPDATE ON analysis_refresh_state BEGIN SELECT RAISE(ABORT,'disk full'); END");
  await assert.rejects(f.ingest([machine(1,123)]),/disk full/);
  assert.equal(JSON.parse(f.db.prepare('SELECT payload_json FROM machine_day_data').get().payload_json).diff,0);
});
test('PIA null required counters are not converted to zero and missing diff is retained',()=>{
  const row={machine_no:1,name:'マイジャグラーV',out:3000,special_out:0,special_1:10,special_2d:8,difference:0};
  assert.equal(normalizePiaJugglerRow({...row,special_2d:null}),null);
  assert.equal(normalizePiaJugglerRow({...row,difference:null}).diff,null);
});
test('PIA rejects almost complete day instead of advancing its date baseline',()=>{
  const previous={ranking:[]},current={ranking:[]};
  for(let no=1;no<=100;no++)for(let i=0;i<30;i++){
    const row={store_id:35,machine_no:no,name:'マイジャグラーV',out:3000+i*3,special_out:0,special_1:10,special_2d:8,difference:i};
    previous.ranking.push(row);current.ranking.push(no===100?row:{...row,out:row.out+3,difference:row.difference+1});
  }
  const out=derivePiaBusinessDay(previous,current,'2026-10-09');assert.equal(out.ready,false);assert.equal(out.diagnostics.zeroAdd,1);
});
test('parallel PIA ticks claim one durable attempt before entering network/barrier work',async t=>{
  const f=await fixture(t);let requests=0;
  const data={status:0,ranking:Array.from({length:30},(_,i)=>({store_id:35,machine_no:1,name:'マイジャグラーV',out:3000+i*3,special_out:0,special_1:10,special_2d:8,difference:i})),server_date_time:{date:'2026-10-09',time:'00:40:00'}};
  const options={dbPath:join(f.dir,'db.sqlite'),rawRoot:join(f.dir,'raw'),now:new Date(AT),minMachineCount:1,fetchImpl:async()=>{requests++;return{ok:true,text:async()=>JSON.stringify(data)}},enterCollectorBarrier:async()=>{await new Promise(r=>setTimeout(r,10))}};
  await Promise.all([runPiaCollectorTick(options),runPiaCollectorTick(options)]);assert.equal(requests,1);
});
