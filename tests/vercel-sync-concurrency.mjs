import assert from 'node:assert/strict';
import {syncHarness} from './helpers/sync-server.mjs';

const server=syncHarness();
const call=async body=>{
  const r=await server.fetch('/api/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
};
const {body:link}=await call({action:'create'});
const auth={syncId:link.syncId,authToken:link.authToken};
const payload=ct=>({v:1,zip:'none',iv:'abcdefghijklmnop',ct});
const canonicalKey=`jugest/juggler-device-sync-v1/sync/${link.syncId}`;
const revisionZero={...server.db.get(canonicalKey)};

const results=await Promise.all(['AAAA','BBBB'].map(ct=>call({...auth,action:'push',baseRevision:0,payload:payload(ct)})));
const statuses=results.map(x=>x.status).sort((a,b)=>a-b);
assert.deepEqual(statuses,[200,409],'exactly one concurrent writer must win revision 1');
const winner=results.find(x=>x.status===200),loser=results.find(x=>x.status===409);
assert.equal(winner.body.revision,1);
assert.equal(loser.body.code,'revision_conflict');
assert.equal(loser.body.revision,1);

let final=await call({...auth,action:'pull'});
assert.equal(final.status,200);
assert.equal(final.body.revision,1);
assert.ok(['AAAA','BBBB'].includes(final.body.payload.ct));
const winningCt=final.body.payload.ct;

// Simulate a function dying after the immutable revision claim but before the
// canonical head is updated. Pull must recover from the committed revision.
server.db.set(canonicalKey,revisionZero);
final=await call({...auth,action:'pull'});
assert.equal(final.status,200);
assert.equal(final.body.revision,1,'committed revision must repair a stale canonical head');
assert.equal(final.body.payload.ct,winningCt);

const next=await call({...auth,action:'push',baseRevision:1,payload:payload('CCCC')});
assert.equal(next.status,200);
assert.equal(next.body.revision,2);
final=await call({...auth,action:'pull'});
assert.equal(final.body.revision,2);
assert.equal(final.body.payload.ct,'CCCC');

console.log('PASS concurrent Device Sync: one writer wins, loser conflicts, and committed revision repairs stale head');
