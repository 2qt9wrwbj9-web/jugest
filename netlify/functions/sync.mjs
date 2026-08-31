import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const STORE_NAME = 'juggler-device-sync-v1';
const MAX_BODY_BYTES = 5_700_000;
const MAX_PAYLOAD_BYTES = 4_900_000;
const ALLOWED_ORIGINS = new Set([
  'https://jugglerest.netlify.app',
]);

const store = () => getStore({ name: STORE_NAME, consistency: 'strong' });
const now = () => Date.now();
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
const digest = value => createHash('sha256').update(String(value || '')).digest('hex');
const byteLength = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');

function secureMatch(raw, expectedHash) {
  if (!raw || !expectedHash) return false;
  const a = Buffer.from(digest(raw), 'hex');
  const b = Buffer.from(String(expectedHash), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function headers(req) {
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
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
function fail(req, status, message, code = 'sync_error', extra = {}) {
  return json(req, { ok: false, code, message, ...extra }, status);
}
async function readBody(req) {
  const text = await req.text();
  if (byteLength(text) > MAX_BODY_BYTES) throw Object.assign(new Error('同期データが大きすぎるよ'), { status: 413 });
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error('JSONを認識できないよ'), { status: 400 }); }
}
function validSyncId(v) { return /^[A-Za-z0-9_-]{12,80}$/.test(String(v || '')); }
function validPayload(p) {
  if (!p || +p.v !== 1) return false;
  if (!['gzip', 'none'].includes(String(p.zip || ''))) return false;
  if (!/^[A-Za-z0-9_-]{12,40}$/.test(String(p.iv || ''))) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(String(p.ct || ''))) return false;
  return byteLength(p) <= MAX_PAYLOAD_BYTES;
}
async function getRecord(s, syncId) {
  if (!validSyncId(syncId)) return null;
  return await s.get(`sync/${syncId}`, { type: 'json' });
}
async function authenticate(s, syncId, authToken) {
  const rec = await getRecord(s, syncId);
  if (!rec || rec.revokedAt || !secureMatch(authToken, rec.authHash)) return null;
  return rec;
}
async function createSync(req, s) {
  for (let i = 0; i < 10; i++) {
    const syncId = token(18), authToken = token(32), createdAt = now();
    const rec = { version: 1, createdAt, updatedAt: createdAt, revokedAt: 0, revision: 0, authHash: digest(authToken), payload: null };
    const out = await s.setJSON(`sync/${syncId}`, rec, { onlyIfNew: true });
    if (out?.modified) return json(req, { ok: true, syncId, authToken, revision: 0, createdAt });
  }
  return fail(req, 503, '共有領域を作れなかったよ。少し待ってもう一度試してね', 'create_busy');
}
async function pullSync(req, s, body) {
  const rec = await authenticate(s, body.syncId, body.authToken);
  if (!rec) return fail(req, 401, '共有コードが無効だよ。もう一度連携してね', 'unauthorized');
  return json(req, {
    ok: true,
    revision: +rec.revision || 0,
    updatedAt: +rec.updatedAt || 0,
    payload: body.metaOnly ? undefined : (rec.payload || null),
  });
}
async function pushSync(req, s, body) {
  const rec = await authenticate(s, body.syncId, body.authToken);
  if (!rec) return fail(req, 401, '共有コードが無効だよ。もう一度連携してね', 'unauthorized');
  if (!validPayload(body.payload)) return fail(req, 400, '暗号化同期データの形式かサイズが不正だよ', 'bad_payload');
  const current = +rec.revision || 0, base = Math.max(0, +body.baseRevision || 0);
  if (base !== current) return fail(req, 409, '別端末が先に更新したよ。最新データでもう一度統合してね', 'revision_conflict', { revision: current });
  rec.revision = current + 1;
  rec.updatedAt = now();
  rec.payload = body.payload;
  await s.setJSON(`sync/${body.syncId}`, rec);
  return json(req, { ok: true, revision: rec.revision, updatedAt: rec.updatedAt });
}

export default async req => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return fail(req, 405, 'POSTで呼んでね', 'method_not_allowed');
  const origin = req.headers.get('origin') || '';
  if (origin && !ALLOWED_ORIGINS.has(origin)) return fail(req, 403, 'このページからは同期APIを使えないよ', 'origin_denied');
  try {
    const body = await readBody(req), action = String(body.action || ''), s = store();
    if (action === 'create') return await createSync(req, s);
    if (action === 'pull') return await pullSync(req, s, body);
    if (action === 'push') return await pushSync(req, s, body);
    return fail(req, 400, '同期APIの操作を認識できないよ', 'bad_action');
  } catch (e) {
    console.error('[juggler-sync]', e);
    return fail(req, +e?.status || 500, e?.message || '同期APIでエラーが起きたよ', 'server_error');
  }
};

export const config = {
  path: '/api/sync',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
