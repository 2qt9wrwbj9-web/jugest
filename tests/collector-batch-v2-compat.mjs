import test from 'node:test';
import assert from 'node:assert/strict';
import * as relay from '../api/_relay-web.js';
import {instrumentedBlob} from './helpers/collector-blob.mjs';

const dateOf=value=>String(value?.date||value?.url||'').match(/(20\d{2}-\d{2}-\d{2})/)?.[1]||'';

test('V2 stays outside active V3 batch claims and keeps the 30-90 second cadence',async t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-07T00:00:00Z')});
  const blob=instrumentedBlob();
  const runtime=relay.createRelayRuntime({createStore:()=>blob.s,batch:true});
  const call=async body=>{
    const response=await runtime.default(new Request('https://preview.invalid/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    return {status:response.status,...await response.json()};
  };
  const creds=await call({action:'createIosCollector'});assert.equal(creds.status,200);
  const receiver={channelId:creds.channelId,receiverToken:creds.receiverToken};
  const sender={collectorKey:creds.collectorKey};
  const target=await call({action:'iosCollectorTargetUpsert',...receiver,url:'https://ana-slo.com/2026-09-06-batch-v2-compat-data/',shop:'batch v2 compat',startDate:'2026-09-06',priority:3});
  assert.equal(target.status,200,JSON.stringify(target));

  const batch=await call({action:'iosCollectorNextBatchV3',...sender});
  assert.equal(batch.state,'RUN');assert.equal(batch.jobs.length,5);
  const batchDates=new Set(batch.jobs.map(dateOf));
  const v2=await call({action:'iosCollectorNextV2',...sender});
  assert.equal(v2.state,'RUN');
  assert.ok(!batchDates.has(dateOf(v2)),`V2 must not claim a V3-owned date: ${dateOf(v2)}`);
  assert.ok(Number.isInteger(v2.waitSeconds));
  assert.ok(v2.waitSeconds>=30&&v2.waitSeconds<=90,`waitSeconds must stay in 30..90, got ${v2.waitSeconds}`);
});
