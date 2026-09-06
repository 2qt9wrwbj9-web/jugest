// Read/write race characterization: isolated fake Blob, actual production API.
// Exit 0 means the known risk was REPRODUCED, not that sync is concurrency-safe.
import assert from 'node:assert/strict';
import {syncHarness} from '../tests/helpers/sync-server.mjs';
const server=syncHarness();
const call=async body=>{const r=await server.fetch('/api/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
const {body:link}=await call({action:'create'});
const auth={syncId:link.syncId,authToken:link.authToken};
const payload=ct=>({v:1,zip:'none',iv:'abcdefghijklmnop',ct});
const results=await Promise.all(['AAAA','BBBB'].map(ct=>call({...auth,action:'push',baseRevision:0,payload:payload(ct)})));
const final=await call({...auth,action:'pull'});
assert.deepEqual(results.map(x=>x.status),[200,200]);
assert.deepEqual(results.map(x=>x.body.revision),[1,1]);
assert.ok(['AAAA','BBBB'].includes(final.body.payload.ct));
console.log(JSON.stringify({finding:'P0-UNFIXED concurrent sync pushes both succeed at revision 1; only one payload remains',responses:results.map(x=>({status:x.status,revision:x.body.revision})),finalRevision:final.body.revision,survivingPayload:final.body.payload.ct,cloudAccess:false},null,2));
