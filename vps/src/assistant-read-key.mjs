import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createRelayStore} from './relay-store.mjs';

const RELAY_STORE_NAME='juggler-relay-v1';
const KEY_STORE_NAME='assistant-read-v1';
export const ASSISTANT_READ_PREFIX='jugest_read_';

function digest(value){return createHash('sha256').update(String(value||'')).digest('hex')}
function secureMatch(raw,expectedHash){
  if(!raw||!/^[a-f0-9]{64}$/i.test(String(expectedHash||'')))return false;
  const a=Buffer.from(digest(raw),'hex'),b=Buffer.from(String(expectedHash),'hex');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function headerValue(req,name){const value=req.headers?.[name.toLowerCase()];return Array.isArray(value)?String(value[0]||''):String(value||'')}
function bearerToken(req){const match=headerValue(req,'authorization').trim().match(/^Bearer\s+(.+)$/i);return match?.[1]?.trim()||''}
function validChannelId(value){return /^[A-Za-z0-9_-]{12,80}$/.test(String(value||''))}
function relayStore(relayDbPath){return createRelayStore(RELAY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'})}
function keyStore(relayDbPath){return createRelayStore(KEY_STORE_NAME,{dbPath:relayDbPath,root:'jugest'})}
function channelKey(channelId){return `channel/${channelId}`}
function tokenKey(tokenHash){return `token/${tokenHash}`}
function iso(value){return value?new Date(Number(value)).toISOString():null}
export async function authenticateReceiver(req,relayDbPath){
  const channelId=headerValue(req,'x-jugest-channel-id').trim(),token=bearerToken(req);
  if(!validChannelId(channelId)||!token)return null;
  const channel=await relayStore(relayDbPath).get(`channel/${channelId}`,{type:'json'});
  if(!channel||channel.revokedAt||!secureMatch(token,channel.receiverHash))return null;
  return {channelId,authType:'receiver'};
}

export async function authenticateAssistantRead(req,relayDbPath){
  const token=bearerToken(req);
  if(!token.startsWith(ASSISTANT_READ_PREFIX))return null;
  const hash=digest(token),store=keyStore(relayDbPath),record=await store.get(tokenKey(hash),{type:'json'});
  if(!record?.channelId||record.tokenHash!==hash)return null;
  const current=await store.get(channelKey(record.channelId),{type:'json'});
  if(!current||current.tokenHash!==hash)return null;
  const channel=await relayStore(relayDbPath).get(`channel/${record.channelId}`,{type:'json'});
  if(!channel||channel.revokedAt)return null;
  return {channelId:String(record.channelId),authType:'assistant-read'};
}

export async function assistantReadKeyStatus(relayDbPath,channelId){
  if(!validChannelId(channelId))throw new TypeError('valid channelId is required');
  const record=await keyStore(relayDbPath).get(channelKey(channelId),{type:'json'});
  return {active:Boolean(record?.tokenHash),createdAt:iso(record?.createdAt)};
}
export async function rotateAssistantReadKey(relayDbPath,channelId){
  if(!validChannelId(channelId))throw new TypeError('valid channelId is required');
  const store=keyStore(relayDbPath),previous=await store.get(channelKey(channelId),{type:'json'});
  if(previous?.tokenHash)await store.delete(tokenKey(previous.tokenHash));
  const key=`${ASSISTANT_READ_PREFIX}${randomBytes(32).toString('base64url')}`;
  const tokenHash=digest(key),createdAt=Date.now(),record={channelId,tokenHash,createdAt};
  await store.setJSON(tokenKey(tokenHash),record);
  await store.setJSON(channelKey(channelId),record);
  return {key,active:true,createdAt:iso(createdAt)};
}

export async function revokeAssistantReadKey(relayDbPath,channelId){
  if(!validChannelId(channelId))throw new TypeError('valid channelId is required');
  const store=keyStore(relayDbPath),record=await store.get(channelKey(channelId),{type:'json'});
  if(record?.tokenHash)await store.delete(tokenKey(record.tokenHash));
  await store.delete(channelKey(channelId));
  return {active:false,createdAt:null};
}

export const __test={digest,bearerToken,validChannelId,secureMatch};
