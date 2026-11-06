import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

// The original production source is executed unchanged except for its random
// dependency and resolving its relative imports from this in-memory module.
// No source validation, SQL, timing or business behavior is replaced.
let sourceEntropy;
const entropy=seed=>{
 let sequence=0;
 const bytes=size=>{const out=Buffer.alloc(size);for(let offset=0;offset<size;offset+=32)createHash('sha256').update(`${seed}:${sequence++}`).digest().copy(out,offset);return out};
 return {randomBytes:bytes,randomUUID:()=>{const x=bytes(16).toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`}};
};
sourceEntropy=entropy('initial');
const hook='__jugest_v18_access_original_entropy';
globalThis[hook]={createHash,randomBytes:size=>sourceEntropy.randomBytes(size),randomUUID:()=>sourceEntropy.randomUUID()};
const originalURL=new URL('../../vps/src/access/store.mjs',import.meta.url);
let originalText=readFileSync(originalURL,'utf8');
assert.ok(originalText.startsWith("import {createHash,randomBytes,randomUUID} from 'node:crypto';"));
originalText=originalText.replace("import {createHash,randomBytes,randomUUID} from 'node:crypto';",`const {createHash,randomBytes,randomUUID}=globalThis.${hook};`)
 .replace("'../db.mjs'",JSON.stringify(new URL('../db.mjs',originalURL).href))
 .replace("'./schema.mjs'",JSON.stringify(new URL('./schema.mjs',originalURL).href));
const {migrateAccessDatabase,createAccessStore}=await import(`data:text/javascript;base64,${Buffer.from(originalText+'\n//# sourceURL=jugest-original-access-store-v18.mjs').toString('base64')}`);
let createD1AccessCeremonyStore;
try{({createD1AccessCeremonyStore}=await import('../lib/access/d1-ceremonies.mjs'))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const require=createRequire(import.meta.url);
const plain=value=>value instanceof Uint8Array?Array.from(value):Array.isArray(value)?value.map(plain):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v)])):value;
const credential=(id='SYNTHETIC-STORAGE-ONLY')=>({webauthnId:id,publicKey:new Uint8Array([1,2,3,4]),counter:0,transports:['internal','hybrid'],deviceType:'multiDevice',backedUp:true});

async function setup(){
 assert.equal(typeof createD1AccessCeremonyStore,'function','independent ACCESS ceremony persistence is not implemented');
 let miniflare;try{miniflare=await import('miniflare')}catch{miniflare=await import(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare'))}
 const {Miniflare}=miniflare;
 const dir=mkdtempSync(join(tmpdir(),'jugest-v18-access-')),path=join(dir,'access.sqlite'),clock={value:1900000000000},now=()=>clock.value;
 sourceEntropy=entropy('migration');migrateAccessDatabase(path);const source=createAccessStore({dbPath:path,now});
 const mf=new Miniflare({modules:true,script:'export default{fetch(){return new Response("storage tests only")}}',compatibilityDate:'2026-05-15',d1Databases:{ACCESS:'dedicated-access-v18'},cf:false});
 try{
  const db=await mf.getD1Database('ACCESS'),tables=source.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for(const table of tables)await db.prepare(table.sql).run();
  for(const table of tables)for(const row of source.db.prepare(`SELECT * FROM ${table.name}`).all()){const keys=Object.keys(row);await db.prepare(`INSERT INTO ${table.name}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(k=>plain(row[k]))).run()}
  let destEntropy=entropy('initial'),sequence=0;
  const dest=await createD1AccessCeremonyStore({db,now,randomBytes:size=>destEntropy.randomBytes(size),randomUUID:()=>destEntropy.randomUUID()});
  const equalRows=async()=>{for(const {name} of tables){const expected=plain(source.db.prepare(`SELECT * FROM ${name} ORDER BY 1`).all()),actual=plain((await db.prepare(`SELECT * FROM ${name} ORDER BY 1`).all()).results);assert.deepEqual(actual,expected,`all persisted fields: ${name}`)}};
  async function pair(method,args=[],errorCode){
   const seed=`operation:${sequence++}`;sourceEntropy=entropy(seed);destEntropy=entropy(seed);
   let expected,sourceError;try{expected=source[method](...args)}catch(error){sourceError=error}
   if(errorCode){assert.ok(sourceError,`source ${method} rejects`);assert.match(sourceError.message,new RegExp(errorCode));await assert.rejects(dest[method](...args),new RegExp(errorCode));await equalRows();return}
   if(sourceError)throw sourceError;
   const actual=await dest[method](...args);assert.deepEqual(plain(actual),plain(expected),`${method} result`);await equalRows();return actual;
  }
  async function bootstrap(){const grant=await pair('issueEnrollment');return pair('registerCredential',[{enrollmentId:grant.id,credential:credential(),name:'  管理者端末  '}])}
  return {source,dest,db,clock,pair,bootstrap,equalRows,async close(){source.close();await mf.dispose();rmSync(dir,{recursive:true,force:true})}};
 }catch(error){source.close();await mf.dispose();rmSync(dir,{recursive:true,force:true});throw error}
}

// Removing the issuer check, grant consumption, audit, label validation or
// bootstrap replacement would change a complete SQLite/D1 persisted row.
test('enrollment creation replaces bootstrap grants and consumes registration exactly once',async()=>{
 const f=await setup();try{
  const first=await f.pair('issueEnrollment'),second=await f.pair('issueEnrollment',[{minutes:1}]);
  await f.pair('lookupEnrollment',[first.token]);assert.equal(await f.dest.lookupEnrollment(first.token),null);
  await f.pair('registerCredential',[{enrollmentId:first.id,credential:credential()}],'invalid_enrollment');
  const admin=await f.pair('registerCredential',[{enrollmentId:second.id,credential:credential(),name:'  primary  '}]);assert.equal(admin.name,'primary');
  await f.pair('registerCredential',[{enrollmentId:second.id,credential:credential('reused')}],'invalid_enrollment');
  await f.pair('issueEnrollment',[],'already_initialized');
  await f.pair('issueEnrollment',[{kind:'bogus'}],'invalid_enrollment_kind');
  await f.pair('issueEnrollment',[{minutes:0}],'invalid_duration');
  await f.pair('issueEnrollment',[{kind:'additional',createdBy:'missing'}],'credential_revoked');
  await f.pair('userID');await f.pair('listState');
 }finally{await f.close()}
});

test('additional enrollment enforces issuer revocation while recovery retains source grant rules',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap(),extra=await f.pair('issueEnrollment',[{kind:'additional',createdBy:admin.id}]),recovery=await f.pair('issueEnrollment',[{kind:'recovery'}]);
  await f.pair('registerCredential',[{enrollmentId:extra.id,credential:credential('bad-label'),name:'bad\0label'}],'invalid_label');
  await f.pair('registerCredential',[{enrollmentId:extra.id,credential:{webauthnId:'empty',publicKey:[]}}],'invalid_credential');
  await f.pair('revokeCredential',[admin.id,'operator']);await f.pair('lookupEnrollment',[extra.token]);
  await f.pair('registerCredential',[{enrollmentId:extra.id,credential:credential('revoked-issuer')}],'invalid_enrollment');
  await f.pair('registerCredential',[{enrollmentId:recovery.id,credential:credential('recovery'),name:'   '}]);
  const expires=await f.pair('issueEnrollment',[{kind:'recovery',minutes:1}]);f.clock.value=expires.expiresAt;
  await f.pair('lookupEnrollment',[expires.token]);await f.pair('registerCredential',[{enrollmentId:expires.id,credential:credential('expired')}],'invalid_enrollment');
 }finally{await f.close()}
});

test('duplicate credential rolls back enrollment consumption and audit insertion',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap(),grant=await f.pair('issueEnrollment',[{kind:'additional',createdBy:admin.id}]);
  await f.pair('registerCredential',[{enrollmentId:grant.id,credential:credential()}],'UNIQUE constraint failed');
  assert.ok(await f.pair('lookupEnrollment',[grant.token]));
  await f.pair('registerCredential',[{enrollmentId:grant.id,credential:credential('unique'),name:''}]);
 }finally{await f.close()}
});

test('admin session completion preserves counter, zero-counter, reauthentication and rollback rules',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap(),session=await f.pair('issueAdminSession',[admin.id]);
  assert.equal(session.expiresAt-session.createdAt,43200000);
  await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter:0}]);
  await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter:1}]);
  f.clock.value+=100;
  await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter:2,sessionId:session.id}]);
  for(const newCounter of [2,0,-1,1.5,Number.MAX_SAFE_INTEGER+1])await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter}],'invalid_authentication');
  await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter:3,sessionId:'missing'}],'invalid_authentication');
  await f.pair('revokeAdminSession',[session.id,'operator']);
  await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter:3,sessionId:session.id}],'invalid_authentication');
  const otherGrant=await f.pair('issueEnrollment',[{kind:'recovery'}]),other=await f.pair('registerCredential',[{enrollmentId:otherGrant.id,credential:credential('other')}]);
  const otherSession=await f.pair('issueAdminSession',[other.id]);
  await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter:3,sessionId:otherSession.id}],'invalid_authentication');
  f.clock.value=otherSession.expiresAt;
  await f.pair('completeAuthentication',[{credentialId:other.id,newCounter:1,sessionId:otherSession.id}],'invalid_authentication');
  await f.pair('revokeCredential',[admin.id,'operator']);await f.pair('issueAdminSession',[admin.id],'credential_revoked');
  await f.pair('completeAuthentication',[{credentialId:admin.id,newCounter:-1}],'credential_revoked');
 }finally{await f.close()}
});

test('invite creation and normalized redemption persist every field including null session expiry',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap();
  for(const viewerHours of [24,null]){
   const invite=await f.pair('issueInvite',[{createdBy:admin.id,label:'  閲覧用  ',redeemMinutes:1,viewerHours}]);
   assert.match(invite.code,/^JGST-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);assert.equal(invite.label,'閲覧用');
   const viewer=await f.pair('redeemInvite',[`  ${invite.code.toLowerCase()}  `]);assert.equal(viewer.expiresAt,viewerHours===null?null:f.clock.value+86400000);
   await f.pair('redeemInvite',[invite.code],'invalid_invite');await f.pair('authenticateViewer',[viewer.token]);
   await f.pair('revokeInvite',[invite.id,'operator']);await f.pair('authenticateViewer',[viewer.token]);
  }
  await f.pair('listState');
  for(const options of [{redeemMinutes:0},{redeemMinutes:1441},{viewerHours:0},{viewerHours:721},{viewerHours:1.5}])await f.pair('issueInvite',[{createdBy:admin.id,...options}],'invalid_duration');
  await f.pair('issueInvite',[{createdBy:admin.id,label:'bad\u007flabel'}],'invalid_label');
  await f.pair('redeemInvite',['invalid'],'invalid_invite');await f.pair('redeemInvite',[null],'invalid_invite');
 }finally{await f.close()}
});

test('invite expiry is strict and issuer revocation does not revoke existing source invitations',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap(),expired=await f.pair('issueInvite',[{createdBy:admin.id,redeemMinutes:1}]);
  f.clock.value=expired.redeemExpiresAt;await f.pair('redeemInvite',[expired.code],'invalid_invite');
  const revoked=await f.pair('issueInvite',[{createdBy:admin.id}]);await f.pair('revokeInvite',[revoked.id,'operator']);await f.pair('redeemInvite',[revoked.code],'invalid_invite');
  const existing=await f.pair('issueInvite',[{createdBy:admin.id,viewerHours:null}]);
  await f.pair('revokeCredential',[admin.id,'operator']);await f.pair('issueInvite',[{createdBy:admin.id}],'credential_revoked');
  // The original allows an already-issued invite after its issuer is revoked.
  const viewer=await f.pair('redeemInvite',[existing.code]);await f.pair('authenticateViewer',[viewer.token]);
  await f.pair('listState');
 }finally{await f.close()}
});

test('concurrent invite and enrollment consumers have exactly one durable winner',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap(),invite=await f.pair('issueInvite',[{createdBy:admin.id}]),grant=await f.pair('issueEnrollment',[{kind:'additional',createdBy:admin.id}]);
  const results=await Promise.allSettled(Array.from({length:8},()=>f.dest.redeemInvite(invite.code)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);for(const x of results.filter(x=>x.status==='rejected'))assert.match(x.reason.message,/invalid_invite/);
  assert.equal((await f.db.prepare('SELECT count(*) n FROM pia_viewer_sessions').first()).n,1);
  assert.equal((await f.db.prepare("SELECT count(*) n FROM access_audit_events WHERE event_type='pia_invite_redeemed'").first()).n,1);
  // Feed only the winning entropy back to the original store, then compare
  // all persisted fields against its single serialized successful operation.
  const viewer=results.find(x=>x.status==='fulfilled').value;
  sourceEntropy={randomBytes:()=>Buffer.from(viewer.token.slice(4),'base64url'),randomUUID:()=>viewer.id};
  assert.deepEqual(plain(f.source.redeemInvite(invite.code)),plain(viewer));await f.equalRows();
  const enrollments=await Promise.allSettled(Array.from({length:8},(_,i)=>f.dest.registerCredential({enrollmentId:grant.id,credential:credential(`parallel-${i}`)})));
  assert.equal(enrollments.filter(x=>x.status==='fulfilled').length,1);for(const x of enrollments.filter(x=>x.status==='rejected'))assert.match(x.reason.message,/invalid_enrollment/);
  assert.equal((await f.db.prepare('SELECT count(*) n FROM admin_credentials').first()).n,2);
  const index=enrollments.findIndex(x=>x.status==='fulfilled'),registered=enrollments[index].value;
  sourceEntropy={randomUUID:()=>registered.id};
  assert.deepEqual(plain(f.source.registerCredential({enrollmentId:grant.id,credential:credential(`parallel-${index}`)})),plain(registered));await f.equalRows();
  assert.equal((await f.db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await f.close()}
});

test('concurrent positive authentication counter cannot create duplicate sessions',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap(),both=await Promise.allSettled(Array.from({length:6},()=>f.dest.completeAuthentication({credentialId:admin.id,newCounter:1})));
  assert.equal(both.filter(x=>x.status==='fulfilled').length,1);for(const x of both.filter(x=>x.status==='rejected'))assert.match(x.reason.message,/invalid_authentication/);
  assert.equal((await f.db.prepare('SELECT counter FROM admin_credentials WHERE id=?').bind(admin.id).first()).counter,1);
  assert.equal((await f.db.prepare('SELECT count(*) n FROM admin_sessions').first()).n,1);
  assert.equal((await f.db.prepare("SELECT count(*) n FROM access_audit_events WHERE event_type='admin_session_started'").first()).n,1);
  const winner=both.find(x=>x.status==='fulfilled').value;
  sourceEntropy={randomBytes:()=>Buffer.from(winner.token.slice(4),'base64url'),randomUUID:()=>winner.id};
  assert.deepEqual(plain(f.source.completeAuthentication({credentialId:admin.id,newCounter:1})),plain(winner));await f.equalRows();
 }finally{await f.close()}
});

test('SQLite and D1 roll back grant, credential, counter and session writes on an audit persistence fault',async()=>{
 const f=await setup();try{
  const admin=await f.bootstrap(),grant=await f.pair('issueEnrollment',[{kind:'additional',createdBy:admin.id}]),invite=await f.pair('issueInvite',[{createdBy:admin.id}]);
  for(const [event,method,args] of [
   ['admin_credential_registered','registerCredential',[{enrollmentId:grant.id,credential:{webauthnId:'defaults-and-binary',publicKey:new Uint8Array([0,128,255])}}]],
   ['admin_session_started','completeAuthentication',[{credentialId:admin.id,newCounter:1}]],
   ['pia_session_started','redeemInvite',[invite.code]]
  ]){
   const sql=`CREATE TRIGGER storage_fault BEFORE INSERT ON access_audit_events WHEN NEW.event_type='${event}' BEGIN SELECT RAISE(ABORT,'synthetic_persistence_fault'); END`;
   f.source.db.exec(sql);await f.db.prepare(sql).run();
   await f.pair(method,args,'synthetic_persistence_fault');
   f.source.db.exec('DROP TRIGGER storage_fault');await f.db.prepare('DROP TRIGGER storage_fault').run();
   await f.pair(method,args);
  }
 }finally{await f.close()}
});

test('ceremony persistence rejects the analysis database rather than creating auth tables',async()=>{
 const f=await setup();try{
  await f.db.prepare('CREATE TABLE analysis_rows(id TEXT PRIMARY KEY)').run();
  await assert.rejects(createD1AccessCeremonyStore({db:f.db}),/dedicated_access_database_required/);
 }finally{await f.close()}
});
