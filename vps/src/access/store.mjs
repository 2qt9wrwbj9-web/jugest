import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,openSync,closeSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {openDatabase} from '../db.mjs';
import {migrateAccess} from './schema.mjs';

export const ACCESS_LIMITS=Object.freeze({adminMs:43200000,freshMs:300000,ceremonyMs:300000,enrollmentMs:900000});
export const digest=value=>createHash('sha256').update(String(value??'')).digest('hex');
const secret=prefix=>prefix+randomBytes(32).toString('base64url');
const error=code=>{throw new Error(code)};
function duration(value,min,max){if(!Number.isInteger(value)||value<min||value>max)error('invalid_duration');return value}
function label(value){if(typeof value!=='string'||value.length>80||/[\u0000-\u001f\u007f]/.test(value))error('invalid_label');return value.trim()}
function normalizeCode(value){return typeof value==='string'?value.trim().toUpperCase():''}
function openAccessDatabase(dbPath){
  const db=openDatabase(dbPath);
  // Persist one-use consumption and revocations across power loss, including WAL commits.
  db.exec('PRAGMA synchronous=FULL;');
  return db;
}

export function migrateAccessDatabase(dbPath){
  if(typeof dbPath!=='string'||!dbPath||dbPath===':memory:')error('access_database_path_required');
  mkdirSync(dirname(dbPath),{recursive:true,mode:0o750});
  if(!existsSync(dbPath))closeSync(openSync(dbPath,'wx',0o600));
  const db=openAccessDatabase(dbPath);
  try{
    migrateAccess(db);
    db.prepare('INSERT OR IGNORE INTO access_meta(key,value) VALUES(?,?)').run('user_id',randomBytes(32).toString('base64url'));
    chmodSync(dbPath,0o600);
  }finally{db.close()}
}

export function createAccessStore({dbPath,now=Date.now}={}){
  if(!existsSync(dbPath))error('access_migration_required');
  const db=openAccessDatabase(dbPath);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)!==2){db.close();error('access_migration_required')}
  const timestamp=()=>Number(now());
  const audit=(type,actor,target)=>db.prepare('INSERT INTO access_audit_events(event_type,actor,target,created_at) VALUES(?,?,?,?)').run(type,actor??null,target??null,timestamp());
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
  const credentialActive=id=>db.prepare('SELECT * FROM admin_credentials WHERE id=? AND revoked_at IS NULL').get(id);
  const enrollmentActive=id=>db.prepare(`SELECT t.* FROM admin_enrollment_tokens t LEFT JOIN admin_credentials c ON c.id=t.created_by
    WHERE t.id=? AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>?
    AND (t.kind!='additional' OR (c.id IS NOT NULL AND c.revoked_at IS NULL))`).get(id,timestamp());
  function issueEnrollment({kind='bootstrap',createdBy=null,minutes=15}={}){
    if(!['bootstrap','additional','recovery'].includes(kind))error('invalid_enrollment_kind');
    duration(minutes,1,30);
    return transaction(()=>{
      if(kind==='bootstrap'&&db.prepare('SELECT COUNT(*) n FROM admin_credentials').get().n)error('already_initialized');
      if(kind==='additional'&&!credentialActive(createdBy))error('credential_revoked');
      const token=secret('JGA_'),id=randomUUID(),createdAt=timestamp(),expiresAt=createdAt+minutes*60000;
      if(kind==='bootstrap')db.prepare("UPDATE admin_enrollment_tokens SET revoked_at=? WHERE kind='bootstrap' AND used_at IS NULL AND revoked_at IS NULL").run(createdAt);
      db.prepare('INSERT INTO admin_enrollment_tokens(id,kind,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?)').run(id,kind,digest(token),createdBy,createdAt,expiresAt);
      audit('admin_enrollment_issued',createdBy??'cli',id);
      return {id,token,createdAt,expiresAt};
    });
  }
  function lookupEnrollment(token){
    if(typeof token!=='string'||!/^JGA_[A-Za-z0-9_-]{43}$/.test(token))return null;
    const row=db.prepare('SELECT id FROM admin_enrollment_tokens WHERE token_hash=?').get(digest(token));
    return row?enrollmentActive(row.id)??null:null;
  }
  function registerCredential({enrollmentId,credential,name='管理者端末'}={}){
    const credentialName=label(name)||'管理者端末';
    if(!credential?.webauthnId||!credential.publicKey?.length)error('invalid_credential');
    return transaction(()=>{
      const grant=enrollmentActive(enrollmentId);if(!grant)error('invalid_enrollment');
      if(grant.kind==='bootstrap'&&db.prepare('SELECT COUNT(*) n FROM admin_credentials').get().n)error('invalid_enrollment');
      const id=randomUUID(),createdAt=timestamp();
      const used=db.prepare('UPDATE admin_enrollment_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').run(createdAt,enrollmentId,createdAt);
      if(used.changes!==1)error('invalid_enrollment');
      db.prepare(`INSERT INTO admin_credentials(id,name,webauthn_id,public_key,counter,transports_json,device_type,backed_up,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(id,credentialName,credential.webauthnId,Buffer.from(credential.publicKey),credential.counter??0,JSON.stringify(credential.transports??[]),credential.deviceType??'unknown',credential.backedUp?1:0,createdAt);
      audit('admin_credential_registered',grant.created_by??'cli',id);
      return {id,name:credentialName,createdAt};
    });
  }
  function issueAdminSession(credentialId){
    if(!credentialActive(credentialId))error('credential_revoked');
    const token=secret('JGS_'),id=randomUUID(),createdAt=timestamp(),expiresAt=createdAt+ACCESS_LIMITS.adminMs;
    db.prepare('INSERT INTO admin_sessions(id,credential_id,session_hash,created_at,expires_at,authenticated_at,last_used_at) VALUES(?,?,?,?,?,?,?)').run(id,credentialId,digest(token),createdAt,expiresAt,createdAt,createdAt);
    audit('admin_session_started',credentialId,id);
    return {id,token,credentialId,createdAt,expiresAt,authenticatedAt:createdAt};
  }
  function authenticateAdmin(token){
    if(typeof token!=='string'||!/^JGS_[A-Za-z0-9_-]{43}$/.test(token))return null;
    const row=db.prepare(`SELECT s.*,c.name FROM admin_sessions s JOIN admin_credentials c ON c.id=s.credential_id
      WHERE s.session_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND c.revoked_at IS NULL`).get(digest(token),timestamp());
    if(!row)return null;
    db.prepare('UPDATE admin_sessions SET last_used_at=? WHERE id=?').run(timestamp(),row.id);
    return {kind:'admin',id:row.id,credentialId:row.credential_id,name:row.name,expiresAt:row.expires_at,authenticatedAt:row.authenticated_at};
  }
  function revokeAdminSession(id,actor){
    db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(timestamp(),id);
    audit('admin_session_revoked',actor,id);
  }
  function completeAuthentication({credentialId,newCounter,sessionId=null}){
    return transaction(()=>{
      const credential=credentialActive(credentialId);if(!credential)error('credential_revoked');
      if(!Number.isSafeInteger(newCounter)||newCounter<0||(credential.counter>0&&newCounter<=credential.counter))error('invalid_authentication');
      const now=timestamp();
      db.prepare('UPDATE admin_credentials SET counter=?,last_used_at=? WHERE id=?').run(newCounter,now,credentialId);
      if(!sessionId)return issueAdminSession(credentialId);
      const session=db.prepare('SELECT * FROM admin_sessions WHERE id=? AND credential_id=? AND revoked_at IS NULL AND expires_at>?').get(sessionId,credentialId,now);
      if(!session)error('invalid_authentication');
      db.prepare('UPDATE admin_sessions SET authenticated_at=? WHERE id=?').run(now,sessionId);
      audit('admin_reauthenticated',credentialId,sessionId);
      return {id:sessionId,authenticatedAt:now,expiresAt:session.expires_at};
    });
  }
  function revokeCredential(id,actor){
    return transaction(()=>{
      if(!db.prepare('SELECT id FROM admin_credentials WHERE id=?').get(id))error('not_found');
      const now=timestamp();
      db.prepare('UPDATE admin_credentials SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(now,id);
      db.prepare('UPDATE admin_sessions SET revoked_at=? WHERE credential_id=? AND revoked_at IS NULL').run(now,id);
      db.prepare('UPDATE admin_enrollment_tokens SET revoked_at=? WHERE created_by=? AND used_at IS NULL AND revoked_at IS NULL').run(now,id);
      audit('admin_credential_revoked',actor,id);
    });
  }
  function issueInvite({createdBy,label:rawLabel='',redeemMinutes=30,viewerHours=24}={}){
    duration(redeemMinutes,1,1440);if(viewerHours!==null)duration(viewerHours,1,720);
    if(!credentialActive(createdBy))error('credential_revoked');
    const memo=label(rawLabel),code='JGST-'+randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
    const id=randomUUID(),createdAt=timestamp(),redeemExpiresAt=createdAt+redeemMinutes*60000;
    db.prepare('INSERT INTO pia_access_invites(id,label,token_hash,created_by,created_at,redeem_expires_at,viewer_session_duration) VALUES(?,?,?,?,?,?,?)').run(id,memo,digest(code),createdBy,createdAt,redeemExpiresAt,viewerHours===null?null:viewerHours*3600000);
    audit('pia_invite_issued',createdBy,id);
    return {id,code,label:memo,createdAt,redeemExpiresAt,viewerHours};
  }
  function redeemInvite(raw){
    const code=normalizeCode(raw);
    if(!/^JGST-(?:[0-9A-F]{4}-){7}[0-9A-F]{4}$/.test(code))error('invalid_invite');
    return transaction(()=>{
      const now=timestamp(),invite=db.prepare('SELECT * FROM pia_access_invites WHERE token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND redeem_expires_at>?').get(digest(code),now);
      if(!invite)error('invalid_invite');
      const changed=db.prepare('UPDATE pia_access_invites SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND redeem_expires_at>?').run(now,invite.id,now);
      if(changed.changes!==1)error('invalid_invite');
      const token=secret('JGV_'),id=randomUUID(),expiresAt=invite.viewer_session_duration===null?null:now+invite.viewer_session_duration;
      db.prepare('INSERT INTO pia_viewer_sessions(id,invite_id,session_hash,created_at,expires_at,last_used_at) VALUES(?,?,?,?,?,?)').run(id,invite.id,digest(token),now,expiresAt,now);
      audit('pia_invite_redeemed','viewer',invite.id);audit('pia_session_started','viewer',id);
      return {id,token,label:invite.label,createdAt:now,expiresAt};
    });
  }
  function authenticateViewer(token){
    if(typeof token!=='string'||!/^JGV_[A-Za-z0-9_-]{43}$/.test(token))return null;
    const row=db.prepare(`SELECT s.*,i.label FROM pia_viewer_sessions s JOIN pia_access_invites i ON i.id=s.invite_id
      WHERE s.session_hash=? AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>?) AND i.revoked_at IS NULL`).get(digest(token),timestamp());
    if(!row)return null;
    db.prepare('UPDATE pia_viewer_sessions SET last_used_at=? WHERE id=?').run(timestamp(),row.id);
    return {kind:'pia-viewer',scope:'pia:view',id:row.id,label:row.label,expiresAt:row.expires_at};
  }
  function revokeViewerSession(id,actor){
    const changed=db.prepare('UPDATE pia_viewer_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(timestamp(),id);
    if(!changed.changes&&!db.prepare('SELECT id FROM pia_viewer_sessions WHERE id=?').get(id))error('not_found');
    audit('pia_session_revoked',actor,id);
  }
  function revokeInvite(id,actor){
    return transaction(()=>{
      if(!db.prepare('SELECT id FROM pia_access_invites WHERE id=?').get(id))error('not_found');
      const now=timestamp();
      db.prepare('UPDATE pia_access_invites SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(now,id);
      db.prepare('UPDATE pia_viewer_sessions SET revoked_at=? WHERE invite_id=? AND revoked_at IS NULL').run(now,id);
      audit('pia_invite_revoked',actor,id);
    });
  }
  function putChallenge({challenge,flow,ceremonyToken,enrollmentId=null,sessionId=null,name=''}={}){
    const id=randomUUID(),createdAt=timestamp(),expiresAt=createdAt+ACCESS_LIMITS.ceremonyMs;
    db.prepare('INSERT INTO access_challenges(id,flow,challenge,ceremony_hash,enrollment_id,session_id,name,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,flow,challenge,digest(ceremonyToken),enrollmentId,sessionId,label(name),createdAt,expiresAt);
    return {id,expiresAt};
  }
  function claimChallenge({id,flow,ceremonyToken}){
    return transaction(()=>{
      const row=db.prepare('SELECT * FROM access_challenges WHERE id=? AND flow=? AND ceremony_hash=? AND used_at IS NULL AND expires_at>?').get(id,flow,digest(ceremonyToken),timestamp());
      if(!row)return null;
      db.prepare('UPDATE access_challenges SET used_at=? WHERE id=?').run(timestamp(),id);
      return row;
    });
  }
  function consumeRate(bucket,{max=10,windowMs=300000}={}){
    return transaction(()=>{
      const now=timestamp();
      db.prepare('DELETE FROM access_rate_limits WHERE started_at<?').run(now-86400000);
      db.prepare('DELETE FROM access_audit_events WHERE created_at<?').run(now-90*86400000);
      db.prepare('DELETE FROM access_challenges WHERE expires_at<?').run(now-86400000);
      const row=db.prepare('SELECT * FROM access_rate_limits WHERE bucket=?').get(bucket);
      if(!row||row.started_at+windowMs<=now){db.prepare('INSERT INTO access_rate_limits(bucket,started_at,count) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET started_at=excluded.started_at,count=1').run(bucket,now);return true}
      if(row.count>=max)return false;
      db.prepare('UPDATE access_rate_limits SET count=count+1 WHERE bucket=?').run(bucket);return true;
    });
  }
  function listState(){
    const now=timestamp();
    return {
      credentials:db.prepare('SELECT id,name,created_at,last_used_at,revoked_at,device_type,backed_up FROM admin_credentials ORDER BY created_at DESC').all(),
      // Include every still-usable grant/session, plus bounded recent history.
      invites:db.prepare(`SELECT i.id,i.label,i.created_at,i.redeem_expires_at,i.used_at,i.revoked_at,i.viewer_session_duration FROM pia_access_invites i
        WHERE (i.revoked_at IS NULL AND ((i.used_at IS NULL AND i.redeem_expires_at>?) OR EXISTS(
          SELECT 1 FROM pia_viewer_sessions s WHERE s.invite_id=i.id AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>?))))
          OR i.id IN (SELECT id FROM pia_access_invites ORDER BY created_at DESC LIMIT 200)
        ORDER BY i.created_at DESC`).all(now,now).map(row=>({...row,status:row.revoked_at!=null?'revoked':row.used_at!=null?'used':row.redeem_expires_at<=now?'expired':'unused'})),
      sessions:db.prepare(`SELECT s.id,s.created_at,s.expires_at,s.last_used_at,s.revoked_at,i.label FROM pia_viewer_sessions s JOIN pia_access_invites i ON i.id=s.invite_id
        WHERE (s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>?) AND i.revoked_at IS NULL)
          OR s.id IN (SELECT id FROM pia_viewer_sessions ORDER BY created_at DESC LIMIT 200)
        ORDER BY s.created_at DESC`).all(now).map(row=>({...row,status:row.revoked_at!=null?'revoked':row.expires_at!=null&&row.expires_at<=now?'expired':'active'}))
    };
  }
  return {db,close:()=>db.close(),issueEnrollment,lookupEnrollment,registerCredential,issueAdminSession,authenticateAdmin,revokeAdminSession,completeAuthentication,revokeCredential,issueInvite,redeemInvite,authenticateViewer,revokeViewerSession,revokeInvite,putChallenge,claimChallenge,consumeRate,listState,
    getCredential:webauthnId=>db.prepare('SELECT * FROM admin_credentials WHERE webauthn_id=?').get(webauthnId)??null,
    userID:()=>db.prepare("SELECT value FROM access_meta WHERE key='user_id'").get()?.value
  };
}
