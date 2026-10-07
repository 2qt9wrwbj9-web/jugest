import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';

let domain;
before(async()=>{
  const parts=await Promise.all(['models','estimator','snapshot','schema','store'].map(name=>import(`../src/pachinko/${name}.mjs`).catch(error=>{
    if(error.code==='ERR_MODULE_NOT_FOUND')return null;
    throw error;
  })));
  domain=parts.every(Boolean)?Object.assign({},...parts):null;
});
function api(){assert.ok(domain,'independent pachinko domain must exist');return domain}
const SEA='OUMI5_SPECIAL_ALTA', G399='TOKYO_GHOUL_399', G999='TOKYO_GHOUL_999';
const identities={
  [SEA]:['Ｐ大海物語５スペシャルＡＬＴＡ','00021',101,901],
  [G399]:['ｅ東京喰種Ｗ','00022',201,902],
  [G999]:['ｅ東京喰種ＭＷ','00406',301,903]
};
function raw(modelKey=SEA,seed=1,patch={}){
  const [name,code,no,id]=identities[modelKey];
  const out=1600+seed, safe=750;
  return {store_id:35,machine_no:no,store_machine_id:id,name,sis_machine_code:code,
    special:3,start:1000+seed,final_start:seed,special_1:3,special_2:1,special_2d:0,
    special_out:100,special_safe:500,out,safe,difference:(safe-out)*10,...patch};
}
function payload(date,first=1,{keys=[SEA,G399,G999],count=30,patches={}}={}){
  return {status:0,server_date_time:{date,time:'05:30:00'},ranking:keys.flatMap(key=>
    Array.from({length:count},(_,i)=>raw(key,first+i,patches[key]??{})))};
}
function seaPayload(date,ranking){return {status:0,server_date_time:{date,time:'05:30:00'},ranking}}
function zeroRaw(){return raw(SEA,0,{special:0,start:0,final_start:0,special_1:0,special_2:0,special_2d:0,special_out:0,special_safe:0,out:0,safe:0,difference:0})}
const seaScope={scopeModelKeys:[SEA]};
function fixture(fn){
  const dir=mkdtempSync(join(tmpdir(),'jugest-p-domain-')),path=join(dir,'pachinko.sqlite');
  const db=api().openPachinkoDatabase(path);api().migratePachinko(db);
  try{return fn({db,path,dir})}finally{db.close();rmSync(dir,{recursive:true,force:true})}
}
function ingest(db,data,extra={}){return api().importPachinkoSnapshot(db,{payload:data,rawText:JSON.stringify(data),observedAt:`${data.server_date_time.date}T00:30:00.000Z`,collectorVersion:'domain-test-v1',...extra})}

test('independent domain exports the complete consumer interface',()=>{
  const d=api();
  for(const name of ['identifyPachinkoModel','estimatePachinko','validatePachinkoSnapshot','derivePachinkoDay','pachinkoRecordFingerprint','pachinkoMachineIdentity','migratePachinko','openPachinkoDatabase','importPachinkoSnapshot','getPachinkoMatrix','getPachinkoRecord','reestimatePachinkoRecords'])assert.equal(typeof d[name],'function',name);
});
test('exact store, padded code and normalized name identify three distinct 4-yen models',()=>{
  const d=api();assert.equal(d.MODELS.length,3);
  assert.equal(d.identifyPachinkoModel(raw()).key,SEA);
  assert.equal(d.identifyPachinkoModel(raw(G399)).key,G399);
  assert.equal(d.identifyPachinkoModel(raw(G999)).key,G999);
  assert.equal(d.identifyPachinkoModel(raw(SEA,1,{name:'P大海物語5スペシャルALTA'})).key,SEA);
  for(const patch of [{store_id:34},{sis_machine_code:21},{sis_machine_code:'21'},{name:'①Ｐ大海物語５スペシャルＡＬＴＡ'},{name:'Ｐ大海物語５スペシャルＡＬＴＡ追加'},{name:'ｅＲｅ：ゼロから始める異世界生活 season2',sis_machine_code:'00499'}])assert.equal(d.identifyPachinkoModel(raw(SEA,1,patch)),null);
  assert.equal(d.identifyPachinkoModel(raw(SEA,1,{machine_no:9876})).key,SEA);
  for(const m of d.MODELS){assert.equal(m.denomination,4);assert.ok(m.formName);assert.ok(m.estimatorReason);}
});
test('verified sea estimator keeps normal counters separate and uses the independently checked ratio',()=>{
  const e=api().estimatePachinko(SEA,raw(SEA,0));
  assert.equal(e.normal_out,1500);assert.equal(e.normal_safe,250);assert.equal(e.net_consumption,1250);
  assert.equal(e.estimated_k,20);assert.equal(e.estimator_status,'verified');assert.equal(e.sample_size,1000);assert.equal(e.confidence,'B');
  assert.ok(e.estimator_id);assert.ok(e.estimator_version);
});
test('sea sample bands measure starts and both Ghoul methods remain provisional with null K',()=>{
  for(const [start,want] of [[1999,'B'],[2000,'A'],[1000,'B'],[999,'C'],[500,'C'],[499,'D']])assert.equal(api().estimatePachinko(SEA,raw(SEA,0,{start})).confidence,want);
  for(const key of [G399,G999]){
    const e=api().estimatePachinko(key,raw(key,0));assert.equal(e.estimated_k,null);assert.equal(e.estimator_status,'provisional');assert.equal(e.confidence,null);assert.equal(e.sample_size,1000);
  }
});
test('estimator rejects missing, fractional, negative, idle and inconsistent counters without inventing zero',()=>{
  for(const patch of [{start:null},{start:''},{start:1.5},{out:'NaN'},{special_out:1700},{special_safe:800},{out:350,difference:4000},{start:0},{difference:1}]){
    const e=api().estimatePachinko(SEA,raw(SEA,0,patch));assert.equal(e.estimated_k,null);assert.ok(e.diagnostics.length);
  }
  const e=api().estimatePachinko(SEA,raw(SEA,0,{start:null}));assert.equal(e.sample_size,null);
  assert.equal(api().estimatePachinko('UNKNOWN',raw()).estimated_k,null);
  assert.equal(api().estimatePachinko('UNKNOWN',raw()).estimator_status,'unusable');
  assert.equal(api().estimatePachinko(SEA,raw(SEA,0,{out:850,difference:-1000})).estimated_k,50);
});
test('valid full payload accepts short new-installation history but requires all target models',()=>{
  const data=payload('2026-10-05');data.ranking=data.ranking.filter(r=>r.sis_machine_code!=='00022').concat(raw(G399));
  const m=api().validatePachinkoSnapshot(data);assert.equal(m.rowCount,61);assert.equal(m.machineCount,3);assert.equal(m.snapshotDate,'2026-10-05');
  assert.throws(()=>api().validatePachinkoSnapshot(payload('2026-10-05',1,{keys:[SEA]})),/missing.*model|model.*missing/i);
  assert.equal(api().validatePachinkoSnapshot(payload('2026-10-05',1,{keys:[SEA]}),seaScope).machineCount,1);
});
test('snapshot rejects API anomalies before storing any target or public raw data',()=>{
  const bad=[];
  bad.push({...payload('2026-10-05'),status:1});bad.push(payload('2026-02-30'));
  bad.push({...payload('2026-10-05'),server_date_time:{date:'2026-10-05',time:'25:00:00'}});
  for(const patch of [{store_id:36},{store_machine_id:null},{machine_no:''},{start:null},{start:0.5},{out:-1},{difference:1},{special:4}]){
    const data=payload('2026-10-05');data.ranking[0]={...data.ranking[0],...patch};bad.push(data);
  }
  bad.push(payload('2026-10-05',1,{count:31}));
  const mixedNames=payload('2026-10-05');mixedNames.ranking.push(raw(SEA,31,{name:'P大海物語5スペシャルALTA'}));bad.push(mixedNames);
  const publicBad=payload('2026-10-05');publicBad.ranking.push(raw(SEA,1,{sis_machine_code:'99999',name:'other',store_id:99}));bad.push(publicBad);
  const truncated=payload('2026-10-05');truncated.ranking=Array.from({length:20000},()=>raw());bad.push(truncated);
  for(const data of bad)assert.throws(()=>api().validatePachinkoSnapshot(data));
  assert.throws(()=>api().validatePachinkoSnapshot(payload('2026-10-05'),{scopeModelKeys:['UNKNOWN']}));
});
test('raw fingerprints include unknown fields and installation identity but ignore property ordering',()=>{
  const d=api(),a=raw(SEA,1,{unknown:{b:2,a:1}}),b=Object.fromEntries(Object.entries(a).reverse());
  assert.equal(d.pachinkoRecordFingerprint(a),d.pachinkoRecordFingerprint(b));
  assert.notEqual(d.pachinkoRecordFingerprint(a),d.pachinkoRecordFingerprint({...a,unknown:{a:1,b:3}}));
  assert.notEqual(d.pachinkoRecordFingerprint(a),d.pachinkoRecordFingerprint({...a,store_machine_id:9000}));
  assert.notEqual(d.pachinkoMachineIdentity(a),d.pachinkoMachineIdentity({...a,machine_no:9999}));
  const p=payload('2026-10-05'),q={...payload('2026-10-06'),ranking:[...p.ranking].reverse()};
  assert.equal(d.validatePachinkoSnapshot(p).contentHash,d.validatePachinkoSnapshot(q).contentHash);
});
test('first history is undated and only exact consecutive multiset replacement assigns the previous day',()=>{
  const d=api();assert.equal(d.derivePachinkoDay(null,payload('2026-10-05')).businessDate,null);
  const r=d.derivePachinkoDay(payload('2026-10-05'),payload('2026-10-06',2));
  assert.equal(r.businessDate,'2026-10-05');assert.equal(r.assignments.length,3);assert.equal(r.diagnostics.ready,true);
  for(const a of r.assignments){assert.equal(a.raw.final_start,31);assert.equal(a.date_status,'derived');assert.equal(a.date_assignment_method,'consecutive_snapshot_multiset_previous_day');}
});
test('multiset comparison counts repeated identical zero history and preserves one added record',()=>{
  const zero=raw(SEA,0,{special:0,start:0,final_start:0,special_1:0,special_2:0,special_2d:0,special_out:0,special_safe:0,out:0,safe:0,difference:0});
  const a=seaPayload('2026-10-05',Array(30).fill(zero));
  const b=seaPayload('2026-10-06',[...Array(29).fill(zero),raw(SEA,31)]);
  const r=api().derivePachinkoDay(a,b,seaScope);assert.equal(r.assignments.length,1);assert.equal(r.businessDate,'2026-10-05');
  const unchanged=api().derivePachinkoDay(a,seaPayload('2026-10-06',Array(30).fill(zero)),seaScope);assert.equal(unchanged.assignments.length,0);assert.ok(unchanged.transitions.some(t=>t.reason==='no_change'));
});
test('same-day, acquisition gap, backwards date, multiple replacement and history-window changes remain undated',()=>{
  const prev=payload('2026-10-05');
  for(const current of [payload('2026-10-05',2),payload('2026-10-07',2),payload('2026-10-04',2),payload('2026-10-06',3),payload('2026-10-06',2,{count:29}),payload('2026-10-06',2,{count:1})]){
    const r=api().derivePachinkoDay(prev,current);assert.equal(r.businessDate,null);assert.equal(r.assignments.length,0);assert.ok(r.transitions.length);
  }
});
test('whole scoped comparable population must reach 95 percent before any candidate is dated',()=>{
  const prev=payload('2026-10-05'),current=payload('2026-10-06',2);
  current.ranking=current.ranking.map(row=>row.sis_machine_code==='00406'?raw(G999,row.final_start-1):row);
  const r=api().derivePachinkoDay(prev,current);assert.equal(r.assignments.length,0);assert.equal(r.diagnostics.ready,false);
  const many=[];for(let machine=0;machine<20;machine++)for(let seed=1;seed<=30;seed++)many.push(raw(SEA,seed,{machine_no:100+machine,store_machine_id:900+machine}));
  const currentRows=many.map(r=>raw(SEA,r.final_start+(r.machine_no===119?0:1),{machine_no:r.machine_no,store_machine_id:r.store_machine_id}));
  assert.equal(api().derivePachinkoDay(seaPayload('2026-10-05',many),seaPayload('2026-10-06',currentRows),seaScope).assignments.length,19);
  const incomplete=currentRows.filter(r=>r.machine_no===100);
  assert.equal(api().derivePachinkoDay(seaPayload('2026-10-05',many),seaPayload('2026-10-06',incomplete),seaScope).assignments.length,0);
});
test('replacement, moved machine and removal produce transitions without connecting installation histories',()=>{
  for(const patch of [{store_machine_id:9999},{machine_no:9999}]){
    const previous=payload('2026-10-05'),current=payload('2026-10-06',2,{patches:{[SEA]:patch}});
    const result=api().derivePachinkoDay(previous,current);
    assert.equal(result.assignments.filter(a=>a.machine_model_key===SEA).length,0);
    assert.ok(result.transitions.some(t=>t.reason===('store_machine_id' in patch?'installation_changed':'machine_no_changed')));
  }
  const previous=payload('2026-10-05',1,{keys:[SEA]}),current=payload('2026-10-06',2,{keys:[SEA],patches:{[SEA]:{machine_no:9999,store_machine_id:9999}}});
  const result=api().derivePachinkoDay(previous,current,seaScope);assert.equal(result.assignments.length,0);assert.ok(result.transitions.some(t=>t.reason==='removed_machine'));
});
test('explicit partial model scope does not invent removals for missing other models',()=>{
  const result=api().derivePachinkoDay(payload('2026-10-05'),payload('2026-10-06',2,{keys:[SEA]}),seaScope);
  assert.equal(result.assignments.length,1);assert.equal(result.businessDate,'2026-10-05');assert.ok(result.transitions.every(t=>t.machine_model_key===SEA));
});
test('migration is independent, repeatable and refuses a canonical database or a future schema',()=>{
  fixture(({db})=>{
    api().migratePachinko(db);assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('stores','machine_day_data','jobs')").get().n,0);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    db.exec('PRAGMA user_version=99');assert.throws(()=>api().migratePachinko(db),/schema/);
  });
  const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE stores(id TEXT PRIMARY KEY)');assert.throws(()=>api().migratePachinko(db),/empty|independent|pachinko/);}finally{db.close()}
});
test('readonly connection neither creates a missing DB nor permits migration or mutation',()=>{
  fixture(({db,path,dir})=>{
    const missing=join(dir,'absent','pachinko.sqlite');assert.throws(()=>api().openPachinkoDatabase(missing,{readOnly:true}));assert.equal(existsSync(join(dir,'absent')),false);
    const ro=api().openPachinkoDatabase(path,{readOnly:true});try{
      assert.deepEqual(api().getPachinkoMatrix(ro).dates,[]);
      assert.throws(()=>ro.exec('DELETE FROM p_snapshots'),/readonly|read-only/i);
      assert.throws(()=>api().migratePachinko(ro),/readonly|read-only/i);
    }finally{ro.close()}
  });
});
test('opening an existing canonical path fails before changing its journal or contents',()=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-p-collision-')),path=join(dir,'canonical.sqlite');
  const db=new DatabaseSync(path);db.exec('CREATE TABLE stores(id TEXT)');db.close();
  try{assert.throws(()=>api().openPachinkoDatabase(path),/independent|pachinko|schema/);const check=new DatabaseSync(path);assert.equal(check.prepare('PRAGMA journal_mode').get().journal_mode,'delete');assert.equal(check.prepare('SELECT count(*) n FROM stores').get().n,0);check.close();}finally{rmSync(dir,{recursive:true,force:true})}
});
test('raw snapshot archive preserves the complete exact response, public rows and unknown fields',()=>{
  fixture(({db})=>{
    const data=payload('2026-10-05');data.extra_public_metadata={keep:true};data.ranking[0].unknown={keep:'all'};data.ranking.push(raw(SEA,0,{sis_machine_code:'00100',name:'other public machine'}));
    const rawText=JSON.stringify(data,null,2),result=ingest(db,data,{rawText,provenance:{source:'test',note:'original'},collectorVersion:'v1'});
    assert.equal(result.assignedCount,0);assert.equal(result.collectionReady,true);
    const saved=db.prepare('SELECT * FROM p_snapshots WHERE id=?').get(result.snapshotId);
    assert.equal(gunzipSync(saved.raw_payload_gzip).toString('utf8'),rawText);
    assert.equal(saved.raw_sha256.length,64);assert.equal(saved.content_hash.length,64);assert.equal(saved.collector_version,'v1');
    const matrix=api().getPachinkoMatrix(db);assert.equal(matrix.records.length,0);assert.equal(matrix.roster.length,3);assert.equal(matrix.undated.occurrence_count,90);
    assert.equal(matrix.latestSnapshot.provenance.note,'original');
    assert.throws(()=>ingest(db,data,{rawText:'{}'}),/raw|payload/);
  });
});
test('same exact import is idempotent, reordered raw is archived and neither creates dates',()=>{
  fixture(({db})=>{
    const data=payload('2026-10-05'),first=ingest(db,data),second=ingest(db,data);
    assert.equal(second.snapshotId,first.snapshotId);assert.equal(second.status,'duplicate');
    const changed={...data,ranking:[...data.ranking].reverse()};const reordered=ingest(db,changed);
    assert.notEqual(reordered.snapshotId,first.snapshotId);assert.equal(reordered.assignedCount,0);
    assert.equal(db.prepare('SELECT count(*) n FROM p_records').get().n,90);assert.equal(db.prepare('SELECT count(*) n FROM p_snapshots').get().n,2);
  });
});
test('snapshot members store repeated raw multiplicity instead of flattening identical zero rows',()=>{
  fixture(({db})=>{
    const zero=raw(SEA,0,{special:0,start:0,final_start:0,special_1:0,special_2:0,special_2d:0,special_out:0,special_safe:0,out:0,safe:0,difference:0});
    ingest(db,seaPayload('2026-10-05',Array(30).fill(zero)),{provenance:seaScope});
    assert.equal(db.prepare('SELECT count(*) n FROM p_records').get().n,1);assert.equal(db.prepare('SELECT occurrence_count FROM p_snapshot_members').get().occurrence_count,30);
    const u=api().getPachinkoMatrix(db).undated;assert.equal(u.record_count,1);assert.equal(u.occurrence_count,30);assert.equal(u.records[0].occurrence_count,30);
  });
});
test('full to sea-only CSV to full uses per-model anchors and never dates a two-day Ghoul gap',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));
    const second=ingest(db,payload('2026-10-06',2,{keys:[SEA]}),{provenance:{...seaScope,source:'primary_csv',csvHash:'csvhash',originalApiHash:'apihash'}});
    assert.equal(second.assignedCount,1);
    const third=ingest(db,payload('2026-10-07',3));assert.equal(third.assignedCount,1);
    const matrix=api().getPachinkoMatrix(db);assert.deepEqual(matrix.dates,['2026-10-06','2026-10-05']);assert.equal(matrix.records.length,2);assert.ok(matrix.records.every(r=>r.machine_model_key===SEA));
    assert.ok(matrix.undated.models.find(m=>m.machine_model_key===G399).occurrence_count>0);
    assert.equal(db.prepare("SELECT count(*) n FROM p_transitions WHERE reason='removed_machine' AND machine_model_key<>?").get(SEA).n,0);
  });
});
test('same-day update and next-day not-ready import keep last good anchor until a later complete retry',()=>{
  fixture(({db})=>{
    const first=ingest(db,payload('2026-10-05'));
    const sameDay=ingest(db,payload('2026-10-05',2));assert.equal(sameDay.assignedCount,0);
    assert.equal(db.prepare('SELECT snapshot_id FROM p_model_anchors WHERE model_key=?').get(SEA).snapshot_id,first.snapshotId);
    const waiting=ingest(db,payload('2026-10-06'));assert.equal(waiting.collectionReady,false);assert.equal(waiting.assignedCount,0);
    assert.equal(db.prepare('SELECT snapshot_id FROM p_model_anchors WHERE model_key=?').get(SEA).snapshot_id,first.snapshotId);
    const ready=ingest(db,payload('2026-10-06',2));assert.equal(ready.assignedCount,3);assert.equal(ready.collectionReady,true);
    assert.equal(api().getPachinkoMatrix(db).records.filter(r=>r.business_date==='2026-10-05').length,3);
  });
});
test('reused machine number under new installation retains separate roster identities and unresolved raw',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));ingest(db,payload('2026-10-06',2));
    ingest(db,payload('2026-10-07',3,{patches:{[SEA]:{store_machine_id:9999}}}));
    const matrix=api().getPachinkoMatrix(db);assert.equal(matrix.roster.filter(r=>r.machine_model_key===SEA).length,2);
    assert.equal(matrix.records.filter(r=>r.machine_model_key===SEA).length,1);assert.ok(matrix.undated.records.some(r=>r.store_machine_id==='9999'));
  });
});
test('matrix summaries use weighted K, compact fields, exact dates and separate provisional models',()=>{
  fixture(({db})=>{
    const previous=payload('2026-10-05');
    previous.ranking.push(...Array.from({length:30},(_,i)=>raw(SEA,i+1,{machine_no:102,store_machine_id:904})));
    const current=payload('2026-10-06',2);
    current.ranking.push(...Array.from({length:30},(_,i)=>raw(SEA,i+2,{machine_no:102,store_machine_id:904})));
    current.ranking=current.ranking.map(r=>r.sis_machine_code==='00021'&&r.final_start===31?raw(SEA,0,{machine_no:r.machine_no,store_machine_id:r.store_machine_id,final_start:31,...(r.machine_no===102?{start:100,out:600,difference:1500}:{})}):r);
    ingest(db,previous);ingest(db,current);
    const matrix=api().getPachinkoMatrix(db);assert.equal(matrix.store.id,'pia:35-p');assert.equal(matrix.store.name,'PIA大船-P');assert.equal(matrix.store.loan_balls_per_1000_yen,250);assert.equal(matrix.store.equal_exchange,true);assert.deepEqual(matrix.dates,['2026-10-05']);
    const summary=matrix.summaries[0].models.find(m=>m.machine_model_key===SEA);
    assert.equal(summary.total_machine_count,2);assert.equal(summary.valid_machine_count,2);assert.equal(summary.total_start,1100);assert.equal(summary.total_difference,-7000);assert.equal(summary.positive_count,1);assert.equal(summary.non_negative_count,1);
    assert.ok(Math.abs(summary.pooled_k-18.333333333333332)<1e-12);assert.equal(summary.simple_mean_k,15);assert.equal(summary.median_k,15);
    const ghoul=matrix.summaries[0].models.find(m=>m.machine_model_key===G399);assert.equal(ghoul.pooled_k,null);assert.equal(ghoul.valid_machine_count,0);assert.equal(ghoul.estimator_status,'provisional');
    assert.equal(Object.hasOwn(matrix.records[0],'raw'),false);assert.equal(matrix.records[0].date_status,'derived');
    const filtered=api().getPachinkoMatrix(db,{modelKey:G399});assert.equal(filtered.records.length,1);assert.ok(filtered.roster.every(r=>r.machine_model_key===G399));
  });
});
test('different estimator versions cannot be pooled and reestimate restores current raw-derived values',()=>{
  fixture(({db})=>{
    const a=payload('2026-10-05'),b=payload('2026-10-06',2);a.ranking.push(...Array.from({length:30},(_,i)=>raw(SEA,i+1,{machine_no:102,store_machine_id:904})));b.ranking.push(...Array.from({length:30},(_,i)=>raw(SEA,i+2,{machine_no:102,store_machine_id:904})));
    ingest(db,a);ingest(db,b);
    const dated=api().getPachinkoMatrix(db).records.find(r=>r.machine_model_key===SEA);
    db.prepare("UPDATE p_records SET estimator_version='old',estimated_k=99 WHERE id=?").run(dated.record_id);
    assert.equal(api().getPachinkoMatrix(db).summaries[0].models.find(m=>m.machine_model_key===SEA).pooled_k,null);
    const counts=api().reestimatePachinkoRecords(db);assert.ok(counts.processed>=120);
    const detail=api().getPachinkoRecord(db,dated.record_id);assert.notEqual(detail.derived.estimated_k,99);assert.equal(detail.derived.estimator_version,api().MODELS.find(m=>m.key===SEA).estimatorVersion);
    assert.ok(api().getPachinkoMatrix(db).summaries[0].models.find(m=>m.machine_model_key===SEA).pooled_k>0);
  });
});
test('record detail supplies complete raw and linked snapshot and derived-date provenance',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));ingest(db,payload('2026-10-06',2));
    const record=api().getPachinkoMatrix(db).records[0],detail=api().getPachinkoRecord(db,record.record_id);
    assert.equal(detail.raw.final_start,31);assert.equal(detail.derived.estimated_k,record.estimated_k);assert.equal(detail.date_assignments[0].business_date,'2026-10-05');
    assert.ok(detail.snapshots.length);assert.equal(detail.snapshots[0].server_date,'2026-10-06');assert.ok(detail.date_assignments[0].previous_snapshot_id);assert.ok(detail.date_assignments[0].current_snapshot_id);
    assert.equal(api().getPachinkoRecord(db,99999999),null);
  });
});
test('schema enforces provisional null K, membership FK and unique day installation binding',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));ingest(db,payload('2026-10-06',2));
    const ghoul=db.prepare('SELECT id FROM p_records WHERE machine_model_key=? LIMIT 1').get(G399);
    assert.throws(()=>db.prepare('UPDATE p_records SET estimated_k=20 WHERE id=?').run(ghoul.id),/CHECK/);
    assert.throws(()=>db.prepare('INSERT INTO p_snapshot_members(snapshot_id,record_id,occurrence_count) VALUES(999999,999999,1)').run(),/FOREIGN KEY/);
    const r=db.prepare('SELECT * FROM p_machine_days LIMIT 1').get();
    assert.throws(()=>db.prepare('INSERT INTO p_machine_days(store_id,business_date,identity,machine_no,store_machine_id,machine_model_key,record_id,previous_snapshot_id,current_snapshot_id,date_status,date_assignment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(r.store_id,r.business_date,r.identity,r.machine_no,r.store_machine_id,r.machine_model_key,r.record_id,r.previous_snapshot_id,r.current_snapshot_id,r.date_status,r.date_assignment_method),/UNIQUE/);
  });
});
test('matrix limits dates, bounds undated sample per model at 200 and validates store, model and limit',()=>{
  fixture(({db})=>{
    const a=payload('2026-10-05');for(let n=0;n<7;n++)a.ranking.push(...Array.from({length:30},(_,i)=>raw(SEA,i+1,{machine_no:110+n,store_machine_id:910+n})));
    ingest(db,a);const m=api().getPachinkoMatrix(db);assert.equal(m.undated.record_count,300);assert.equal(m.undated.records.length,260);assert.equal(m.undated.per_model_sample_limit,200);assert.equal(m.undated.truncated,true);
    assert.equal(api().getPachinkoMatrix(db,{modelKey:SEA}).undated.records.length,200);
    for(const options of [{storeId:'pia:35'},{modelKey:'INVALID'},{limit:0},{limit:31},{limit:'not-number'}])assert.throws(()=>api().getPachinkoMatrix(db,options));
    ingest(db,payload('2026-10-08'));ingest(db,payload('2026-10-09',2));ingest(db,payload('2026-10-10',3));
    assert.deepEqual(api().getPachinkoMatrix(db,{limit:1}).dates,['2026-10-09']);
  });
});
test('unverified and unusable are persisted as explicit null-K states and cannot acquire K',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));
    const sea=db.prepare('SELECT id FROM p_records WHERE machine_model_key=? LIMIT 1').get(SEA);
    for(const status of ['unverified','unusable']){
      db.prepare('UPDATE p_records SET estimator_status=?,estimated_k=NULL WHERE id=?').run(status,sea.id);
      assert.equal(api().getPachinkoRecord(db,sea.id).derived.estimator_status,status);
      assert.throws(()=>db.prepare('UPDATE p_records SET estimated_k=20 WHERE id=?').run(sea.id),/CHECK/);
    }
  });
});
test('an already dated seat cannot acquire a second installation and conflict remains unresolved',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));ingest(db,payload('2026-10-06',2));
    const oldDay=db.prepare('SELECT * FROM p_machine_days WHERE machine_model_key=?').get(SEA);
    const newPrevious=ingest(db,payload('2026-10-05',1,{patches:{[SEA]:{store_machine_id:9999}}}));
    const newer=db.prepare('SELECT * FROM p_records WHERE machine_model_key=? AND store_machine_id=? LIMIT 1').get(SEA,'9999');
    assert.throws(()=>db.prepare('INSERT INTO p_machine_days(store_id,business_date,identity,machine_no,store_machine_id,machine_model_key,record_id,previous_snapshot_id,current_snapshot_id,date_status,date_assignment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(oldDay.store_id,oldDay.business_date,newer.identity,newer.machine_no,newer.store_machine_id,newer.machine_model_key,newer.id,oldDay.previous_snapshot_id,newPrevious.snapshotId,oldDay.date_status,oldDay.date_assignment_method),/UNIQUE/);
    db.prepare('UPDATE p_model_anchors SET snapshot_id=?,server_date=? WHERE model_key=?').run(newPrevious.snapshotId,'2026-10-05',SEA);
    const incoming=ingest(db,payload('2026-10-06',2,{patches:{[SEA]:{store_machine_id:9999}}}));
    assert.equal(incoming.assignedCount,0);assert.equal(incoming.collectionReady,false);
    assert.equal(db.prepare('SELECT count(*) n FROM p_machine_days WHERE business_date=? AND machine_no=?').get('2026-10-05','101').n,1);
    assert.equal(db.prepare("SELECT count(*) n FROM p_transitions WHERE current_snapshot_id=? AND reason='day_conflict'").get(incoming.snapshotId).n,1);
  });
});
test('latest snapshot follows source date and time even when historical data is imported later',()=>{
  fixture(({db})=>{
    const latest=payload('2026-10-07',3);latest.server_date_time.time='23:43:44';
    const current=ingest(db,latest);
    const early={...latest,server_date_time:{date:'2026-10-07',time:'22:51:15'}};ingest(db,early);
    ingest(db,payload('2026-10-05'));
    const matrix=api().getPachinkoMatrix(db);assert.equal(matrix.latestSnapshot.snapshot_id,current.snapshotId);assert.equal(matrix.latestSnapshot.server_time,'23:43:44');
    assert.equal(db.prepare('SELECT snapshot_id FROM p_model_anchors WHERE model_key=?').get(SEA).snapshot_id,current.snapshotId);
  });
});
test('round-robin undated samples include every current seat and each model independently',()=>{
  fixture(({db})=>{
    const data=payload('2026-10-05');data.ranking=[];
    for(const [key,machines,offset] of [[SEA,48,1000],[G399,12,2000],[G999,48,3000]])for(let machine=0;machine<machines;machine++)for(let seed=1;seed<=30;seed++)data.ranking.push(raw(key,seed,{machine_no:offset+machine,store_machine_id:offset+machine+10000}));
    ingest(db,data);
    const matrix=api().getPachinkoMatrix(db);assert.equal(matrix.undated.records.length,600);
    for(const [key,count] of [[SEA,48],[G399,12],[G999,48]]){
      const samples=matrix.undated.records.filter(row=>row.machine_model_key===key);assert.equal(samples.length,200);
      assert.equal(new Set(samples.slice(0,count).map(row=>row.identity)).size,count);
      assert.equal(matrix.undated.models.find(model=>model.machine_model_key===key).truncated,true);
    }
  });
});
test('historical import preserves unknown observation time separately from import time and source date',()=>{
  fixture(({db})=>{
    const data=payload('2026-10-05');const imported=api().importPachinkoSnapshot(db,{payload:data,provenance:{historical:true,observed_at_unknown:true}});
    const matrix=api().getPachinkoMatrix(db);assert.equal(matrix.latestSnapshot.observed_at,null);assert.ok(matrix.latestSnapshot.imported_at);assert.equal(matrix.latestSnapshot.server_date,'2026-10-05');
    const detail=api().getPachinkoRecord(db,matrix.undated.records[0].record_id);assert.equal(detail.snapshots[0].observed_at,null);assert.equal(detail.snapshots[0].provenance.historical,true);assert.equal(imported.assignedCount,0);
  });
});
test('roster excludes historical installations outside the selected date window',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));ingest(db,payload('2026-10-06',2));
    ingest(db,payload('2026-10-07',3,{patches:{[SEA]:{store_machine_id:9999}}}));
    ingest(db,payload('2026-10-08',4,{patches:{[SEA]:{store_machine_id:9999}}}));
    const limited=api().getPachinkoMatrix(db,{limit:1});assert.deepEqual(limited.dates,['2026-10-07']);assert.equal(limited.roster.length,3);assert.ok(limited.roster.every(row=>row.store_machine_id!=='901'));
    assert.equal(api().getPachinkoMatrix(db).roster.length,4);
  });
});
test('record snapshot metadata preserves source chronology after a late historical import',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-07',3));ingest(db,payload('2026-10-05'));
    const record=db.prepare('SELECT id FROM p_records WHERE machine_model_key=? AND final_start=?').get(SEA,3);
    assert.equal(api().getPachinkoRecord(db,record.id).snapshots[0].server_date,'2026-10-07');
  });
});
test('a historically dated record that disappears and reappears after a gap is undated',()=>{
  fixture(({db})=>{
    for(const [date,row] of [['2026-10-05',raw(SEA,1)],['2026-10-06',zeroRaw()],['2026-10-07',raw(SEA,1)],['2026-10-09',zeroRaw()]])ingest(db,seaPayload(date,[row]),{provenance:seaScope});
    const matrix=api().getPachinkoMatrix(db,{modelKey:SEA});assert.equal(matrix.latestSnapshot.status,'gap_seeded');assert.equal(matrix.latestSnapshot.assigned_count,0);
    assert.equal(matrix.undated.record_count,1);assert.equal(matrix.undated.occurrence_count,1);assert.equal(matrix.undated.records[0].start,0);
    const detail=api().getPachinkoRecord(db,matrix.undated.records[0].record_id);assert.equal(detail.date_assignments.length,1);assert.equal(detail.snapshots[0].dated_occurrence_count,0);
  });
});
test('a 30-row window keeps every reappearing duplicate-zero occurrence uncertain',()=>{
  fixture(({db})=>{
    const common=Array.from({length:28},(_,i)=>raw(SEA,i+1)),zero=zeroRaw(),a=raw(SEA,31),b=raw(SEA,32);
    for(const [date,tail] of [['2026-10-05',[zero,a]],['2026-10-06',[zero,zero]],['2026-10-07',[zero,a]],['2026-10-08',[a,b]],['2026-10-10',[zero,zero]]])ingest(db,seaPayload(date,[...common,...tail]),{provenance:seaScope});
    const matrix=api().getPachinkoMatrix(db,{modelKey:SEA}),zeroSample=matrix.undated.records.find(record=>record.start===0);
    assert.equal(matrix.latestSnapshot.assigned_count,0);assert.equal(matrix.undated.occurrence_count,30);assert.equal(zeroSample.occurrence_count,2);
  });
});
test('known duplicate-zero certainty is consumed by a removal and reset by an ambiguous no-change day',()=>{
  fixture(({db})=>{
    const common=Array.from({length:29},(_,i)=>raw(SEA,i+1)),zero=zeroRaw();
    ingest(db,seaPayload('2026-10-05',[...common,raw(SEA,31)]),{provenance:seaScope});
    ingest(db,seaPayload('2026-10-06',[...common,zero]),{provenance:seaScope});
    assert.equal(api().getPachinkoMatrix(db,{modelKey:SEA}).undated.occurrence_count,29);
    ingest(db,seaPayload('2026-10-07',[...common,zero]),{provenance:seaScope});
    const matrix=api().getPachinkoMatrix(db,{modelKey:SEA});assert.equal(matrix.undated.occurrence_count,30);assert.equal(matrix.undated.records.find(record=>record.start===0).occurrence_count,1);
  });
});
test('latest sea-only CSV leaves Ghoul roster and undated source provenance visible',()=>{
  fixture(({db})=>{
    const full=ingest(db,payload('2026-10-05'),{provenance:{source:'full-original'}});
    const partial=ingest(db,payload('2026-10-06',2,{keys:[SEA]}),{provenance:{...seaScope,source:'primary-csv',csvHash:'csv-evidence'}});
    const matrix=api().getPachinkoMatrix(db);assert.equal(matrix.latestSnapshot.snapshot_id,partial.snapshotId);assert.equal(matrix.roster.length,3);
    for(const key of [G399,G999]){
      const snapshot=matrix.modelSnapshots.find(model=>model.machine_model_key===key).snapshot;assert.equal(snapshot.snapshot_id,full.snapshotId);assert.equal(snapshot.provenance.source,'full-original');
      const undated=matrix.undated.models.find(model=>model.machine_model_key===key);assert.equal(undated.occurrence_count,30);assert.equal(undated.snapshot_id,full.snapshotId);
      assert.ok(matrix.undated.records.filter(record=>record.machine_model_key===key).every(record=>record.snapshot_id===full.snapshotId));
    }
    const filtered=api().getPachinkoMatrix(db,{modelKey:G399});assert.equal(filtered.roster.length,1);assert.equal(filtered.undated.records.length,30);
    assert.equal(matrix.modelSnapshots.find(model=>model.machine_model_key===SEA).snapshot.provenance.csvHash,'csv-evidence');
  });
});
test('model display snapshots advance on not-ready data while recovery anchors remain unchanged',()=>{
  fixture(({db})=>{
    const first=ingest(db,payload('2026-10-05'));
    const waiting=ingest(db,payload('2026-10-06'),{provenance:{source:'waiting-observation'}});assert.equal(waiting.collectionReady,false);
    const matrix=api().getPachinkoMatrix(db);
    for(const key of [SEA,G399,G999]){
      assert.equal(db.prepare('SELECT snapshot_id FROM p_model_anchors WHERE model_key=?').get(key).snapshot_id,first.snapshotId);
      assert.equal(matrix.modelSnapshots.find(model=>model.machine_model_key===key).snapshot.snapshot_id,waiting.snapshotId);
    }
  });
});
test('verified estimation refuses raw identity for another or unknown model',()=>{
  for(const row of [raw(G399,0),raw(G999,0),raw(SEA,0,{sis_machine_code:'99999',name:'unregistered'})]){
    const result=api().estimatePachinko(SEA,row);assert.equal(result.estimated_k,null);assert.equal(result.estimator_status,'unusable');assert.equal(result.confidence,null);assert.ok(result.diagnostics.includes('model_identity_mismatch'));
  }
});
test('unknown same-method IDs are not pooled and mixed IDs remain unpooled',()=>{
  fixture(({db})=>{
    const before=payload('2026-10-05'),after=payload('2026-10-06',2);
    before.ranking.push(...Array.from({length:30},(_,i)=>raw(SEA,i+1,{machine_no:102,store_machine_id:904})));
    after.ranking.push(...Array.from({length:30},(_,i)=>raw(SEA,i+2,{machine_no:102,store_machine_id:904})));
    ingest(db,before);ingest(db,after);
    const current=api().MODELS.find(model=>model.key===SEA),dated=api().getPachinkoMatrix(db).records.filter(record=>record.machine_model_key===SEA);
    for(const record of dated)db.prepare('UPDATE p_records SET estimator_id=?,estimator_version=? WHERE id=?').run('unknown-denominator-method','1',record.record_id);
    const seaSummary=()=>api().getPachinkoMatrix(db).summaries[0].models.find(model=>model.machine_model_key===SEA);
    assert.equal(seaSummary().valid_machine_count,2);assert.equal(seaSummary().pooled_k,null);
    db.prepare('UPDATE p_records SET estimator_id=?,estimator_version=? WHERE id=?').run(current.estimatorId,current.estimatorVersion,dated[0].record_id);
    assert.equal(seaSummary().pooled_k,null);
    db.prepare('UPDATE p_records SET estimator_id=?,estimator_version=? WHERE id=?').run(current.estimatorId,current.estimatorVersion,dated[1].record_id);
    assert.ok(seaSummary().pooled_k>0);
  });
});
test('a stored sea method cannot be used to pool a different model',()=>{
  fixture(({db})=>{
    ingest(db,payload('2026-10-05'));ingest(db,payload('2026-10-06',2));
    const sea=api().MODELS.find(model=>model.key===SEA),ghoul=api().getPachinkoMatrix(db).records.find(record=>record.machine_model_key===G399);
    db.prepare("UPDATE p_records SET estimator_status='verified',estimator_id=?,estimator_version=?,estimated_k=20 WHERE id=?").run(sea.estimatorId,sea.estimatorVersion,ghoul.record_id);
    assert.equal(api().getPachinkoMatrix(db).summaries[0].models.find(model=>model.machine_model_key===G399).pooled_k,null);
  });
});
test('v1 migration preserves raw and only backfills dates attached directly to each snapshot',()=>{
  const dir=mkdtempSync(join(tmpdir(),'jugest-p-upgrade-')),path=join(dir,'pachinko.sqlite'),legacy=new DatabaseSync(path),records=[raw(SEA,1),zeroRaw()];
  try{
    legacy.exec(readFileSync(new URL('../migrations/pachinko/001-initial.sql',import.meta.url),'utf8'));
    const cols=['id','fingerprint','store_id','identity','machine_model_key','machine_no','store_machine_id','sis_machine_code','raw_machine_name','raw_json','special','start','final_start','special_1','special_2','special_2d','special_out','special_safe','out','safe','difference','normal_out','normal_safe','net_consumption','estimated_k','estimator_id','estimator_version','estimator_status','sample_size','confidence','diagnostics_json'];
    for(const [index,row] of records.entries()){
      const estimate=api().estimatePachinko(SEA,row),entry={...row,id:index+1,fingerprint:api().pachinkoRecordFingerprint(row),store_id:'pia:35-p',identity:api().pachinkoMachineIdentity(row),machine_model_key:SEA,machine_no:'101',store_machine_id:'901',sis_machine_code:'00021',raw_machine_name:row.name,raw_json:JSON.stringify(row),...estimate,diagnostics_json:JSON.stringify(estimate.diagnostics)};
      legacy.prepare(`INSERT INTO p_records(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(key=>entry[key]));
    }
    for(const [index,date] of ['2026-10-05','2026-10-06','2026-10-08'].entries()){
      const data=seaPayload(date,[records[index===0?0:1]]),rawText=JSON.stringify(data);
      legacy.prepare("INSERT INTO p_snapshots(id,store_id,imported_at,server_date,server_time,raw_payload_gzip,raw_sha256,content_hash,collector_version,provenance_json,scope_model_keys_json,row_count,machine_count,status,diagnostics_json) VALUES(?,'pia:35-p',?,?,?, ?,?,?,?,'{}',?,1,1,'legacy','{}')").run(index+1,'2026-10-09T00:00:00.000Z',date,'05:30:00',gzipSync(rawText),api().pachinkoSha256(rawText),'content-hash','legacy-v1',JSON.stringify([SEA]));
      legacy.prepare('INSERT INTO p_snapshot_members(snapshot_id,record_id,occurrence_count) VALUES(?,?,1)').run(index+1,index===0?1:2);
    }
    legacy.prepare("INSERT INTO p_machine_days(store_id,business_date,identity,machine_no,store_machine_id,machine_model_key,record_id,previous_snapshot_id,current_snapshot_id,date_status,date_assignment_method) VALUES('pia:35-p','2026-10-05',?,'101','901',?,2,1,2,'derived','consecutive_snapshot_multiset_previous_day')").run(api().pachinkoMachineIdentity(records[1]),SEA);
    assert.throws(()=>api().openPachinkoDatabase(path,{readOnly:true}),/schema/);
    const db=api().openPachinkoDatabase(path);
    try{
      api().migratePachinko(db);api().migratePachinko(db);assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
      assert.equal(db.prepare('SELECT dated_occurrence_count FROM p_snapshot_members WHERE snapshot_id=2').get().dated_occurrence_count,1);
      assert.equal(db.prepare('SELECT dated_occurrence_count FROM p_snapshot_members WHERE snapshot_id=3').get().dated_occurrence_count,0);
      assert.equal(api().getPachinkoMatrix(db,{modelKey:SEA}).undated.occurrence_count,1);
      assert.deepEqual(api().getPachinkoRecord(db,2).raw,records[1]);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    }finally{db.close()}
  }finally{legacy.close();rmSync(dir,{recursive:true,force:true})}
});
