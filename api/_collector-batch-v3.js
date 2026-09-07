import {readCollectorState,transactCollector,collectorReadStore} from './_collector-state-v3.js';

const MAX_JOBS=5,INTERVAL_MS=15*60*1000,RECEIPT_MS=24*60*60*1000;
export const MAX_BATCH_BYTES=4_000_000;
const readerActions=new Set(['pairStatus','send','peek','receive','ack','collectorPull','iosCollectorTargets']);
const senderActions=new Set(['send','collectorPush']);
const keyActions=new Set(['iosCollectorNext','iosCollectorNextV2','iosCollectorHtmlPush','iosCollectorPushV2','iosCollectorNextBatchV3','iosCollectorPushBatchV3']);

function batchStatus(L,req,reason,until){
  return L.json(req,{ok:true,state:'WAIT',reason,waitSeconds:Math.max(1,Math.ceil((until-Date.now())/1000))});
}
async function nextBatch(L,req,s,body,id){
  const configured=await L.getIosCollectorConfig(s,id);
  if(!configured.stores.some(x=>x.enabled))return L.json(req,{ok:true,state:'DONE',reason:'no_targets',jobs:[]});
  const controlKey=`batch-control/${id}`,control=await s.get(controlKey,{type:'json'}),now=Date.now();
  if(control){
    let active=false;
    for(const jobToken of control.jobTokens||[]){
      const job=await s.get(L.iosCollectorJobKey(id,jobToken),{type:'json'});
      if(job?.status==='issued'&&job.expiresAt>now)active=true;
    }
    if(active)return batchStatus(L,req,'active_batch',control.expiresAt);
    if(control.nextAt>now)return batchStatus(L,req,'batch_interval',control.nextAt);
  }
  const jobs=[],batchId=L.token(18);let last;
  for(let i=0;i<MAX_JOBS;i++){
    last=await L.iosCollectorIssueJob(s,id);const {cfg,job}=last;if(!job)break;
    const st=cfg.stores.find(x=>x.sourceStoreId===job.sourceStoreId&&x.slug===job.slug);
    const transport=await L.iosCollectorTransportForJob(s,id,st,job.date);
    Object.assign(job,{batchId,transportMode:transport.mode,requestUrl:transport.requestUrl,canonicalUrl:transport.canonicalUrl});
    await s.setJSON(L.iosCollectorJobKey(id,job.jobToken),job);
    jobs.push({jobToken:job.jobToken,sourceStoreId:job.sourceStoreId,shop:job.shop,date:job.date,url:job.requestUrl,transportMode:job.transportMode});
  }
  if(!jobs.length){
    if(last?.blockedUntil>now)return batchStatus(L,req,last.blockedReason,last.blockedUntil);
    return L.json(req,{ok:true,state:'DONE',reason:last?.cfg.stores.some(x=>x.enabled)?'complete':'no_targets',jobs:[]});
  }
  const expiresAt=now+20*60*1000;
  await s.setJSON(controlKey,{batchId,jobTokens:jobs.map(j=>j.jobToken),issuedAt:now,expiresAt,nextAt:now+INTERVAL_MS});
  // Receipts are retained for a day; pruning is in memory and uses no list call.
  const {blobs}=await s.list({prefix:`ios-job/${id}/`});
  for(const {key} of blobs){const j=await s.get(key,{type:'json'});if(j&&j.expiresAt+RECEIPT_MS<now)await s.delete(key)}
  return L.json(req,{ok:true,state:'RUN',batchId,jobs,expiresAt,betweenJobsSeconds:2,maxPushBytes:MAX_BATCH_BYTES,nextRequestAfter:now+INTERVAL_MS});
}

async function checkedJob(L,s,id,jobToken){
  const job=await s.get(L.iosCollectorJobKey(id,jobToken),{type:'json'});
  if(!job||job.channelId!==id||job.jobToken!==jobToken)return{error:'job_missing'};
  if(job.status==='cancelled')return{job,error:'job_cancelled'};
  if(job.receipt)return{job,receipt:job.receipt};
  if(job.status==='saved')return{job,receipt:{ok:true,state:'SAVED',date:job.date,shop:job.shop}};
  if(job.expiresAt<=Date.now())return{job,error:'job_expired'};
  const lease=await s.get(L.iosCollectorLeaseKey(id,job.sourceStoreId,job.date),{type:'json'});
  if(!lease||lease.until<=Date.now()||lease.jobTokenHash!==L.digest(jobToken))return{job,error:'lease_conflict'};
  return{job};
}

async function pushBatch(L,req,s,body,id){
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(String(body.batchId||''))||!Array.isArray(body.results)||!body.results.length||body.results.length>MAX_JOBS)
    return L.fail(req,400,'batchIdと1〜5件の結果を送ってください','bad_batch');
  if(L.byteLength(body)>MAX_BATCH_BYTES)return L.fail(req,413,'本文を分けて、同じbatchIdで送信してください','batch_too_large');
  const results=[];let saved=0,failed=0,duplicates=0;
  for(const row of body.results){
    const jobToken=String(row?.jobToken||''),checked=await checkedJob(L,s,id,jobToken),job=checked.job;
    if(job&&job.batchId!==body.batchId){results.push({jobToken,ok:false,code:'batch_mismatch'});failed++;continue}
    if(checked.error){results.push({jobToken,ok:false,code:checked.error});failed++;continue}
    if(checked.receipt){results.push({jobToken,...checked.receipt,duplicate:true});duplicates++;continue}
    let result;
    if(row.error||!String(row.text??row.html??'').trim()){
      const cfg=await L.getIosCollectorConfig(s,id),st=cfg.stores.find(x=>x.sourceStoreId===job.sourceStoreId&&x.slug===job.slug);
      if(!st){results.push({jobToken,ok:false,code:'store_not_configured'});failed++;continue}
      const code='fetch_failed';
      const f=await L.iosCollectorFinishFailure(s,id,cfg,st,job.date,code,String(row.error||'empty_input').slice(0,240));
      job.status='failed';job.errorCode=code;await s.setJSON(L.iosCollectorJobKey(id,jobToken),job);
      result={ok:false,state:'FAILED',code,nextRetryAt:f.nextRetryAt,date:job.date,shop:job.shop};
    }else{
      const response=await L.iosCollectorPushV2(req,s,{...row,collectorKey:body.collectorKey});
      result=await response.json();
      // Per-page diagnostics remain available but are not copied into receipts.
      if(response.status>=500)throw new Error('Collector parser failed');
    }
    const updated=await s.get(L.iosCollectorJobKey(id,jobToken),{type:'json'});
    if(updated&&['saved','failed'].includes(updated.status)){
      updated.receipt={ok:!!result.ok,state:result.ok?'SAVED':'FAILED',date:job.date,shop:job.shop,
        ...(result.ok?{revision:result.revision}:{code:result.code,nextRetryAt:result.nextRetryAt})};
      await s.setJSON(L.iosCollectorJobKey(id,jobToken),updated);
    }
    if(result.ok)saved++;else failed++;
    results.push({jobToken,...result});
  }
  return L.json(req,{ok:true,state:'PROCESSED',batchId:body.batchId,saved,failed,duplicates,results});
}

async function invalidateJobs(L,s,state,id,sourceStoreId,date,remove=false){
  for(const [key,job] of Object.entries(state.values)){
    if(key.startsWith(`ios-job/${id}/`)&&job.sourceStoreId===sourceStoreId&&(!date||job.date===date)){
      if(remove)await s.delete(key);
      else{job.status='cancelled';delete job.receipt;await s.setJSON(key,job)}
    }
  }
}

async function cleanupTarget(L,s,state,id,sourceStoreId,base){
  await invalidateJobs(L,s,state,id,sourceStoreId,'',true);
  const hash=L.collectorStoreHash(sourceStoreId),index=await L.getCollectorIndex(s,id),removedPacks=new Set();
  // Administrative cleanup also finds unpublished packs from interrupted
  // writes. Normal Next/Push never list payload storage.
  const {blobs}=await base.list({prefix:`collector-pack-v3/${id}/`});
  for(const {key} of blobs){
    const pack=await base.get(key,{type:'json',useCache:false});
    if(pack?.version===3&&pack.channelId===id&&Object.values(pack.days||{}).some(x=>x.sourceStoreId===sourceStoreId)){
      removedPacks.add(key);state.garbage.push(key);
    }
  }
  for(const [ik,entry] of Object.entries(index.entries))if(entry.sourceStoreId===sourceStoreId){
    if(state.days[entry.key])removedPacks.add(state.days[entry.key].pack);
    await s.delete(entry.key);delete index.entries[ik];
  }
  await s.setJSON(L.collectorIndexKey(id),index);
  for(const key of Object.keys(state.values))if(['ios-lease','ios-failure','ios-coverage'].some(p=>key.startsWith(`${p}/${id}/${hash}`)))await s.delete(key);
  // If a pack spans stores, move its remaining days before reclaiming that pack.
  for(const [key,ref] of Object.entries(state.days))if(ref&&removedPacks.has(ref.pack))await s.setJSON(key,await s.get(key,{type:'json'}));
  state.garbage.push(...state.legacyKeys);state.legacyKeys=[];
}

export function createCollectorBatchDispatcher(L){
  return async function dispatch(req,base,body){
    const action=String(body.action||''),isV3=action==='iosCollectorNextBatchV3'||action==='iosCollectorPushBatchV3';
    if(!isV3&&!L.actions[action])return null;
    const key=keyActions.has(action)?L.parseCollectorKey(body.collectorKey):null;
    if(keyActions.has(action)&&!key)return L.fail(req,401,'Collectorキーが無効です','unauthorized');
    let pending=null,id=String(key?key.channelId:body.channelId||'');
    if(action==='claimPair'){
      const code=String(body.code||'').replace(/\D/g,'').slice(0,6);
      if(!/^\d{6}$/.test(code))return null;
      pending=await base.get(`code/${code}`,{type:'json',useCache:false});id=pending?.channelId||'';
      if(!pending||pending.expiresAt<=Date.now())return null;
    }
    if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))return isV3?L.fail(req,401,'Collectorキーが無効です','unauthorized'):null;
    const snapshot=await readCollectorState(base,id);
    const s=snapshot?collectorReadStore(base,id,snapshot):base;
    const channel=await s.get(`channel/${id}`,{type:'json',useCache:false});
    const sender=senderActions.has(action)||!!key;
    const authorized=channel&&(!channel.revokedAt||action==='unlink')&&(action==='claimPair'||L.secureMatch(sender?(key?.senderToken||body.senderToken):body.receiverToken,sender?channel.senderHash:channel.receiverHash));
    if(!authorized)return L.fail(req,401,'Collector連携が無効です','unauthorized');
    const readOnly=readerActions.has(action)||(action==='collectorStatus'&&!body.localCoverage?.length);
    if(readOnly)return await L.actions[action](req,s,body);
    return await transactCollector(base,id,snapshot,channel,async (tx,state)=>{
      const ch=await tx.get(`channel/${id}`,{type:'json'});
      if(!ch||(ch.revokedAt&&action!=='unlink')||(action!=='claimPair'&&!L.secureMatch(sender?(key?.senderToken||body.senderToken):body.receiverToken,sender?ch.senderHash:ch.receiverHash)))
        return{response:L.fail(req,401,'Collector連携が無効です','unauthorized'),commit:false};
      let response;
      if(action==='unlink'&&ch.revokedAt)response=L.json(req,{ok:true,cleanupRetry:true});
      else if(action==='iosCollectorNextBatchV3')response=await nextBatch(L,req,tx,body,id);
      else if(action==='iosCollectorPushBatchV3')response=await pushBatch(L,req,tx,body,id);
      else{
        if(action==='iosCollectorPushV2'){
          const checked=await checkedJob(L,tx,id,String(body.jobToken||''));
          if(checked.error)return{response:L.fail(req,checked.error==='job_missing'?404:checked.error==='job_expired'?410:409,'取得ジョブを再発行してください',checked.error),commit:false};
          if(checked.receipt)return{response:L.json(req,{...checked.receipt,duplicate:true}),commit:false};
        }
        response=await L.actions[action](req,tx,body);
      }
      if(response.status>=400&&!(action==='iosCollectorPushV2'&&response.status===422))return{response,commit:false};
      if(action==='iosCollectorRequeueDate')await invalidateJobs(L,tx,state,id,String(body.sourceStoreId||''),String(body.date||''));
      if(action==='iosCollectorTargetDelete')await cleanupTarget(L,tx,state,id,String(body.sourceStoreId||''),base);
      if(action==='unlink'){
        state.garbage.push(...state.legacyKeys,`channel/${id}`);state.legacyKeys=[];
        for(const prefix of [`collector-day/${id}/`,`collector-pack-v3/${id}/`]){
          const {blobs}=await base.list({prefix});state.garbage.push(...blobs.map(x=>x.key));
        }
        state.days={};state.values={[`channel/${id}`]:await tx.get(`channel/${id}`,{type:'json'})};
      }
      return{response};
    });
  };
}
