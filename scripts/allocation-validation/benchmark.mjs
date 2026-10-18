// Entire local read/verify/worker/cache path, using explicitly synthetic data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir,cpus,totalmem} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {openDatabase} from '../../vps/src/db.mjs';
import {migrate} from '../../vps/src/schema.mjs';
import {createAllocationService} from '../../vps/src/allocation/service.mjs';
import '../../machine-names.js';
const rootDir=path.resolve(import.meta.dirname,'../..'),dir=mkdtempSync(path.join(tmpdir(),'allocation-benchmark-')),dbPath=path.join(dir,'local.sqlite'),rawRoot=path.join(dir,'raw');
const sha=x=>createHash('sha256').update(x).digest('hex'),keys=['my','my6','im','go','fk','hp','gg','mr','um'];
const readOptional=p=>{try{return readFileSync(p,'utf8').trim()}catch{return null}};
mkdirSync(rawRoot);const db=openDatabase(dbPath);migrate(db);
const service=createAllocationService({rootDir,dbPath,rawRoot}),cases=[];
function seed(id,sizes){
  const rows=[];let number=0;
  for(let i=0;i<sizes.length;i++)for(let j=0;j<sizes[i];j++)rows.push({machine:keys[i],tableNo:String(++number),games:j===0?0:6000,bb:j===0?0:24+j%4,rb:j===0?0:20+j%3,diff:j===0?0:300+(j%3)*200,gamesSource:'observed',diffSource:'observed'});
  const name='完全合成性能試験店'+id,date='2026-10-16',header='<tr><th>機種名</th><th>台番号</th><th>G数</th><th>差枚</th><th>BB</th><th>RB</th></tr>';
  const html=`<html><title>${date} ${name}</title><h2>全データ一覧</h2><table>${header}${rows.map(r=>`<tr><td>${globalThis.JugestMachineNames.full(r.machine)}</td><td>${r.tableNo}</td><td>${r.games}</td><td>${r.diff}</td><td>${r.bb}</td><td>${r.rb}</td></tr>`).join('')}</table></html>`;
  const raw=path.join(rawRoot,id+'.gz');writeFileSync(raw,gzipSync(html));
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,name,JSON.stringify({source:'ana-slo-ios-relay'}),'fixture','fixture');
  db.prepare('INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,date,'synthetic-native-html-v1',sha(html),sha(JSON.stringify(rows)),'valid',raw,'fixture','fixture');
  for(const [i,row] of rows.entries())db.prepare('INSERT INTO machine_day_data VALUES(?,?,?,?)').run(id,date,String(i).padStart(6,'0'),JSON.stringify(row));
  return {id,date,sizes,n:rows.length,rawBytes:Buffer.byteLength(html)};
}
try{
  const inputs=[seed('n58',[58]),seed('n60',[60]),seed('n120',[120]),seed('n1000',[120,120,120,120,120,120,120,120,40])];
  for(const input of inputs){
    globalThis.gc?.();
    const baseline=process.memoryUsage().rss;let peak=baseline,last=performance.now(),maxLoopLagMs=0;
    const timer=setInterval(()=>{const now=performance.now();maxLoopLagMs=Math.max(maxLoopLagMs,now-last-5);last=now;peak=Math.max(peak,process.memoryUsage().rss)},5);
    try{
      const start=performance.now(),result=await service.analyzeStoreDay({storeId:input.id,date:input.date}),elapsedMs=performance.now()-start;
      peak=Math.max(peak,process.memoryUsage().rss);assert.equal(result.supportedGroupsCompleted,true);assert.ok(result.groups.every(g=>g.result?.ok&&g.differenceReference?.available));assert.equal(result.cacheWarning,undefined);
      const cachedStart=performance.now(),cached=await service.analyzeStoreDay({storeId:input.id,date:input.date,allowCompute:false}),cachedElapsedMs=performance.now()-cachedStart;
      assert.equal(cached.ok,true);assert.equal(cached.computedAt,result.computedAt);
      cases.push({...input,elapsedMs,cachedElapsedMs,resultJsonBytes:Buffer.byteLength(JSON.stringify(result)),peakRssMiB:peak/1048576,incrementalRssMiB:(peak-baseline)/1048576,maxLoopLagMs,fullSensitivity:true,existingDifferenceReference:true,readOnlyCacheReused:true});
    }finally{clearInterval(timer)}
  }
  const evidence={kind:'synthetic-entire-read-worker-cache-benchmark',node:process.version,cpu:cpus()[0]?.model,logicalCpuCount:cpus().length,hostMemoryMiB:totalmem()/1048576,cpuAffinity:readOptional('/proc/self/status')?.match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1],cpuCgroup:readOptional('/sys/fs/cgroup/cpu.max'),memoryCgroup:readOptional('/sys/fs/cgroup/memory.max'),cases,limits:['Synthetic native HTML; not a production load benchmark','CPU affinity may be constrained externally; no claim of a hard 2GiB container limit','Observed RSS includes process worker threads; asynchronous sampling can miss a short peak','Performance does not establish statistical accuracy']};
  const output=process.argv[2]||'docs/development/store-day-allocation-20261017/performance-validation.json';writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');process.stdout.write(JSON.stringify(evidence)+'\n');
}finally{service.close();db.close();rmSync(dir,{recursive:true,force:true})}
