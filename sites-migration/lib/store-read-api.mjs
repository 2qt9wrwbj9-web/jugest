import{enrichStoredStoreReadPayload}from'../upstream/vps/src/research/store-read-output.mjs';
import{getActiveStoreModel}from'./active-model-view.mjs';
import{openStoreHistory}from'./store-history.mjs';
import {handleAnalysisJobs} from './analysis/job-api.mjs';
import {createStoreReadHandler} from './generated-store-read.mjs';
import {authenticateReceiver,authenticateAssistantRead} from './generated-store-auth.mjs';
import {storeMetadata,canAccessStoreMetadata} from './generated-store-policy.mjs';
import {judgeMachinesPublic} from './generated-judge.mjs';
import {createSitesRelayStore} from './storage/relay-store.mjs';

// Only normalize the database API; SQL, ordering, parsing and output mappings
// remain in the generated original handler. A D1 session keeps successive reads
// on one sequentially consistent session. No request creates or alters schema.
export function readDatabase(binding){
 const session=binding.withSession?.('first-primary')??binding;
 return {prepare(sql){return {
  get(...values){return session.prepare(sql).bind(...values).first()},
  async all(...values){return (await session.prepare(sql).bind(...values).all()).results}
 }}};
}
export async function handleStoreRead(request,{db,bucket,piaAccessMode='owner',piaOwnerChannelIds='',executionEnabled=false}={}){
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
 if(!db||!bucket)return Response.json({ok:false,code:'sites_storage_unavailable'},{status:503,headers});
 const jobsResponse=await handleAnalysisJobs(request,{db,bucket,piaAccessMode,piaOwnerChannelIds,executionEnabled});if(jobsResponse)return jobsResponse;
 const stores=name=>createSitesRelayStore(name,{db,bucket});
 if(new URL(request.url).pathname==='/api/vps/judge/machines'){
  const reply=(value,status=200,extra={})=>Response.json(value,{status,headers:{...headers,...extra}});
  if(request.method!=='POST')return reply({ok:false,code:'method_not_allowed'},405,{allow:'POST'});
  const req={headers:Object.fromEntries(request.headers)},auth=await authenticateReceiver(req,stores)||await authenticateAssistantRead(req,stores);
  if(!auth)return reply({ok:false,code:'unauthorized'},401);
  if(auth.authType==='assistant-read')return reply({ok:false,code:'assistant_read_scope_denied'},403);
  let body;try{const reader=request.body?.getReader(),chunks=[];let size=0;if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>262144){await reader.cancel();return reply({ok:false,code:'body_too_large'},413)}chunks.push(part.value)}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}body=size?JSON.parse(new TextDecoder().decode(bytes)):null}catch{return reply({ok:false,code:'bad_json'},400)}
  if(!Array.isArray(body?.machines))return reply({ok:false,code:'bad_machines'},400);
  if(body.machines.length>200)return reply({ok:false,code:'batch_too_large',maxMachines:200},413);
  return reply(await judgeMachinesPublic(body.machines));
 }
 let response;
 const sendJson=(req,_res,status,payload,extra={})=>{const body=JSON.stringify(payload);response=new Response(req.method==='HEAD'?null:body,{status,headers:{'content-type':'application/json; charset=utf-8',...headers,...extra}})};
 const handler=createStoreReadHandler({db:readDatabase(db),
  authenticateReceiver:req=>authenticateReceiver(req,stores),
  authenticateAssistantRead:req=>authenticateAssistantRead(req,stores),
  // Passkeys, invitations and viewer sessions have not been ported: no cookie
  // is interpreted as permission. PIA owner policy remains explicit and closed.
  auditStoreRead:async(_db,storeId,payload)=>{if(!payload||payload.explanationVersion==='pre-audit-v1')return payload;try{const activeModel=await getActiveStoreModel(db,{storeId});if(!activeModel||activeModel.fingerprint!==String(payload.modelFingerprint||''))return payload;const input=await openStoreHistory(db,storeId,{limit:400}),days=[];for await(const d of input.days)days.push(d);return enrichStoredStoreReadPayload({payload,activeModel,days})}catch{return payload}},
  storeMetadata,canAccessStoreMetadata:(metadata,channel)=>canAccessStoreMetadata(metadata,channel,{piaAccessMode,piaOwnerChannelIds}),sendJson});
 const req={url:request.url,method:request.method,headers:Object.fromEntries(request.headers)};
 await handler(req,{});
 return response;
}
