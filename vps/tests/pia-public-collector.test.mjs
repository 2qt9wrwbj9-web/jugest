import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {collectPiaPublicOnce,derivePiaBusinessDay,normalizePiaJugglerRow,validatePiaSnapshot} from '../src/collectors/pia-public.mjs';
import {shouldAttemptPiaCollection} from '../src/collectors/pia-scheduler.mjs';

function row({no,name,code,id,storeMachineId=no}){
  const games=1000+id*37,bb=5+(id%20),rb=4+(id%17),specialOut=120+(id%5)*3,out=specialOut+games*3,diff=(id-15)*41;
  return {store_id:35,machine_no:no,name,sis_machine_code:code,store_machine_id:storeMachineId,special:bb,start:rb,final_start:id,special_1:bb,special_2:0,special_2d:rb,special_out:specialOut,special_safe:0,out,safe:out+diff,difference:diff};
}
function snapshot(date,{advance=true}={}){
  const specs=[[3090,'ＳマイジャグラーⅤＫＤ','00087'],[3118,'Ｓゴーゴージャグラー３ＫＡ','00088']];
  const ranking=[];
  for(const [no,name,code] of specs){
    const first=advance?2:1,last=advance?31:30;
    for(let id=first;id<=last;id++)ranking.push(row({no,name,code,id}));
  }
  return {status:0,ranking,server_date_time:{date,time:'06:10:00'}};
}
function response(data){return {ok:true,status:200,text:async()=>JSON.stringify(data)}}
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'jugest-pia-'));
  const db=openDatabase(join(dir,'db.sqlite'));migrate(db);
  return {dir,db,rawRoot:join(dir,'raw'),close:async()=>{db.close();await rm(dir,{recursive:true,force:true})}};
}

test('PIA row normalizes to existing JUGEST juggler payload',()=>{
  const normalized=normalizePiaJugglerRow(row({no:3090,name:'ＳマイジャグラーⅤＫＤ',code:'00087',id:31}));
  assert.equal(normalized.machine,'my');
  assert.equal(normalized.category,'juggler');
  assert.equal(normalized.sourceMachineName,'マイジャグラーV');
  assert.equal(normalized.tableNo,'3090');
  assert.equal(normalized.games,2147);
  assert.equal(normalized.bb,16);
  assert.equal(normalized.rb,18);
});

test('rolling snapshot diff derives exactly the previous business day',()=>{
  const previous=snapshot('2026-09-21',{advance:false}),current=snapshot('2026-09-22',{advance:true});
  const derived=derivePiaBusinessDay(previous,current,'2026-09-22',{minComparable:2});
  assert.equal(derived.ready,true);
  assert.equal(derived.businessDate,'2026-09-21');
  assert.equal(derived.machines.length,2);
  assert.deepEqual(derived.machines.map(x=>x.tableNo),['3090','3118']);
  assert.equal(derived.diagnostics.oneAddCoverage,1);
});

test('native PIA collector seeds once then writes next day into canonical JUGEST tables',async()=>{
  const f=await fixture();
  try{
    let data=snapshot('2026-09-21',{advance:false});
    const fetchImpl=async()=>response(data);
    const seeded=await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-21T21:10:00.000Z'});
    assert.equal(seeded.status,'seeded');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM store_days').get().n,0);

    data=snapshot('2026-09-22',{advance:true});
    const ingested=await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-22T21:10:00.000Z'});
    assert.equal(ingested.status,'ingested');
    assert.equal(ingested.businessDate,'2026-09-21');
    assert.equal(ingested.machineCount,2);
    const store=f.db.prepare('SELECT * FROM stores WHERE id=?').get('pia:35');
    assert.equal(store.name,'PIA大船1');
    const meta=JSON.parse(store.source_metadata_json);
    assert.equal(meta.source,'pia-public-ranking-top');
    assert.equal(meta.publicStoreId,35);
    assert.equal(meta.visibility,'public');
    const rows=f.db.prepare('SELECT payload_json FROM machine_day_data WHERE store_id=? AND business_date=? ORDER BY machine_key').all('pia:35','2026-09-21');
    assert.equal(rows.length,2);
    assert.deepEqual(rows.map(x=>JSON.parse(x.payload_json).tableNo),['3090','3118']);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM jobs WHERE type='DAILY_ANALYSIS'").get().n,1);
  }finally{await f.close()}
});

test('not-ready same-day snapshot keeps the previous baseline so a later retry can ingest',async()=>{
  const f=await fixture();
  try{
    let data=snapshot('2026-09-21',{advance:false});
    const fetchImpl=async()=>response(data);
    await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-21T21:10:00.000Z'});
    data={...snapshot('2026-09-22',{advance:false}),ranking:snapshot('2026-09-21',{advance:false}).ranking};
    const waiting=await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-22T21:10:00.000Z'});
    assert.equal(waiting.status,'not_ready');
    assert.equal(f.db.prepare('SELECT last_snapshot_date FROM source_collector_state').get().last_snapshot_date,'2026-09-21');
    data=snapshot('2026-09-22',{advance:true});
    const retry=await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-22T21:41:00.000Z'});
    assert.equal(retry.status,'ingested');
  }finally{await f.close()}
});

test('validation rejects partial rolling history',()=>{
  const data=snapshot('2026-09-21',{advance:false});
  data.ranking.pop();
  assert.throws(()=>validatePiaSnapshot(data,{minMachineCount:2}),/30-row rolling history/);
});

test('midnight source date lag waits 30 minutes and preserves the baseline until yesterday can be ingested',async()=>{
  const f=await fixture();
  try{
    let data=snapshot('2026-09-22',{advance:false});
    const fetchImpl=async()=>response(data);
    await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-21T21:10:00.000Z'});

    const unchanged=await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-22T15:00:00.000Z'});
    assert.equal(unchanged.status,'already_collected');
    const state=f.db.prepare('SELECT last_snapshot_date,last_snapshot_json,last_attempt_at FROM source_collector_state').get();
    assert.equal(state.last_attempt_at,'2026-09-22T15:00:00.000Z');
    assert.equal(state.last_snapshot_date,'2026-09-22');
    assert.deepEqual(JSON.parse(state.last_snapshot_json),data);
    assert.equal(shouldAttemptPiaCollection(f.db,{now:new Date('2026-09-22T15:05:00.000Z')}).reason,'cooldown');
    assert.equal(shouldAttemptPiaCollection(f.db,{now:new Date('2026-09-22T15:29:59.999Z')}).reason,'cooldown');
    assert.equal(shouldAttemptPiaCollection(f.db,{now:new Date('2026-09-22T15:30:00.000Z')}).attempt,true);

    data=snapshot('2026-09-23',{advance:false});
    const notReady=await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-22T15:30:00.000Z'});
    assert.equal(notReady.status,'not_ready');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM store_days').get().n,0);
    assert.equal(shouldAttemptPiaCollection(f.db,{now:new Date('2026-09-22T15:35:00.000Z')}).reason,'cooldown');

    data=snapshot('2026-09-23',{advance:true});
    const ready=await collectPiaPublicOnce(f.db,{rawRoot:f.rawRoot,fetchImpl,minMachineCount:2,nowIso:'2026-09-22T16:00:00.000Z'});
    assert.equal(ready.status,'ingested');
    assert.equal(ready.businessDate,'2026-09-22');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM machine_day_data WHERE business_date=?').get('2026-09-22').n,2);
    assert.equal(shouldAttemptPiaCollection(f.db,{now:new Date('2026-09-22T16:05:00.000Z')}).reason,'done_today');
  }finally{await f.close()}
});
