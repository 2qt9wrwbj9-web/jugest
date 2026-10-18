import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {archiveRawArtifact} from '../src/ingest/raw-archive.mjs';

const mod=await import('../src/allocation/provenance.mjs');
function verify(input){assert.equal(typeof mod.verifyAllocationProvenance,'function');return mod.verifyAllocationProvenance({storeId:'pia:35',date:'2026-10-15',...input});}
function row(no,id,name='ＳマイジャグラーⅤＫＤ',code='my-code'){
  return {store_id:35,machine_no:no,name,sis_machine_code:code,store_machine_id:no,special:10,start:5,final_start:id,special_1:10,special_2:0,special_2d:5,special_out:120,special_safe:0,out:120+(1000+id*10)*3,safe:120+(1000+id*10)*3+id*10,difference:id*10};
}
function snapshot(date,first=1,last=30){return {status:0,ranking:[...Array.from({length:last-first+1},(_,i)=>row(101,first+i)),...Array.from({length:last-first+1},(_,i)=>row(201,first+i,'未対応スマスロ','other-code'))],server_date_time:{date,time:'06:10:00'}};}
function pia(patch={}){return {rawText:JSON.stringify(snapshot('2026-10-16',2,31)),previousRawText:JSON.stringify(snapshot('2026-10-15')),...patch};}
function html(rows,head='2026-10-15 テスト店'){return `<html><title>${head}</title><h2>全データ一覧</h2><table><tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>${rows.map(r=>`<tr>${r.map(x=>`<td>${x??''}</td>`).join('')}</tr>`).join('')}</table></html>`;}
function ana(rows,extra={}){return verify({storeId:'ana-test',storeName:'テスト店',source:'ana-slo-ios-relay',rawText:html(rows),...extra});}

test('PIA adjacent native histories establish exact business day and all-machine roster',()=>{
  const got=verify(pia());
  assert.equal(got.kind,'source-native');
  assert.equal(got.dateVerified,true);
  assert.equal(got.roster.status,'verified');
  assert.equal(got.roster.rows.length,2);
  assert.equal(got.rows[0].tableNo,'101');
  assert.deepEqual(got.rows[0].input,{games:1310,bb:10,rb:5,diff:310});
  assert.equal(got.rows[0].eligible,true);
  assert.equal(got.roster.rows[1].machine,null);
  assert.match(got.roster.rows[1].sourceMachineName,/未対応/);
});
test('PIA does not date a rolling history from its position without a previous native snapshot',()=>{
  const got=verify(pia({previousRawText:null}));
  assert.notEqual(got.roster.status,'verified');
  assert.ok(got.rows.every(x=>!x.eligible));
  assert.ok(got.reasons.includes('pia_previous_snapshot_missing'));
});
test('PIA identical repeated history cannot become a fabricated daily observation',()=>{
  const got=verify(pia({rawText:JSON.stringify(snapshot('2026-10-16'))}));
  assert.equal(got.roster.status,'verified');
  assert.ok(got.rows.every(x=>!x.eligible));
  assert.ok(got.rows[0].reasons.includes('pia_day_ambiguous'));
  assert.equal(got.dateVerified,false);
});
test('PIA stable unsupported identity proves roster membership independently of ambiguous daily observations',()=>{
  for(const multi of [false,true]){
    const current=snapshot('2026-10-16',2,31),previous=snapshot('2026-10-15');
    current.ranking=current.ranking.filter(r=>r.machine_no!==201);
    current.ranking.push(...Array.from({length:30},(_,i)=>row(201,(multi?3:1)+i,'未対応スマスロ','other-code')));
    const got=verify(pia({rawText:JSON.stringify(current),previousRawText:JSON.stringify(previous)}));
    assert.equal(got.roster.status,'verified');assert.equal(got.rows[0].eligible,true);assert.equal(got.dateVerified,false);
    const unsupported=got.roster.rows.find(r=>r.tableNo==='201');assert.equal(unsupported.membershipVerified,true);assert.equal(unsupported.observationVerified,false);assert.equal(unsupported.eligible,false);assert.ok(unsupported.reasons.includes('pia_day_ambiguous'));
    assert.equal(got.verificationScope,'native-adjacent-membership-observations-partial');
  }
});
test('PIA blank native identity globally prevents full roster certification even when the observed numeric day is unique',()=>{
  for(const missing of ['',null,'   ']){
    const current=snapshot('2026-10-16',2,31),previous=snapshot('2026-10-15');
    for(const data of [current,previous])for(const r of data.ranking)if(r.machine_no===201)r.name=missing;
    const got=verify(pia({rawText:JSON.stringify(current),previousRawText:JSON.stringify(previous)}));
    assert.notEqual(got.roster.status,'verified');assert.equal(got.rows.find(r=>r.tableNo==='201').membershipVerified,false);
    assert.ok(got.roster.reasons.includes('missing_machine_identity'));
  }
});
test('PIA membership fallback never conceals replacement, mixed identity, prior-only table, ambiguous new table or source gap',()=>{
  for(const variant of ['replacement','mixed','removed','new','gap','missing-prior-name','changed-source-id']){
    const current=snapshot('2026-10-16',2,31),previous=snapshot('2026-10-15');
    current.ranking=current.ranking.filter(r=>r.machine_no!==201);
    const unchanged=Array.from({length:30},(_,i)=>row(201,1+i,'未対応スマスロ','other-code'));
    if(variant!=='removed')current.ranking.push(...unchanged);
    if(variant==='replacement')for(const r of unchanged){r.name='別の未対応機種';r.sis_machine_code='replacement';}
    if(variant==='mixed')unchanged[0].name='別の未対応機種';
    if(variant==='new')current.ranking.push(...Array.from({length:30},(_,i)=>row(301,1+i,'新規未対応機種','new-code')));
    if(variant==='gap')previous.server_date_time.date='2026-10-14';
    if(variant==='missing-prior-name')for(const r of previous.ranking)if(r.machine_no===201)r.name='';
    if(variant==='changed-source-id')for(const r of unchanged)r.store_machine_id='different-id';
    const got=verify(pia({rawText:JSON.stringify(current),previousRawText:JSON.stringify(previous)}));
    assert.notEqual(got.roster.status,'verified',variant);
    assert.equal(got.dateVerified,false,variant);
  }
});
test('PIA capped or empty previous source snapshot is not a complete first-day membership anchor',()=>{
  const previous=snapshot('2026-10-15');
  previous.ranking=Array.from({length:5000},(_,i)=>row(1000+Math.floor(i/30),1+i%30,'旧未対応機種','old-code'));
  const current=snapshot('2026-10-16');
  current.ranking=[row(101,31),...Array.from({length:167},(_,i)=>row(1000+i,31,'新未対応機種','new-code'))];
  const capped=verify(pia({rawText:JSON.stringify(current),previousRawText:JSON.stringify(previous)}));
  assert.notEqual(capped.roster.status,'verified');assert.equal(capped.dateVerified,false);assert.ok(capped.reasons.includes('pia_previous_snapshot_incomplete'));assert.ok(capped.rows.every(r=>!r.eligible&&!r.membershipVerified));
  previous.ranking=[];current.ranking=[row(101,31)];
  const empty=verify(pia({rawText:JSON.stringify(current),previousRawText:JSON.stringify(previous)}));assert.notEqual(empty.roster.status,'verified');assert.ok(empty.reasons.includes('pia_previous_snapshot_incomplete'));
});
test('PIA malformed previous ranking is held instead of escaping provenance validation',()=>{
  for(const ranking of [42,{},'invalid']){
    const got=verify(pia({previousRawText:JSON.stringify({status:0,ranking,server_date_time:{date:'2026-10-15'}})}));
    assert.notEqual(got.roster.status,'verified');assert.ok(got.rows.every(r=>!r.eligible));
  }
});
test('PIA validates native null and field types before legacy Number conversions',()=>{
  for(const value of [null,'',false,[],{},'  ','10abc']){
    const current=snapshot('2026-10-16',2,31);current.ranking.find(x=>x.machine_no===101&&x.final_start===31).special_1=value;
    const got=verify(pia({rawText:JSON.stringify(current)}));
    assert.equal(got.rows.find(x=>x.tableNo==='101').eligible,false,JSON.stringify(value));
    assert.equal(got.rows.find(x=>x.tableNo==='101').input.bb,null);
  }
});
test('PIA accepts clean numeric source strings without accepting missing values as zero',()=>{
  const current=snapshot('2026-10-16',2,31);for(const r of current.ranking)for(const f of ['out','special_out','special_1','special_2d','difference'])r[f]=String(r[f]);
  const got=verify(pia({rawText:JSON.stringify(current)}));
  assert.equal(got.roster.status,'verified');assert.equal(got.rows[0].eligible,true);assert.equal(got.rows[0].input.games,1310);
});
test('PIA exact first-row replacement proves new model without reusing previous model roster',()=>{
  const current=snapshot('2026-10-16',2,31);current.ranking=current.ranking.filter(x=>x.machine_no!==101);current.ranking.push(row(101,31,'ＳマイジャグラーⅥＫＫ','my6-code'));
  const got=verify(pia({rawText:JSON.stringify(current)}));
  assert.equal(got.roster.status,'verified');assert.equal(got.rows.find(x=>x.tableNo==='101').machine,'my6');assert.equal(got.rows.find(x=>x.tableNo==='101').eligible,true);
});
test('PIA removed table and snapshot gaps retain uncertainty about historical installation',()=>{
  const current=snapshot('2026-10-16',2,31);current.ranking=current.ranking.filter(x=>x.machine_no!==101);
  const got=verify(pia({rawText:JSON.stringify(current)}));
  assert.notEqual(got.roster.status,'verified');assert.ok(got.roster.rows.some(x=>x.tableNo==='101'));
  const gap=verify(pia({previousRawText:JSON.stringify(snapshot('2026-10-14'))}));assert.equal(gap.dateVerified,false);
});
test('PIA backfill metadata alone is source-derived and cannot prove old day roster',()=>{
  const current=snapshot('2026-10-16',31,31);current.backfill={snapshotDate:'2026-10-16',anchorBusinessDate:'2026-10-15',historyIndex:0,windowDays:30};
  const got=verify({rawText:JSON.stringify(current),date:'2026-09-16'});
  assert.equal(got.kind,'source-derived');assert.notEqual(got.roster.status,'verified');assert.ok(got.rows.every(x=>!x.eligible));
});
test('device day repackaging never gains native provenance because numeric fields look valid',()=>{
  const got=verify({rawText:JSON.stringify({provenance:'device-indexeddb-backfill-v1',day:{date:'2026-10-15',machines:[{machine:'my',tableNo:'101',games:0,bb:0,rb:0}]}})});
  assert.equal(got.kind,'device-repackaged');assert.equal(got.dateVerified,false);assert.notEqual(got.roster.status,'verified');assert.equal(got.rows.length,0);
});
test('native explicit full HTML retains unsupported machine and strictly observed zero',()=>{
  const got=ana([['マイジャグラーV','101','0','0','0','0'],['未対応機種','201','20','-60','0','0']]);
  assert.equal(got.roster.status,'verified');assert.equal(got.rows.length,2);assert.equal(got.rows[0].eligible,true);assert.deepEqual(got.rows[0].input,{games:0,bb:0,rb:0,diff:0});assert.equal(got.rows[1].machine,null);
});
test('native blank BB is missing rather than neutral zero and impossible zero remains held',()=>{
  const missing=ana([['マイジャグラーV','101','0','0','','0']]);assert.equal(missing.rows[0].input.bb,null);assert.equal(missing.rows[0].eligible,false);
  for(const r of [['マイジャグラーV','101','0','0','1','0'],['マイジャグラーV','101','0','20','0','0'],['マイジャグラーV','101','10','0','6','5'],['マイジャグラーV','101','10','0','1.5','0']])assert.equal(ana([r]).rows[0].eligible,false);
});
test('native identical duplicates count once but contradictory observations remain held',()=>{
  const a=['マイジャグラーV','101','1000','50','5','4'];
  const same=ana([a,a]);assert.equal(same.rows.length,1);assert.equal(same.rows[0].eligible,true);assert.equal(same.duplicates.identical,1);
  const conflict=ana([a,['マイジャグラーV','101','2000','50','5','4']]);assert.equal(conflict.rows.length,1);assert.equal(conflict.rows[0].eligible,false);assert.ok(conflict.rows[0].reasons.includes('conflicting_duplicate'));
});
test('native conflicting machine identities and blank roster identities cannot certify a full roster',()=>{
  const conflict=ana([['マイジャグラーV','101','1000','50','5','4'],['マイジャグラーVI','101','1000','50','5','4']]);
  assert.notEqual(conflict.roster.status,'verified');assert.ok(conflict.rows[0].reasons.includes('ambiguous_machine_identity'));
  for(const rows of [[['マイジャグラーV','','1000','50','5','4']],[['','101','1000','50','5','4']]]){
    const got=ana(rows);assert.equal(got.rows.length,1);assert.notEqual(got.roster.status,'verified');assert.equal(got.rows[0].eligible,false);
  }
});
test('native header with conflicting dates cannot borrow the requested day from another heading',()=>{
  const got=ana([['マイジャグラーV','101','1000','50','5','4']],{rawText:html([['マイジャグラーV','101','1000','50','5','4']],'2026-10-14 テスト店').replace('<h2>','<h1>2026-10-15 テスト店</h1><h2>')});
  assert.equal(got.dateVerified,false);assert.notEqual(got.roster.status,'verified');assert.equal(got.rows[0].eligible,false);
});
test('PIA original missing difference is excluded while valid bonus observations remain usable',()=>{
  const current=snapshot('2026-10-16',2,31);current.ranking.find(x=>x.machine_no===101&&x.final_start===31).difference=null;
  const got=verify(pia({rawText:JSON.stringify(current)}));assert.equal(got.rows[0].eligible,true);assert.equal(got.rows[0].input.diff,null);
});
test('PIA noninteger optional difference is warned and excluded while primary bonus remains eligible',()=>{
  for(const diff of [1.5,-1.5,Number.MAX_SAFE_INTEGER+1]){
    const current=snapshot('2026-10-16',2,31);current.ranking.find(x=>x.machine_no===101&&x.final_start===31).difference=diff;
    const got=verify(pia({rawText:JSON.stringify(current)})),r=got.rows.find(x=>x.tableNo==='101');
    assert.equal(r.eligible,true);assert.equal(r.input.diff,null);assert.equal(r.diffIssue,'diff_not_safe_integer');assert.ok(r.warnings.includes('diff_not_safe_integer'));assert.equal(r.nativeValues.difference,diff);
  }
});
test('native HTML noninteger optional difference is excluded but contradictory zero games is still held',()=>{
  const got=ana([['マイジャグラーV','101','1000','1.5','5','4']]);assert.equal(got.rows[0].eligible,true);assert.equal(got.rows[0].input.diff,null);assert.ok(got.rows[0].warnings.includes('diff_not_safe_integer'));
  const zero=ana([['マイジャグラーV','101','0','1.5','0','0']]);assert.equal(zero.rows[0].eligible,false);assert.ok(zero.rows[0].reasons.includes('inconsistent_zero_games'));
  const current=snapshot('2026-10-16',2,31),native=current.ranking.find(x=>x.machine_no===101&&x.final_start===31);native.out=120;native.special_1=0;native.special_2d=0;native.difference=1.5;
  const piaZero=verify(pia({rawText:JSON.stringify(current)}));assert.equal(piaZero.rows[0].eligible,false);assert.ok(piaZero.rows[0].reasons.includes('inconsistent_zero_games'));
});
test('PIA capped response cannot certify missing machines as a complete native roster',()=>{
  const current=snapshot('2026-10-16',2,31);
  current.ranking=Array.from({length:5000},(_,i)=>row(101+i,i+1));
  const got=verify(pia({rawText:JSON.stringify(current)}));assert.notEqual(got.roster.status,'verified');assert.ok(got.reasons.includes('native_roster_truncated'));assert.ok(got.rows.every(r=>!r.eligible));
});
test('native HTML requires source day and store and full-list evidence rather than unrelated table',()=>{
  const rows=[['マイジャグラーV','101','1000','50','5','4']];
  for(const rawText of [html(rows,'2026-10-14 テスト店'),html(rows,'2026-10-15 他店'),html(rows).replace('全データ一覧','機種別ピックアップ'),html(rows)+'<a rel="next">次へ</a>'])assert.notEqual(ana(rows,{rawText}).roster.status,'verified');
});
test('native HTML parses normalized exact store identity and rejects prefix or suffix store names',()=>{
  const rows=[['マイジャグラーV','101','1000','50','5','4']];
  for(const other of ['テスト店2','スーパーテスト店','テスト店 南口','前 テスト店','テスト店 | 別店舗']){
    const got=ana(rows,{rawText:html(rows,`2026-10-15 ${other}`)});assert.notEqual(got.roster.status,'verified',other);assert.equal(got.rows[0].eligible,false,other);assert.ok(got.reasons.includes('native_store_mismatch'),other);
  }
  assert.equal(ana(rows,{rawText:html(rows,'2026年10月15日 テスト店 - データまとめ | アナスロ')}).roster.status,'verified');
  assert.equal(ana(rows,{storeName:'ＡＢＣ店',rawText:html(rows,'2026/10/15 ABC店')}).roster.status,'verified');
});
test('raw archive reader verifies content digest and refuses paths outside root including symlinks',async()=>{
  assert.equal(typeof mod.readAllocationRawArtifact,'function');
  const dir=await mkdtemp(join(tmpdir(),'allocation-raw-'));
  try{
    const rawRoot=join(dir,'raw'),artifact=await archiveRawArtifact({root:rawRoot,storeId:'x',date:'2026-10-15',rawText:'native payload'});
    const got=await mod.readAllocationRawArtifact({rawRoot,path:artifact.path,expectedHash:artifact.sha256});assert.equal(got.rawText,'native payload');assert.equal(got.hash,artifact.sha256);
    await assert.rejects(mod.readAllocationRawArtifact({rawRoot,path:artifact.path,expectedHash:'0'.repeat(64)}),/hash/i);
    const outside=join(dir,'outside.gz');await writeFile(outside,'private');await symlink(outside,join(rawRoot,'escape.gz'));
    await assert.rejects(mod.readAllocationRawArtifact({rawRoot,path:outside}),/root|outside/i);await assert.rejects(mod.readAllocationRawArtifact({rawRoot,path:join(rawRoot,'escape.gz')}),/root|outside/i);
    await assert.rejects(mod.readAllocationRawArtifact({rawRoot,path:artifact.path,maxBytes:2}),/large|limit/i);
  }finally{await rm(dir,{recursive:true,force:true})}
});
