// Storage boundary for original JUGEST namespaces; no unauthenticated endpoint.
import {sha256Text} from './recovery.mjs';
const etag=revision=>`"r${revision}"`;
function conflict(){return Object.assign(new Error('relay store ETag precondition failed'),{status:412,statusCode:412,code:'precondition_failed'})}
export function createSitesRelayStore(name,{db,bucket,root='jugest'}={}){
 const n=String(name||'').trim(),r=String(root||'jugest').trim()||'jugest';
 if(!n)throw new TypeError('relay store name is required');
 if(!db?.prepare||!bucket?.put||!bucket?.get)throw new TypeError('D1 and R2 bindings required');
 const namespace=`${r}/${n}`;
 async function set(key,value,options={}){
  const k=String(key??''),text=String(value??''),objectKey=`sites-relay/${crypto.randomUUID()}`,now=Date.now();
  // Upload immutable bytes first. Failed or losing publications leave unreachable
  // objects, never a visible pointer to an incomplete upload. Do not eagerly
  // delete previous objects: an in-flight reader may already hold that pointer.
  const hash=await sha256Text(text);
  await bucket.put(objectKey,text,{customMetadata:{sha256:hash}});
  let sql,bindings;
  if(options.onlyIfNew===true){
   sql='INSERT INTO sites_relay_refs(namespace,key,object_key,value_sha256,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(namespace,key) DO NOTHING RETURNING revision';bindings=[namespace,k,objectKey,hash,now];
  }else if(options.ifMatch){
   const match=String(options.ifMatch).match(/^"r([1-9][0-9]*)"$/);if(!match)throw conflict();
   sql='UPDATE sites_relay_refs SET object_key=?,value_sha256=?,revision=revision+1,updated_at=? WHERE namespace=? AND key=? AND revision=? RETURNING revision';bindings=[objectKey,hash,now,namespace,k,Number(match[1])];
  }else{
   sql='INSERT INTO sites_relay_refs(namespace,key,object_key,value_sha256,revision,updated_at) VALUES(?,?,?,?,1,?) ON CONFLICT(namespace,key) DO UPDATE SET object_key=excluded.object_key,value_sha256=excluded.value_sha256,revision=sites_relay_refs.revision+1,updated_at=excluded.updated_at RETURNING revision';bindings=[namespace,k,objectKey,hash,now];
  }
  const row=await db.prepare(sql).bind(...bindings).first();
  if(!row){if(options.onlyIfNew===true)return {modified:false};throw conflict()}
  return {modified:true,etag:etag(row.revision)};
 }
 async function read(key){
  const row=await db.prepare('SELECT object_key,value_sha256,revision,updated_at FROM sites_relay_refs WHERE namespace=? AND key=?').bind(namespace,String(key??'')).first();
  if(!row)return null;
  const object=await bucket.get(row.object_key);if(!object)throw new Error('relay_payload_missing');
  const text=await object.text();
  if(row.value_sha256&&await sha256Text(text)!==row.value_sha256)throw new Error('relay_payload_hash_mismatch');
  return {...row,text};
 }
 async function get(key,options={}){const row=await read(key);if(!row)return null;if(options.type==='json'){if(!row.text)return null;try{return JSON.parse(row.text)}catch{return null}}return row.text}
 async function getWithMetadata(key){const row=await read(key);return row?{value:JSON.parse(row.text),etag:etag(row.revision)}:null}
 async function list({prefix=''}={}){const p=String(prefix??'');const {results}=await db.prepare('SELECT key,revision,updated_at FROM sites_relay_refs WHERE namespace=? AND substr(key,1,?)=? ORDER BY key ASC').bind(namespace,p.length,p).all();return {blobs:results.map(row=>({key:row.key,pathname:row.key,etag:etag(row.revision),uploadedAt:new Date(Number(row.updated_at)||0).toISOString()}))}}
 async function del(key){await db.prepare('DELETE FROM sites_relay_refs WHERE namespace=? AND key=?').bind(namespace,String(key??'')).run()}
 return {set,setJSON:(key,value,options={})=>set(key,JSON.stringify(value),options),get,getWithMetadata,list,delete:del,_namespace:namespace};
}
