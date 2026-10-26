// Internal maintenance functions only. No public endpoint exposes data/keys.
export async function sha256Text(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
const pageSize=n=>Math.min(500,Math.max(1,Math.trunc(Number(n)||100)));

// A missing immutable object can be restored only using exact bytes matching
// the checksum already committed beside its D1 pointer. Never choose an older
// value or rewrite a live reference, revision, timestamp, or existing object.
export async function restoreMissingRelayPayload({db,bucket,namespace,key,etag,text}){
 const row=await db.prepare('SELECT object_key,revision,value_sha256 FROM sites_relay_refs WHERE namespace=? AND key=?').bind(namespace,key).first();
 if(!row||`"r${row.revision}"`!==etag)throw Error('backup_reference_changed');
 if(!row.value_sha256)throw Error('backup_hash_unavailable');
 const value=String(text),hash=await sha256Text(value);
 if(hash!==row.value_sha256)throw Error('backup_hash_mismatch');
 const existing=await bucket.get(row.object_key);
 if(existing){if(await sha256Text(await existing.text())!==hash)throw Error('existing_object_hash_mismatch');return {restored:false,alreadyPresent:true}}
 const result=await bucket.put(row.object_key,value,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:hash}});
 if(!result){const raced=await bucket.get(row.object_key);if(!raced||await sha256Text(await raced.text())!==hash)throw Error('existing_object_hash_mismatch');return {restored:false,alreadyPresent:true}}
 return {restored:true,alreadyPresent:false};
}
export async function auditRelayReferences({db,bucket,limit=100,cursor=null}){
 const n=pageSize(limit),ns=cursor?.namespace??'',key=cursor?.key??'';
 const {results}=await db.prepare('SELECT namespace,key,object_key,revision,value_sha256 FROM sites_relay_refs WHERE namespace>? OR (namespace=? AND key>?) ORDER BY namespace,key LIMIT ?').bind(ns,ns,key,n+1).all();
 const references=[];
 for(const row of results.slice(0,n)){
  const object=await bucket.get(row.object_key);let status='missing';
  if(object)status=row.value_sha256?(await sha256Text(await object.text())===row.value_sha256?'verified':'hash_mismatch'):'hash_unavailable';
  references.push({namespace:row.namespace,key:row.key,objectKey:row.object_key,revision:row.revision,status});
 }
 const last=references.at(-1);
 return {references,cursor:results.length>n?{namespace:last.namespace,key:last.key}:null,destructive:false,snapshot:false};
}
// Unreferenced does not mean safe to delete: upload-before-publication and
// readers holding an older pointer race with this scan. This function only
// inventories; it intentionally provides no destructive option or GC endpoint.
export async function listUnreferencedRelayObjects({db,bucket,limit=100,cursor}){
 const page=await bucket.list({prefix:'sites-relay/',limit:pageSize(limit),...(cursor?{cursor}:{})}),objects=[];
 for(const object of page.objects){
  const row=await db.prepare('SELECT 1 AS referenced FROM sites_relay_refs WHERE object_key=? LIMIT 1').bind(object.key).first();
  objects.push({objectKey:object.key,size:object.size,referenced:!!row});
 }
 return {objects,cursor:page.truncated?page.cursor:null,destructive:false,snapshot:false};
}
