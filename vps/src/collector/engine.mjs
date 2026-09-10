import {randomUUID} from 'node:crypto';
import {parseAnaSloHtml} from './ana-parser.mjs';
import {archiveRawHtml} from './archive.mjs';
import {fetchAnaSloDay} from './source.mjs';
import {persistCollectedDay} from './persist.mjs';
import {
  claimCollectorDay,collectorJstDate,ensureCollectorTargets,getCollectorControl,getCollectorDay,
  markCollectorFailure,peekEligibleCollectorDay,recoverExpiredCollectorRuns,setCollectorRunState,setGlobalBlock
} from './repository.mjs';

const RETRY_MS=45*60*1000;
const DEFAULT_LEASE_MS=10*60*1000;
const DEFAULT_MAX_REQUESTS=10;
const DEFAULT_MAX_RUN_MS=4*60*1000;

function plusMs(date,ms){return new Date(date.getTime()+ms).toISOString();}
function asDate(value){const d=value instanceof Date?value:new Date(value);if(!Number.isFinite(d.getTime()))throw new TypeError('clock returned invalid date');return d;}
function boundedInt(value,name,{min=1,max=Number.MAX_SAFE_INTEGER}={}){
  if(!Number.isInteger(value)||value<min||value>max)throw new TypeError(`${name} must be an integer in range`);
  return value;
}
function paceMs(random){
  const n=Number(random());if(!Number.isFinite(n))throw new TypeError('random must return a finite number');
  const clamped=Math.max(0,Math.min(1,n));
  return 10000+Math.floor(clamped*20000);
}
function errorClass(error){
  if(error?.collectorClass)return error.collectorClass;
  if(error?.name==='AbortError'||error?.name==='TimeoutError')return 'timeout';
  return 'network_or_processing';
}
function sanitizedMessage(error){return String(error?.message||error||'collector failure').slice(0,1000);}
function sourceError(response){
  const error=new Error(`HTTP ${response.status}${response.statusText?` ${response.statusText}`:''}`);
  error.httpStatus=response.status;
  error.collectorClass='http';
  return error;
}
function parserError(message='supported machine rows not found'){
  const error=new Error(message);error.collectorClass='parse';return error;
}

export async function runCollectorOnce({
  db,
  rawRoot='/var/lib/jugest/collector/raw',
  clock=()=>new Date(),
  transport=globalThis.fetch,
  parser=parseAnaSloHtml,
  archive=archiveRawHtml,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  random=Math.random,
  owner=`collector-${process.pid}-${randomUUID()}`,
  requestTimeoutMs=20000,
  maxRequests=DEFAULT_MAX_REQUESTS,
  maxRunMs=DEFAULT_MAX_RUN_MS,
  leaseMs=DEFAULT_LEASE_MS
}={}){
  if(!db?.prepare)throw new TypeError('db is required');
  if(typeof parser!=='function'||typeof archive!=='function'||typeof sleep!=='function'||typeof random!=='function')throw new TypeError('collector dependencies must be functions');
  boundedInt(maxRequests,'maxRequests',{max:1000});boundedInt(maxRunMs,'maxRunMs');boundedInt(leaseMs,'leaseMs');
  const started=asDate(clock());const startedIso=started.toISOString();
  const summary={result:'idle',attempted:0,collected:0,failed:0,excluded:0,blockedUntil:null,nextEligible:null};

  recoverExpiredCollectorRuns(db,{nowIso:startedIso});
  ensureCollectorTargets(db,{now:started,historyBackfill:false});
  setCollectorRunState(db,{startedAt:startedIso,nowIso:startedIso});

  const initialControl=getCollectorControl(db);
  if(initialControl.globalBlockUntil&&Date.parse(initialControl.globalBlockUntil)>started.getTime()){
    summary.result='blocked';summary.blockedUntil=initialControl.globalBlockUntil;
    setCollectorRunState(db,{endedAt:startedIso,result:'blocked',nowIso:startedIso});
    return summary;
  }

  while(summary.attempted<maxRequests){
    const now=asDate(clock()),nowIso=now.toISOString();
    if(now.getTime()-started.getTime()>=maxRunMs)break;
    const control=getCollectorControl(db);
    if(control.globalBlockUntil&&Date.parse(control.globalBlockUntil)>now.getTime()){
      summary.result='blocked';summary.blockedUntil=control.globalBlockUntil;break;
    }
    const target=peekEligibleCollectorDay(db,{nowIso,todayJst:collectorJstDate(now)});
    if(!target)break;
    const claimed=claimCollectorDay(db,{storeId:target.storeId,businessDate:target.businessDate,owner,nowIso,leaseExpiresIso:plusMs(now,leaseMs)});
    if(!claimed)continue;

    let globallyBlocked=false;
    summary.attempted++;
    try{
      const response=await fetchAnaSloDay({date:target.businessDate,slug:target.slug,transport,timeoutMs:requestTimeoutMs});
      if(!response.ok)throw sourceError(response);
      if(typeof response.html!=='string'||response.html.trim().length===0)throw parserError('empty HTML response');
      const day=parser({html:response.html,date:target.businessDate,sourceUrl:response.finalUrl});
      if(!day||!Array.isArray(day.machines)||day.machines.length===0)throw parserError('HTTP 200 but supported machine rows were not found');
      if(day.quality?.grade==='D')throw parserError(`parser quality D: ${(day.quality.warnings||[]).join(' / ')||'quality check failed'}`);
      const rawArtifact=await archive({root:rawRoot,storeId:target.storeId,date:target.businessDate,html:response.html});
      persistCollectedDay(db,{store:{storeId:target.storeId,name:target.name,slug:target.slug},day,rawArtifact,nowIso:asDate(clock()).toISOString()});
      summary.collected++;
    }catch(error){
      const failureNow=asDate(clock()),failureIso=failureNow.toISOString();
      const status=Number.isInteger(error?.httpStatus)?error.httpStatus:null;
      let row=getCollectorDay(db,target.storeId,target.businessDate);
      if(row?.state==='running')row=markCollectorFailure(db,{storeId:target.storeId,businessDate:target.businessDate,nowIso:failureIso,httpStatus:status,errorClass:errorClass(error),message:sanitizedMessage(error)});
      if(row?.state==='excluded')summary.excluded++;else summary.failed++;
      if(status===403||status===429){
        const until=plusMs(failureNow,RETRY_MS);
        setGlobalBlock(db,{untilIso:until,nowIso:failureIso});
        summary.result='blocked';summary.blockedUntil=until;globallyBlocked=true;
      }
    }

    if(globallyBlocked)break;
    if(summary.attempted>=maxRequests)break;
    const after=asDate(clock()),afterIso=after.toISOString();
    if(after.getTime()-started.getTime()>=maxRunMs)break;
    const next=peekEligibleCollectorDay(db,{nowIso:afterIso,todayJst:collectorJstDate(after)});
    if(!next)break;
    await sleep(paceMs(random));
  }

  const ended=asDate(clock()),endedIso=ended.toISOString();
  if(summary.result!=='blocked')summary.result=summary.collected>0?'success':summary.failed>0||summary.excluded>0?'failed':'idle';
  const next=peekEligibleCollectorDay(db,{nowIso:endedIso,todayJst:collectorJstDate(ended)});
  summary.nextEligible=next?{storeId:next.storeId,businessDate:next.businessDate}:null;
  setCollectorRunState(db,{endedAt:endedIso,result:summary.result,nowIso:endedIso});
  return summary;
}
