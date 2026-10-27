import test from'node:test';import assert from'node:assert/strict';import{createRequire}from'node:module';import{readFileSync,readdirSync}from'node:fs';import{handleDevelopmentSession,readDevelopmentPrincipal}from'../dev/session.mjs';import{handleStoreRead}from'../lib/store-read-api.mjs';
const require=createRequire(import.meta.url),{Miniflare}=await import('miniflare');
test('job API enforces authentication, scope, origin, execution gate; original read returns new saved result',async()=>{
 const mf=new Miniflare({modules:true,script:'export default{fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'test'},r2Buckets:['BUCKET'],cf:false});try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');for(const f of readdirSync(new URL('../drizzle',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())for(const s of readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(s).run();
 const login=await handleDevelopmentSession(new Request('https://dev.test/api/dev-session',{method:'POST',headers:{origin:'https://dev.test'}}),{enabled:true,db,bucket});const cookie=login.headers.get('set-cookie').split(';')[0],p=await readDevelopmentPrincipal(new Request('https://dev.test/',{headers:{cookie}}),{enabled:true,db,bucket});
 const headers={'x-jugest-channel-id':p.channelId,authorization:'Bearer '+p.token,'content-type':'application/json'},base='https://dev.test/api/vps/stores/dev-store-one/analysis/jobs';
 const options={db,bucket,piaAccessMode:'owner',piaOwnerChannelIds:p.channelId,executionEnabled:true};
 const call=(path='',method='GET',body,extra={},env={})=>handleStoreRead(new Request(base+path,{method,headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{})}),{...options,...env});
 assert.equal((await handleStoreRead(new Request(base),options)).status,401);
 assert.equal((await call('', 'POST',{kind:'store-analysis',targetDate:'2026-02-19',requestKey:'denied'},{},{executionEnabled:false})).status,503);
 assert.equal((await call('', 'POST',{}, {origin:'https://evil.test'})).status,403);
 assert.equal((await call('', 'POST',{kind:'store-analysis',targetDate:'2026-02-30',requestKey:'invalid'})).status,400);
 const created=await call('','POST',{kind:'store-analysis',targetDate:'2026-02-18',requestKey:'api'});assert.equal(created.status,202);const id=(await created.json()).job.id;
 assert.equal((await call('/'+id+'/result')).status,409);await call('/'+id+'/advance','POST',{});const staged=await call('/'+id+'/advance','POST',{});assert.equal((await staged.json()).job.state,'queued');assert.equal((await call('/'+id+'/result')).status,409);const done=await call('/'+id+'/advance','POST',{});assert.equal((await done.json()).job.state,'succeeded');
 const saved=await(await call('/'+id+'/result')).json();assert.equal(saved.result.targetDate,'2026-02-18');
 const originalRead=await handleStoreRead(new Request('https://dev.test/api/vps/stores/dev-store-one/analysis/default',{headers}),options);const read=await originalRead.json();assert.deepEqual(read.analysis,saved.result.payload);assert.equal(read.businessDate,'2026-02-18');
 const {createSitesRelayStore}=await import('../lib/storage/relay-store.mjs');const {sha256Text}=await import('../lib/storage/recovery.mjs');const token='jugest_read_synthetic-test-only',hash=await sha256Text(token),readStore=createSitesRelayStore('assistant-read-v1',{db,bucket});await readStore.setJSON('token/'+hash,{channelId:p.channelId,tokenHash:hash});await readStore.setJSON('channel/'+p.channelId,{channelId:p.channelId,tokenHash:hash});assert.equal((await call('','POST',{}, {authorization:'Bearer '+token,'x-jugest-channel-id':''})).status,403);
 // An unrelated authenticated receiver cannot enter the owner-only PIA scope.
 const other=await handleDevelopmentSession(new Request('https://dev.test/api/dev-session',{method:'POST',headers:{origin:'https://dev.test'}}),{enabled:true,db,bucket});const op=await readDevelopmentPrincipal(new Request('https://dev.test/',{headers:{cookie:other.headers.get('set-cookie').split(';')[0]}}),{enabled:true,db,bucket});assert.equal((await call('','GET',undefined,{'x-jugest-channel-id':op.channelId,authorization:'Bearer '+op.token})).status,403);
 }finally{await mf.dispose()}
});
