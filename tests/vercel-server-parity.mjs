import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
// Inspect actual declarations. The old scanner returned null for both sides
// and inspected the packed loader rather than its payload.
function functions(src,names){
 const body=src.replace(/^import .*;\r?\n/gm,'').replace('export default','const defaultHandler =').replace(/export const /g,'const ').replace('return {default:defaultHandler,config,__test};','');
 const values=new Function(`${body}\nreturn {${names.join(',')}};`)();
 return Object.fromEntries(names.map(n=>{assert.equal(typeof values[n],'function',`${n} missing`);return[n,values[n].toString()]}));
}
const compact=s=>s.replace(/\s+/g,'');
assert.throws(()=>functions('const placeholder=1;',['missing']));
const encoded=[0,1,2].map(i=>fs.readFileSync(`api/_relay-payload-${i}.js`,'utf8').split("'")[1]).join('');
const relay=gunzipSync(Buffer.from(encoded,'base64')).toString('utf8');
const sets={relay:['secureMatch','readBody','cleanupExpiredPairCodes','getChannel','authReceiver','authSender','firstActiveMessage','messageMeta','createPair','claimPair','pairStatus','validatePayload','collectorPush','collectorPull','collectorStatus','sendMessage','peekInbox','receiveMessage','ackMessage','unlink'],sync:['secureMatch','readBody','validSyncId','validPayload','authenticate']};
for(const [kind,names] of Object.entries(sets)){
 const reference=functions(fs.readFileSync(`tests/fixtures/legacy-netlify/functions/${kind}.mjs`,'utf8'),names);
 const current=functions(kind==='relay'?relay:fs.readFileSync('api/_sync-web.js','utf8'),names);
 for(const name of names){
   if(kind==='sync')assert.equal(compact(current[name]),compact(reference[name]),`${kind}.${name} changed beyond formatting`);
   else assert.equal(current[name],reference[name],`${kind}.${name} changed`);
 }
}
console.log('Actual decoded functions: 20 Relay exact + 5 unchanged Sync security/validation functions preserved; revision-write functions covered by concurrency regressions');
