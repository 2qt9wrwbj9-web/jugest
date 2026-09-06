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
assert.throws(()=>functions('const placeholder=1;',['missing']));
const encoded=[0,1,2].map(i=>fs.readFileSync(`api/_relay-payload-${i}.js`,'utf8').split("'")[1]).join('');
const relay=gunzipSync(Buffer.from(encoded,'base64')).toString('utf8');
const names=['secureMatch','readBody','cleanupExpiredPairCodes','getChannel','authReceiver','authSender','firstActiveMessage','messageMeta','createPair','claimPair','pairStatus','validatePayload','collectorPush','collectorPull','collectorStatus','sendMessage','peekInbox','receiveMessage','ackMessage','unlink'];
const reference=functions(fs.readFileSync('tests/fixtures/legacy-netlify/functions/relay.mjs','utf8'),names);
const current=functions(relay,names);
for(const name of names)assert.equal(current[name],reference[name],`relay.${name} changed`);
// Device Sync's revision read/write path intentionally differs from the legacy server now.
// Its auth, validation, chunk transport, roundtrip, and concurrency behavior are guarded by
// vercel-native-backend, vercel-sync-chunk-*, sync-roundtrip, and vercel-sync-concurrency.
console.log('Actual decoded Relay: 20 core functions exact; Device Sync intentional backend changes are behavior-tested separately');
