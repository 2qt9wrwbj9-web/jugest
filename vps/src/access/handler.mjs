import {randomBytes,createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {createAccessStore,ACCESS_LIMITS} from './store.mjs';
import {validateAccessConfig} from './config.mjs';

export const ACCESS_COOKIES=Object.freeze({admin:'__Host-jugest_admin',viewer:'__Host-jugest_pia',ceremony:'__Host-jugest_ceremony'});
const ACCESS_ROUTES=new Set(['admin/state','viewer/status','register/options','register/verify','login/options','login/verify','reauth/options','reauth/verify','viewer/redeem','viewer/logout','admin/logout','admin/invites','admin/enrollment'].map(route=>'/api/access/'+route));
const header=(req,name)=>String(req.headers?.[name]??'');
export function ratePeerAddress(req,config){
  const direct=String(req.socket?.remoteAddress??'local');
  // Opt-in, only for a loopback proxy which overwrites X-Real-IP (confirmed Nginx).
  const forwarded=header(req,'x-real-ip').trim();
  if(config?.trustLoopbackProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(direct)&&isIP(forwarded))return forwarded;
  return direct;
}
export function cookieToken(req,name){
  const values=header(req,'cookie').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  return values.length===1?values[0].slice(name.length+1):'';
}
function cookie(name,value,seconds){return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(seconds))}`}
const FINITE_VIEWER_COOKIE_SECONDS=30*86400;
// Chrome's supported upper bound: https://developer.chrome.com/blog/cookie-max-age-expires
// This is browser retention only; NULL/revocation in the DB remains authoritative.
const UNLIMITED_VIEWER_COOKIE_SECONDS=400*86400;
function viewerCookie(token,expiresAt,now){
  const seconds=expiresAt===null?UNLIMITED_VIEWER_COOKIE_SECONDS:Math.min(FINITE_VIEWER_COOKIE_SECONDS,(expiresAt-now)/1000);
  return cookie(ACCESS_COOKIES.viewer,token,seconds);
}
function send(req,res,status,payload,extra={}){
  const body=Buffer.from(JSON.stringify(payload));
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':String(body.length),'cache-control':'no-store','pragma':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra});
  res.end(req.method==='HEAD'?undefined:body);
}
async function jsonBody(req){
  if(Number(header(req,'content-length'))>65536)throw new Error('body_too_large');
  let size=0;const chunks=[];
  for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>65536)throw new Error('body_too_large');chunks.push(bytes)}
  try{const body=JSON.parse(Buffer.concat(chunks).toString());if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body}catch{throw new Error('bad_json')}
}
export function canReadPiaRoute(parts,method){
  if(!['GET','HEAD'].includes(method)||parts[0]!=='api'||parts[1]!=='vps')return false;
  if(parts.length===3&&parts[2]==='stores')return true;
  return parts[2]==='stores'&&((parts.length===5&&parts[4]==='days')||(parts.length===6&&parts[4]==='days'));
}

export function createAccessHandler({config}={}){
  config=validateAccessConfig(config);
  const now=config?.now??Date.now,rateSalt=randomBytes(32);
  function authenticate(req){
    if(!config||header(req,'sec-fetch-site')==='cross-site')return null;
    let store;
    try{store=createAccessStore({dbPath:config.dbPath,now});return store.authenticateAdmin(cookieToken(req,ACCESS_COOKIES.admin))??store.authenticateViewer(cookieToken(req,ACCESS_COOKIES.viewer))}
    catch{return null}finally{store?.close()}
  }
  async function handle(req,res){
    if(!config){send(req,res,503,{ok:false,code:'access_not_configured'});return}
    const method=String(req.method??'GET').toUpperCase(),route=new URL(req.url,'http://localhost').pathname;
    if(!['GET','HEAD','POST'].includes(method)){send(req,res,405,{ok:false,code:'method_not_allowed'},{allow:'GET, HEAD, POST'});return}
    const foreign=header(req,'sec-fetch-site')==='cross-site';
    if(foreign||(method==='POST'&&(header(req,'origin')!==config.origin||header(req,'x-jugest-access')!=='1'||!/^application\/json(?:\s*;|$)/i.test(header(req,'content-type'))))){send(req,res,403,{ok:false,code:'origin_denied'});return}
    const revoke=route.match(/^\/api\/access\/admin\/(invites|sessions|credentials)\/([a-f0-9-]{36})\/revoke$/);
    if(!ACCESS_ROUTES.has(route)&&!revoke){send(req,res,404,{ok:false,code:'not_found'});return}
    let store;
    try{
      store=createAccessStore({dbPath:config.dbPath,now});
      let principal=store.authenticateAdmin(cookieToken(req,ACCESS_COOKIES.admin))??store.authenticateViewer(cookieToken(req,ACCESS_COOKIES.viewer));
      const adminRoute=route.startsWith('/api/access/admin/')||route.startsWith('/api/access/reauth/');
      function requireAdmin(){
        principal=store.authenticateAdmin(cookieToken(req,ACCESS_COOKIES.admin))??store.authenticateViewer(cookieToken(req,ACCESS_COOKIES.viewer));
        if(!principal){send(req,res,401,{ok:false,code:'authentication_required'});return false}
        if(principal.kind!=='admin'){send(req,res,403,{ok:false,code:'admin_required'});return false}
        if(method==='POST'&&!route.includes('/reauth/')&&!route.endsWith('/logout')&&now()-principal.authenticatedAt>=ACCESS_LIMITS.freshMs){send(req,res,403,{ok:false,code:'reauthentication_required'});return false}
        return true;
      }
      if(adminRoute&&!requireAdmin())return;
      if(method==='GET'||method==='HEAD'){
        if(route==='/api/access/admin/state'){send(req,res,200,{ok:true,admin:{name:principal.name,authenticatedAt:principal.authenticatedAt,expiresAt:principal.expiresAt},...store.listState()});return}
        if(route==='/api/access/viewer/status'){
          if(!principal){send(req,res,401,{ok:false,code:'authentication_required'});return}
          const extra=principal.kind==='pia-viewer'?{'set-cookie':viewerCookie(cookieToken(req,ACCESS_COOKIES.viewer),principal.expiresAt,now())}:{};
          send(req,res,200,{ok:true,kind:principal.kind,scope:'pia:view',label:principal.label??principal.name,expiresAt:principal.expiresAt,serverTime:now()},extra);return;
        }
        send(req,res,404,{ok:false,code:'not_found'});return;
      }
      const rateAction=route.startsWith('/api/access/admin/')?'admin':route.replace(/\/verify$/,'/options');
      const peer=createHmac('sha256',rateSalt).update(ratePeerAddress(req,config)).digest('hex');
      if(!store.consumeRate('peer:'+rateAction+':'+peer,{max:10,windowMs:300000})||!store.consumeRate('global:'+rateAction,{max:100,windowMs:300000})){
        send(req,res,429,{ok:false,code:'too_many_attempts'},{'retry-after':'300'});return;
      }
      const body=await jsonBody(req);
      // Reading a body can await network input: do not retain pre-revocation authorization.
      if(adminRoute&&!requireAdmin())return;
      if(route==='/api/access/register/options'){
        const grant=store.lookupEnrollment(body.token);if(!grant)throw new Error('invalid_enrollment');
        const options=await generateRegistrationOptions({rpName:'JUGEST 管理者',rpID:config.rpID,userName:'JUGEST管理者',userID:Buffer.from(store.userID(),'base64url'),attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},supportedAlgorithmIDs:[-7,-257],excludeCredentials:store.db.prepare('SELECT webauthn_id id FROM admin_credentials').all()});
        const ceremonyToken='JGC_'+randomBytes(32).toString('base64url');
        const flow=store.putChallenge({flow:'register',challenge:options.challenge,ceremonyToken,enrollmentId:grant.id,name:body.name??'管理者端末'});
        send(req,res,200,{ok:true,flowId:flow.id,options},{'set-cookie':cookie(ACCESS_COOKIES.ceremony,ceremonyToken,300)});return;
      }
      if(route==='/api/access/register/verify'){
        const flow=store.claimChallenge({id:body.flowId??'',flow:'register',ceremonyToken:cookieToken(req,ACCESS_COOKIES.ceremony)});if(!flow)throw new Error('invalid_authentication');
        let result;try{result=await verifyRegistrationResponse({response:body.response,expectedChallenge:flow.challenge,expectedOrigin:config.origin,expectedRPID:config.rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]})}catch{throw new Error('invalid_authentication')}
        if(!result.verified||!result.registrationInfo?.userVerified)throw new Error('invalid_authentication');
        const info=result.registrationInfo,credential=store.registerCredential({enrollmentId:flow.enrollment_id,name:flow.name,credential:{webauthnId:info.credential.id,publicKey:info.credential.publicKey,counter:info.credential.counter,transports:info.credential.transports,deviceType:info.credentialDeviceType,backedUp:info.credentialBackedUp}});
        const session=store.issueAdminSession(credential.id);
        send(req,res,200,{ok:true,credential},{'set-cookie':[cookie(ACCESS_COOKIES.admin,session.token,ACCESS_LIMITS.adminMs/1000),cookie(ACCESS_COOKIES.ceremony,'',0)]});return;
      }
      if(route==='/api/access/login/options'||route==='/api/access/reauth/options'){
        const reauth=route.includes('/reauth/');
        const credential=reauth?store.db.prepare('SELECT webauthn_id FROM admin_credentials WHERE id=? AND revoked_at IS NULL').get(principal.credentialId):null;
        if(reauth&&!credential)throw new Error('invalid_authentication');
        const options=await generateAuthenticationOptions({rpID:config.rpID,userVerification:'required',allowCredentials:reauth?[{id:credential.webauthn_id}]:[]});
        const ceremonyToken='JGC_'+randomBytes(32).toString('base64url'),flow=store.putChallenge({flow:reauth?'reauth':'login',challenge:options.challenge,ceremonyToken,sessionId:reauth?principal.id:null});
        send(req,res,200,{ok:true,flowId:flow.id,options},{'set-cookie':cookie(ACCESS_COOKIES.ceremony,ceremonyToken,300)});return;
      }
      if(route==='/api/access/login/verify'||route==='/api/access/reauth/verify'){
        const reauth=route.includes('/reauth/'),flow=store.claimChallenge({id:body.flowId??'',flow:reauth?'reauth':'login',ceremonyToken:cookieToken(req,ACCESS_COOKIES.ceremony)});
        if(!flow||(reauth&&flow.session_id!==principal.id))throw new Error('invalid_authentication');
        const credential=store.getCredential(body.response?.id??'');
        if(!credential||credential.revoked_at!=null||(reauth&&credential.id!==principal.credentialId))throw new Error('invalid_authentication');
        if(body.response?.response?.userHandle&&body.response.response.userHandle!==store.userID())throw new Error('invalid_authentication');
        let result;try{result=await verifyAuthenticationResponse({response:body.response,expectedChallenge:flow.challenge,expectedOrigin:config.origin,expectedRPID:config.rpID,requireUserVerification:true,credential:{id:credential.webauthn_id,publicKey:new Uint8Array(credential.public_key),counter:credential.counter,transports:JSON.parse(credential.transports_json)}})}catch{throw new Error('invalid_authentication')}
        if(!result.verified||!result.authenticationInfo?.userVerified)throw new Error('invalid_authentication');
        const session=store.completeAuthentication({credentialId:credential.id,newCounter:result.authenticationInfo.newCounter,sessionId:reauth?principal.id:null});
        if(!reauth&&principal?.kind==='admin')store.revokeAdminSession(principal.id,credential.id);
        const cookies=[cookie(ACCESS_COOKIES.ceremony,'',0)];if(!reauth)cookies.push(cookie(ACCESS_COOKIES.admin,session.token,ACCESS_LIMITS.adminMs/1000));
        send(req,res,200,{ok:true,expiresAt:session.expiresAt},{'set-cookie':cookies});return;
      }
      if(route==='/api/access/viewer/redeem'){
        const session=store.redeemInvite(body.code);
        const old=store.authenticateViewer(cookieToken(req,ACCESS_COOKIES.viewer));if(old)store.revokeViewerSession(old.id,'viewer');
        send(req,res,200,{ok:true,expiresAt:session.expiresAt},{'set-cookie':viewerCookie(session.token,session.expiresAt,now())});return;
      }
      if(route==='/api/access/viewer/logout'){
        const viewer=store.authenticateViewer(cookieToken(req,ACCESS_COOKIES.viewer));if(viewer)store.revokeViewerSession(viewer.id,'viewer');
        send(req,res,200,{ok:true},{'set-cookie':cookie(ACCESS_COOKIES.viewer,'',0)});return;
      }
      if(route==='/api/access/admin/logout'){store.revokeAdminSession(principal.id,principal.credentialId);send(req,res,200,{ok:true},{'set-cookie':cookie(ACCESS_COOKIES.admin,'',0)});return}
      if(route==='/api/access/admin/invites'){
        const invite=store.issueInvite({createdBy:principal.credentialId,label:body.label??'',redeemMinutes:body.redeemMinutes??30,viewerHours:Object.hasOwn(body,'viewerHours')?body.viewerHours:24});
        send(req,res,200,{ok:true,...invite});return;
      }
      if(route==='/api/access/admin/enrollment'){send(req,res,200,{ok:true,...store.issueEnrollment({kind:'additional',createdBy:principal.credentialId})});return}
      if(revoke){
        const action={invites:store.revokeInvite,sessions:store.revokeViewerSession,credentials:store.revokeCredential}[revoke[1]];
        action(revoke[2],principal.credentialId);send(req,res,200,{ok:true});return;
      }
      send(req,res,404,{ok:false,code:'not_found'});
    }catch(error){
      const known=new Set(['invalid_invite','invalid_enrollment','invalid_authentication','invalid_label','invalid_duration','bad_json','body_too_large','not_found','credential_revoked']);
      const code=known.has(error.message)?error.message:error.message==='access_migration_required'?'access_migration_required':'access_request_failed';
      const status=code==='access_migration_required'?503:code==='access_request_failed'?500:code==='body_too_large'?413:code==='not_found'?404:400;
      // Do not log exception details, request bodies, cookies, or token values.
      send(req,res,status,{ok:false,code});
    }finally{store?.close()}
  }
  return {handle,authenticate,config};
}
