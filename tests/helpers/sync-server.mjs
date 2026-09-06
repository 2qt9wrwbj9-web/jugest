import fs from 'node:fs';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {makeBlobStore} from '../../api/_blob-store.js';
export function syncHarness(){
 const db=new Map(),calls=[];let seq=0;
 const client={async put(path,body,opts){if(db.has(path)&&!opts.allowOverwrite)throw Object.assign(Error('exists'),{status:409});const r={pathname:path,etag:`e${++seq}`,text:String(body)};db.set(path,r);return r},async get(path){const r=db.get(path);return r?{statusCode:200,blob:r,stream:new Blob([r.text]).stream()}:null},async list({prefix=""}){return {blobs:[...db.keys()].filter(k=>k.startsWith(prefix)).map(pathname=>({pathname}))}},async del(path){db.delete(path)}};
 const src=fs.readFileSync('api/_sync-web.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default','const handler =').replace(/export const /g,'const ');
 const handler=new Function('createBlobStore','createHash','randomBytes','timingSafeEqual',`${src}\nreturn handler;`)(name=>makeBlobStore(name,client),createHash,randomBytes,timingSafeEqual);
 async function fetch(url,opts){if(url!=='/api/sync')throw Error(`Unexpected endpoint ${url}`);calls.push(JSON.parse(opts.body));return handler(new Request('http://localhost/api/sync',opts))}
 return {db,calls,fetch};
}
