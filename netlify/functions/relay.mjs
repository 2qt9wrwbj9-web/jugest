import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const STORE_NAME = 'juggler-relay-v1';
const PAIR_TTL_MS = 10 * 60 * 1000;
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 4_500_000;
const ALLOWED_ORIGINS = new Set([
  'https://jugest.netlify.app',
  'https://2qt9wrwbj9-web.github.io',
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
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://jugest.netlify.app';
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
    if (action === 'claimPair') return await claimPair(req, s, body);
    if (action === 'pairStatus') return await pairStatus(req, s, body);
    if (action === 'send') return await sendMessage(req, s, body);
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
