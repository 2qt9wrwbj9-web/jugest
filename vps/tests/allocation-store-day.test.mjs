import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {archiveRawArtifact} from '../src/ingest/raw-archive.mjs';
import {hashCanonical} from '../src/canonical-json.mjs';

const mod=await import('../src/allocation/store-day.mjs');
const date='2026-10-15',storeId='test-store';
function html(rows){return `<html><title>${date} テスト店</title><h2>全データ一覧</h2><table><tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>${rows.map(r=>`<tr>${r.map(x=>`<td>${x??''}</td>`).join('')}</tr>`).join('')}</table></html>`;}
function machine(patch={}){return {machine:'my',tableNo:'101',sourceMachineName:'マイジャグラーV',games:1000,bb:5,rb:4,diff:50,gamesSource:'observed',diffSource:'observed',...patch};}
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'allocation-day-')),dbPath=join(dir,'canonical.sqlite'),rawRoot=join(dir,'raw'),db=new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE stores(id TEXT PRIMARY KEY,name TEXT,source_metadata_json TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE store_days(store_id TEXT,business_date TEXT,parser_version TEXT,source_hash TEXT,normalized_payload_hash TEXT,quality_status TEXT,raw_artifact_path TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(store_id,business_date)); CREATE TABLE machine_day_data(store_id TEXT,business_date TEXT,machine_key TEXT,payload_json TEXT,PRIMARY KEY(store_id,business_date,machine_key)); CREATE TABLE jobs(id INTEGER PRIMARY KEY,payload_json TEXT); INSERT INTO jobs VALUES(1,'untouched'); INSERT INTO stores VALUES('test-store','テスト店','{"source":"ana-slo-ios-relay"}','start','original');`);
  async function put({day=date,machines=[machine()],raw=html([['マイジャグラーV','101','1000','50','5','4']]),id=storeId}={}){
    const a=await archiveRawArtifact({root:rawRoot,storeId:id,date:day,rawText:raw});
    db.prepare(`INSERT OR REPLACE INTO store_days VALUES(?,?,?,?,?,'valid',?,'start','revision')`).run(id,day,'native-test',a.sha256,hashCanonical({date:day,machines}),a.path);
    db.prepare('DELETE FROM machine_day_data WHERE store_id=? AND business_date=?').run(id,day);
    machines.forEach((m,i)=>db.prepare('INSERT INTO machine_day_data VALUES(?,?,?,?)').run(id,day,String(i).padStart(6,'0'),JSON.stringify(m)));
    return a;
  }
  return {db,dbPath,rawRoot,put,load:async(patch={})=>{assert.equal(typeof mod.loadAllocationSnapshot,'function');return mod.loadAllocationSnapshot({dbPath,rawRoot,storeId,date,...patch});},close:async()=>{db.close();await rm(dir,{recursive:true,force:true})}};
}
test('exact missing day never falls back to the latest canonical day',async()=>{const f=await fixture();try{await f.put();const got=await f.load({date:'2026-10-14'});assert.equal(got.ok,false);assert.equal(got.code,'day_not_found');assert.equal(got.date,'2026-10-14');assert.deepEqual(got.groups,[]);}finally{await f.close()}});
test('strict store and calendar validation do not create a missing canonical database',async()=>{const f=await fixture();try{assert.equal((await f.load({storeId:'other'})).code,'store_not_found');for(const date of ['2026-02-30','2026-1-01','today'])await assert.rejects(f.load({date}),/date/i);await assert.rejects(f.load({dbPath:join(f.rawRoot,'missing.sqlite')}));}finally{await f.close()}});
test('same-day native full roster yields supported group and retains unsupported machines',async()=>{const f=await fixture();try{await f.put({raw:html([['マイジャグラーV','101','1000','50','5','4'],['未対応機種','201','900','50','2','3']])});const got=await f.load();assert.equal(got.ok,true);assert.equal(got.roster.status,'verified');assert.equal(got.groups.length,1);assert.equal(got.groups[0].nInstalled,1);assert.equal(got.groups[0].nObserved,1);assert.equal(got.groups[0].eligible,true);assert.equal(got.unsupported.length,1);assert.equal(got.unsupported[0].tableNo,'201');assert.equal(got.snapshot.date,date);assert.match(got.snapshot.inputHash,/^[a-f0-9]{64}$/);assert.equal(got.groups[0].rows[0].id,'101');}finally{await f.close()}});
test('native missing BB overrides canonical null-to-zero and never becomes neutral',async()=>{const f=await fixture();try{await f.put({machines:[machine({games:0,bb:0,rb:0,diff:0})],raw:html([['マイジャグラーV','101','0','0','','0']])});const got=await f.load();assert.equal(got.groups[0].eligible,false);assert.equal(got.groups[0].zeroGamesN,0);assert.equal(got.groups[0].rows[0].input.bb,null);assert.equal(got.groups[0].rows[0].eligible,false);}finally{await f.close()}});
test('genuine observed zero is neutral but remains one installed table',async()=>{const f=await fixture();try{await f.put({machines:[machine({games:0,bb:0,rb:0,diff:0})],raw:html([['マイジャグラーV','101','0','0','0','0']])});const g=(await f.load()).groups[0];assert.equal(g.nInstalled,1);assert.equal(g.nObserved,1);assert.equal(g.zeroGamesN,1);assert.equal(g.eligible,true);}finally{await f.close()}});
test('native roster missing canonical table holds the full machine group without filling a neutral row',async()=>{const f=await fixture();try{await f.put({raw:html([['マイジャグラーV','101','1000','50','5','4'],['マイジャグラーV','102','1000','50','5','4']])});const g=(await f.load()).groups[0];assert.equal(g.nInstalled,2);assert.equal(g.nObserved,1);assert.equal(g.rows.length,2);assert.equal(g.eligible,false);assert.ok(g.reasons.includes('canonical_row_missing'));assert.equal(g.rows.find(x=>x.tableNo==='102').input.games,null);}finally{await f.close()}});
test('unverified repackaging retains raw canonical observation but is ineligible even for ordinary reference',async()=>{const f=await fixture();try{await f.put({raw:JSON.stringify({provenance:'device-indexeddb-backfill-v1',day:{date,machines:[machine()]}})});const got=await f.load(),g=got.groups[0];assert.notEqual(got.roster.status,'verified');assert.equal(g.nInstalled,null);assert.equal(g.eligible,false);assert.equal(g.rows[0].eligible,false);assert.equal(g.rows[0].provenance.observed,false);assert.equal(g.rows[0].input.games,1000);}finally{await f.close()}});
test('estimated canonical games and native/canonical mismatch are held rather than silently replaced',async()=>{const f=await fixture();try{await f.put({machines:[machine({gamesSource:'estimated'})]});let g=(await f.load()).groups[0];assert.equal(g.eligible,false);assert.ok(g.rows[0].reasons.includes('estimated_games'));await f.put({machines:[machine({bb:6})]});g=(await f.load()).groups[0];assert.equal(g.eligible,false);assert.ok(g.rows[0].reasons.includes('canonical_native_mismatch'));}finally{await f.close()}});
test('canonical sequence keys are never mistaken for physical table ids and duplicate content is counted once',async()=>{const f=await fixture();try{await f.put({machines:[machine(),machine()]});let g=(await f.load()).groups[0];assert.equal(g.nObserved,1);assert.equal(g.rows.length,1);assert.equal(g.rows[0].id,'101');assert.equal(g.eligible,true);await f.put({machines:[machine(),machine({bb:6})]});g=(await f.load()).groups[0];assert.equal(g.eligible,false);assert.equal(g.rows.length,1);assert.ok(g.reasons.includes('conflicting_duplicate'));}finally{await f.close()}});
test('same-day correction invalidates source, input and roster hashes while read path leaves schema and jobs untouched',async()=>{const f=await fixture();try{await f.put();const schema=f.db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(),before=(await f.load());await f.put({machines:[machine(),machine({tableNo:'102'})],raw:html([['マイジャグラーV','101','1000','50','5','4'],['マイジャグラーV','102','1000','50','5','4']])});const after=await f.load();assert.notEqual(before.snapshot.inputHash,after.snapshot.inputHash);assert.notEqual(before.snapshot.rawHash,after.snapshot.rawHash);assert.notEqual(before.snapshot.rosterHash,after.snapshot.rosterHash);assert.deepEqual(f.db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all(),schema);assert.deepEqual(f.db.prepare('SELECT * FROM jobs').all().map(x=>({...x})),[{id:1,payload_json:'untouched'}]);assert.equal(f.db.prepare('SELECT updated_at FROM stores').get().updated_at,'original');}finally{await f.close()}});
test('canonical header and rows are captured in one readonly snapshot across a concurrent correction',async()=>{const f=await fixture();try{await f.put();const pending=f.load();f.db.prepare('UPDATE store_days SET normalized_payload_hash=?').run('corrected-header');f.db.prepare('UPDATE machine_day_data SET payload_json=?').run(JSON.stringify(machine({bb:6})));const got=await pending;assert.notEqual(got.snapshot.normalizedHash,'corrected-header');assert.equal(got.groups[0].rows[0].input.bb,5);assert.equal(got.groups[0].eligible,true);}finally{await f.close()}});
test('saved PIA full snapshots work with previous canonical raw and retain unknown machines',async()=>{const f=await fixture();try{
  f.db.prepare('UPDATE stores SET id=?,source_metadata_json=?').run('pia:35','{"source":"pia-public-ranking-top"}');
  function r(no,i,name='ＳマイジャグラーⅤＫＤ'){return {store_id:35,machine_no:no,name,sis_machine_code:name,store_machine_id:no,special:5,start:4,final_start:i,special_1:5,special_2:0,special_2d:4,special_out:120,special_safe:0,out:3120+i*30,safe:3170+i*30,difference:50};}
  function s(day,start){return JSON.stringify({status:0,server_date_time:{date:day,time:'06:10'},ranking:[...Array.from({length:30},(_,i)=>r(101,start+i)),...Array.from({length:30},(_,i)=>r(201,start+i,'未対応機種'))]});}
  await f.put({id:'pia:35',day:'2026-10-14',machines:[machine({games:1300})],raw:s('2026-10-15',1)});await f.put({id:'pia:35',machines:[machine({games:1310,sourceMachineCode:'ＳマイジャグラーⅤＫＤ',sourceStoreMachineId:'101'})],raw:s('2026-10-16',2)});
  const got=await f.load({storeId:'pia:35'});assert.equal(got.roster.status,'verified');assert.equal(got.groups[0].eligible,true);assert.equal(got.unsupported.length,1);assert.equal(got.snapshot.verificationScope,'native-adjacent-snapshots');
}finally{await f.close()}});
test('native canonical header requires matching source digest instead of trusting an arbitrary raw path',async()=>{const f=await fixture();try{
  await f.put();f.db.prepare('UPDATE store_days SET source_hash=?').run('0'.repeat(64));let got=await f.load();assert.equal(got.groups[0].eligible,false);assert.ok(got.quality.reasons.includes('raw_hash_mismatch'));
  f.db.prepare('UPDATE store_days SET source_hash=NULL').run();got=await f.load();assert.equal(got.groups[0].eligible,false);assert.ok(got.quality.reasons.includes('raw_source_hash_missing'));
}finally{await f.close()}});
test('canonical string values are held and missing or estimated difference never enters observed input',async()=>{const f=await fixture();try{
  await f.put({machines:[machine({bb:'5'})]});assert.equal((await f.load()).groups[0].eligible,false);
  await f.put({machines:[machine({diffSource:'estimated'})]});let g=(await f.load()).groups[0];assert.equal(g.eligible,true);assert.equal(g.rows[0].input.diff,null);assert.equal(g.diffN,0);
  await f.put({machines:[machine({diff:0})],raw:html([['マイジャグラーV','101','1000','','5','4']])});g=(await f.load()).groups[0];assert.equal(g.eligible,true);assert.equal(g.rows[0].input.diff,null);
}finally{await f.close()}});
test('noninteger native optional difference cannot reach legacy input or invalidate valid primary bonus group',async()=>{const f=await fixture();try{
  await f.put({machines:[machine({diff:1.5})],raw:html([['マイジャグラーV','101','1000','1.5','5','4']])});const got=await f.load(),g=got.groups[0],r=g.rows[0];
  assert.equal(g.eligible,true);assert.equal(g.diffN,0);assert.equal(r.input.diff,null);assert.equal(r.provenance.diffObserved,false);assert.equal(r.diffIssue,'diff_not_safe_integer');assert.ok(r.warnings.includes('diff_not_safe_integer'));assert.ok(got.quality.warnings.includes('diff_not_safe_integer'));
}finally{await f.close()}});
test('canonical model key cannot override a contradictory identified source machine name',async()=>{const f=await fixture();try{
  await f.put({machines:[machine({sourceMachineName:'マイジャグラーVI'})]});const got=await f.load();assert.equal(got.groups[0].eligible,false);assert.ok(got.groups[0].reasons.includes('machine_identity_mismatch'));
}finally{await f.close()}});
test('PIA first canonical day can verify from its unique immutable native seed archive',async()=>{const f=await fixture();try{
  f.db.prepare('UPDATE stores SET id=?,source_metadata_json=?').run('pia:35','{"source":"pia-public-ranking-top"}');
  const native=(day,first)=>JSON.stringify({status:0,server_date_time:{date:day,time:'06:10'},ranking:Array.from({length:30},(_,i)=>({store_id:35,machine_no:101,name:'ＳマイジャグラーⅤＫＤ',sis_machine_code:'my',store_machine_id:101,special:5,start:4,final_start:first+i,special_1:5,special_2:0,special_2d:4,special_out:120,special_safe:0,out:3120+(first+i)*30,safe:3170+(first+i)*30,difference:50}))});
  await archiveRawArtifact({root:f.rawRoot,storeId:'pia:35:snapshot',date,rawText:native(date,1)});
  await f.put({id:'pia:35',machines:[machine({games:1310})],raw:native('2026-10-16',2)});
  let got=await f.load({storeId:'pia:35'});assert.equal(got.groups[0].eligible,true);assert.equal(got.roster.nInstalled,1);assert.equal(got.roster.nObserved,1);
  await archiveRawArtifact({root:f.rawRoot,storeId:'pia:35:snapshot',date,rawText:native(date,0)});
  got=await f.load({storeId:'pia:35'});assert.equal(got.groups[0].eligible,false);assert.equal(got.groups[0].nInstalled,null);
}finally{await f.close()}});
test('PIA complete supported group remains eligible when a stable unsupported table has no unique daily observation',async()=>{const f=await fixture();try{
  f.db.prepare('UPDATE stores SET id=?,source_metadata_json=?').run('pia:35','{"source":"pia-public-ranking-top"}');
  function r(no,i,name='ＳマイジャグラーⅤＫＤ'){return {store_id:35,machine_no:no,name,sis_machine_code:name,store_machine_id:no,special:5,start:4,final_start:i,special_1:5,special_2:0,special_2d:4,special_out:120,special_safe:0,out:3120+i*30,safe:3170+i*30,difference:50};}
  function s(day,start,name='未対応機種'){return JSON.stringify({status:0,server_date_time:{date:day,time:'06:10'},ranking:[...Array.from({length:30},(_,i)=>r(101,start+i)),...Array.from({length:30},(_,i)=>r(201,1+i,name))]});}
  await f.put({id:'pia:35',day:'2026-10-14',machines:[machine({games:1300})],raw:s('2026-10-15',1)});
  await f.put({id:'pia:35',machines:[machine({games:1310})],raw:s('2026-10-16',2)});
  let got=await f.load({storeId:'pia:35'});assert.equal(got.roster.status,'verified');assert.equal(got.roster.nInstalled,2);assert.equal(got.roster.nSupported,1);assert.equal(got.roster.nUnsupported,1);assert.equal(got.groups[0].eligible,true);assert.equal(got.quality.status,'partial');assert.ok(got.quality.reasons.includes('pia_day_ambiguous'));assert.equal(got.unsupported[0].membershipVerified,true);assert.equal(got.unsupported[0].observationVerified,false);assert.ok(got.unsupported[0].reasons.includes('pia_day_ambiguous'));
  await f.put({id:'pia:35',day:'2026-10-14',machines:[machine({games:1300})],raw:s('2026-10-15',1,'Ｓゴーゴージャグラー３ＫＡ')});
  await f.put({id:'pia:35',machines:[machine({games:1310}),machine({machine:'go',tableNo:'201'})],raw:s('2026-10-16',2,'Ｓゴーゴージャグラー３ＫＡ')});
  got=await f.load({storeId:'pia:35'});assert.equal(got.roster.status,'verified');assert.equal(got.groups.find(g=>g.machine==='my').eligible,true);assert.equal(got.groups.find(g=>g.machine==='go').eligible,false);assert.equal(got.groups.find(g=>g.machine==='go').nInstalled,1);
  await f.put({id:'pia:35',day:'2026-10-14',machines:[machine({games:1300})],raw:s('2026-10-15',1,'')});
  await f.put({id:'pia:35',machines:[machine({games:1310})],raw:s('2026-10-16',2,'')});
  got=await f.load({storeId:'pia:35'});assert.notEqual(got.roster.status,'verified');assert.ok(got.groups.every(g=>!g.eligible&&g.nInstalled===null));
}finally{await f.close()}});
