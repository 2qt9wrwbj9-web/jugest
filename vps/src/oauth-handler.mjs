import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createRelayStore} from './relay-store.mjs';

export const OAUTH_ISSUER='https://jugest.net';
export const OAUTH_RESOURCE='https://jugest.net/mcp';
export const OAUTH_SCOPE='jugest:read';
export const OAUTH_RESOURCE_METADATA=`${OAUTH_ISSUER}/.well-known/oauth-protected-resource`;
const OAUTH_STORE_NAME='jugest-oauth-v1';
const RELAY_STORE_NAME='juggler-relay-v1';
const CODE_TTL_MS=5*60*1000;
const ACCESS_TTL_MS=60*60*1000;
const REFRESH_TTL_MS=30*24*60*60*1000;

function digest(value){return createHash('sha256').update(String(value||'')).digest('hex')}
function randomToken(prefix,bytes=32){return `${prefix}${randomBytes(bytes).toString('base64url')}`}
function secureMatch(raw,expectedHash){
  if(!raw||!/^[a-f0-9]{64}$/i.test(String(expectedHash||'')))return false;
  const a=Buffer.from(digest(raw),'hex'),b=Buffer.from(String(expectedHash),'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function secureTextEqual(a,b){
  const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));
  return left.length===right.length&&timingSafeEqual(left,right);
}
function validChannelId(value){return /^[A-Za-z0-9_-]{12,80}$/.test(String(value||''))}
function sendRaw(res,status,body='',headers={}){
  const data=Buffer.from(String(body));
  res.writeHead(status,{'content-length':String(data.length),'cache-control':'no-store','x-content-type-options':'nosniff',...headers});
  res.end(data);
}
function sendJson(res,status,payload,headers={}){sendRaw(res,status,JSON.stringify(payload),{'content-type':'application/json; charset=utf-8',...headers})}
function oauthError(res,status,error,description){sendJson(res,status,{error,...(description?{error_description:description}:{})})}
function htmlEscape(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
async function readBody(req,{maxBytes=131072}={}){
  let size=0;const chunks=[];
  for await(const chunk of req){
    const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=data.length;
    if(size>maxBytes){const error=new Error('body_too_large');error.code='body_too_large';throw error}
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function parseForm(text){return new URLSearchParams(String(text||''))}
function oauthStore(relayDbPath){return createRelayStore(OAUTH_STORE_NAME,{dbPath:relayDbPath,root:'jugest'})}
function collectorStore(relayDbPath){return createRelayStore(RELAY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'})}
function trustedRedirectUri(raw){
  let url;try{url=new URL(String(raw||''))}catch{return false}
  if(url.username||url.password||url.hash)return false;
  if(url.protocol==='https:'&&['chatgpt.com','chat.openai.com'].includes(url.hostname))return true;
  if(url.protocol==='http:'&&['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname))return true;
  return false;
}
function normalizeScopes(raw){return [...new Set(String(raw||'').trim().split(/\s+/).filter(Boolean))]}
function scopeValid(raw){const scopes=normalizeScopes(raw);return scopes.length===1&&scopes[0]===OAUTH_SCOPE}
function pkceChallenge(verifier){return createHash('sha256').update(String(verifier||'')).digest('base64url')}
function validChallenge(value){return /^[A-Za-z0-9_-]{43}$/.test(String(value||''))}
async function getClient(store,clientId){
  const id=String(clientId||'').trim();if(!id)return null;
  const record=await store.get(`client/${id}`,{type:'json'});
  return record&&record.type==='client'?record:null;
}
async function verifyCollector(relayDbPath,channelId,receiverToken){
  const id=String(channelId||'').trim(),token=String(receiverToken||'');
  if(!validChannelId(id)||!token)return null;
  const channel=await collectorStore(relayDbPath).get(`channel/${id}`,{type:'json'});
  if(!channel||channel.revokedAt||!secureMatch(token,channel.receiverHash))return null;
  return {channelId:id};
}
async function persistUnique(store,prefix,record,{tokenPrefix='jgo_',bytes=32}={}){
  for(let attempt=0;attempt<4;attempt+=1){
    const token=randomToken(tokenPrefix,bytes),key=`${prefix}/${digest(token)}`;
    const saved=await store.setJSON(key,record(token),{onlyIfNew:true});
    if(saved.modified)return {token,key};
  }
  throw new Error('oauth_token_collision');
}
async function consumeRecord(store,key,record,etag){
  try{
    await store.setJSON(key,{type:'consumed',previousType:String(record?.type||''),consumedAt:Date.now(),expiresAt:Number(record?.expiresAt)||Date.now()},{ifMatch:etag});
    return true;
  }catch(error){
    if(error?.code==='precondition_failed')return false;
    throw error;
  }
}
function protectedResourceMetadata(){
  return {resource:OAUTH_RESOURCE,authorization_servers:[OAUTH_ISSUER],scopes_supported:[OAUTH_SCOPE],resource_documentation:`${OAUTH_ISSUER}/`};
}
function authorizationServerMetadata(){
  return {
    issuer:OAUTH_ISSUER,
    authorization_endpoint:`${OAUTH_ISSUER}/oauth/authorize`,
    token_endpoint:`${OAUTH_ISSUER}/oauth/token`,
    registration_endpoint:`${OAUTH_ISSUER}/oauth/register`,
    scopes_supported:[OAUTH_SCOPE],
    response_types_supported:['code'],
    grant_types_supported:['authorization_code','refresh_token'],
    code_challenge_methods_supported:['S256'],
    token_endpoint_auth_methods_supported:['none'],
  };
}
function registrationValid(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'invalid_client_metadata'};
  const redirects=body.redirect_uris;
  if(!Array.isArray(redirects)||redirects.length<1||redirects.length>10||redirects.some(uri=>!trustedRedirectUri(uri)))return {ok:false,error:'invalid_redirect_uri'};
  if(body.token_endpoint_auth_method!=null&&body.token_endpoint_auth_method!=='none')return {ok:false,error:'invalid_client_metadata'};
  if(body.response_types!=null&&(!Array.isArray(body.response_types)||body.response_types.some(value=>value!=='code')))return {ok:false,error:'invalid_client_metadata'};
  if(body.grant_types!=null&&(!Array.isArray(body.grant_types)||body.grant_types.some(value=>!['authorization_code','refresh_token'].includes(value))))return {ok:false,error:'invalid_client_metadata'};
  return {ok:true,redirects:[...new Set(redirects.map(String))]};
}
async function registerClient(req,res,relayDbPath){
  let body;try{body=JSON.parse(await readBody(req))}catch(error){oauthError(res,error?.code==='body_too_large'?413:400,'invalid_client_metadata','Invalid registration request');return}
  const valid=registrationValid(body);if(!valid.ok){oauthError(res,400,valid.error);return}
  const store=oauthStore(relayDbPath),issuedAt=Math.floor(Date.now()/1000);
  const {token:clientId}=await persistUnique(store,'client-id',()=>({}),{tokenPrefix:'jugest_client_',bytes:24});
  await store.delete(`client-id/${digest(clientId)}`);
  const record={type:'client',clientId,clientName:String(body.client_name||'ChatGPT').slice(0,160),redirectUris:valid.redirects,tokenEndpointAuthMethod:'none',grantTypes:['authorization_code','refresh_token'],responseTypes:['code'],issuedAt};
  await store.setJSON(`client/${clientId}`,record,{onlyIfNew:true});
  sendJson(res,201,{client_id:clientId,client_id_issued_at:issuedAt,client_name:record.clientName,redirect_uris:record.redirectUris,token_endpoint_auth_method:'none',grant_types:record.grantTypes,response_types:record.responseTypes});
}
function extractAuthorizeParams(source){
  return {
    responseType:String(source.get('response_type')||''),clientId:String(source.get('client_id')||''),redirectUri:String(source.get('redirect_uri')||''),scope:String(source.get('scope')||''),state:String(source.get('state')||''),resource:String(source.get('resource')||''),codeChallenge:String(source.get('code_challenge')||''),codeChallengeMethod:String(source.get('code_challenge_method')||'')
  };
}
async function validateAuthorizeRequest(params,relayDbPath){
  const store=oauthStore(relayDbPath),client=await getClient(store,params.clientId);
  if(!client)return {ok:false,error:'unauthorized_client',description:'Unknown client'};
  if(params.responseType!=='code')return {ok:false,error:'unsupported_response_type',description:'Only authorization code is supported'};
  if(!client.redirectUris.includes(params.redirectUri))return {ok:false,error:'invalid_request',description:'redirect_uri is not registered'};
  if(params.resource!==OAUTH_RESOURCE)return {ok:false,error:'invalid_target',description:'resource must identify the JUGEST MCP server'};
  if(!scopeValid(params.scope))return {ok:false,error:'invalid_scope',description:'Only jugest:read is supported'};
  if(params.codeChallengeMethod!=='S256'||!validChallenge(params.codeChallenge))return {ok:false,error:'invalid_request',description:'PKCE S256 is required'};
  return {ok:true,client};
}
function authorizePage(params,client){
  const hidden=Object.entries({response_type:params.responseType,client_id:params.clientId,redirect_uri:params.redirectUri,scope:params.scope,state:params.state,resource:params.resource,code_challenge:params.codeChallenge,code_challenge_method:params.codeChallengeMethod})
    .map(([name,value])=>`<input type="hidden" name="${htmlEscape(name)}" value="${htmlEscape(value)}">`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JUGEST 接続</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:48px auto;padding:0 20px;color:#111}label{display:block;margin:16px 0 6px}input{box-sizing:border-box;width:100%;padding:10px;font:inherit}button{margin-top:20px;padding:10px 16px;font:inherit}.note{color:#555;font-size:.92rem}</style></head><body><h1>JUGESTをChatGPTに接続</h1><p>${htmlEscape(client.clientName)} が <strong>${htmlEscape(OAUTH_SCOPE)}</strong> を要求しています。</p><p class="note">既存JUGEST Collectorの接続情報で本人確認します。receiver tokenは保存されません。</p><form method="post" action="/oauth/authorize">${hidden}<label>Channel ID</label><input name="channel_id" required autocomplete="off"><label>Receiver token</label><input name="receiver_token" type="password" required autocomplete="off"><button type="submit">接続を許可</button></form></body></html>`;
}
async function authorize(req,res,url,relayDbPath){
  let source;
  if(req.method==='GET')source=url.searchParams;
  else if(req.method==='POST'){try{source=parseForm(await readBody(req))}catch{oauthError(res,400,'invalid_request');return}}
  else{sendRaw(res,405,'Method Not Allowed\n',{'content-type':'text/plain; charset=utf-8','allow':'GET, POST'});return}
  const params=extractAuthorizeParams(source),valid=await validateAuthorizeRequest(params,relayDbPath);
  if(!valid.ok){oauthError(res,400,valid.error,valid.description);return}
  if(req.method==='GET'){sendRaw(res,200,authorizePage(params,valid.client),{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});return}
  const auth=await verifyCollector(relayDbPath,source.get('channel_id'),source.get('receiver_token'));
  if(!auth){sendRaw(res,401,'JUGEST authentication failed\n',{'content-type':'text/plain; charset=utf-8'});return}
  const now=Date.now(),store=oauthStore(relayDbPath);
  const {token:code}=await persistUnique(store,'code',()=>({type:'authorization_code',issuer:OAUTH_ISSUER,resource:OAUTH_RESOURCE,scope:OAUTH_SCOPE,clientId:params.clientId,channelId:auth.channelId,redirectUri:params.redirectUri,codeChallenge:params.codeChallenge,issuedAt:now,expiresAt:now+CODE_TTL_MS}),{tokenPrefix:'jugest_code_',bytes:32});
  const location=new URL(params.redirectUri);location.searchParams.set('code',code);if(params.state)location.searchParams.set('state',params.state);
  sendRaw(res,303,'',{'location':location.toString()});
}
async function issueTokenPair(store,{clientId,channelId,scope=OAUTH_SCOPE}){
  const now=Date.now();
  const access=await persistUnique(store,'access',()=>({type:'access',issuer:OAUTH_ISSUER,resource:OAUTH_RESOURCE,scope,clientId,channelId,issuedAt:now,expiresAt:now+ACCESS_TTL_MS}),{tokenPrefix:'jugest_access_',bytes:32});
  const refresh=await persistUnique(store,'refresh',()=>({type:'refresh',issuer:OAUTH_ISSUER,resource:OAUTH_RESOURCE,scope,clientId,channelId,issuedAt:now,expiresAt:now+REFRESH_TTL_MS}),{tokenPrefix:'jugest_refresh_',bytes:48});
  return {accessToken:access.token,refreshToken:refresh.token};
}
async function tokenEndpoint(req,res,relayDbPath){
  if(req.method!=='POST'){sendRaw(res,405,'Method Not Allowed\n',{'content-type':'text/plain; charset=utf-8','allow':'POST'});return}
  let form;try{form=parseForm(await readBody(req))}catch{oauthError(res,400,'invalid_request');return}
  const grantType=String(form.get('grant_type')||''),clientId=String(form.get('client_id')||''),resource=String(form.get('resource')||'');
  const store=oauthStore(relayDbPath),client=await getClient(store,clientId);
  if(!client){oauthError(res,400,'invalid_client');return}
  if(resource!==OAUTH_RESOURCE){oauthError(res,400,'invalid_target');return}
  if(grantType==='authorization_code'){
    const code=String(form.get('code')||''),key=`code/${digest(code)}`,entry=await store.getWithMetadata(key),record=entry?.value;
    if(!record||record.type!=='authorization_code'||record.expiresAt<=Date.now()||record.clientId!==clientId||record.redirectUri!==String(form.get('redirect_uri')||'')||record.resource!==OAUTH_RESOURCE){oauthError(res,400,'invalid_grant');return}
    const verifier=String(form.get('code_verifier')||'');
    if(verifier.length<43||verifier.length>128||!secureTextEqual(pkceChallenge(verifier),record.codeChallenge)){oauthError(res,400,'invalid_grant');return}
    if(!await consumeRecord(store,key,record,entry.etag)){oauthError(res,400,'invalid_grant');return}
    const pair=await issueTokenPair(store,{clientId,channelId:record.channelId,scope:record.scope});
    sendJson(res,200,{access_token:pair.accessToken,token_type:'Bearer',expires_in:Math.floor(ACCESS_TTL_MS/1000),refresh_token:pair.refreshToken,scope:record.scope},{'pragma':'no-cache'});return;
  }
  if(grantType==='refresh_token'){
    const raw=String(form.get('refresh_token')||''),key=`refresh/${digest(raw)}`,entry=await store.getWithMetadata(key),record=entry?.value;
    if(!record||record.type!=='refresh'||record.expiresAt<=Date.now()||record.clientId!==clientId||record.resource!==OAUTH_RESOURCE){oauthError(res,400,'invalid_grant');return}
    if(!await consumeRecord(store,key,record,entry.etag)){oauthError(res,400,'invalid_grant');return}
    const pair=await issueTokenPair(store,{clientId,channelId:record.channelId,scope:record.scope});
    sendJson(res,200,{access_token:pair.accessToken,token_type:'Bearer',expires_in:Math.floor(ACCESS_TTL_MS/1000),refresh_token:pair.refreshToken,scope:record.scope},{'pragma':'no-cache'});return;
  }
  oauthError(res,400,'unsupported_grant_type');
}
export async function authenticateOAuthAccessToken(token,{relayDbPath}={}){
  if(typeof relayDbPath!=='string'||!relayDbPath.trim()||!token)return null;
  const store=oauthStore(relayDbPath),key=`access/${digest(token)}`,record=await store.get(key,{type:'json'});
  if(!record||record.type!=='access'||record.issuer!==OAUTH_ISSUER||record.resource!==OAUTH_RESOURCE||record.expiresAt<=Date.now()||!normalizeScopes(record.scope).includes(OAUTH_SCOPE)){
    if(record?.expiresAt<=Date.now())await store.delete(key);
    return null;
  }
  return {channelId:record.channelId,clientId:record.clientId,scope:record.scope};
}
export function createOAuthHandler({relayDbPath}={}){
  if(typeof relayDbPath!=='string'||!relayDbPath.trim())throw new TypeError('relayDbPath is required');
  return async function jugestOAuthHandler(req,res){
    const url=new URL(req.url||'/','http://127.0.0.1'),method=String(req.method||'GET').toUpperCase();
    if(url.pathname==='/.well-known/oauth-protected-resource'){
      if(method!=='GET'&&method!=='HEAD'){sendRaw(res,405,'Method Not Allowed\n',{'content-type':'text/plain; charset=utf-8','allow':'GET, HEAD'});return}
      sendJson(res,200,protectedResourceMetadata());return;
    }
    if(url.pathname==='/.well-known/oauth-authorization-server'){
      if(method!=='GET'&&method!=='HEAD'){sendRaw(res,405,'Method Not Allowed\n',{'content-type':'text/plain; charset=utf-8','allow':'GET, HEAD'});return}
      sendJson(res,200,authorizationServerMetadata());return;
    }
    if(url.pathname==='/oauth/register'){if(method!=='POST'){sendRaw(res,405,'Method Not Allowed\n',{'content-type':'text/plain; charset=utf-8','allow':'POST'});return}return await registerClient(req,res,relayDbPath)}
    if(url.pathname==='/oauth/authorize')return await authorize(req,res,url,relayDbPath);
    if(url.pathname==='/oauth/token')return await tokenEndpoint(req,res,relayDbPath);
    sendRaw(res,404,'Not Found\n',{'content-type':'text/plain; charset=utf-8'});
  };
}

export const __test={trustedRedirectUri,scopeValid,pkceChallenge,protectedResourceMetadata,authorizationServerMetadata};