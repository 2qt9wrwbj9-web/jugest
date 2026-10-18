// Local reproduction from a bounded read-only export. Never connects to a
// production host or writes to the supplied export. Output contains no raw path.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {openDatabase} from '../../vps/src/db.mjs';
import {migrate} from '../../vps/src/schema.mjs';
import {loadAllocationSnapshot} from '../../vps/src/allocation/store-day.mjs';
import {createAllocationService} from '../../vps/src/allocation/service.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const input=process.argv[2],output=process.argv[3];
if(!input)throw new Error('Usage: node scripts/allocation-validation/real-data.mjs <readonly-export.json> [report.json]');
const exportBytes=readFileSync(input),data=JSON.parse(exportBytes);
assert.equal(data.mode,'readonly');
const dir=mkdtempSync(path.join(tmpdir(),'allocation-real-')),dbPath=path.join(dir,'fixture.sqlite'),rawRoot=path.join(dir,'raw');
mkdirSync(rawRoot);
let service;
try{
  const db=openDatabase(dbPath);migrate(db);
  const insert=(table,row)=>{
    const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name).filter(c=>Object.hasOwn(row,c));
    db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
  };
  insert('stores',data.store);
  for(const day of data.days){
    const raw=data.raw.find(r=>r.date===day.header.business_date),bytes=Buffer.from(raw.gzipBase64,'base64');
    assert.equal(sha(gunzipSync(bytes)),day.header.source_hash);
    const localPath=path.join(rawRoot,raw.date+'.'+raw.hash+'.html.gz');writeFileSync(localPath,bytes);
    insert('store_days',{...day.header,raw_artifact_path:localPath});
    for(const row of day.rows)insert('machine_day_data',row);
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();
  const before=sha(readFileSync(dbPath)),date=data.days.map(d=>d.header.business_date).sort().at(-1),storeId=data.store.id;
  const source=await loadAllocationSnapshot({dbPath,rawRoot,storeId,date});
  service=createAllocationService({rootDir:path.resolve(import.meta.dirname,'../..'),dbPath,rawRoot});
  const start=performance.now(),report=await service.analyzeStoreDay({storeId,date}),elapsedMs=performance.now()-start;
  const cachedStart=performance.now(),cached=await service.analyzeStoreDay({storeId,date}),cachedElapsedMs=performance.now()-cachedStart;
  assert.equal(cached.snapshot.inputHash,report.snapshot.inputHash);
  assert.equal(report.strongEnabled,false);assert.equal(sha(readFileSync(dbPath)),before);
  const summary={exportSha256:sha(exportBytes),productionBase:data.productionBase,store:report.store,date,readOnlyCanonicalUnchanged:true,elapsedMs,cachedElapsedMs,snapshot:report.snapshot,roster:report.roster,quality:report.quality,familySize:report.familySize,strongEnabled:report.strongEnabled,groups:report.groups.map(g=>({machine:g.machine,machineName:g.machineName,nInstalled:g.nInstalled,nObserved:g.nObserved,eligible:g.eligible,reasons:g.reasons,zeroGamesN:g.zeroGamesN,lowGamesN:g.lowGamesN,diffN:g.diffN,bands:g.result?.bands.map(b=>({id:b.id,expected:b.expected,median:b.median,interval:b.interval,sensitivityRange:b.sensitivityRange,events:b.events}))??null})),unsupportedN:report.unsupported.length,sourceReasons:source.quality.reasons,limitations:['正解設定が不明な実店舗データでは誤検出率・的中率を直接確定できない','全台の0G・欠損・営業日・台帳を原本から立証できる範囲だけを計算','強判定表示は無効']};
  if(output)writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({date,roster:report.roster,groups:summary.groups.map(({bands,...g})=>g),unsupportedN:summary.unsupportedN,quality:report.quality,elapsedMs,cachedElapsedMs,readOnlyCanonicalUnchanged:true}));
}finally{service?.close();rmSync(dir,{recursive:true,force:true})}
