import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createWebServer} from '../src/web-server.mjs';
import {createRelayStore} from '../src/relay-store.mjs';
import {authenticateOAuthAccessToken} from '../src/oauth-handler.mjs';

const CHANNEL='channel_oauth_test_123';
const RECEIVER='receiver-token-oauth-test-1234567890';
const RESOURCE='https://jugest.net/mcp';
const ISSUER='https://jugest.net';
const REDIRECT='https://chatgpt.com/connector_platform_oauth_redirect';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const challenge=value=>createHash('sha256').update(String(value)).digest('base64url');

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'jugest-oauth-api-'));
  const root=join(dir,'web'),relayDbPath=join(dir,'relay.sqlite'),canonicalDbPath=join(dir,'jugest.sqlite'),rawRoot=join(dir,'raw');
  await mkdir(root,{recursive:true});
  writeFileSync(join(root,'index.html'),'<title>JUGEST OAUTH TEST</title>');
  const relay=createRelayStore('juggler-relay-v1',{dbPath:relayDbPath,root:'jugest'});
  await relay.setJSON(`channel/${CHANNEL}`,{version:1,createdAt:1,claimedAt:1,revokedAt:0,receiverHash:digest(RECEIVER),senderHash:'sender'});
  const server=createWebServer({rootDir:root,relayDbPath,canonicalDbPath,rawRoot});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  return {base,relayDbPath,async close(){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}};
}

async function register(base,redirectUri=REDIRECT){
  return await fetch(`${base}/oauth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    client_name:'ChatGPT JUGEST Test',redirect_uris:[redirectUri],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']
  })});
}

function authorizeParams(clientId,{state='state-123',verifier='v'.repeat(64),redirectUri=REDIRECT}={}){
  return {clientId,state,verifier,redirectUri,params:new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'jugest:read',state,resource:RESOURCE,code_challenge:challenge(verifier),code_challenge_method:'S256'})};
}

test('OAuth discovery metadata advertises the protected JUGEST MCP resource and DCR+PKCE server',async()=>{
  const f=await fixture();
  try{
    const protectedResource=await fetch(`${f.base}/.well-known/oauth-protected-resource`);
    assert.equal(protectedResource.status,200);
    const resource=await protectedResource.json();
    assert.equal(resource.resource,RESOURCE);
    assert.deepEqual(resource.authorization_servers,[ISSUER]);
    assert.deepEqual(resource.scopes_supported,['jugest:read']);

    const authServer=await fetch(`${f.base}/.well-known/oauth-authorization-server`);
    assert.equal(authServer.status,200);
    const metadata=await authServer.json();
    assert.equal(metadata.issuer,ISSUER);
    assert.equal(metadata.authorization_endpoint,`${ISSUER}/oauth/authorize`);
    assert.equal(metadata.token_endpoint,`${ISSUER}/oauth/token`);
    assert.equal(metadata.registration_endpoint,`${ISSUER}/oauth/register`);
    assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
    assert.deepEqual(metadata.token_endpoint_auth_methods_supported,['none']);
    assert.equal(metadata.authorization_response_iss_parameter_supported,true);
  }finally{await f.close()}
});

test('DCR issues a public client only for trusted ChatGPT/OpenAI or loopback redirect URIs',async()=>{
  const f=await fixture();
  try{
    const response=await register(f.base);
    assert.equal(response.status,201);
    const client=await response.json();
    assert.match(client.client_id,/^[A-Za-z0-9_-]{20,}$/);
    assert.equal(client.client_secret,undefined);
    assert.equal(client.token_endpoint_auth_method,'none');
    assert.deepEqual(client.redirect_uris,[REDIRECT]);

    const loopback=await register(f.base,'http://127.0.0.1:8787/callback');
    assert.equal(loopback.status,201);
    const bad=await register(f.base,'https://evil.example/callback');
    assert.equal(bad.status,400);
    const error=await bad.json();
    assert.equal(error.error,'invalid_redirect_uri');
  }finally{await f.close()}
});

test('authorization code + S256 PKCE issues tokens, makes codes single-use, and rotates refresh tokens',async()=>{
  const f=await fixture();
  try{
    const client=await (await register(f.base)).json();
    const flow=authorizeParams(client.client_id);
    const page=await fetch(`${f.base}/oauth/authorize?${flow.params}`);
    assert.equal(page.status,200);
    assert.match(await page.text(),/JUGEST/i);

    const authorizeBody=new URLSearchParams(flow.params);
    authorizeBody.set('channel_id',CHANNEL);authorizeBody.set('receiver_token',RECEIVER);
    const authorized=await fetch(`${f.base}/oauth/authorize`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:authorizeBody,redirect:'manual'});
    assert.equal(authorized.status,302);
    const location=new URL(authorized.headers.get('location'));
    assert.equal(location.origin+location.pathname,REDIRECT);
    assert.equal(location.searchParams.get('state'),flow.state);
    assert.equal(location.searchParams.get('iss'),ISSUER);
    const code=location.searchParams.get('code');
    assert.ok(code);

    const tokenBody=new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code,redirect_uri:REDIRECT,code_verifier:flow.verifier,resource:RESOURCE});
    const tokenResponse=await fetch(`${f.base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:tokenBody});
    assert.equal(tokenResponse.status,200);
    const token=await tokenResponse.json();
    assert.equal(token.token_type,'Bearer');
    assert.equal(token.expires_in,3600);
    assert.equal(token.scope,'jugest:read');
    assert.ok(token.access_token);assert.ok(token.refresh_token);

    const reused=await fetch(`${f.base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:tokenBody});
    assert.equal(reused.status,400);
    assert.equal((await reused.json()).error,'invalid_grant');

    const refreshBody=new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:token.refresh_token,resource:RESOURCE});
    const refreshed=await fetch(`${f.base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:refreshBody});
    assert.equal(refreshed.status,200);
    const rotated=await refreshed.json();
    assert.notEqual(rotated.access_token,token.access_token);
    assert.notEqual(rotated.refresh_token,token.refresh_token);

    const oldRefresh=await fetch(`${f.base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:refreshBody});
    assert.equal(oldRefresh.status,400);
    assert.equal((await oldRefresh.json()).error,'invalid_grant');
  }finally{await f.close()}
});

test('authorization rejects mismatched resource and redirect targets',async()=>{
  const f=await fixture();
  try{
    const client=await (await register(f.base)).json();
    const flow=authorizeParams(client.client_id);
    const wrongResource=new URLSearchParams(flow.params);wrongResource.set('resource','https://evil.example/mcp');
    const badResource=await fetch(`${f.base}/oauth/authorize?${wrongResource}`);
    assert.equal(badResource.status,400);
    assert.equal((await badResource.json()).error,'invalid_target');

    const wrongRedirect=new URLSearchParams(flow.params);wrongRedirect.set('redirect_uri','https://chatgpt.com/not-the-registered-callback');
    const badRedirect=await fetch(`${f.base}/oauth/authorize?${wrongRedirect}`);
    assert.equal(badRedirect.status,400);
    assert.equal((await badRedirect.json()).error,'invalid_request');
  }finally{await f.close()}
});

test('authorization rejects bad Collector credentials and a bad PKCE verifier does not burn the valid code',async()=>{
  const f=await fixture();
  try{
    const client=await (await register(f.base)).json();
    const flow=authorizeParams(client.client_id,{state:'bad-state'});
    const badBody=new URLSearchParams(flow.params);badBody.set('channel_id',CHANNEL);badBody.set('receiver_token','wrong');
    const denied=await fetch(`${f.base}/oauth/authorize`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:badBody,redirect:'manual'});
    assert.equal(denied.status,401);

    const goodBody=new URLSearchParams(flow.params);goodBody.set('channel_id',CHANNEL);goodBody.set('receiver_token',RECEIVER);
    const authorized=await fetch(`${f.base}/oauth/authorize`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:goodBody,redirect:'manual'});
    const code=new URL(authorized.headers.get('location')).searchParams.get('code');
    const wrong=new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code,redirect_uri:REDIRECT,code_verifier:'x'.repeat(64),resource:RESOURCE});
    const tokenResponse=await fetch(`${f.base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:wrong});
    assert.equal(tokenResponse.status,400);
    assert.equal((await tokenResponse.json()).error,'invalid_grant');

    const correct=new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code,redirect_uri:REDIRECT,code_verifier:flow.verifier,resource:RESOURCE});
    const recovered=await fetch(`${f.base}/oauth/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:correct});
    assert.equal(recovered.status,200);
    assert.ok((await recovered.json()).access_token);
  }finally{await f.close()}
});

test('invalid and expired OAuth access tokens are rejected',async()=>{
  const f=await fixture();
  try{
    assert.equal(await authenticateOAuthAccessToken('not-a-real-token',{relayDbPath:f.relayDbPath}),null);
    const oauth=createRelayStore('jugest-oauth-v1',{dbPath:f.relayDbPath,root:'jugest'}),raw='expired-access-token';
    await oauth.setJSON(`access/${digest(raw)}`,{type:'access',issuer:ISSUER,resource:RESOURCE,scope:'jugest:read',clientId:'test-client',channelId:CHANNEL,issuedAt:Date.now()-7200000,expiresAt:Date.now()-1});
    assert.equal(await authenticateOAuthAccessToken(raw,{relayDbPath:f.relayDbPath}),null);
    assert.equal(await oauth.get(`access/${digest(raw)}`,{type:'json'}),null);
  }finally{await f.close()}
});