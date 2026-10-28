import {scheduleDevelopmentAnalysis} from './background-context.mjs';
import {continueDevelopmentJob} from './background-runner.mjs';
import {authenticateReceiver,authenticateAssistantRead} from '../generated-store-auth.mjs';
import {storeMetadata,canAccessStoreMetadata} from '../generated-store-policy.mjs';
import {createSitesRelayStore} from '../storage/relay-store.mjs';
import {enqueueAnalysisJob,advanceAnalysisJob,getAnalysisJob,publicAnalysisJob,readAnalysisJobResult,readLatestAnalysisResult,verifiedResultBody,jsonWrappedStream} from './jobs.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleAnalysisJobs(request,{db,bucket,piaAccessMode='owner',piaOwnerChannelIds='',executionEnabled=false}={}){
 const url=new URL(request.url);let parts;try{parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent)}catch{return null}
 if(parts[0]!=='api'||parts[1]!=='vps'||parts[2]!=='stores')return null;
 const isJobs=parts[4]==='analysis'&&parts[5]==='jobs';
 const isDefault=parts.length===6&&parts[4]==='analysis'&&parts[5]==='default';
 const isStatus=parts.length===5&&parts[4]==='status';
 if(!isJobs&&!isDefault&&!isStatus)return null;
 if(!db||!bucket)return reply({ok:false,code:'sites_storage_unavailable'},503);
 const stores=name=>createSitesRelayStore(name,{db,bucket}),req={headers:Object.fromEntries(request.headers)};
 const auth=await authenticateReceiver(req,stores)||await authenticateAssistantRead(req,stores);
 if(!auth)return reply({ok:false,code:'unauthorized'},401);
 if(auth.authType==='assistant-read')return reply({ok:false,code:'assistant_read_scope_denied'},403);
 const storeId=parts[3],store=await db.prepare('SELECT id,name,source_metadata_json,created_at,updated_at FROM stores WHERE id=?').bind(storeId).first();
 if(!store)return reply({ok:false,code:'store_not_found'},404);
 if(!canAccessStoreMetadata(storeMetadata(store.source_metadata_json),auth.channelId,{piaAccessMode,piaOwnerChannelIds}))return reply({ok:false,code:'forbidden'},403);
 const publicStore={id:store.id,name:store.name,createdAt:store.created_at,updatedAt:store.updated_at};
 try{
  if(isDefault||isStatus){
   if(!['GET','HEAD'].includes(request.method))return reply({ok:false,code:'method_not_allowed'},405);
   const head=await db.prepare("SELECT h.completed_job_id,j.* FROM sites_analysis_heads h JOIN sites_analysis_jobs j ON j.id=h.latest_job_id WHERE h.store_id=? AND h.kind='store-analysis'").bind(storeId).first();
   if(!head?.completed_job_id)return null;
   const completed=await getAnalysisJob(db,head.completed_job_id);
   const suffix=JSON.stringify({businessDate:completed.target_date,payloadHash:completed.output_hash,updatedAt:completed.updated_at}).slice(1);
   if(isDefault){
    const result=await verifiedResultBody({db,bucket,jobId:completed.id,payloadOnly:true});
    return new Response(request.method==='HEAD'?null:jsonWrappedStream(result.body,'{"ok":true,"store":'+JSON.stringify(publicStore)+',"analysis":',','+suffix),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
   }
   return reply({ok:true,store:publicStore,status:{status:head.state==='succeeded'?'analyzed':head.state==='failed'?'failed':'pending',generation:head.id,completedGeneration:completed.id,inputHash:completed.input_hash,outputHash:completed.output_hash},businessDate:completed.target_date,payloadHash:completed.output_hash,updatedAt:completed.updated_at});
  }

  if(request.method==='POST'){
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return reply({ok:false,code:'origin_denied'},403);
   if(!executionEnabled)return reply({ok:false,code:'sites_analysis_execution_not_enabled'},503);
   if(parts.length===6){
    const reader=request.body?.getReader();let size=0,chunks=[];if(reader)while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>4096){await reader.cancel();return reply({ok:false,code:'body_too_large'},413)}chunks.push(p.value)}
    const bytes=new Uint8Array(size);let off=0;for(const b of chunks){bytes.set(b,off);off+=b.length}let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply({ok:false,code:'bad_json'},400)}
    const job=await enqueueAnalysisJob({db,storeId,channelId:auth.channelId,kind:body.kind,targetDate:body.targetDate,historyLimit:body.historyLimit??180,machineBatchSize:body.machineBatchSize??null,requestKey:body.requestKey});
    const background=scheduleDevelopmentAnalysis(()=>continueDevelopmentJob({db,bucket,jobId:job.id}));
    return reply({ok:true,job:publicAnalysisJob(job),background},202);
   }
  }
  if(parts.length===6&&request.method==='GET'){
   const {results}=await db.prepare('SELECT * FROM sites_analysis_jobs WHERE store_id=? AND channel_id=? ORDER BY id DESC LIMIT 100').bind(storeId,auth.channelId).all();return reply({ok:true,jobs:results.map(publicAnalysisJob),executionEnabled});
  }
  const id=Number(parts[6]);if(!Number.isSafeInteger(id)||id<1)return reply({ok:false,code:'bad_job_id'},400);
  const job=await getAnalysisJob(db,id);if(!job||job.store_id!==storeId||job.channel_id!==auth.channelId)return reply({ok:false,code:'job_not_found'},404);
  if(parts.length===7&&request.method==='GET')return reply({ok:true,job:publicAnalysisJob(job)});
  if(parts.length===8&&parts[7]==='runs'&&request.method==='GET'){
   const {results}=await db.prepare('SELECT attempt,state,input_hash,output_hash,timings_json,started_at,ended_at,error_class FROM sites_analysis_job_runs WHERE job_id=? ORDER BY attempt').bind(id).all();
   return reply({ok:true,runs:results.map(r=>({attempt:r.attempt,state:r.state,inputHash:r.input_hash,outputHash:r.output_hash,timings:r.timings_json?JSON.parse(r.timings_json):null,startedAt:r.started_at,endedAt:r.ended_at,error:r.error_class}))});
  }
  if(parts.length===8&&parts[7]==='advance'&&request.method==='POST')return reply({ok:true,job:publicAnalysisJob(await advanceAnalysisJob({db,bucket,jobId:id}))});
  if(parts.length===8&&parts[7]==='result'&&request.method==='GET'){
   const result=await verifiedResultBody({db,bucket,jobId:id});return result?new Response(jsonWrappedStream(result.body,'{"ok":true,"result":','}'),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}):reply({ok:false,code:'analysis_not_complete'},409);
  }
  return reply({ok:false,code:'method_not_allowed'},405);
 }catch(error){const code=error.code||'analysis_request_failed';return reply({ok:false,code},code==='idempotency_conflict'?409:code.startsWith('bad_')?400:500)}
}
