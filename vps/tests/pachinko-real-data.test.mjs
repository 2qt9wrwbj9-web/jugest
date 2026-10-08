import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MODELS,identifyPachinkoModel} from '../src/pachinko/models.mjs';
import {estimatePachinko} from '../src/pachinko/estimator.mjs';
import {derivePachinkoDay} from '../src/pachinko/snapshot.mjs';
import {openPachinkoDatabase,migratePachinko} from '../src/pachinko/schema.mjs';
import {importPachinkoSnapshot,getPachinkoMatrix,getPachinkoRecord,reestimatePachinkoRecords} from '../src/pachinko/store.mjs';

const root=new URL('./fixtures/pachinko/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('provenance.json',root),'utf8'));
const fixtures=manifest.snapshots.map(meta=>{
  const rawText=gunzipSync(readFileSync(new URL(meta.file,root))).toString('utf8');
  assert.equal(createHash('sha256').update(rawText).digest('hex'),meta.raw_sha256);
  return {meta,rawText,payload:JSON.parse(rawText)};
});
function database(t){const db=openPachinkoDatabase(':memory:');migratePachinko(db);t.after(()=>db.close());return db}
function ingest(db,fixture){return importPachinkoSnapshot(db,{payload:fixture.payload,rawText:fixture.rawText,observedAt:fixture.meta.observed_at??undefined,provenance:fixture.meta.provenance,collectorVersion:'archived-public-pia-audit-v2'})}
function rows(fixture,key){return fixture.payload.ranking.filter(raw=>identifyPachinkoModel(raw)?.key===key)}
function auditRatio(raws){return 25*raws.reduce((n,r)=>n+r.start,0)/raws.reduce((n,r)=>n+r.out-r.special_out-r.safe+r.special_safe,0)}
function near(actual,expected,tolerance=1e-9){assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`)}

test('archived public API bytes reproduce separate cohorts and the audited raw ratios',()=>{
  const expected={OUMI5_SPECIAL_ALTA:{n:1440,k:20.477272715217104},TOKYO_GHOUL_399:{n:24,k:15.688138816258617},TOKYO_GHOUL_999:{n:1440,k:32.398616973020694}};
  assert.equal(MODELS.length,3);
  for(const [key,{n,k}] of Object.entries(expected)){
    const current=rows(fixtures[2],key);assert.equal(current.length,n);near(auditRatio(current),k,1e-8);
    for(const raw of current){assert.equal(raw.difference,10*(raw.safe-raw.out));assert.equal(raw.special_1,raw.special+raw.special_2d)}
    if(key!=='OUMI5_SPECIAL_ALTA')for(const raw of current){const result=estimatePachinko(key,raw);assert.equal(result.estimator_status,'provisional');assert.equal(result.estimated_k,null)}
  }
  near(auditRatio(rows(fixtures[0],'OUMI5_SPECIAL_ALTA')),20.48469588733626);
  const noHitSupport=rows(fixtures[2],'OUMI5_SPECIAL_ALTA').filter(r=>r.special===0&&r.final_start>r.start);
  assert.deepEqual(noHitSupport.map(r=>r.final_start-r.start).sort((a,b)=>a-b),[350,351,351,351]);
  assert.ok(noHitSupport.every(r=>r.special_2===1&&r.special_out>0&&r.special_safe>0));
  near(auditRatio(rows(fixtures[0],'TOKYO_GHOUL_399')),17.401475915323317);
  const oldIds=new Set(rows(fixtures[0],'TOKYO_GHOUL_399').map(r=>r.store_machine_id));
  assert.equal(rows(fixtures[0],'TOKYO_GHOUL_399').length,720);
  assert.ok(rows(fixtures[2],'TOKYO_GHOUL_399').every(r=>!oldIds.has(r.store_machine_id)));
  assert.deepEqual([...new Set(rows(fixtures[2],'TOKYO_GHOUL_399').map(r=>r.machine_no))].sort((a,b)=>a-b),Array.from({length:12},(_,i)=>1025+i));
  // Whole-store source bytes are retained, but unknown models never enter the
  // normalized domain, including this explicitly excluded product.
  assert.equal(identifyPachinkoModel({store_id:35,sis_machine_code:'unknown',name:'e Re:ゼロ 鬼がかり2'}),null);
});

test('independent candidate formulas match archived Ghoul cohorts without changing persisted status',t=>{
  const db=database(t);
  ingest(db,fixtures[0]);
  const older=getPachinkoMatrix(db);
  const gh399Older=older.historySummaries.find(x=>x.machine_model_key==='TOKYO_GHOUL_399');
  assert.equal(gh399Older.history_count,720);assert.equal(gh399Older.machine_count,24);
  assert.ok(gh399Older.candidate_pooled_k>16.5&&gh399Older.candidate_pooled_k<18.5);
  for(const f of fixtures.slice(1))ingest(db,f);
  const current=getPachinkoMatrix(db);
  const pairs=[['TOKYO_GHOUL_399',15.688138816258617,24,12],['TOKYO_GHOUL_999',32.398616973020694,1440,48]];
  for(const [key,expected,count,machines] of pairs){
    const snap=current.historySummaries.find(x=>x.machine_model_key===key);
    assert.equal(snap.history_count,count);assert.equal(snap.machine_count,machines);
    assert.equal(snap.candidate_valid_history_count,count);
    near(snap.candidate_pooled_k,expected,1e-8);
    const model=getPachinkoMatrix(db,{modelKey:key});
    assert.equal(model.historySummaries.length,1);
    const undated=model.undated.records;
    assert.ok(undated.length>0&&undated.every(x=>x.estimated_k===null&&x.estimator_status==='provisional'));
    assert.ok(undated.every(x=>x.candidate_k>0&&x.candidate_method_id.includes(key==='TOKYO_GHOUL_399'?'399':'999')));
    const detail=getPachinkoRecord(db,undated[0].record_id);
    assert.equal(detail.candidate_k,undated[0].candidate_k);
    assert.equal(detail.derived.estimated_k,null);
    assert.equal(db.prepare('SELECT estimated_k FROM p_records WHERE id=?').get(detail.record_id).estimated_k,null);
  }
  const sea=current.historySummaries.find(x=>x.machine_model_key==='OUMI5_SPECIAL_ALTA');
  assert.equal(sea.candidate_pooled_k,null);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('first rolling window remains undated and full original raw bytes are retained',t=>{
  const db=database(t),result=ingest(db,fixtures[0]),matrix=getPachinkoMatrix(db);
  assert.equal(result.assignedCount,0);assert.deepEqual(matrix.dates,[]);assert.equal(matrix.records.length,0);
  assert.equal(matrix.roster.length,120);
  assert.equal(db.prepare('SELECT SUM(occurrence_count) n FROM p_snapshot_members WHERE snapshot_id=?').get(result.snapshotId).n,3600);
  const snapshot=db.prepare('SELECT * FROM p_snapshots WHERE id=?').get(result.snapshotId);
  assert.equal(gunzipSync(snapshot.raw_payload_gzip).toString('utf8'),fixtures[0].rawText);
  assert.equal(snapshot.observed_at,null);
  const again=ingest(db,fixtures[0]);assert.equal(again.status,'duplicate');assert.equal(again.snapshotId,result.snapshotId);
  assert.equal(db.prepare('SELECT count(*) n FROM p_snapshots').get().n,1);
});

test('three real snapshots derive only two sea days, with null zero play and exact pooled summaries',t=>{
  const db=database(t),results=fixtures.map(f=>ingest(db,f));
  assert.deepEqual(results.map(r=>r.assignedCount),[0,48,48]);
  const matrix=getPachinkoMatrix(db);assert.deepEqual(matrix.dates,['2026-10-06','2026-10-05']);
  assert.equal(matrix.records.length,96);assert.equal(matrix.roster.length,108);
  const expected={'2026-10-05':{start:53625,k:20.611681682605084,valid:48,difference:143600,positive:27,nonnegative:27},'2026-10-06':{start:48951,k:20.294776119402986,valid:46,difference:-45480,positive:17,nonnegative:19}};
  for(const {business_date,models} of matrix.summaries){
    const sea=models.find(m=>m.machine_model_key==='OUMI5_SPECIAL_ALTA'),e=expected[business_date];
    assert.equal(sea.total_machine_count,48);assert.equal(sea.valid_machine_count,e.valid);assert.equal(sea.total_start,e.start);near(sea.pooled_k,e.k);
    assert.equal(sea.total_difference,e.difference);assert.equal(sea.positive_count,e.positive);assert.equal(sea.non_negative_count,e.nonnegative);
    for(const m of models.filter(m=>m.machine_model_key!=='OUMI5_SPECIAL_ALTA')){assert.equal(m.pooled_k,null);assert.equal(m.total_machine_count,0)}
  }
  const nullRows=matrix.records.filter(r=>r.estimated_k===null);assert.deepEqual(nullRows.map(r=>r.machine_no).sort(),['1101','1116']);
  for(const record of matrix.records){assert.equal(record.machine_model_key,'OUMI5_SPECIAL_ALTA');assert.equal(record.date_status,'derived');assert.equal(record.date_assignment_method,'consecutive_snapshot_multiset_previous_day');const detail=getPachinkoRecord(db,record.record_id);assert.ok(detail);assert.equal(detail.raw.machine_no,Number(record.machine_no));assert.equal(detail.raw.start,record.start)}
  for(const key of ['TOKYO_GHOUL_399','TOKYO_GHOUL_999']){
    const filtered=getPachinkoMatrix(db,{modelKey:key});assert.equal(filtered.records.length,0);assert.ok(filtered.undated.records.length>0);assert.ok(filtered.undated.records.every(r=>r.estimated_k===null&&r.estimator_status==='provisional'));
  }
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  const before=matrix.records.map(r=>[r.record_id,r.estimated_k,r.business_date]);reestimatePachinkoRecords(db);
  assert.deepEqual(getPachinkoMatrix(db).records.map(r=>[r.record_id,r.estimated_k,r.business_date]),before);
});

test('two-day real gap and all-new 399 installations remain unresolved instead of guessed backfill',()=>{
  const result=derivePachinkoDay(fixtures[0].payload,fixtures[2].payload);
  assert.equal(result.businessDate,null);assert.equal(result.assignments.length,0);
  assert.ok(result.transitions.length>0);
  const seaOnly=derivePachinkoDay(fixtures[0].payload,fixtures[1].payload,{scopeModelKeys:['OUMI5_SPECIAL_ALTA']});
  assert.equal(seaOnly.businessDate,'2026-10-05');assert.equal(seaOnly.assignments.length,48);
});

test('same-day unchanged source imported out of order preserves latest roster and assigned days',t=>{
  const db=database(t);fixtures.forEach(f=>ingest(db,f));
  const rawText=gunzipSync(readFileSync(new URL('2026-10-07-earlier-ranking.json.gz',root))).toString('utf8');
  assert.equal(createHash('sha256').update(rawText).digest('hex'),'4cde179e4a5a54981f5d8d669cb75c21b126dc7982664bf85d2b040c657d83ab');
  const payload=JSON.parse(rawText);assert.equal(payload.ranking.length,6188);
  const result=importPachinkoSnapshot(db,{payload,rawText,provenance:{historical:true,observed_at_unknown:true}});
  assert.equal(result.assignedCount,0);
  const matrix=getPachinkoMatrix(db);assert.equal(matrix.records.length,96);assert.equal(matrix.roster.length,108);
  assert.equal(matrix.latestSnapshot.server_time,'23:43:44');assert.equal(matrix.latestSnapshot.raw_sha256,fixtures[2].meta.raw_sha256);
});
