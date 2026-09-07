import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRelayRuntime} from '../api/_relay-web.js';
import {instrumentedBlob,samplePage} from './helpers/collector-blob.mjs';

async function measure({legacy=false,cold=false}={}){
  const blob=instrumentedBlob();let runtime=createRelayRuntime({createStore:()=>blob.s,batch:!legacy&&!cold});
  const call=async body=>{const r=await runtime.default(new Request('https://preview.invalid/api/relay',{method:'POST',body:JSON.stringify(body)}));const x=await r.json();assert.equal(r.status,200,JSON.stringify(x));return x};
  const c=await call({action:'createIosCollector'}),date=new Date(Date.now()+9*3600000-86400000).toISOString().slice(0,10);
  await call({action:'iosCollectorTargetUpsert',channelId:c.channelId,receiverToken:c.receiverToken,url:`https://ana-slo.com/${date}-operations-store-data/`,shop:'operations store',startDate:date});
  if(cold)runtime=createRelayRuntime({createStore:()=>blob.s});
  blob.reset();let results;
  if(legacy){
    for(let i=0;i<5;i++){
      const j=await call({action:'iosCollectorNextV2',collectorKey:c.collectorKey});
      await call({action:'iosCollectorPushV2',collectorKey:c.collectorKey,jobToken:j.jobToken,text:samplePage(j.url.match(/\/(20\d{2}-\d{2}-\d{2})-/)[1],'operations store'),fetchUrl:j.url});
    }
  }else{
    const b=await call({action:'iosCollectorNextBatchV3',collectorKey:c.collectorKey});
    assert.equal(b.jobs.length,5);
    results=b.jobs.map(j=>({jobToken:j.jobToken,text:samplePage(j.date,j.shop),fetchUrl:j.url}));
    const p=await call({action:'iosCollectorPushBatchV3',collectorKey:c.collectorKey,batchId:b.batchId,results});assert.equal(p.saved,5);
  }
  const counts=blob.counts();
  const bytes={snapshot:0,payloadPacks:0};for(const [k,v] of blob.db){if(k.includes('collector-state-v3/'))bytes.snapshot+=Buffer.byteLength(v.text);if(k.includes('collector-pack-v3/'))bytes.payloadPacks+=Buffer.byteLength(v.text)}
  return{counts,bytes,requestBytes:results?Buffer.byteLength(JSON.stringify(results)):null};
}
const legacy=await measure({legacy:true}),batch=await measure(),coldMigration=await measure({cold:true});
assert.equal(legacy.counts.advanced,50);assert.deepEqual(batch.counts,{get:2,put:3,list:0,delete:0,advanced:3});
const report={
  unit:'SDK operations; Advanced equivalent = put + list; no multipart, conflicts or SDK network retries in steady state',
  fixture:'One channel, one store, five missing dates, ten machine rows per date. Same unmodified parser and sample content.',
  legacy,batch,coldMigration,reductionPercent:(1-batch.counts.advanced/legacy.counts.advanced)*100,
  averagePerFetchedDay:batch.counts.advanced/5,
  backfill365Days:[1,2,3].map(stores=>({stores,days:365*stores,batches:Math.ceil(365*stores/5),advanced:Math.ceil(365*stores/5)*batch.counts.advanced})),
  dailyOnlyAfterBackfill:[1,2,3].map(stores=>({stores,daysPerDailyBatch:stores,annualAdvanced:365*3})),
  exclusions:['initial configuration','initial migration lists/reads','contention and failed writes','failed/retried pages','manual force and cleanup','new local coverage sync','dashboard activity','real SDK internal retries'],
  calendar:'The actual inclusive calendar-year window contains 366 or 367 dates. Above estimates deliberately use the requested 365 days.',
  realBlobVerified:false
};
console.log(JSON.stringify(report,null,2));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
