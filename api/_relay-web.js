// packed JUGEST relay runtime; semantic source contains juggler-relay-v1
import zlib from 'node:zlib';
import { createBlobStore } from './_blob-store.js';
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
    "async function iosCollectorWaitSeconds() {\n  return randomInt(0, 31);\n}",
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
    "async function iosCollectorFindCandidate(s, channelId, index, st, yesterday) {\n  let d = yesterday, guard = 0, blockedUntil = 0, blockedReason = '';",
    "async function iosCollectorFindCandidate(s, channelId, index, st, yesterday) {\n  let d = yesterday, guard = 0, blockedUntil = 0, blockedReason = '';\n  const floor = iosCollectorYearFloor(yesterday);",
    'calendar-year candidate floor');
  source=replaceRequired(source,
    "  while (d && d >= st.startDate && guard++ < IOS_COLLECTOR_LOOKBACK_DAYS) {",
    "  while (d && d >= floor && guard++ < IOS_COLLECTOR_LOOKBACK_DAYS) {",
    'calendar-year candidate loop');
  source=replaceRequired(source,
    "  const yesterday = jstYesterday(), out = [], floor=addIsoDays(yesterday,-(IOS_COLLECTOR_LOOKBACK_DAYS-1));",
    "  const yesterday = jstYesterday(), out = [], floor=iosCollectorYearFloor(yesterday);",
    'calendar-year summaries floor');
  source=replaceRequired(source,
    "    let latestDate = '', missing = 0, d = st.startDate > floor ? st.startDate : floor, guard = 0;",
    "    let latestDate = '', missing = 0, d = floor, guard = 0;",
    'calendar-year summaries loop');
  if(source.includes('date<st.startDate||date>yesterday'))source=source.replaceAll('date<st.startDate||date>yesterday','date<iosCollectorYearFloor(yesterday)||date>yesterday');
  return source;
}

function createConsistentBlobStore(name,options){
  const base=createBlobStore(name,options);
  return {...base,get:(key,getOptions={})=>base.get(key,{...getOptions,useCache:false})};
}

const packed=zlib.gunzipSync(Buffer.from(p0+p1+p2,'base64')).toString('utf8');
const source=patchRelaySource(packed);
const mod=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual',source)(createConsistentBlobStore,createHash,randomBytes,randomInt,timingSafeEqual);
export default mod.default;
export const config=mod.config;
export const __test=mod.__test;
