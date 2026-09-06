import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {makeBlobStore} from '../../api/_blob-store.js';
export function relayHarness(){
 const db=new Map(),calls=[];let n=0;
 const client={async put(path,body,opts){if(db.has(path)&&!opts.allowOverwrite)throw Object.assign(Error('already exists'),{status:409});const rec={text:String(body),etag:`e${++n}`,pathname:path};db.set(path,rec);return rec},async get(path){const v=db.get(path);return v?{statusCode:200,stream:new Blob([v.text]).stream(),blob:v}:null},async list({prefix=''}){return {blobs:[...db.keys()].filter(k=>k.startsWith(prefix)).map(pathname=>({pathname}))}},async del(path){db.delete(path)}};
 const encoded=[0,1,2].map(i=>fs.readFileSync(`api/_relay-payload-${i}.js`,'utf8').split("'")[1]).join('');
 const src=gunzipSync(Buffer.from(encoded,'base64')).toString('utf8');
 const mod=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual',src)(name=>makeBlobStore(name,client),createHash,randomBytes,randomInt,timingSafeEqual);
 async function fetch(url,opts){if(url!=='/api/relay')throw Error(`Unexpected endpoint ${url}`);calls.push(JSON.parse(opts.body));return mod.default(new Request('http://localhost/api/relay',opts));}
 async function call(body){const r=await fetch('/api/relay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json()}
 return {db,calls,fetch,call};
}
export const payload={format:'juggler-external-import-bulk',version:7,source:'ana-slo',sourceStoreId:'test-store',shop:'テスト店',days:[{date:'2026-09-01',machines:[{machine:'my',tableNo:'1',games:5000,bb:20,rb:18,diff:100}]}]};
