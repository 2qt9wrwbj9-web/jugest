import {createStoreReadHandler} from './generated-store-read.mjs';
import {authenticateReceiver,authenticateAssistantRead} from './generated-store-auth.mjs';
import {storeMetadata,canAccessStoreMetadata} from './generated-store-policy.mjs';
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
export async function handleStoreRead(request,{db,bucket,piaAccessMode='owner',piaOwnerChannelIds=''}={}){
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff'};
 if(!db||!bucket)return Response.json({ok:false,code:'sites_storage_unavailable'},{status:503,headers});
 const stores=name=>createSitesRelayStore(name,{db,bucket});
 let response;
 const sendJson=(req,_res,status,payload,extra={})=>{const body=JSON.stringify(payload);response=new Response(req.method==='HEAD'?null:body,{status,headers:{'content-type':'application/json; charset=utf-8',...headers,...extra}})};
 const handler=createStoreReadHandler({db:readDatabase(db),
  authenticateReceiver:req=>authenticateReceiver(req,stores),
  authenticateAssistantRead:req=>authenticateAssistantRead(req,stores),
  // Passkeys, invitations and viewer sessions have not been ported: no cookie
  // is interpreted as permission. PIA owner policy remains explicit and closed.
  storeMetadata,canAccessStoreMetadata:(metadata,channel)=>canAccessStoreMetadata(metadata,channel,{piaAccessMode,piaOwnerChannelIds}),sendJson});
 const req={url:request.url,method:request.method,headers:Object.fromEntries(request.headers)};
 await handler(req,{});
 return response;
}
