import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {openDatabase} from '../src/db.mjs';
import {migrate} from '../src/schema.mjs';
import {spawnJobChild} from '../src/child-runner.mjs';
import {requestFeatureRefresh} from '../src/analysis/feature-refresh-state.mjs';
import {getResearchChampion} from '../src/analysis/research-cycle.mjs';
import {getActiveStoreModel} from '../src/research/store-read-output.mjs';

const NOW='2026-09-17T09:00:00.000Z';
const FEATURE_VERSION='store-features-v1';

function seed(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-pre-v2-initial-active-'));
  const dbPath=join(dir,'jugest.sqlite');
  const db=openDatabase(dbPath);migrate(db);
  db.prepare('INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','新規店舗','{}',NOW,NOW);
  for(let d=1;d<=12;d+=1){
    const date=`2026-08-${String(d).padStart(2,'0')}`;
    db.prepare(`INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`).run('s1',date,'fixture',`raw-${d}`,`norm-${d}`,`/tmp/${date}.gz`,NOW,NOW);
    for(let n=101;n<=105;n+=1){
      const tableNo=String(n),strong=tableNo.endsWith('5');
      const row={tableNo,sourceMachineName:'マイジャグラーV',machine:'my',category:'juggler',games:5000,bb:strong?24:18,rb:strong?22:16,diff:strong?1300:-150};
      db.prepare('INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(?,?,?,?)').run('s1',date,tableNo,JSON.stringify(row));
    }
  }
  return{dir,dbPath,db,cleanup(){try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})}};
}

function spawnAndWait({job,dbPath}){
  return new Promise((resolve,reject)=>{
    const messages=[];
    const timer=setTimeout(()=>reject(new Error('FEATURE_BUILD timeout')),15000);
    spawnJobChild({job,leaseMiB:896,heapMiB:512,workerPath:new URL('../src/jobs/feature-build.mjs',import.meta.url),childEnv:{JUGEST_DB_PATH:dbPath},onMessage:message=>{
      messages.push(message);
      if(message.type==='complete'){clearTimeout(timer);resolve(messages)}
    },onExit:code=>{
      if(code!==0&&messages.every(x=>x.type!=='complete')){clearTimeout(timer);reject(Object.assign(new Error(`FEATURE_BUILD exited ${code}`),{messages}))}
    }});
  });
}

test('fresh FEATURE_BUILD installs baseline as the initial Active Champion and publishes tomorrow PRE snapshot',async()=>{
  const f=seed();
  try{
    assert.equal(getActiveStoreModel(f.db,{storeId:'s1'}),null);
    const requested=requestFeatureRefresh(f.db,{storeId:'s1',featureVersion:FEATURE_VERSION,frontierDate:'2026-08-12',nowIso:NOW,dirty:true});
    const messages=await spawnAndWait({job:requested.job,dbPath:f.dbPath});
    const done=messages.find(x=>x.type==='complete');
    assert.ok(done?.researchJobId,'fresh store must enter research after feature build');
    assert.equal(done.storeReadTargetDate,'2026-08-13');

    const champion=getResearchChampion(f.db,{storeId:'s1'});
    const active=getActiveStoreModel(f.db,{storeId:'s1'});
    assert.ok(champion);assert.ok(active);
    assert.equal(active.fingerprint,champion.fingerprint,'initial Active must be the baseline incumbent, not a researched Challenger');
    assert.equal(active.featureVersion,FEATURE_VERSION);
    assert.equal(active.sourceFrontierDate,'2026-08-12');

    const snapshot=f.db.prepare("SELECT business_date,payload_json FROM client_snapshots WHERE store_id='s1' AND snapshot_type='store-read-active' AND version='store-read-v1'").get();
    assert.equal(snapshot.business_date,'2026-08-13');
    const payload=JSON.parse(snapshot.payload_json);
    assert.equal(payload.modelFingerprint,active.fingerprint);
    assert.equal(payload.asOfDate,'2026-08-12');
  }finally{f.cleanup()}
});
