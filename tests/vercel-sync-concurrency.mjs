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

const results=await Promise.all(['AAAA','BBBB'].map(ct=>call({...auth,action:'push',baseRevision:0,payload:payload(ct)})));
const statuses=results.map(x=>x.status).sort((a,b)=>a-b);
assert.deepEqual(statuses,[200,409],'exactly one concurrent writer must win revision 1');
const winner=results.find(x=>x.status===200);
const loser=results.find(x=>x.status===409);
assert.equal(winner.body.revision,1);
assert.equal(loser.body.code,'revision_conflict');
assert.equal(loser.body.revision,1);

const final=await call({...auth,action:'pull'});
assert.equal(final.status,200);
assert.equal(final.body.revision,1);
assert.ok(['AAAA','BBBB'].includes(final.body.payload.ct));

console.log('PASS concurrent Device Sync: one writer wins and one receives revision_conflict');
