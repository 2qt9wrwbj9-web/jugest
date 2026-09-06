import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const STORE_NAME = 'juggler-relay-v1';
const PAIR_TTL_MS = 10 * 60 * 1000;
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 4_500_000;
const COLLECTOR_PULL_LIMIT = 45;
const COLLECTOR_INDEX_VERSION = 1;
const IOS_COLLECTOR_CONFIG_VERSION = 2;
const IOS_COLLECTOR_MAX_STORES = 50;
const IOS_COLLECTOR_MAX_INPUT_BYTES = 5_000_000;
const IOS_COLLECTOR_JOB_TTL_MS = 20 * 60 * 1000;
const IOS_COLLECTOR_RETRY_BASE_MS = 15 * 60 * 1000;
const IOS_COLLECTOR_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
const IOS_COLLECTOR_LOOKBACK_DAYS = 420;
const ALLOWED_ORIGINS = new Set([
  'https://jugglerest.netlify.app',
  'https://ana-slo.com',
  'https://www.ana-slo.com',
]);

const store = () => getStore({ name: STORE_NAME, consistency: 'strong' });
const now = () => Date.now();
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
const digest = (value) => createHash('sha256').update(String(value || '')).digest('hex');
const byteLength = (value) => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');

function secureMatch(raw, expectedHash) {
  if (!raw || !expectedHash) return false;
  const a = Buffer.from(digest(raw), 'hex');
  const b = Buffer.from(String(expectedHash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://jugglerest.netlify.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

function fail(req, status, message, code = 'relay_error') {
  return json(req, { ok: false, code, message }, status);
}

async function readBody(req) {
  const text = await req.text();
  if (byteLength(text) > 5_700_000) throw Object.assign(new Error('送信データが大きすぎるよ'), { status: 413 });
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error('JSONを認識できないよ'), { status: 400 }); }
}

async function cleanupExpiredPairCodes(s) {
  try {
    const { blobs } = await s.list({ prefix: 'code/' });
    for (const item of blobs.slice(0, 50)) {
      const rec = await s.get(item.key, { type: 'json' });
      if (!rec || +rec.expiresAt <= now()) await s.delete(item.key);
    }
  } catch {}
}

async function getChannel(s, channelId) {
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(String(channelId || ''))) return null;
  return await s.get(`channel/${channelId}`, { type: 'json' });
}

async function authReceiver(s, channelId, receiverToken) {
  const ch = await getChannel(s, channelId);
  if (!ch || ch.revokedAt || !secureMatch(receiverToken, ch.receiverHash)) return null;
  return ch;
}

async function authSender(s, channelId, senderToken) {
  const ch = await getChannel(s, channelId);
  if (!ch || ch.revokedAt || !ch.senderHash || !secureMatch(senderToken, ch.senderHash)) return null;
  return ch;
}

async function firstActiveMessage(s, channelId) {
  const prefix = `message/${channelId}/`;
  const { blobs } = await s.list({ prefix });
  const items = [...blobs].sort((a, b) => a.key.localeCompare(b.key));
  const active = [];
  for (const item of items) {
    const id = item.key.slice(prefix.length);
    const createdAt = Number(id.split('-')[0]);
    if (Number.isFinite(createdAt) && createdAt + MESSAGE_TTL_MS <= now()) {
      await s.delete(item.key);
      continue;
    }
    active.push(item);
  }
  if (!active.length) return { count: 0, first: null };
  const rec = await s.get(active[0].key, { type: 'json' });
  if (!rec || +rec.expiresAt <= now()) {
    await s.delete(active[0].key);
    return firstActiveMessage(s, channelId);
  }
  return { count: active.length, first: { key: active[0].key, rec } };
}

function messageMeta(rec) {
  const p = rec?.payload || {};
  return {
    messageId: rec?.messageId || '',
    createdAt: +rec?.createdAt || 0,
    expiresAt: +rec?.expiresAt || 0,
    shop: String(p.shop || ''),
    days: Array.isArray(p.days) ? p.days.length : 0,
    successDays: +p.successDays || (Array.isArray(p.days) ? p.days.length : 0),
    batchId: String(rec?.batchId || ''),
    chunkIndex: +rec?.chunkIndex || 1,
    chunkTotal: +rec?.chunkTotal || 1,
  };
}

async function createPair(req, s) {
  await cleanupExpiredPairCodes(s);
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = String(randomInt(100000, 1000000));
    const channelId = token(18);
    const receiverToken = token(32);
    const createdAt = now();
    const expiresAt = createdAt + PAIR_TTL_MS;
    const pending = { channelId, createdAt, expiresAt };
    const r = await s.setJSON(`code/${code}`, pending, { onlyIfNew: true });
    if (!r?.modified) continue;
    await s.setJSON(`channel/${channelId}`, {
      version: 1,
      createdAt,
      claimedAt: 0,
      revokedAt: 0,
      receiverHash: digest(receiverToken),
      senderHash: '',
    });
    return json(req, { ok: true, code, channelId, receiverToken, expiresAt });
  }
  return fail(req, 503, '連携コードを発行できなかったよ。少し待ってもう一度試してね', 'pair_busy');
}

async function claimPair(req, s, body) {
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(code)) return fail(req, 400, '6桁の連携コードを入れてね', 'bad_code');
  const key = `code/${code}`;
  const pending = await s.get(key, { type: 'json' });
  if (!pending || +pending.expiresAt <= now()) {
    if (pending) await s.delete(key);
    return fail(req, 404, '連携コードが見つからないか、有効期限が切れてるよ', 'code_expired');
  }
  const ch = await getChannel(s, pending.channelId);
  if (!ch || ch.revokedAt) {
    await s.delete(key);
    return fail(req, 404, '連携先が見つからないよ。ツール側でコードを発行し直してね', 'channel_missing');
  }
  const senderToken = token(32);
  ch.senderHash = digest(senderToken);
  ch.claimedAt = now();
  await s.setJSON(`channel/${pending.channelId}`, ch);
  await s.delete(key);
  return json(req, { ok: true, channelId: pending.channelId, senderToken, linkedAt: ch.claimedAt });
}

async function pairStatus(req, s, body) {
  const ch = await authReceiver(s, body.channelId, body.receiverToken);
  if (!ch) return fail(req, 401, '連携情報を確認できなかったよ', 'unauthorized');
  return json(req, { ok: true, linked: !!ch.senderHash && !!ch.claimedAt, claimedAt: +ch.claimedAt || 0 });
}

function validatePayload(payload) {
  if (!payload || payload.format !== 'juggler-external-import-bulk' || !Array.isArray(payload.days)) return '送信JSONの形式を認識できないよ';
  if (!String(payload.shop || '').trim()) return '店舗名を認識できないよ';
  if (!payload.days.length || payload.days.length > 400) return '日別データ数が不正だよ';
  if (byteLength(payload) > MAX_PAYLOAD_BYTES) return '1便のJSONが大きすぎるよ。Launcherを最新版にして分割送信してね';
  return '';
}

function iosCollectorConfigKey(channelId) { return `ios-collector-config/${channelId}`; }
function iosCollectorJobKey(channelId, jobToken) { return `ios-job/${channelId}/${digest(jobToken).slice(0, 32)}`; }
function iosCollectorLeaseKey(channelId, sourceStoreId, date) { return `ios-lease/${channelId}/${collectorStoreHash(sourceStoreId)}/${date}`; }
function iosCollectorFailureKey(channelId, sourceStoreId, date) { return `ios-failure/${channelId}/${collectorStoreHash(sourceStoreId)}/${date}`; }
function iosCollectorWindowKey(channelId) { return `ios-window/${channelId}`; }
function iosCollectorCanonicalUrl(date, slug) { return `https://ana-slo.com/${date}-${slug}-data/`; }
function iosCollectorDecodedSlug(slug) {
  let x = String(slug || '');
  try { x = decodeURIComponent(x); } catch {}
  return x;
}
function iosCollectorRawUnicodeUrl(date, slug) {
  const decoded = iosCollectorDecodedSlug(slug);
  // URLの区切り文字を含む特殊なslugは安全側で従来形式へ戻す。
  if (!decoded || /[\/?#%]/.test(decoded)) return iosCollectorCanonicalUrl(date, slug);
  return `https://ana-slo.com/${date}-${decoded}-data/`;
}
function iosCollectorUpperPercentUrl(date, slug) {
  const upper = String(slug || '').replace(/%[0-9a-f]{2}/gi, m => m.toUpperCase());
  return iosCollectorCanonicalUrl(date, upper);
}
async function iosCollectorTransportForJob(s, channelId, st, date) {
  const canonicalUrl = iosCollectorCanonicalUrl(date, st.slug);
  const rawUnicodeUrl = iosCollectorRawUnicodeUrl(date, st.slug);
  const upperPercentUrl = iosCollectorUpperPercentUrl(date, st.slug);
  const hasEncodedNonAscii = /%[89a-f][0-9a-f]/i.test(String(st.slug || '')) && rawUnicodeUrl !== canonicalUrl;
  if (!hasEncodedNonAscii) return { mode:'canonical', requestUrl:canonicalUrl, canonicalUrl };

  // iOS/Shortcuts側で既に%エンコード済みURLが再エンコードされる可能性を切り分ける。
  // まず「日本語の生URL」を渡し、iOSに1回だけエンコードさせる。
  const failure = await iosCollectorFailure(s, channelId, st.sourceStoreId, date);
  const previousMode = String(failure?.transportMode || '');
  if (failure?.code === 'upstream_http_400' && previousMode === 'raw_unicode')
    return { mode:'upper_percent', requestUrl:upperPercentUrl, canonicalUrl };
  if (failure?.code === 'upstream_http_400' && previousMode === 'upper_percent')
    return { mode:'canonical', requestUrl:canonicalUrl, canonicalUrl };
  return { mode:'raw_unicode', requestUrl:rawUnicodeUrl, canonicalUrl };
}
function parseCollectorKey(value) {
  const raw = String(value || '').trim();
  const dot = raw.indexOf('.');
  if (dot < 12) return null;
  const channelId = raw.slice(0, dot), senderToken = raw.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(channelId) || !/^[A-Za-z0-9_-]{20,120}$/.test(senderToken)) return null;
  return { channelId, senderToken };
}
async function authCollectorKey(s, collectorKey) {
  const x = parseCollectorKey(collectorKey);
  if (!x) return null;
  const ch = await authSender(s, x.channelId, x.senderToken);
  return ch ? { ...x, ch } : null;
}
function validCollectorSlug(v) {
  const x = String(v || '').trim();
  return !!x && x.length <= 360 && !/[/?#\\]/.test(x) && /^[A-Za-z0-9%._~!$&'()*+,;=:@-]+$/.test(x);
}
function isoDateUTC(d) { return d.toISOString().slice(0, 10); }
function addIsoDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return isoDateUTC(d);
}
function isoDayDiff(a, b) {
  const x = new Date(`${a}T00:00:00Z`), y = new Date(`${b}T00:00:00Z`);
  return Number.isFinite(x.getTime()) && Number.isFinite(y.getTime()) ? Math.round((y - x) / 86400000) : 9999;
}
function jstYesterday() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoDateUTC(d);
}
function iosPriority(v) {
  const x = String(v ?? '').toLowerCase();
  if (x === 'high' || x === '3') return 3;
  if (x === 'low' || x === '1') return 1;
  const n = +v;
  return n === 3 ? 3 : n === 1 ? 1 : 2;
}
function iosPriorityLabel(v) { return iosPriority(v) === 3 ? '最優先' : iosPriority(v) === 1 ? '低優先' : '通常'; }
function iosStoreRuntime(raw = {}) {
  return {
    dispatchCount: Math.max(0, +raw.dispatchCount || 0),
    lastJobAt: Math.max(0, +raw.lastJobAt || 0),
    lastSuccessAt: Math.max(0, +raw.lastSuccessAt || 0),
    lastErrorAt: Math.max(0, +raw.lastErrorAt || 0),
    lastErrorCode: String(raw.lastErrorCode || '').slice(0, 80),
    failures: Math.max(0, +raw.failures || 0),
  };
}
function parseAnaDetailUrl(value) {
  let u; try { u = new URL(String(value || '').trim()); } catch { return null; }
  if (!['ana-slo.com','www.ana-slo.com'].includes(u.hostname.toLowerCase())) return null;
  const m = u.pathname.match(/^\/(20\d{2}-\d{2}-\d{2})-(.+)-data\/?$/);
  if (!m || !validCollectorSlug(m[2])) return null;
  let shop = m[2]; try { shop = decodeURIComponent(shop); } catch {}
  shop = String(shop).replace(/[-_]+/g, ' ').trim();
  return { date: m[1], slug: m[2], shop: shop || m[2], url: `https://ana-slo.com/${m[1]}-${m[2]}-data/` };
}
function stableIosStoreId(slug) { return `ana:${digest(String(slug || '').toLowerCase()).slice(0, 24)}`; }
function normalizeIosStores(stores) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(stores) ? stores : []) {
    const shop = String(raw?.shop || '').trim(), slug = String(raw?.slug || '').trim(), startDate = String(raw?.startDate || '').trim();
    const sourceStoreId = String(raw?.sourceStoreId || stableIosStoreId(slug)).trim();
    if (!shop || !validCollectorStoreId(sourceStoreId) || !validCollectorSlug(slug) || !validCollectorDate(startDate)) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      shop: shop.slice(0, 240), sourceStoreId, slug, startDate,
      enabled: raw?.enabled !== false,
      priority: iosPriority(raw?.priority),
      runtime: iosStoreRuntime(raw?.runtime),
    });
    if (out.length >= IOS_COLLECTOR_MAX_STORES) break;
  }
  return out;
}
async function getIosCollectorConfig(s, channelId) {
  const x = await s.get(iosCollectorConfigKey(channelId), { type: 'json' });
  if (!x || !Array.isArray(x.stores)) return { version: IOS_COLLECTOR_CONFIG_VERSION, updatedAt: 0, stores: [] };
  return { version: IOS_COLLECTOR_CONFIG_VERSION, updatedAt: +x.updatedAt || 0, stores: normalizeIosStores(x.stores) };
}
async function saveIosCollectorConfig(s, channelId, cfg) {
  const rec = { version: IOS_COLLECTOR_CONFIG_VERSION, updatedAt: now(), stores: normalizeIosStores(cfg?.stores) };
  await s.setJSON(iosCollectorConfigKey(channelId), rec);
  return rec;
}
async function iosCollectorFailure(s, channelId, sourceStoreId, date) {
  return await s.get(iosCollectorFailureKey(channelId, sourceStoreId, date), { type: 'json' });
}
async function iosCollectorRecordFailure(s, channelId, st, date, code, message = '', extra = {}) {
  const key = iosCollectorFailureKey(channelId, st.sourceStoreId, date), old = await s.get(key, { type: 'json' });
  const attempts = Math.max(0, +old?.attempts || 0) + 1;
  const delay = Math.min(IOS_COLLECTOR_RETRY_MAX_MS, IOS_COLLECTOR_RETRY_BASE_MS * (2 ** Math.min(5, attempts - 1)));
  const rec = { attempts, lastErrorAt: now(), nextRetryAt: now() + delay, code: String(code || 'fetch_failed').slice(0, 80), message: String(message || '').slice(0, 240),
    transportMode:String(extra?.transportMode||'').slice(0,40), requestUrl:String(extra?.requestUrl||'').slice(0,900) };
  await s.setJSON(key, rec);
  return rec;
}
async function iosCollectorClearFailure(s, channelId, sourceStoreId, date) { try { await s.delete(iosCollectorFailureKey(channelId, sourceStoreId, date)); } catch {} }
async function iosCollectorLeaseUntil(s, channelId, sourceStoreId, date) {
  const key = iosCollectorLeaseKey(channelId, sourceStoreId, date), x = await s.get(key, { type: 'json' });
  if (!x) return 0;
  const until = +x.until || 0;
  if (until > now()) return until;
  await s.delete(key); return 0;
}
async function iosCollectorLeaseActive(s, channelId, sourceStoreId, date) { return (await iosCollectorLeaseUntil(s, channelId, sourceStoreId, date)) > now(); }
async function iosCollectorFindCandidate(s, channelId, index, st, yesterday) {
  let d = yesterday, guard = 0, blockedUntil = 0, blockedReason = '';
  const rememberBlock = (until, reason) => {
    const u = +until || 0;
    if (u > now() && (!blockedUntil || u < blockedUntil)) { blockedUntil = u; blockedReason = reason; }
  };
  while (d && d >= st.startDate && guard++ < IOS_COLLECTOR_LOOKBACK_DAYS) {
    const exists = !!index.entries?.[`${collectorStoreHash(st.sourceStoreId)}|${d}`];
    if (!exists) {
      const failure = await iosCollectorFailure(s, channelId, st.sourceStoreId, d);
      if (failure && +failure.nextRetryAt > now()) {
        rememberBlock(+failure.nextRetryAt, 'backoff');
      } else {
        const leaseUntil = await iosCollectorLeaseUntil(s, channelId, st.sourceStoreId, d);
        if (leaseUntil > now()) rememberBlock(leaseUntil, 'lease');
        else return { candidate: { st, date: d, ageDays: Math.max(0, isoDayDiff(d, yesterday)) }, blockedUntil, blockedReason };
      }
    }
    d = addIsoDays(d, -1);
  }
  return { candidate: null, blockedUntil, blockedReason };
}
async function iosCollectorChooseJob(s, channelId) {
  const cfg = await getIosCollectorConfig(s, channelId), stores = cfg.stores.filter(x => x.enabled);
  if (!stores.length) return { cfg, candidate: null, yesterday: jstYesterday(), blockedUntil: 0, blockedReason: '' };
  const index = await getCollectorIndex(s, channelId), yesterday = jstYesterday(), candidates = [];
  let blockedUntil = 0, blockedReason = '';
  for (const st of stores) {
    const scan = await iosCollectorFindCandidate(s, channelId, index, st, yesterday);
    if (scan.candidate) candidates.push(scan.candidate);
    if (scan.blockedUntil && (!blockedUntil || scan.blockedUntil < blockedUntil)) { blockedUntil = scan.blockedUntil; blockedReason = scan.blockedReason; }
  }
  const weight = p => p === 3 ? 3 : p === 1 ? 1 : 2;
  const tier = age => age <= 1 ? 3 : age <= 7 ? 2 : 1;
  candidates.sort((a,b) => tier(b.ageDays)-tier(a.ageDays)
    || ((+a.st.runtime?.dispatchCount||0)/weight(a.st.priority))-((+b.st.runtime?.dispatchCount||0)/weight(b.st.priority))
    || b.st.priority-a.st.priority
    || (+a.st.runtime?.lastJobAt||0)-(+b.st.runtime?.lastJobAt||0)
    || a.date.localeCompare(b.date));
  return { cfg, candidate: candidates[0] || null, yesterday, blockedUntil, blockedReason };
}
async function iosCollectorIssueJob(s, channelId, {persistJob=true} = {}) {
  const { cfg, candidate, yesterday, blockedUntil = 0, blockedReason = '' } = await iosCollectorChooseJob(s, channelId);
  if (!candidate) return { cfg, job: null, yesterday, blockedUntil, blockedReason };
  const st = candidate.st, date = candidate.date, jobToken = token(24), createdAt = now(), expiresAt = createdAt + IOS_COLLECTOR_JOB_TTL_MS;
  const job = { version: 2, channelId, jobToken, sourceStoreId: st.sourceStoreId, shop: st.shop, slug: st.slug, date, createdAt, expiresAt, status: 'issued' };
  if (persistJob) await s.setJSON(iosCollectorJobKey(channelId, jobToken), job);
  await s.setJSON(iosCollectorLeaseKey(channelId, st.sourceStoreId, date), { jobTokenHash: digest(jobToken), until: expiresAt, createdAt });
  const pos = cfg.stores.findIndex(x => x.sourceStoreId === st.sourceStoreId);
  if (pos >= 0) cfg.stores[pos] = { ...cfg.stores[pos], runtime: { ...iosStoreRuntime(cfg.stores[pos].runtime), dispatchCount: (+cfg.stores[pos].runtime?.dispatchCount||0)+1, lastJobAt: createdAt } };
  await saveIosCollectorConfig(s, channelId, cfg);
  return { cfg, job, yesterday, blockedUntil: 0, blockedReason: '' };
}
async function iosCollectorPurgeExpiredJobs(s, channelId) {
  try {
    const { blobs } = await s.list({ prefix: `ios-job/${channelId}/` });
    const t = now(), stale = [];
    for (const b of blobs || []) {
      const rec = await s.get(b.key, { type: 'json' });
      if (!rec || +rec.expiresAt < t) stale.push(b.key);
    }
    await Promise.all(stale.map(k => s.delete(k)));
  } catch {}
}
function iosCollectorMakeOffsets() {
  const y = Array.from({length:5}, () => randomInt(0, 561)).sort((a,b)=>a-b);
  return y.map((v,i) => v + i * 60); // 0..800秒、各枠は最低60秒離す
}
async function iosCollectorWindowCapacity(s,channelId){const rec=await s.get(iosCollectorWindowKey(channelId),{type:'json'}),t=now();return !rec||!Array.isArray(rec.offsets)||+rec.startedAt+900000<=t||(+rec.used||0)<5}
async function iosCollectorWindowRetrySeconds(s,channelId){const rec=await s.get(iosCollectorWindowKey(channelId),{type:'json'}),t=now();if(!rec||!Array.isArray(rec.offsets)||+rec.startedAt+900000<=t||(+rec.used||0)<5)return 0;return Math.max(1,Math.ceil((+rec.startedAt+900000-t)/1000))}
async function iosCollectorWaitSeconds(s, channelId) {
  let rec = await s.get(iosCollectorWindowKey(channelId), { type:'json' });
  const t = now();
  if (!rec || !Array.isArray(rec.offsets) || +rec.startedAt + 900000 <= t) rec = { startedAt:t, offsets:iosCollectorMakeOffsets(), used:0 };
  if((+rec.used||0)>=5)return null;
  const i = Math.max(0, Math.min(4, +rec.used || 0)), target = +rec.startedAt + (+rec.offsets[i] || 0) * 1000;
  rec.used = i + 1; rec.lastTouchAt = t; await s.setJSON(iosCollectorWindowKey(channelId), rec);
  return Math.max(0, Math.min(800, Math.ceil((target - t) / 1000)));
}
async function iosCollectorTargetSummaries(s, channelId, cfg, index) {
  const yesterday = jstYesterday(), out = [], floor=addIsoDays(yesterday,-(IOS_COLLECTOR_LOOKBACK_DAYS-1));
  for (const st of cfg.stores) {
    let latestDate = '', missing = 0, d = st.startDate > floor ? st.startDate : floor, guard = 0;
    while (d && d <= yesterday && guard++ < IOS_COLLECTOR_LOOKBACK_DAYS) {
      const e = index.entries?.[`${collectorStoreHash(st.sourceStoreId)}|${d}`];
      if (e) { if (!latestDate || d > latestDate) latestDate = d; } else missing++;
      d = addIsoDays(d, 1);
    }
    out.push({ ...st, priorityLabel: iosPriorityLabel(st.priority), latestDate, missingDays: missing });
  }
  return out;
}
async function iosCollectorCountSanity(s,channelId,sourceStoreId,currentCount){
  const index=await getCollectorIndex(s,channelId),rows=Object.values(index.entries||{}).filter(x=>x.sourceStoreId===sourceStoreId&&(+x.machines||0)>0).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,12),counts=rows.map(x=>+x.machines).sort((a,b)=>a-b);
  if(counts.length<4)return{ok:true,median:null};const mid=Math.floor(counts.length/2),median=counts.length%2?counts[mid]:(counts[mid-1]+counts[mid])/2,limit=Math.max(3,Math.floor(median*.55));return{ok:currentCount>=limit,median,limit};
}
function iosIdentityToken(value='') { let x=String(value); try{x=x.normalize('NFKC')}catch{} return x.toLowerCase().replace(/[\s\u3000・･_\-‐‑‒–—―]/g,''); }
function iosPageIdentity(input, st, date) {
  const raw=String(input||''), txt=stripHtml(raw).slice(0,160000), hay=iosIdentityToken(txt);
  let decoded=st.slug; try{decoded=decodeURIComponent(st.slug)}catch{}
  decoded=String(decoded||'').replace(/[-_]+/g,' ').trim();
  const rawNames=[st.shop,decoded].filter(Boolean), names=rawNames.map(iosIdentityToken).filter(x=>x.length>=3);
  const matchedShopIndex=names.findIndex(x=>hay.includes(x)), shopOk=matchedShopIndex>=0;
  const [y,m,d]=String(date).split('-'), mi=String(+m), di=String(+d);
  const dateVariants=[date,`${y}/${m}/${d}`,`${y}/${mi}/${di}`,`${y}年${mi}月${di}日`];
  const matchedDateVariant=dateVariants.find(x=>txt.includes(x))||'', dateOk=!!matchedDateVariant;
  const detectedDates=[];
  const pushDate=v=>{v=String(v||'').trim();if(v&&!detectedDates.includes(v)&&detectedDates.length<10)detectedDates.push(v)};
  for(const re of [/20\d{2}[-/]\d{1,2}[-/]\d{1,2}/g,/20\d{2}年\d{1,2}月\d{1,2}日/g]){let q;while((q=re.exec(txt)))pushDate(q[0]);}
  const storeHints=[];
  for(const line of txt.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,120)){
    if(line.includes('店')&&line.length<=100&&!storeHints.includes(line)){storeHints.push(line);if(storeHints.length>=8)break}
  }
  const preview=txt.slice(0,600).replace(/\s+/g,' ').trim();
  return {
    ok:shopOk&&dateOk,shopOk,dateOk,
    expectedShop:String(st.shop||''),expectedDate:String(date||''),expectedSlug:String(st.slug||''),decodedSlug:decoded,
    matchedShopCandidate:shopOk?(rawNames[matchedShopIndex]||''):'',matchedDateVariant,
    detectedDates,storeHints,inputMode:/<table\b/i.test(raw)?'html':'text',
    inputChars:raw.length,inputBytes:byteLength(raw),strippedChars:txt.length,preview
  };
}
function decEnt(s = '') {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(s).replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#([0-9]+);/g, (_, x) => String.fromCodePoint(parseInt(x, 10)))
    .replace(/&([a-z]+);/gi, (z, k) => map[k.toLowerCase()] ?? z);
}
function stripHtml(s = '') {
  return decEnt(String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[\u00a0\t\r ]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}
const IOS_ALIASES = [
 ['my',['マイジャグラーV','マイジャグラー5','マイジャグV','マイジャグ5']],
 ['im',['ネオアイムジャグラーEX','ネオアイムジャグラー','ネオアイム']],
 ['go',['ゴーゴージャグラー3','ゴーゴージャグラーⅢ','ゴージャグ3','ゴージャグⅢ']],
 ['fk',['ファンキージャグラー2','ファンキージャグラーⅡ','ファンキー2','ファンキーⅡ']],
 ['hp',['ハッピージャグラーVⅢ','ハッピージャグラーVIII','ハッピージャグラーV3','ハッピーVⅢ','ハッピーVIII','ハッピーV3']],
 ['gg',['ジャグラーガールズSS','ジャグラーガールズ','ガールズSS']],
 ['mr',['ミスタージャグラー','ミスター']],
 ['um',['ウルトラミラクルジャグラー','ウルトラミラクル','ウルミラ']],
 ['newkingv',['ニューキングハナハナV','LニューキングハナハナV','スマート沖スロニューキングハナハナV','スマスロニューキングハナハナV']],
 ['houou',['ハナハナホウオウ～天翔～','ハナハナホウオウ-天翔-','ハナハナホウオウ天翔','ホウオウ～天翔～','ホウオウ天翔']],
 ['dragon',['ドラゴンハナハナ～閃光～','ドラゴンハナハナ-閃光-','ドラゴンハナハナ閃光','スマート沖スロドラゴンハナハナ～閃光～','Lドラゴンハナハナ～閃光～']],
 ['star',['スターハナハナ','スマート沖スロスターハナハナ','Lスターハナハナ']],
 ['king',['キングハナハナ','スマート沖スロキングハナハナ','Lキングハナハナ']]
];
function iosMachineToken(name = '') { let x = String(name); try { x = x.normalize('NFKC'); } catch {} return x.toUpperCase().replace(/\s+/g,'').replace(/[‐‑‒–—―]/g,'-').replace(/[・･]/g,'').replace(/[Φφ]/g,'Φ'); }
const IOS_ALIAS_TOKENS = IOS_ALIASES.map(([k, aa]) => [k, aa.map(iosMachineToken)]);
function iosNormMachine(name = '') { const x = iosMachineToken(name); for (const [k, aa] of IOS_ALIAS_TOKENS) if (aa.some(a => x.includes(a))) return k; return ''; }
function iosNum(v, nullable = false) { const x = stripHtml(String(v ?? '')).replace(/,/g,'').replace(/[＋+]/g,'+').replace(/[−－–—]/g,'-').trim(); if (!x || /^[―ー\-–—]+$/.test(x)) return nullable ? null : NaN; const m = x.match(/[+-]?\d+(?:\.\d+)?/); if (!m) return nullable ? null : NaN; const n = Number(m[0]); return Number.isFinite(n) ? n : (nullable ? null : NaN); }
function iosCells(row) { const out=[]; let q; const re=/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi; while((q=re.exec(row))) out.push({type:q[1].toLowerCase(),text:stripHtml(q[2])}); return out; }
function iosRows(table) { const out=[]; let q; const re=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi; while((q=re.exec(table))){ const c=iosCells(q[1]); if(c.length) out.push(c); } return out; }
function iosIdx(h,p){ return h.findIndex(x=>p.some(y=>x.includes(y))); }
function iosInfer(prefix){ const txt=iosMachineToken(stripHtml(prefix.slice(-9000))); let best={key:'',idx:-1}; for(const [key,aa] of IOS_ALIAS_TOKENS)for(const a of aa){const i=txt.lastIndexOf(a);if(i>best.idx)best={key,idx:i}}return best.key; }
function iosFinalizeMachines(machines, qualitySeed = {}) {
  const byNo = new Map(), conflicts = new Set(); let duplicateRows=0, conflictRows=0;
  const rowRank=x=>(x._explicit?1000000:0)+(x.diff!=null?100000:0)+Math.max(0,+x.games||0);
  for (const x of machines) { const k=x.tableNo, prev=byNo.get(k); if(!prev){byNo.set(k,x);continue} duplicateRows++; if(prev.machine!==x.machine){conflictRows++;conflicts.add(k);continue} if(rowRank(x)>=rowRank(prev))byNo.set(k,x); }
  for(const k of conflicts)byNo.delete(k);
  const dedup=[...byNo.values()].map(({_explicit,...x})=>x), counts={}; for(const x of dedup) counts[x.machine]=(counts[x.machine]||0)+1;
  const diffMissing=dedup.filter(x=>x.diff==null).length, gamesMissing=dedup.filter(x=>x.games==null).length;
  let score=100, warnings=[];
  if(qualitySeed.invalidRows){score-=Math.min(20,qualitySeed.invalidRows>5?15:5);warnings.push(`無効行${qualitySeed.invalidRows}件`)}
  if(duplicateRows){score-=5;warnings.push(`重複${duplicateRows}件を台番単位で統合`)}
  if(conflictRows){score-=20;warnings.push(`同一台番の機種競合${conflictRows}件を除外`)}
  if(dedup.length&&diffMissing/dedup.length>0.2)warnings.push(`差枚欠損${diffMissing}台（推定対象）`);
  if(dedup.length&&gamesMissing/dedup.length>0.2)warnings.push(`G数欠損${gamesMissing}台（推定対象）`);
  score=Math.max(0,Math.min(100,score)); const grade=score>=90?'A':score>=75?'B':score>=60?'C':'D';
  return {machines:dedup,quality:{score,grade,warnings,duplicateRows,conflictRows,diffMissing,gamesMissing,totalMachines:dedup.length,machineCounts:counts,...qualitySeed}};
}
function parseIosHtml(html, date, url) {
  const src=String(html||''); let q; const tables=[]; const re=/<table\b[^>]*>[\s\S]*?<\/table>/gi; while((q=re.exec(src)))tables.push({html:q[0],index:q.index});
  const metas=[];
  for(const t of tables){
    const rr=iosRows(t.html);if(!rr.length)continue;
    const hr=rr.find(r=>r.some(c=>c.type==='h'))||rr[0],h=hr.map(c=>c.text.replace(/\s+/g,''));
    const no=iosIdx(h,['台番号','台番']),g=iosIdx(h,['G数','総回転数','回転数','ゲーム数']),df=iosIdx(h,['差枚','総差枚']),bb=iosIdx(h,['BB','BIG']),rb=iosIdx(h,['RB','REG']),mi=iosIdx(h,['機種名','機種']);
    // ana-slo has multiple public layouts. BB/RB + table number are mandatory; G and difference may independently be absent.
    if(no<0||bb<0||rb<0||(g<0&&df<0))continue;
    const scope=mi>=0?'':iosInfer(src.slice(0,t.index));if(mi<0&&!scope)continue;
    metas.push({rr,hr,no,g,df,bb,rb,mi,scope});
  }
  const explicitHasTarget=metas.some(m=>m.mi>=0&&m.rr.some(row=>row!==m.hr&&iosNormMachine((row[m.mi]||{}).text))); const selected=explicitHasTarget?metas.filter(m=>m.mi>=0):metas;
  const machines=[]; let candidateRows=0,invalidRows=0,missingGamesRows=0,missingDiffRows=0;
  for(const m of selected){for(const row of m.rr){
    if(row===m.hr)continue;const c=row.map(x=>x.text),need=[m.no,m.bb,m.rb,m.mi,m.g,m.df].filter(x=>x>=0);if(c.length<=Math.max(...need))continue;
    const key=m.mi>=0?iosNormMachine(c[m.mi]):m.scope;if(!key)continue;candidateRows++;
    const tableNo=String(c[m.no]||'').replace(/[^0-9A-Za-z-]/g,'').trim(),games=m.g>=0?iosNum(c[m.g],true):null,diff=m.df>=0?iosNum(c[m.df],true):null,b=iosNum(c[m.bb]),r=iosNum(c[m.rb]);
    const hasG=games!=null&&Number.isFinite(games),hasD=diff!=null&&Number.isFinite(diff);
    if(!tableNo||!Number.isFinite(b)||b<0||!Number.isFinite(r)||r<0||(hasG&&(games<0||(b+r>games&&games>0)))||(!hasG&&!hasD)){invalidRows++;continue}
    if(!hasG)missingGamesRows++;if(!hasD)missingDiffRows++;
    machines.push({machine:key,category:['houou','king','dragon','star','newkingv'].includes(key)?'hanahana':'juggler',sourceMachineName:m.mi>=0?c[m.mi]:(IOS_ALIASES.find(x=>x[0]===key)?.[1]?.[0]||key),tableNo,games:hasG?games:null,diff:hasD?diff:null,bb:b,rb:r,gamesSource:hasG?'observed':'missing',diffSource:hasD?'observed':'missing',_explicit:m.mi>=0});
  }}
  const layouts=[...new Set(selected.map(m=>`${m.g>=0?'G':'noG'}+${m.df>=0?'diff':'noDiff'}`))];
  const fin=iosFinalizeMachines(machines,{candidateRows,invalidRows,missingGamesRows,missingDiffRows,matchedTables:selected.length,inputMode:'html',columnLayouts:layouts,parserBuild:'v504-header-driven-1'}); return {date,sourceUrl:url,...fin};
}
function iosTextHeaderKind(v=''){
  const x=String(v).replace(/\s+/g,'').toUpperCase();
  if(x.includes('機種名')||x==='機種')return'machine';
  if(x.includes('台番号')||x==='台番')return'tableNo';
  if(['G数','総回転数','回転数','ゲーム数'].some(k=>x.includes(k.toUpperCase())))return'games';
  if(x.includes('差枚')||x.includes('総差枚'))return'diff';
  if(x==='BB'||x.includes('BIG'))return'bb';
  if(x==='RB'||x.includes('REG'))return'rb';
  return'';
}
function iosTextColumnLayout(lines){
  const firstMachine=lines.findIndex(x=>!!iosNormMachine(x)),head=(firstMachine>=0?lines.slice(0,firstMachine):lines.slice(0,40));
  let start=-1;
  for(let i=head.length-1;i>=0;i--){const k=iosTextHeaderKind(head[i]);if(k==='machine'){start=i;break}}
  if(start<0)for(let i=head.length-1;i>=0;i--){if(iosTextHeaderKind(head[i])==='tableNo'){start=i;break}}
  if(start<0)return{headerDetected:false,hasG:false,hasDiff:false,hasBB:false,hasRB:false,offsets:{},headerLines:[]};
  const headerLines=head.slice(start),kinds=headerLines.map(iosTextHeaderKind),machineIdx=kinds.indexOf('machine'),offsets={};
  for(const field of ['tableNo','games','diff','bb','rb']){
    const idx=kinds.indexOf(field);if(idx>=0)offsets[field]=machineIdx>=0?idx-machineIdx:idx+1;
  }
  const hasG=Number.isFinite(offsets.games),hasDiff=Number.isFinite(offsets.diff),hasBB=Number.isFinite(offsets.bb),hasRB=Number.isFinite(offsets.rb),hasNo=Number.isFinite(offsets.tableNo);
  return{hasG,hasDiff,hasBB,hasRB,hasNo,offsets,headerDetected:hasNo&&hasBB&&hasRB&&(hasG||hasDiff),headerLines};
}
function parseIosText(text, date, url) {
  const raw=String(text||'').replace(/\r/g,''); const start=raw.indexOf('全データ一覧'); const endCandidates=['機種別データピックアップ','末尾別データ']; let end=-1; for(const m of endCandidates){const x=raw.indexOf(m,start>=0?start+1:0);if(x>=0&&(end<0||x<end))end=x;} const scope=start>=0?raw.slice(start,end>start?end:undefined):raw;
  const lines=scope.split('\n').map(x=>x.replace(/[\u00a0\t]+/g,' ').trim()).filter(Boolean),layout=iosTextColumnLayout(lines); const machines=[]; let candidateRows=0,invalidRows=0,missingGamesRows=0,missingDiffRows=0;
  // Never guess a shifted schema when the header is available. This is the guard that prevents BB being mistaken for difference.
  if(!layout.headerDetected){const fin=iosFinalizeMachines([],{candidateRows:0,invalidRows:0,missingGamesRows:0,missingDiffRows:0,matchedTables:start>=0?1:0,inputMode:'text',columnLayout:'unknown',schemaGuard:'header_required',parserBuild:'v504-header-driven-1'});return {date,sourceUrl:url,...fin};}
  const offsets=layout.offsets,need=Math.max(...Object.values(offsets));
  for(let i=0;i+need<lines.length;i++){
    const key=iosNormMachine(lines[i]);if(!key)continue;const tableNo=String(lines[i+offsets.tableNo]||'').replace(/[^0-9A-Za-z-]/g,'').trim();if(!/^\d{1,6}$/.test(tableNo))continue;candidateRows++;
    const games=layout.hasG?iosNum(lines[i+offsets.games],true):null,diff=layout.hasDiff?iosNum(lines[i+offsets.diff],true):null,b=iosNum(lines[i+offsets.bb]),r=iosNum(lines[i+offsets.rb]),hasG=games!=null&&Number.isFinite(games),hasD=diff!=null&&Number.isFinite(diff);
    if(!Number.isFinite(b)||b<0||!Number.isFinite(r)||r<0||(hasG&&(games<0||(b+r>games&&games>0)))||(!hasG&&!hasD)){invalidRows++;continue}
    if(!hasG)missingGamesRows++;if(!hasD)missingDiffRows++;
    machines.push({machine:key,category:['houou','king','dragon','star','newkingv'].includes(key)?'hanahana':'juggler',sourceMachineName:lines[i],tableNo,games:hasG?games:null,diff:hasD?diff:null,bb:b,rb:r,gamesSource:hasG?'observed':'missing',diffSource:hasD?'observed':'missing',_explicit:true});
  }
  // fill explicit missing flags without relying on truthiness
  for(const m of machines){if(!m.gamesSource)m.gamesSource='missing';if(!m.diffSource)m.diffSource='missing'}
  const columnLayout=`${layout.hasG?'G':'noG'}+${layout.hasDiff?'diff':'noDiff'}`;
  const fin=iosFinalizeMachines(machines,{candidateRows,invalidRows,missingGamesRows,missingDiffRows,matchedTables:start>=0?1:0,inputMode:'text',columnLayout,schemaGuard:'header_driven',parserBuild:'v504-header-driven-1'}); return {date,sourceUrl:url,...fin};
}
function parseIosCollectorInput(input, date, url) { const text=String(input||''); return /<table\b/i.test(text)?parseIosHtml(text,date,url):parseIosText(text,date,url); }
async function createIosCollector(req, s) {
  const channelId=token(18), receiverToken=token(32), senderToken=token(32), createdAt=now();
  await s.setJSON(`channel/${channelId}`,{version:1,createdAt,claimedAt:createdAt,revokedAt:0,receiverHash:digest(receiverToken),senderHash:digest(senderToken),mode:'ios-shortcut'});
  return json(req,{ok:true,channelId,receiverToken,collectorKey:`${channelId}.${senderToken}`,claimedAt:createdAt});
}
async function rotateIosCollectorKey(req,s,body){
  const ch=await authReceiver(s,body.channelId,body.receiverToken); if(!ch)return fail(req,401,'iPhone Collector連携が無効だよ','unauthorized');
  const senderToken=token(32); ch.senderHash=digest(senderToken); ch.claimedAt=now(); ch.mode='ios-shortcut'; await s.setJSON(`channel/${body.channelId}`,ch);
  return json(req,{ok:true,collectorKey:`${body.channelId}.${senderToken}`,claimedAt:ch.claimedAt});
}
async function iosCollectorConfigure(req,s,body){
  const ch=await authReceiver(s,body.channelId,body.receiverToken); if(!ch)return fail(req,401,'iPhone Collector連携が無効だよ','unauthorized');
  const current=await getIosCollectorConfig(s,body.channelId), incoming=normalizeIosStores(body.stores);
  const oldBySlug=new Map(current.stores.map(x=>[x.slug.toLowerCase(),x]));
  const stores=incoming.map(x=>{const old=oldBySlug.get(x.slug.toLowerCase());return old?{...x,sourceStoreId:old.sourceStoreId,runtime:iosStoreRuntime(old.runtime)}:x});
  const rec=await saveIosCollectorConfig(s,body.channelId,{stores});
  return json(req,{ok:true,stores:rec.stores,updatedAt:rec.updatedAt});
}
async function iosCollectorTargets(req,s,body){
  const ch=await authReceiver(s,body.channelId,body.receiverToken); if(!ch)return fail(req,401,'iPhone Collector連携が無効だよ','unauthorized');
  const cfg=await getIosCollectorConfig(s,body.channelId),index=await getCollectorIndex(s,body.channelId),stores=await iosCollectorTargetSummaries(s,body.channelId,cfg,index);
  const since=Math.max(0,+body.sinceRevision||0),pending=Object.values(index.entries||{}).filter(x=>(+x.revision||0)>since).length;
  return json(req,{ok:true,stores,revision:+index.revision||0,pending,updatedAt:+index.updatedAt||0});
}
async function iosCollectorTargetUpsert(req,s,body){
  const ch=await authReceiver(s,body.channelId,body.receiverToken); if(!ch)return fail(req,401,'iPhone Collector連携が無効だよ','unauthorized');
  const cfg=await getIosCollectorConfig(s,body.channelId); let parsed=body.url?parseAnaDetailUrl(body.url):null;
  let pos=String(body.sourceStoreId||'')?cfg.stores.findIndex(x=>x.sourceStoreId===String(body.sourceStoreId)): -1;
  if(pos<0&&parsed)pos=cfg.stores.findIndex(x=>x.slug.toLowerCase()===parsed.slug.toLowerCase());
  const old=pos>=0?cfg.stores[pos]:null;
  if(!parsed&&old)parsed={slug:old.slug,date:old.startDate,shop:old.shop};
  if(!parsed)return fail(req,400,'アナスロの日別データURLを入れてね','bad_store_url');
  const startDate=String(body.startDate||old?.startDate||parsed.date||''); if(!validCollectorDate(startDate))return fail(req,400,'取得開始日を確認してね','bad_start_date');
  const shop=String(body.shop||old?.shop||parsed.shop||'').trim().slice(0,240); if(!shop)return fail(req,400,'店舗名を認識できないよ','bad_shop');
  const sourceStoreId=old?.sourceStoreId||stableIosStoreId(parsed.slug),next={shop,sourceStoreId,slug:parsed.slug,startDate,enabled:body.enabled==null?(old?.enabled!==false):body.enabled!==false,priority:iosPriority(body.priority??old?.priority),runtime:iosStoreRuntime(old?.runtime)};
  if(pos>=0)cfg.stores[pos]=next;else cfg.stores.push(next);
  const rec=await saveIosCollectorConfig(s,body.channelId,cfg); const index=await getCollectorIndex(s,body.channelId),stores=await iosCollectorTargetSummaries(s,body.channelId,rec,index);
  return json(req,{ok:true,store:stores.find(x=>x.sourceStoreId===sourceStoreId),stores,updatedAt:rec.updatedAt});
}
async function iosCollectorTargetDelete(req,s,body){
  const ch=await authReceiver(s,body.channelId,body.receiverToken); if(!ch)return fail(req,401,'iPhone Collector連携が無効だよ','unauthorized');
  const id=String(body.sourceStoreId||''); const cfg=await getIosCollectorConfig(s,body.channelId),before=cfg.stores.length; cfg.stores=cfg.stores.filter(x=>x.sourceStoreId!==id);
  if(cfg.stores.length===before)return fail(req,404,'取得店舗が見つからないよ','store_not_found');
  const rec=await saveIosCollectorConfig(s,body.channelId,cfg); return json(req,{ok:true,stores:rec.stores,updatedAt:rec.updatedAt});
}
async function iosCollectorRequeueDate(req,s,body){
  const ch=await authReceiver(s,body.channelId,body.receiverToken); if(!ch)return fail(req,401,'iPhone Collector連携が無効だよ','unauthorized');
  const id=String(body.sourceStoreId||''),date=String(body.date||''); if(!id||!validCollectorDate(date))return fail(req,400,'再取得する店舗・日付を確認してね','bad_requeue');
  const cfg=await getIosCollectorConfig(s,body.channelId),st=cfg.stores.find(x=>x.sourceStoreId===id); if(!st)return fail(req,404,'取得店舗が見つからないよ','store_not_found');
  const index=await getCollectorIndex(s,body.channelId),ik=`${collectorStoreHash(id)}|${date}`,entry=index.entries?.[ik]||null;
  if(entry){delete index.entries[ik];index.updatedAt=now();await s.setJSON(collectorIndexKey(body.channelId),index);try{await s.delete(entry.key||collectorDayKey(body.channelId,id,date))}catch{}}
  await iosCollectorClearFailure(s,body.channelId,id,date);try{await s.delete(iosCollectorLeaseKey(body.channelId,id,date))}catch{}
  return json(req,{ok:true,requeued:!!entry,shop:st.shop,date,revision:+index.revision||0});
}
async function iosCollectorNext(req,s,body){
  const auth=await authCollectorKey(s,body.collectorKey); if(!auth)return fail(req,401,'iPhone Collectorキーが無効だよ','unauthorized');
  await iosCollectorPurgeExpiredJobs(s,auth.channelId);
  const {cfg,job,yesterday}=await iosCollectorIssueJob(s,auth.channelId,{persistJob:false}); if(!job)return json(req,{ok:true,hasJob:false,needsConfig:!cfg.stores.some(x=>x.enabled),message:cfg.stores.length?'今は未取得データがないよ':'JUGEST側で取得店舗を追加してね'});
  const legacy={shop:job.shop,sourceStoreId:job.sourceStoreId,slug:job.slug,date:job.date,url:`https://ana-slo.com/${job.date}-${job.slug}-data/`};
  const index=await getCollectorIndex(s,auth.channelId); return json(req,{ok:true,hasJob:true,job:legacy,configuredStores:cfg.stores.length,yesterday,revision:+index.revision||0});
}
async function iosCollectorNextV2(req,s,body){
  const auth=await authCollectorKey(s,body.collectorKey); if(!auth)return fail(req,401,'iPhone Collectorキーが無効だよ','unauthorized');
  await iosCollectorPurgeExpiredJobs(s,auth.channelId);
  const probe=await iosCollectorChooseJob(s,auth.channelId);
  if(!probe.candidate){
    if(probe.blockedUntil>now())return json(req,{ok:true,state:'WAIT',reason:probe.blockedReason||'temporary',waitSeconds:Math.max(1,Math.ceil((probe.blockedUntil-now())/1000)),message:probe.blockedReason==='backoff'?'直前の取得エラー後なので再試行時刻まで待機':'取得中ジョブの期限まで待機'});
    return json(req,{ok:true,state:'DONE',reason:probe.cfg.stores.some(x=>x.enabled)?'complete':'no_targets',message:probe.cfg.stores.some(x=>x.enabled)?'今は回収するデータなし':'JUGESTで取得店舗を追加してね'});
  }
  if(!(await iosCollectorWindowCapacity(s,auth.channelId)))return json(req,{ok:true,state:'WAIT',reason:'rate_limit',waitSeconds:await iosCollectorWindowRetrySeconds(s,auth.channelId),message:'15分5件の取得間隔を調整中'});
  const {cfg,job,blockedUntil,blockedReason}=await iosCollectorIssueJob(s,auth.channelId,{persistJob:true});
  if(!job){
    if(blockedUntil>now())return json(req,{ok:true,state:'WAIT',reason:blockedReason||'temporary',waitSeconds:Math.max(1,Math.ceil((blockedUntil-now())/1000)),message:'一時待機中'});
    return json(req,{ok:true,state:'DONE',reason:cfg.stores.some(x=>x.enabled)?'complete':'no_targets',message:cfg.stores.some(x=>x.enabled)?'今は回収するデータなし':'JUGESTで取得店舗を追加してね'});
  }
  const waitSeconds=await iosCollectorWaitSeconds(s,auth.channelId),st=cfg.stores.find(x=>x.sourceStoreId===job.sourceStoreId&&x.slug===job.slug);
  const transport=st?await iosCollectorTransportForJob(s,auth.channelId,st,job.date):{mode:'canonical',requestUrl:iosCollectorCanonicalUrl(job.date,job.slug),canonicalUrl:iosCollectorCanonicalUrl(job.date,job.slug)};
  job.transportMode=transport.mode; job.requestUrl=transport.requestUrl; job.canonicalUrl=transport.canonicalUrl; await s.setJSON(iosCollectorJobKey(auth.channelId,job.jobToken),job);
  return json(req,{ok:true,state:'RUN',jobToken:job.jobToken,url:transport.requestUrl,waitSeconds:waitSeconds??0,transportMode:transport.mode,transportBuild:'v503-ios-url-transport-1'});
}
async function storeIosCollectorDay(s,channelId,st,day){
  const index=await getCollectorIndex(s,channelId); index.revision=(+index.revision||0)+1; const rev=index.revision,updatedAt=now(),key=collectorDayKey(channelId,st.sourceStoreId,day.date); const rec={version:2,channelId,revision:rev,updatedAt,shop:st.shop,sourceStoreId:st.sourceStoreId,parserBuild:String(day?.quality?.parserBuild||'v504-header-driven-1'),day:compactCollectorDay(day)}; await s.setJSON(key,rec); index.entries[`${collectorStoreHash(st.sourceStoreId)}|${day.date}`]={key,revision:rev,updatedAt,shop:st.shop,sourceStoreId:st.sourceStoreId,date:day.date,machines:day.machines.length,parserBuild:String(day?.quality?.parserBuild||'v504-header-driven-1')}; index.updatedAt=updatedAt; await s.setJSON(collectorIndexKey(channelId),index); return{revision:rev,updatedAt};
}
async function iosCollectorFinishSuccess(s,channelId,cfg,st,date){
  await iosCollectorClearFailure(s,channelId,st.sourceStoreId,date); try{await s.delete(iosCollectorLeaseKey(channelId,st.sourceStoreId,date))}catch{}
  const pos=cfg.stores.findIndex(x=>x.sourceStoreId===st.sourceStoreId); if(pos>=0)cfg.stores[pos]={...cfg.stores[pos],runtime:{...iosStoreRuntime(cfg.stores[pos].runtime),lastSuccessAt:now(),lastErrorCode:''}};
  await saveIosCollectorConfig(s,channelId,cfg);
}
async function iosCollectorFinishFailure(s,channelId,cfg,st,date,code,message,extra={}){
  const f=await iosCollectorRecordFailure(s,channelId,st,date,code,message,extra); try{await s.delete(iosCollectorLeaseKey(channelId,st.sourceStoreId,date))}catch{}
  const pos=cfg.stores.findIndex(x=>x.sourceStoreId===st.sourceStoreId); if(pos>=0)cfg.stores[pos]={...cfg.stores[pos],runtime:{...iosStoreRuntime(cfg.stores[pos].runtime),lastErrorAt:now(),lastErrorCode:code,failures:(+cfg.stores[pos].runtime?.failures||0)+1}};
  await saveIosCollectorConfig(s,channelId,cfg); return f;
}
async function iosCollectorHtmlPush(req,s,body){
  const auth=await authCollectorKey(s,body.collectorKey); if(!auth)return fail(req,401,'iPhone Collectorキーが無効だよ','unauthorized');
  const date=String(body.date||''),sourceStoreId=String(body.sourceStoreId||'').trim(),input=String(body.text??body.html??''); if(!validCollectorDate(date)||!validCollectorStoreId(sourceStoreId))return fail(req,400,'取得日または店舗IDが不正だよ','bad_job'); if(!input.trim())return fail(req,400,'アナスロの取得本文が空だよ','empty_input'); if(byteLength(input)>IOS_COLLECTOR_MAX_INPUT_BYTES)return fail(req,413,'アナスロ本文が大きすぎるよ','input_too_large');
  const cfg=await getIosCollectorConfig(s,auth.channelId),st=cfg.stores.find(x=>x.sourceStoreId===sourceStoreId); if(!st)return fail(req,403,'この店舗はJUGEST側で取得対象になってないよ','store_not_configured'); const yesterday=jstYesterday(); if(date<st.startDate||date>yesterday)return fail(req,400,'取得対象外の日付だよ','date_out_of_range');
  const url=`https://ana-slo.com/${date}-${st.slug}-data/`,parsed=parseIosCollectorInput(input,date,url); if(!parsed.machines.length){await iosCollectorFinishFailure(s,auth.channelId,cfg,st,date,'parse_empty','対象台を読み取れない');return fail(req,422,'対象のジャグラー / ハナハナ台を読み取れなかったよ','parse_empty')} if((+parsed.quality?.score||0)<60){await iosCollectorFinishFailure(s,auth.channelId,cfg,st,date,'parse_quality',parsed.quality?.grade||'D');return fail(req,422,`取得内容の品質が低いため保存しなかったよ（${parsed.quality?.grade||'D'}）`,'parse_quality')}
  const sanity=await iosCollectorCountSanity(s,auth.channelId,st.sourceStoreId,parsed.machines.length); if(!sanity.ok){await iosCollectorFinishFailure(s,auth.channelId,cfg,st,date,'partial_page',`count=${parsed.machines.length},median=${sanity.median}`);return fail(req,422,`普段より取得台数が少なすぎるため保存しなかったよ（${parsed.machines.length}台）`,'partial_page')}
  const saved=await storeIosCollectorDay(s,auth.channelId,st,parsed); await iosCollectorFinishSuccess(s,auth.channelId,cfg,st,date); return json(req,{ok:true,date,shop:st.shop,machines:parsed.machines.length,quality:parsed.quality,revision:saved.revision,updatedAt:saved.updatedAt});
}
function iosCollectorUpstreamDiagnostic(input, expectedUrl, fetchUrl='') {
  const raw=String(input||''), flat=raw.replace(/\s+/g,' ').trim(), low=flat.toLowerCase();
  let upstreamCode=null, upstreamProvider='';
  const m=flat.match(/\b(400|401|403|404|408|409|425|429|500|502|503|504)\b/);
  if (/cloudflare/i.test(flat)) upstreamProvider='cloudflare';
  if (/bad request/i.test(flat) && m) upstreamCode=+m[1];
  else if (upstreamProvider && m) upstreamCode=+m[1];
  let parsedExpected=null, parsedFetch=null;
  try{parsedExpected=new URL(String(expectedUrl||''))}catch{}
  try{if(fetchUrl)parsedFetch=new URL(String(fetchUrl||''))}catch{}
  const path=parsedExpected?.pathname||'', slugMatch=path.match(/^\/20\d{2}-\d{2}-\d{2}-(.+)-data\/?$/), rawSlug=slugMatch?.[1]||'';
  let decodedSlug=rawSlug; try{decodedSlug=decodeURIComponent(rawSlug)}catch{}
  let reencodedSlug=''; try{reencodedSlug=encodeURIComponent(decodedSlug).toLowerCase()}catch{}
  return {
    isUpstreamError:!!upstreamCode || /bad request|access denied|too many requests|cloudflare/i.test(low),
    upstreamCode,upstreamProvider:upstreamProvider||'(不明)',
    expectedUrl:String(expectedUrl||''),fetchUrl:String(fetchUrl||''),fetchUrlProvided:!!fetchUrl,
    fetchUrlMatchesExpected:fetchUrl?String(fetchUrl)===String(expectedUrl):null,
    expectedHost:parsedExpected?.hostname||'',expectedPath:parsedExpected?.pathname||'',
    fetchHost:parsedFetch?.hostname||'',fetchPath:parsedFetch?.pathname||'',
    rawSlug,decodedSlug,reencodedSlug,
    expectedHasPercent25:/\%25/i.test(String(expectedUrl||'')),fetchHasPercent25:/\%25/i.test(String(fetchUrl||'')),
    inputChars:raw.length,inputBytes:byteLength(raw),preview:flat.slice(0,800)
  };
}
async function iosCollectorPushV2(req,s,body){
  const auth=await authCollectorKey(s,body.collectorKey); if(!auth)return fail(req,401,'iPhone Collectorキーが無効だよ','unauthorized');
  const jobToken=String(body.jobToken||''),input=String(body.text??body.html??''); if(!jobToken||!input.trim())return fail(req,400,'取得ジョブまたは本文が空だよ','bad_job'); if(byteLength(input)>IOS_COLLECTOR_MAX_INPUT_BYTES)return fail(req,413,'アナスロ本文が大きすぎるよ','input_too_large');
  const key=iosCollectorJobKey(auth.channelId,jobToken),job=await s.get(key,{type:'json'}); if(!job||job.channelId!==auth.channelId||job.jobToken!==jobToken)return fail(req,404,'取得ジョブの有効期限が切れたよ','job_missing'); if(+job.expiresAt<now())return fail(req,410,'取得ジョブの有効期限が切れたよ','job_expired'); if(job.status==='saved')return json(req,{ok:true,duplicate:true,date:job.date,shop:job.shop});
  const cfg=await getIosCollectorConfig(s,auth.channelId),st=cfg.stores.find(x=>x.sourceStoreId===job.sourceStoreId&&x.slug===job.slug); if(!st)return fail(req,403,'この取得ジョブは現在の店舗設定と一致しないよ','store_not_configured');
  const url=iosCollectorCanonicalUrl(job.date,st.slug),requestUrl=String(job.requestUrl||url),transportMode=String(job.transportMode||'legacy_encoded'),fetchUrl=String(body.fetchUrl||''),upstream=iosCollectorUpstreamDiagnostic(input,requestUrl,fetchUrl),identity=iosPageIdentity(input,st,job.date);
  if(upstream.isUpstreamError){
    const upstreamCode=upstream.upstreamCode||0,code=upstreamCode?`upstream_http_${upstreamCode}`:'upstream_error';
    job.status='failed';job.errorCode=code;await s.setJSON(key,job);
    const f=await iosCollectorFinishFailure(s,auth.channelId,cfg,st,job.date,code,upstream.preview,{transportMode,requestUrl}),retryMinutes=Math.max(1,Math.ceil((f.nextRetryAt-now())/60000));
    return json(req,{
      ok:false,code,errorStep:'ana_slo_fetch',message:`アナスロ取得時点で${upstreamCode||'HTTP'}エラーになってるよ。JUGESTの解析前に失敗してる。`,
      requestedShop:st.shop,requestedDate:job.date,requestedUrl:url,dispatchedUrl:requestUrl,transportMode,transportBuild:'v503-ios-url-transport-1',jobTokenPrefix:String(jobToken).slice(0,10),
      upstreamStatus:upstreamCode||null,upstreamProvider:upstream.upstreamProvider,
      fetchUrlProvided:upstream.fetchUrlProvided,fetchUrl:upstream.fetchUrl||'(Shortcutから未送信)',fetchUrlMatchesExpected:upstream.fetchUrlMatchesExpected,
      expectedHost:upstream.expectedHost,expectedPath:upstream.expectedPath,fetchHost:upstream.fetchHost,fetchPath:upstream.fetchPath,
      rawSlug:upstream.rawSlug,decodedSlug:upstream.decodedSlug,reencodedSlug:upstream.reencodedSlug,
      expectedHasPercent25:upstream.expectedHasPercent25,fetchHasPercent25:upstream.fetchHasPercent25,
      textLength:upstream.inputChars,textBytes:upstream.inputBytes,textPreview:upstream.preview,
      diagnosis:upstream.fetchUrlProvided?(upstream.fetchUrlMatchesExpected?`Shortcut保持URLは送信URLと一致（方式:${transportMode}）`:`Shortcut保持URLが送信URLと不一致（方式:${transportMode}）`):'fetchUrlをPOSTに追加するとShortcutが保持したURLも比較できる',
      retryMinutes,nextRetryAt:+f.nextRetryAt||0
    },422)
  }
  if(!identity.ok){
    let probe=null; try{probe=parseIosCollectorInput(input,job.date,url)}catch{}
    job.status='failed';job.errorCode='page_identity';await s.setJSON(key,job);
    const f=await iosCollectorFinishFailure(s,auth.channelId,cfg,st,job.date,'page_identity',`shop=${identity.shopOk},date=${identity.dateOk}`),retryMinutes=Math.max(1,Math.ceil((f.nextRetryAt-now())/60000));
    return json(req,{
      ok:false,code:'page_identity',message:`店舗または日付を確認できなかったため保存しなかったよ。${retryMinutes}分後に再試行するよ`,
      errorStep:!identity.shopOk&&!identity.dateOk?'shop_and_date':(!identity.shopOk?'shop':'date'),
      requestedShop:st.shop,requestedDate:job.date,requestedUrl:url,dispatchedUrl:requestUrl,transportMode,transportBuild:'v503-ios-url-transport-1',fetchUrlMatchesDispatched:fetchUrl?fetchUrl===requestUrl:null,expectedSlug:st.slug,
      shopMatch:identity.shopOk,dateMatch:identity.dateOk,matchedShopCandidate:identity.matchedShopCandidate||'',matchedDateVariant:identity.matchedDateVariant||'',
      detectedDates:(identity.detectedDates||[]).join(' / ')||'(検出なし)',storeHints:(identity.storeHints||[]).join(' / ')||'(検出なし)',
      inputMode:identity.inputMode,textLength:identity.inputChars,textBytes:identity.inputBytes,strippedLength:identity.strippedChars,
      parsedMachines:+probe?.machines?.length||0,parserMode:probe?.quality?.inputMode||identity.inputMode,qualityGrade:probe?.quality?.grade||'-',qualityScore:Number.isFinite(+probe?.quality?.score)?+probe.quality.score:null,
      textPreview:identity.preview||'',retryMinutes,nextRetryAt:+f.nextRetryAt||0
    },422)
  }
  const parsed=parseIosCollectorInput(input,job.date,url); if(!parsed.machines.length){job.status='failed';job.errorCode='parse_empty';await s.setJSON(key,job);const f=await iosCollectorFinishFailure(s,auth.channelId,cfg,st,job.date,'parse_empty','対象台を読み取れない');return json(req,{ok:false,code:'parse_empty',message:'対象のジャグラー / ハナハナ台を読み取れなかったよ',errorStep:'parser',requestedShop:st.shop,requestedDate:job.date,requestedUrl:url,dispatchedUrl:requestUrl,transportMode,transportBuild:'v503-ios-url-transport-1',fetchUrlMatchesDispatched:fetchUrl?fetchUrl===requestUrl:null,inputMode:identity.inputMode,textLength:identity.inputChars,textBytes:identity.inputBytes,quality:parsed.quality||null,textPreview:identity.preview||'',retryMinutes:Math.max(1,Math.ceil((f.nextRetryAt-now())/60000))},422)} if((+parsed.quality?.score||0)<60){job.status='failed';job.errorCode='parse_quality';await s.setJSON(key,job);const f=await iosCollectorFinishFailure(s,auth.channelId,cfg,st,job.date,'parse_quality',parsed.quality?.grade||'D');return json(req,{ok:false,code:'parse_quality',message:`取得内容の品質が低いため保存しなかったよ（${parsed.quality?.grade||'D'}）`,errorStep:'quality',requestedShop:st.shop,requestedDate:job.date,requestedUrl:url,dispatchedUrl:requestUrl,transportMode,transportBuild:'v503-ios-url-transport-1',fetchUrlMatchesDispatched:fetchUrl?fetchUrl===requestUrl:null,parsedMachines:parsed.machines.length,quality:parsed.quality,inputMode:identity.inputMode,textLength:identity.inputChars,textBytes:identity.inputBytes,retryMinutes:Math.max(1,Math.ceil((f.nextRetryAt-now())/60000))},422)}
  const sanity=await iosCollectorCountSanity(s,auth.channelId,st.sourceStoreId,parsed.machines.length); if(!sanity.ok){job.status='failed';job.errorCode='partial_page';await s.setJSON(key,job);const f=await iosCollectorFinishFailure(s,auth.channelId,cfg,st,job.date,'partial_page',`count=${parsed.machines.length},median=${sanity.median}`);return json(req,{ok:false,code:'partial_page',message:`普段より取得台数が少なすぎるため保存しなかったよ（${parsed.machines.length}台）`,errorStep:'count_sanity',requestedShop:st.shop,requestedDate:job.date,requestedUrl:url,dispatchedUrl:requestUrl,transportMode,transportBuild:'v503-ios-url-transport-1',fetchUrlMatchesDispatched:fetchUrl?fetchUrl===requestUrl:null,parsedMachines:parsed.machines.length,medianMachines:sanity.median,quality:parsed.quality,retryMinutes:Math.max(1,Math.ceil((f.nextRetryAt-now())/60000))},422)}
  const saved=await storeIosCollectorDay(s,auth.channelId,st,parsed); job.status='saved';job.savedAt=now();job.revision=saved.revision;await s.setJSON(key,job);await iosCollectorFinishSuccess(s,auth.channelId,cfg,st,job.date);
  return json(req,{ok:true,state:'SAVED',shop:st.shop,date:job.date,url,dispatchedUrl:requestUrl,transportMode,transportBuild:'v503-ios-url-transport-1',fetchUrlMatchesDispatched:fetchUrl?fetchUrl===requestUrl:null,machines:parsed.machines.length,quality:parsed.quality,revision:saved.revision,updatedAt:saved.updatedAt});
}
function collectorIndexKey(channelId) { return `collector-index/${channelId}`; }
function collectorStoreHash(sourceStoreId) { return digest(String(sourceStoreId || '')).slice(0, 24); }
function collectorDayKey(channelId, sourceStoreId, date) { return `collector-day/${channelId}/${collectorStoreHash(sourceStoreId)}/${date}`; }
function validCollectorDate(v) { return /^20\d{2}-\d{2}-\d{2}$/.test(String(v || '')); }
function validCollectorStoreId(v) { const s = String(v || '').trim(); return !!s && s.length <= 240; }
function emptyCollectorIndex() { return { version: COLLECTOR_INDEX_VERSION, revision: 0, updatedAt: 0, entries: {} }; }
async function getCollectorIndex(s, channelId) {
  const x = await s.get(collectorIndexKey(channelId), { type: 'json' });
  if (!x || +x.version !== COLLECTOR_INDEX_VERSION || !x.entries || typeof x.entries !== 'object') return emptyCollectorIndex();
  return x;
}
function compactCollectorDay(day) {
  return {
    date: String(day?.date || ''),
    sourceUrl: String(day?.sourceUrl || ''),
    parserBuild: String(day?.quality?.parserBuild || 'v504-header-driven-1'),
    machines: Array.isArray(day?.machines) ? day.machines.map(r => ({
      machine: String(r?.machine || ''),
      category: String(r?.category || ''),
      sourceMachineName: String(r?.sourceMachineName || ''),
      tableNo: String(r?.tableNo || ''),
      games: r?.games == null || !Number.isFinite(+r.games) ? null : +r.games,
      diff: r?.diff == null || !Number.isFinite(+r.diff) ? null : +r.diff,
      bb: +r?.bb || 0,
      rb: +r?.rb || 0,
      gamesSource: String(r?.gamesSource || (r?.games == null ? 'missing' : 'observed')),
      diffSource: String(r?.diffSource || (r?.diff == null ? 'missing' : 'observed')),
    })) : [],
  };
}
async function collectorPush(req, s, body) {
  const ch = await authSender(s, body.channelId, body.senderToken);
  if (!ch) return fail(req, 401, 'JUGESTとのCollector連携が無効だよ。連携し直してね', 'unauthorized');
  const payloadError = validatePayload(body.payload);
  if (payloadError) return fail(req, 400, payloadError, 'bad_payload');
  const payload = body.payload, sourceStoreId = String(payload.sourceStoreId || '').trim(), shop = String(payload.shop || '').trim();
  if (!validCollectorStoreId(sourceStoreId)) return fail(req, 400, 'Collectorの店舗IDを認識できないよ', 'bad_store_id');
  if (payload.days.length > COLLECTOR_PULL_LIMIT) return fail(req, 400, `Collectorは1回${COLLECTOR_PULL_LIMIT}日まで送ってね`, 'too_many_days');
  const index = await getCollectorIndex(s, body.channelId), acceptedDates = [];
  for (const srcDay of payload.days) {
    const day = compactCollectorDay(srcDay), date = day.date;
    if (!validCollectorDate(date) || !day.machines.length) return fail(req, 400, `${date || '日付不明'} のCollectorデータが不正だよ`, 'bad_day');
    index.revision = (+index.revision || 0) + 1;
    const rev = index.revision, updatedAt = now(), key = collectorDayKey(body.channelId, sourceStoreId, date);
    const rec = { version: 1, channelId: body.channelId, revision: rev, updatedAt, shop, sourceStoreId, day };
    await s.setJSON(key, rec);
    index.entries[`${collectorStoreHash(sourceStoreId)}|${date}`] = { key, revision: rev, updatedAt, shop, sourceStoreId, date, machines: day.machines.length };
    acceptedDates.push(date);
  }
  index.updatedAt = now();
  await s.setJSON(collectorIndexKey(body.channelId), index);
  return json(req, { ok: true, acceptedDates, revision: +index.revision || 0, updatedAt: index.updatedAt });
}
async function collectorPull(req, s, body) {
  const ch = await authReceiver(s, body.channelId, body.receiverToken);
  if (!ch) return fail(req, 401, 'Collector連携が無効だよ。連携し直してね', 'unauthorized');
  const index = await getCollectorIndex(s, body.channelId), serverRevision = +index.revision || 0;
  let since = Math.max(0, +body.sinceRevision || 0);
  if (since > serverRevision) since = 0;
  const limit = Math.max(1, Math.min(COLLECTOR_PULL_LIMIT, +body.limit || COLLECTOR_PULL_LIMIT));
  const pending = Object.values(index.entries || {}).filter(x => (+x.revision || 0) > since).sort((a, b) => (+a.revision || 0) - (+b.revision || 0));
  const chosen = pending.slice(0, limit), items = [];
  for (const x of chosen) {
    const rec = await s.get(x.key, { type: 'json' });
    if (rec?.day && +rec.revision > since) items.push({ revision: +rec.revision || 0, updatedAt: +rec.updatedAt || 0, shop: String(rec.shop || ''), sourceStoreId: String(rec.sourceStoreId || ''), day: rec.day });
  }
  const nextRevision = chosen.length ? Math.max(...chosen.map(x => +x.revision || 0)) : since;
  const hasMore = pending.some(x => (+x.revision || 0) > nextRevision);
  return json(req, { ok: true, items, nextRevision, serverRevision, hasMore, pending: pending.length, updatedAt: +index.updatedAt || 0 });
}
async function collectorStatus(req, s, body) {
  const ch = await authReceiver(s, body.channelId, body.receiverToken);
  if (!ch) return fail(req, 401, 'Collector連携が無効だよ。連携し直してね', 'unauthorized');
  const index = await getCollectorIndex(s, body.channelId), entries = Object.values(index.entries || {}), since=Math.max(0,+body.sinceRevision||0);
  const latestByStore = {};
  for (const x of entries) {
    const id = String(x.sourceStoreId || ''), old = latestByStore[id];
    if (!old || String(x.date || '') > String(old.date || '')) latestByStore[id] = { sourceStoreId: id, shop: String(x.shop || ''), date: String(x.date || ''), updatedAt: +x.updatedAt || 0 };
  }
  const iosConfig = await getIosCollectorConfig(s, body.channelId), targets=await iosCollectorTargetSummaries(s,body.channelId,iosConfig,index);
  const pending=entries.filter(x=>(+x.revision||0)>since).length;
  return json(req, { ok: true, revision: +index.revision || 0, pending, days: entries.length, stores: Object.values(latestByStore), iosConfiguredStores: iosConfig.stores, iosTargets:targets, updatedAt: +index.updatedAt || 0 });
}
async function cleanupCollector(s, channelId) {
  try {
    const index = await getCollectorIndex(s, channelId);
    const keys = [...new Set(Object.values(index.entries || {}).map(x => x?.key).filter(Boolean))];
    for(const prefix of [`ios-job/${channelId}/`,`ios-lease/${channelId}/`,`ios-failure/${channelId}/`]){try{const {blobs}=await s.list({prefix});keys.push(...blobs.map(x=>x.key))}catch{}}
    await Promise.all([...new Set(keys)].map(key => s.delete(key)));
    await s.delete(collectorIndexKey(channelId));
    await s.delete(iosCollectorConfigKey(channelId));
    await s.delete(iosCollectorWindowKey(channelId));
  } catch {}
}

async function sendMessage(req, s, body) {
  const ch = await authSender(s, body.channelId, body.senderToken);
  if (!ch) return fail(req, 401, '設定判別ツールとの連携が無効だよ。連携し直してね', 'unauthorized');
  const payloadError = validatePayload(body.payload);
  if (payloadError) return fail(req, 400, payloadError, 'bad_payload');
  const batchId = String(body.batchId || token(10)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || token(10);
  const chunkIndex = Math.max(1, Math.min(999, +body.chunkIndex || 1));
  const chunkTotal = Math.max(chunkIndex, Math.min(999, +body.chunkTotal || 1));
  const createdAt = now();
  const messageId = `${createdAt}-${token(8)}`;
  const rec = {
    version: 1,
    messageId,
    channelId: body.channelId,
    batchId,
    chunkIndex,
    chunkTotal,
    createdAt,
    expiresAt: createdAt + MESSAGE_TTL_MS,
    payload: body.payload,
  };
  await s.setJSON(`message/${body.channelId}/${messageId}`, rec, { onlyIfNew: true });
  return json(req, { ok: true, messageId, expiresAt: rec.expiresAt, chunkIndex, chunkTotal });
}

async function peekInbox(req, s, body) {
  const ch = await authReceiver(s, body.channelId, body.receiverToken);
  if (!ch) return fail(req, 401, 'Launcher連携が無効だよ。連携し直してね', 'unauthorized');
  const { count, first } = await firstActiveMessage(s, body.channelId);
  return json(req, { ok: true, count, next: first ? messageMeta(first.rec) : null });
}

async function receiveMessage(req, s, body) {
  const ch = await authReceiver(s, body.channelId, body.receiverToken);
  if (!ch) return fail(req, 401, 'Launcher連携が無効だよ。連携し直してね', 'unauthorized');
  const { count, first } = await firstActiveMessage(s, body.channelId);
  if (!first) return json(req, { ok: true, count: 0, message: null });
  return json(req, { ok: true, count, message: first.rec });
}

async function ackMessage(req, s, body) {
  const ch = await authReceiver(s, body.channelId, body.receiverToken);
  if (!ch) return fail(req, 401, 'Launcher連携が無効だよ。連携し直してね', 'unauthorized');
  const id = String(body.messageId || '');
  if (!/^\d{10,20}-[A-Za-z0-9_-]{5,80}$/.test(id)) return fail(req, 400, '受信便IDが不正だよ', 'bad_message_id');
  await s.delete(`message/${body.channelId}/${id}`);
  return json(req, { ok: true });
}

async function unlink(req, s, body) {
  const ch = await authReceiver(s, body.channelId, body.receiverToken);
  if (!ch) return fail(req, 401, 'Launcher連携が無効だよ', 'unauthorized');
  ch.revokedAt = now();
  await s.setJSON(`channel/${body.channelId}`, ch);
  const { blobs } = await s.list({ prefix: `message/${body.channelId}/` });
  await Promise.all(blobs.map(x => s.delete(x.key)));
  await cleanupCollector(s, body.channelId);
  return json(req, { ok: true });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 405, 'POSTで呼んでね', 'method_not_allowed');
  const origin = req.headers.get('origin') || '';
  if (origin && !ALLOWED_ORIGINS.has(origin)) return fail(req, 403, 'このページからは中継APIを使えないよ', 'origin_denied');
  try {
    const body = await readBody(req);
    const action = String(body.action || '');
    const s = store();
    if (action === 'createPair') return await createPair(req, s);
    if (action === 'createIosCollector') return await createIosCollector(req, s);
    if (action === 'rotateIosCollectorKey') return await rotateIosCollectorKey(req, s, body);
    if (action === 'claimPair') return await claimPair(req, s, body);
    if (action === 'pairStatus') return await pairStatus(req, s, body);
    if (action === 'send') return await sendMessage(req, s, body);
    if (action === 'collectorPush') return await collectorPush(req, s, body);
    if (action === 'iosCollectorConfigure') return await iosCollectorConfigure(req, s, body);
    if (action === 'iosCollectorTargets') return await iosCollectorTargets(req, s, body);
    if (action === 'iosCollectorTargetUpsert') return await iosCollectorTargetUpsert(req, s, body);
    if (action === 'iosCollectorTargetDelete') return await iosCollectorTargetDelete(req, s, body);
    if (action === 'iosCollectorRequeueDate') return await iosCollectorRequeueDate(req, s, body);
    if (action === 'iosCollectorNext') return await iosCollectorNext(req, s, body);
    if (action === 'iosCollectorNextV2') return await iosCollectorNextV2(req, s, body);
    if (action === 'iosCollectorHtmlPush') return await iosCollectorHtmlPush(req, s, body);
    if (action === 'iosCollectorPushV2') return await iosCollectorPushV2(req, s, body);
    if (action === 'collectorPull') return await collectorPull(req, s, body);
    if (action === 'collectorStatus') return await collectorStatus(req, s, body);
    if (action === 'peek') return await peekInbox(req, s, body);
    if (action === 'receive') return await receiveMessage(req, s, body);
    if (action === 'ack') return await ackMessage(req, s, body);
    if (action === 'unlink') return await unlink(req, s, body);
    return fail(req, 400, '中継APIの操作を認識できないよ', 'bad_action');
  } catch (e) {
    console.error('[juggler-relay]', e);
    return fail(req, +e?.status || 500, e?.message || '中継APIでエラーが起きたよ', 'server_error');
  }
};

export const config = {
  path: '/api/relay',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
