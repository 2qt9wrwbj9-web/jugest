// packed JUGEST relay runtime; semantic source contains juggler-relay-v1
import zlib from 'node:zlib';
import { createBlobStore } from './_blob-store.js';
import { createCollectorBatchDispatcher } from './_collector-batch-v3.js';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import p0 from './_relay-payload-0.js';
import p1 from './_relay-payload-1.js';
import p2 from './_relay-payload-2.js';

function replaceRequired(source,from,to,label){
  if(!source.includes(from))throw new Error(`Relay runtime patch anchor missing: ${label}`);
  return source.replace(from,to);
}

export function patchRelaySource(input){
  let source=String(input||'');
  source=replaceRequired(source,
    "async function iosCollectorWaitSeconds(s, channelId) {\n  let rec = await s.get(iosCollectorWindowKey(channelId), { type:'json' });\n  const t = now();\n  if (!rec || !Array.isArray(rec.offsets) || +rec.startedAt + 900000 <= t) rec = { startedAt:t, offsets:iosCollectorMakeOffsets(), used:0 };\n  if((+rec.used||0)>=5)return null;\n  const i = Math.max(0, Math.min(4, +rec.used || 0)), target = +rec.startedAt + (+rec.offsets[i] || 0) * 1000;\n  rec.used = i + 1; rec.lastTouchAt = t; await s.setJSON(iosCollectorWindowKey(channelId), rec);\n  return Math.max(0, Math.min(800, Math.ceil((target - t) / 1000)));\n}",
    "async function iosCollectorWaitSeconds() {\n  return randomInt(10, 31);\n}",
    'single-fetch short jitter');
  source=replaceRequired(source,
    "  if(!(await iosCollectorWindowCapacity(s,auth.channelId)))return json(req,{ok:true,state:'WAIT',reason:'rate_limit',waitSeconds:await iosCollectorWindowRetrySeconds(s,auth.channelId),message:'15分5件の取得間隔を調整中'});\n",
    "",
    'remove 15-minute collector window limit');
  source=replaceRequired(source,
    "  return isoDateUTC(d);\n}\nfunction iosPriority(v) {",
    "  return isoDateUTC(d);\n}\nfunction iosCollectorYearFloor(date) {\n  const p=String(date||'').split('-').map(Number),y=p[0]-1,m=p[1],day=p[2];\n  if(!Number.isFinite(y)||!Number.isFinite(m)||!Number.isFinite(day))return '';\n  const maxDay=new Date(Date.UTC(y,m,0)).getUTCDate(),d=Math.min(day,maxDay);\n  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;\n}\nfunction iosPriority(v) {",
    'calendar-year helper');
  source=replaceRequired(source,
    "function iosCollectorWindowKey(channelId) { return `ios-window/${channelId}`; }\nfunction iosCollectorCanonicalUrl(date, slug) {",
    "function iosCollectorWindowKey(channelId) { return `ios-window/${channelId}`; }\nfunction iosCollectorCoverageKey(channelId, sourceStoreId) { return `ios-coverage/${channelId}/${collectorStoreHash(sourceStoreId)}`; }\nasync function iosCollectorCoverageState(s, channelId, sourceStoreId) {\n  const rec=await s.get(iosCollectorCoverageKey(channelId,sourceStoreId),{type:'json'}),clean=a=>new Set((Array.isArray(a)?a:[]).map(String).filter(validCollectorDate));\n  return {dates:clean(rec?.dates),force:clean(rec?.force)};\n}\nasync function iosCollectorWriteCoverage(s,channelId,sourceStoreId,state){\n  const yesterday=jstYesterday(),floor=iosCollectorYearFloor(yesterday),trim=set=>[...set].filter(d=>validCollectorDate(d)&&d>=floor&&d<=yesterday).sort().slice(-370);\n  await s.setJSON(iosCollectorCoverageKey(channelId,sourceStoreId),{version:1,sourceStoreId,dates:trim(state.dates),force:trim(state.force),updatedAt:now()});\n}\nasync function iosCollectorSyncLocalCoverage(s,channelId,cfg,rows){\n  const yesterday=jstYesterday(),floor=iosCollectorYearFloor(yesterday);\n  for(const row of (Array.isArray(rows)?rows:[]).slice(0,100)){\n    const id=String(row?.sourceStoreId||''),shopToken=iosIdentityToken(row?.shop||'');\n    const st=cfg.stores.find(x=>(id&&x.sourceStoreId===id)||(!id&&shopToken&&iosIdentityToken(x.shop)===shopToken));\n    if(!st)continue;\n    const incoming=[...new Set((Array.isArray(row?.dates)?row.dates:[]).map(String).filter(d=>validCollectorDate(d)&&d>=floor&&d<=yesterday))].sort().slice(-370);\n    if(!incoming.length)continue;\n    const state=await iosCollectorCoverageState(s,channelId,st.sourceStoreId);for(const d of incoming)state.dates.add(d);\n    await iosCollectorWriteCoverage(s,channelId,st.sourceStoreId,state);\n  }\n}\nasync function iosCollectorSetCoverageForce(s,channelId,sourceStoreId,date,forced){\n  const state=await iosCollectorCoverageState(s,channelId,sourceStoreId);if(forced)state.force.add(date);else state.force.delete(date);await iosCollectorWriteCoverage(s,channelId,sourceStoreId,state);\n}\nfunction iosCollectorCanonicalUrl(date, slug) {",
    'local coverage helpers');
  source=replaceRequired(source,
    "async function iosCollectorFindCandidate(s, channelId, index, st, yesterday) {\n  let d = yesterday, guard = 0, blockedUntil = 0, blockedReason = '';",
    "async function iosCollectorFindCandidate(s, channelId, index, st, yesterday) {\n  let d = yesterday, guard = 0, blockedUntil = 0, blockedReason = '';\n  const floor = iosCollectorYearFloor(yesterday);\n  const coverage = await iosCollectorCoverageState(s,channelId,st.sourceStoreId);",
    'calendar-year candidate floor and coverage');
  source=replaceRequired(source,
    "  while (d && d >= st.startDate && guard++ < IOS_COLLECTOR_LOOKBACK_DAYS) {",
    "  while (d && d >= floor && guard++ < IOS_COLLECTOR_LOOKBACK_DAYS) {",
    'calendar-year candidate loop');
  source=replaceRequired(source,
    "    const exists = !!index.entries?.[`${collectorStoreHash(st.sourceStoreId)}|${d}`];",
    "    const exists = !coverage.force.has(d) && (!!index.entries?.[`${collectorStoreHash(st.sourceStoreId)}|${d}`] || coverage.dates.has(d));",
    'candidate honors local coverage');
  source=replaceRequired(source,
    "  const yesterday = jstYesterday(), out = [], floor=addIsoDays(yesterday,-(IOS_COLLECTOR_LOOKBACK_DAYS-1));",
    "  const yesterday = jstYesterday(), out = [], floor=iosCollectorYearFloor(yesterday);",
    'calendar-year summaries floor');
  source=replaceRequired(source,
    "  for (const st of cfg.stores) {\n    let latestDate = '', missing = 0, d = st.startDate > floor ? st.startDate : floor, guard = 0;",
    "  for (const st of cfg.stores) {\n    const coverage=await iosCollectorCoverageState(s,channelId,st.sourceStoreId);\n    let latestDate = '', missing = 0, d = floor, guard = 0;",
    'calendar-year summaries loop and coverage');
  source=replaceRequired(source,
    "      const e = index.entries?.[`${collectorStoreHash(st.sourceStoreId)}|${d}`];\n      if (e) { if (!latestDate || d > latestDate) latestDate = d; } else missing++;",
    "      const e = index.entries?.[`${collectorStoreHash(st.sourceStoreId)}|${d}`],exists=!coverage.force.has(d)&&(!!e||coverage.dates.has(d));\n      if (exists) { if (!latestDate || d > latestDate) latestDate = d; } else missing++;",
    'summaries honor local coverage');
  source=replaceRequired(source,
    "  const iosConfig = await getIosCollectorConfig(s, body.channelId), targets=await iosCollectorTargetSummaries(s,body.channelId,iosConfig,index);",
    "  const iosConfig = await getIosCollectorConfig(s, body.channelId);\n  await iosCollectorSyncLocalCoverage(s,body.channelId,iosConfig,body.localCoverage);\n  const targets=await iosCollectorTargetSummaries(s,body.channelId,iosConfig,index);",
    'collector status syncs local coverage');
  source=replaceRequired(source,
    "  await iosCollectorClearFailure(s,body.channelId,id,date);try{await s.delete(iosCollectorLeaseKey(body.channelId,id,date))}catch{}\n  return json(req,{ok:true,requeued:!!entry,shop:st.shop,date,revision:+index.revision||0});",
    "  await iosCollectorClearFailure(s,body.channelId,id,date);try{await s.delete(iosCollectorLeaseKey(body.channelId,id,date))}catch{}\n  await iosCollectorSetCoverageForce(s,body.channelId,id,date,true);\n  return json(req,{ok:true,requeued:!!entry,shop:st.shop,date,revision:+index.revision||0});",
    'manual requeue overrides local coverage');
  source=replaceRequired(source,
    "async function iosCollectorFinishSuccess(s,channelId,cfg,st,date){\n  await iosCollectorClearFailure(s,channelId,st.sourceStoreId,date); try{await s.delete(iosCollectorLeaseKey(channelId,st.sourceStoreId,date))}catch{}",
    "async function iosCollectorFinishSuccess(s,channelId,cfg,st,date){\n  await iosCollectorClearFailure(s,channelId,st.sourceStoreId,date); try{await s.delete(iosCollectorLeaseKey(channelId,st.sourceStoreId,date))}catch{}\n  await iosCollectorSetCoverageForce(s,channelId,st.sourceStoreId,date,false);",
    'successful fetch clears force requeue');
  source=replaceRequired(source,
    "  const rec=await saveIosCollectorConfig(s,body.channelId,cfg); return json(req,{ok:true,stores:rec.stores,updatedAt:rec.updatedAt});",
    "  const rec=await saveIosCollectorConfig(s,body.channelId,cfg);try{await s.delete(iosCollectorCoverageKey(body.channelId,id))}catch{} return json(req,{ok:true,stores:rec.stores,updatedAt:rec.updatedAt});",
    'target delete clears local coverage');
  source=replaceRequired(source,
    "    for(const prefix of [`ios-job/${channelId}/`,`ios-lease/${channelId}/`,`ios-failure/${channelId}/`]){try{const {blobs}=await s.list({prefix});keys.push(...blobs.map(x=>x.key))}catch{}}",
    "    for(const prefix of [`ios-job/${channelId}/`,`ios-lease/${channelId}/`,`ios-failure/${channelId}/`,`ios-coverage/${channelId}/`]){try{const {blobs}=await s.list({prefix});keys.push(...blobs.map(x=>x.key))}catch{}}",
    'collector cleanup includes local coverage');
  if(source.includes('date<st.startDate||date>yesterday'))source=source.replaceAll('date<st.startDate||date>yesterday','date<iosCollectorYearFloor(yesterday)||date>yesterday');
  return source;
}

function createConsistentBlobStore(name,options){
  // Preview may share a suspended Blob credential with Production. A separate
  // namespace prevents a Preview migration from shadowing live Collector data.
  const root=process.env.VERCEL_ENV==='preview'?'jugest-preview-collector-v3':'jugest';
  const base=createBlobStore(name,{...options,root});
  return {...base,get:(key,getOptions={})=>base.get(key,{...getOptions,useCache:false})};
}

const packed=zlib.gunzipSync(Buffer.from(p0+p1+p2,'base64')).toString('utf8');
export function createRelayRuntime({createStore=createConsistentBlobStore,batch=true}={}){
  let source=patchRelaySource(packed);
  let dispatchCollector=async()=>null;
  if(batch){
    const names=['json','fail','token','digest','byteLength','secureMatch','parseCollectorKey','iosCollectorJobKey','iosCollectorLeaseKey','collectorStoreHash','collectorIndexKey','getCollectorIndex','getIosCollectorConfig','iosCollectorIssueJob','iosCollectorTransportForJob','iosCollectorFinishFailure','iosCollectorPushV2'];
    const actions={rotateIosCollectorKey:'rotateIosCollectorKey',claimPair:'claimPair',pairStatus:'pairStatus',send:'sendMessage',collectorPush:'collectorPush',iosCollectorConfigure:'iosCollectorConfigure',iosCollectorTargets:'iosCollectorTargets',iosCollectorTargetUpsert:'iosCollectorTargetUpsert',iosCollectorTargetDelete:'iosCollectorTargetDelete',iosCollectorRequeueDate:'iosCollectorRequeueDate',iosCollectorNext:'iosCollectorNext',iosCollectorNextV2:'iosCollectorNextV2',iosCollectorHtmlPush:'iosCollectorHtmlPush',iosCollectorPushV2:'iosCollectorPushV2',collectorPull:'collectorPull',collectorStatus:'collectorStatus',peek:'peekInbox',receive:'receiveMessage',ack:'ackMessage',unlink:'unlink'};
    source=replaceRequired(source,'    const s = store();','    const s = store();\n    const intercepted = await dispatchCollector(req,s,body);\n    if(intercepted)return intercepted;','transaction dispatch');
    source=replaceRequired(source,'if (!rec || +rec.expiresAt < t) stale.push(b.key);','if (!rec || +rec.expiresAt + (rec.batchId ? 86400000 : 0) < t) stale.push(b.key);','batch receipt retention');
    source=replaceRequired(source,'return {default:defaultHandler,config,__test};',`return {default:defaultHandler,config,__test,collectorApi:{${names.join(',')},actions:{${Object.entries(actions).map(([k,v])=>`${k}:${v}`).join(',')}}}};`,'legacy collector helpers');
  }
  const runtime=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual','dispatchCollector',source)(createStore,createHash,randomBytes,randomInt,timingSafeEqual,(...args)=>dispatchCollector(...args));
  if(batch)dispatchCollector=createCollectorBatchDispatcher(runtime.collectorApi);
  return runtime;
}
const mod=createRelayRuntime();
export default mod.default;
export const config=mod.config;
export const __test=mod.__test;
