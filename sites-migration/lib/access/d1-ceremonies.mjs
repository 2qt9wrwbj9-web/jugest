// Persistence after a trusted caller verifies WebAuthn. This module does not
// verify attestation/assertion signatures, expose HTTP routes, or create a DB.
import {ACCESS_LIMITS,duration,label,normalizeCode} from './generated-primitives.mjs';
import {createD1AccessSessionStore} from './d1-sessions.mjs';

const error=code=>{throw Object.assign(new Error(code),{code})};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value??'')))),x=>x.toString(16).padStart(2,'0')).join('');
const defaultBytes=size=>crypto.getRandomValues(new Uint8Array(size));
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const enrollmentSQL=`SELECT t.* FROM admin_enrollment_tokens t LEFT JOIN admin_credentials c ON c.id=t.created_by
 WHERE t.id=? AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>?
 AND (t.kind!='additional' OR (c.id IS NOT NULL AND c.revoked_at IS NULL))`;

export async function createD1AccessCeremonyStore({db,now=Date.now,randomBytes=defaultBytes,randomUUID=()=>crypto.randomUUID()}={}){
 // Reuse the dedicated-table and source schema-v2 checks. Never initialize or
 // migrate the analytical database through an authentication store.
 const sessions=await createD1AccessSessionStore({db,now});
 const timestamp=()=>Number(now()),secret=prefix=>prefix+base64url(randomBytes(32));
 const statement=(sql,...values)=>db.prepare(sql).bind(...values);
 const audit=(type,actor,target,at)=>statement('INSERT INTO access_audit_events(event_type,actor,target,created_at) VALUES(?,?,?,?)',type,actor??null,target??null,at);
 const credentialActive=id=>statement('SELECT * FROM admin_credentials WHERE id=? AND revoked_at IS NULL',id).first();
 const enrollmentActive=(id,at)=>statement(enrollmentSQL,id,at).first();
 // D1 batch() is transactional. A failing SQL assertion rolls back every write
 // in the batch, including grant/counter consumption and audit inserts. The
 // condition is reevaluated inside the batch; preflight reads alone are unsafe.
 const guard=(condition,...values)=>statement(`SELECT json(CASE WHEN (${condition}) THEN 'null' ELSE '!' END) AS access_guard`,...values);
 async function batch(statements,code){
  try{return await db.batch(statements)}catch(cause){
   if(/malformed JSON/i.test(cause.message))error(typeof code==='function'?await code():code);
   throw cause;
  }
 }
 const grantGuard=(id,at)=>guard(`EXISTS(SELECT 1 FROM (${enrollmentSQL}) t WHERE t.kind!='bootstrap' OR NOT EXISTS(SELECT 1 FROM admin_credentials))`,id,at);
 const activeGuard=id=>guard('EXISTS(SELECT 1 FROM admin_credentials WHERE id=? AND revoked_at IS NULL)',id);

 async function issueEnrollment({kind='bootstrap',createdBy=null,minutes=15}={}){
  if(!['bootstrap','additional','recovery'].includes(kind))error('invalid_enrollment_kind');
  duration(minutes,1,30);
  if(kind==='bootstrap'&&(await statement('SELECT COUNT(*) n FROM admin_credentials').first()).n)error('already_initialized');
  if(kind==='additional'&&!await credentialActive(createdBy))error('credential_revoked');
  const token=secret('JGA_'),id=randomUUID(),createdAt=timestamp(),expiresAt=createdAt+minutes*60000,operations=[];
  if(kind==='bootstrap')operations.push(guard('NOT EXISTS(SELECT 1 FROM admin_credentials)'),statement("UPDATE admin_enrollment_tokens SET revoked_at=? WHERE kind='bootstrap' AND used_at IS NULL AND revoked_at IS NULL",createdAt));
  if(kind==='additional')operations.push(activeGuard(createdBy));
  operations.push(statement('INSERT INTO admin_enrollment_tokens(id,kind,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?)',id,kind,await digest(token),createdBy,createdAt,expiresAt),audit('admin_enrollment_issued',createdBy??'cli',id,createdAt));
  await batch(operations,kind==='bootstrap'?'already_initialized':'credential_revoked');
  return {id,token,createdAt,expiresAt};
 }

 async function registerCredential({enrollmentId,credential,name='管理者端末'}={}){
  const credentialName=label(name)||'管理者端末';
  if(!credential?.webauthnId||!credential.publicKey?.length)error('invalid_credential');
  const grant=await enrollmentActive(enrollmentId,timestamp());if(!grant)error('invalid_enrollment');
  if(grant.kind==='bootstrap'&&(await statement('SELECT COUNT(*) n FROM admin_credentials').first()).n)error('invalid_enrollment');
  const id=randomUUID(),createdAt=timestamp();
  await batch([
   grantGuard(enrollmentId,createdAt),
   statement('UPDATE admin_enrollment_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?',createdAt,enrollmentId,createdAt),
   statement(`INSERT INTO admin_credentials(id,name,webauthn_id,public_key,counter,transports_json,device_type,backed_up,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,id,credentialName,credential.webauthnId,Array.from(credential.publicKey),credential.counter??0,JSON.stringify(credential.transports??[]),credential.deviceType??'unknown',credential.backedUp?1:0,createdAt),
   audit('admin_credential_registered',grant.created_by??'cli',id,createdAt)
  ],'invalid_enrollment');
  return {id,name:credentialName,createdAt};
 }

 async function issueAdminSession(credentialId){
  if(!await credentialActive(credentialId))error('credential_revoked');
  const token=secret('JGS_'),id=randomUUID(),createdAt=timestamp(),expiresAt=createdAt+ACCESS_LIMITS.adminMs;
  await batch([
   activeGuard(credentialId),
   statement('INSERT INTO admin_sessions(id,credential_id,session_hash,created_at,expires_at,authenticated_at,last_used_at) VALUES(?,?,?,?,?,?,?)',id,credentialId,await digest(token),createdAt,expiresAt,createdAt,createdAt),
   audit('admin_session_started',credentialId,id,createdAt)
  ],'credential_revoked');
  return {id,token,credentialId,createdAt,expiresAt,authenticatedAt:createdAt};
 }

 async function completeAuthentication({credentialId,newCounter,sessionId=null}){
  const credential=await credentialActive(credentialId);if(!credential)error('credential_revoked');
  if(!Number.isSafeInteger(newCounter)||newCounter<0||(credential.counter>0&&newCounter<=credential.counter))error('invalid_authentication');
  const at=timestamp(),operations=[guard('EXISTS(SELECT 1 FROM admin_credentials WHERE id=? AND revoked_at IS NULL AND (counter<=0 OR counter<?))',credentialId,newCounter)];
  const failure=async()=>await credentialActive(credentialId)?'invalid_authentication':'credential_revoked';
  operations.push(statement('UPDATE admin_credentials SET counter=?,last_used_at=? WHERE id=?',newCounter,at,credentialId));
  if(sessionId){
   operations.push(guard('EXISTS(SELECT 1 FROM admin_sessions WHERE id=? AND credential_id=? AND revoked_at IS NULL AND expires_at>?)',sessionId,credentialId,at),statement('UPDATE admin_sessions SET authenticated_at=? WHERE id=?',at,sessionId),audit('admin_reauthenticated',credentialId,sessionId,at),statement('SELECT expires_at FROM admin_sessions WHERE id=?',sessionId));
   const result=await batch(operations,failure);
   return {id:sessionId,authenticatedAt:at,expiresAt:result.at(-1).results[0].expires_at};
  }
  const token=secret('JGS_'),id=randomUUID(),createdAt=timestamp(),expiresAt=createdAt+ACCESS_LIMITS.adminMs;
  operations.push(statement('INSERT INTO admin_sessions(id,credential_id,session_hash,created_at,expires_at,authenticated_at,last_used_at) VALUES(?,?,?,?,?,?,?)',id,credentialId,await digest(token),createdAt,expiresAt,createdAt,createdAt),audit('admin_session_started',credentialId,id,createdAt));
  await batch(operations,failure);
  return {id,token,credentialId,createdAt,expiresAt,authenticatedAt:createdAt};
 }

 async function issueInvite({createdBy,label:rawLabel='',redeemMinutes=30,viewerHours=24}={}){
  duration(redeemMinutes,1,1440);if(viewerHours!==null)duration(viewerHours,1,720);
  if(!await credentialActive(createdBy))error('credential_revoked');
  const memo=label(rawLabel),code='JGST-'+Array.from(randomBytes(16),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{4}/g).join('-');
  const id=randomUUID(),createdAt=timestamp(),redeemExpiresAt=createdAt+redeemMinutes*60000;
  await batch([
   activeGuard(createdBy),
   statement('INSERT INTO pia_access_invites(id,label,token_hash,created_by,created_at,redeem_expires_at,viewer_session_duration) VALUES(?,?,?,?,?,?,?)',id,memo,await digest(code),createdBy,createdAt,redeemExpiresAt,viewerHours===null?null:viewerHours*3600000),
   audit('pia_invite_issued',createdBy,id,createdAt)
  ],'credential_revoked');
  return {id,code,label:memo,createdAt,redeemExpiresAt,viewerHours};
 }

 async function redeemInvite(raw){
  const code=normalizeCode(raw);if(!/^JGST-(?:[0-9A-F]{4}-){7}[0-9A-F]{4}$/.test(code))error('invalid_invite');
  const at=timestamp(),hash=await digest(code),invite=await statement('SELECT * FROM pia_access_invites WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND redeem_expires_at>?',hash,at).first();
  if(!invite)error('invalid_invite');
  const token=secret('JGV_'),id=randomUUID(),expiresAt=invite.viewer_session_duration===null?null:at+invite.viewer_session_duration;
  await batch([
   // Do not add an issuer-active check: the fixed source permits redemption of
   // an existing invite after credential revocation, unless that invite is revoked.
   guard('EXISTS(SELECT 1 FROM pia_access_invites WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND redeem_expires_at>?)',invite.id,at),
   statement('UPDATE pia_access_invites SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND redeem_expires_at>?',at,invite.id,at),
   statement('INSERT INTO pia_viewer_sessions(id,invite_id,session_hash,created_at,expires_at,last_used_at) VALUES(?,?,?,?,?,?)',id,invite.id,await digest(token),at,expiresAt,at),
   audit('pia_invite_redeemed','viewer',invite.id,at),audit('pia_session_started','viewer',id,at)
  ],'invalid_invite');
  return {id,token,label:invite.label,createdAt:at,expiresAt};
 }

 async function listState(){
  const at=timestamp(),result=await db.batch([
   statement('SELECT id,name,created_at,last_used_at,revoked_at,device_type,backed_up FROM admin_credentials ORDER BY created_at DESC'),
   statement(`SELECT i.id,i.label,i.created_at,i.redeem_expires_at,i.used_at,i.revoked_at,i.viewer_session_duration FROM pia_access_invites i
    WHERE (i.revoked_at IS NULL AND ((i.used_at IS NULL AND i.redeem_expires_at>?) OR EXISTS(
     SELECT 1 FROM pia_viewer_sessions s WHERE s.invite_id=i.id AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>?))))
     OR i.id IN (SELECT id FROM pia_access_invites ORDER BY created_at DESC LIMIT 200) ORDER BY i.created_at DESC`,at,at),
   statement(`SELECT s.id,s.created_at,s.expires_at,s.last_used_at,s.revoked_at,i.label FROM pia_viewer_sessions s JOIN pia_access_invites i ON i.id=s.invite_id
    WHERE (s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>?) AND i.revoked_at IS NULL)
     OR s.id IN (SELECT id FROM pia_viewer_sessions ORDER BY created_at DESC LIMIT 200) ORDER BY s.created_at DESC`,at)
  ]);
  return {credentials:result[0].results,invites:result[1].results.map(row=>({...row,status:row.revoked_at!=null?'revoked':row.used_at!=null?'used':row.redeem_expires_at<=at?'expired':'unused'})),sessions:result[2].results.map(row=>({...row,status:row.revoked_at!=null?'revoked':row.expires_at!=null&&row.expires_at<=at?'expired':'active'}))};
 }
 return {...sessions,issueEnrollment,registerCredential,issueAdminSession,completeAuthentication,issueInvite,redeemInvite,listState,
  userID:async()=> (await statement("SELECT value FROM access_meta WHERE key='user_id'").first())?.value};
}
