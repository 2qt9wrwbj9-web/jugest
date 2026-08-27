import http from 'node:http';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAIR_TTL_MS = 10 * 60 * 1000;
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 4_500_000;
const MAX_BODY_BYTES = 5_700_000;
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://2qt9wrwbj9-web.github.io',
  'https://ana-slo.com',
  'https://www.ana-slo.com',
]);

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

function safeSegment(value) {
  const s = String(value || '');
  if (!/^[A-Za-z0-9._-]+$/.test(s)) throw new Error('unsafe storage key');
  return s;
}

class FileStore {
  constructor(rootDir) { this.rootDir = path.resolve(rootDir); }
  async init() { await mkdir(this.rootDir, { recursive: true }); }
  filePath(key) {
    const parts = String(key || '').split('/').filter(Boolean).map(safeSegment);
    if (!parts.length) throw new Error('empty storage key');
    const last = parts.pop();
    return path.join(this.rootDir, ...parts, `${last}.json`);
  }
  dirPath(prefix) {
    const parts = String(prefix || '').split('/').filter(Boolean).map(safeSegment);
    return path.join(this.rootDir, ...parts);
  }
  async get(key) {
    try { return JSON.parse(await readFile(this.filePath(key), 'utf8')); }
    catch (e) { if (e?.code === 'ENOENT') return null; throw e; }
  }
  async setJSON(key, value, { onlyIfNew = false } = {}) {
    const target = this.filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    const body = JSON.stringify(value);
    if (onlyIfNew) {
      try {
        const fh = await open(target, 'wx', 0o600);
        try { await fh.writeFile(body, 'utf8'); } finally { await fh.close(); }
        return { modified: true };
      } catch (e) {
        if (e?.code === 'EEXIST') return { modified: false };
        throw e;
      }
    }
    const tmp = `${target}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
    await writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, target);
    return { modified: true };
  }
  async delete(key) { await rm(this.filePath(key), { force: true }); }
  async list(prefix) {
    const dir = this.dirPath(prefix);
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (e) { if (e?.code === 'ENOENT') return { blobs: [] }; throw e; }
    const base = String(prefix || '').replace(/^\/+|\/+$/g, '');
    const blobs = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      blobs.push({ key: base ? `${base}/${entry.name.slice(0, -5)}` : entry.name.slice(0, -5) });
    }
    return { blobs };
  }
}

function messageMeta(rec) {
  const p = rec?.payload || {};
  return {
    messageId: rec?.messageId || '', createdAt: +rec?.createdAt || 0, expiresAt: +rec?.expiresAt || 0,
    shop: String(p.shop || ''), days: Array.isArray(p.days) ? p.days.length : 0,
    successDays: +p.successDays || (Array.isArray(p.days) ? p.days.length : 0),
    batchId: String(rec?.batchId || ''), chunkIndex: +rec?.chunkIndex || 1, chunkTotal: +rec?.chunkTotal || 1,
  };
}

function parseOrigins(value) {
  if (!value) return new Set(DEFAULT_ALLOWED_ORIGINS);
  return new Set(String(value).split(',').map(x => x.trim()).filter(Boolean));
}

export function createRelayServer(options = {}) {
  const dataDir = options.dataDir || process.env.JUGEST_RELAY_DATA_DIR || path.resolve('data/relay');
  const allowedOrigins = options.allowedOrigins || parseOrigins(process.env.JUGEST_ALLOWED_ORIGINS);
  const rateWindowMs = Math.max(1000, +(options.rateWindowMs ?? 60_000));
  const rateWindowLimit = Math.max(1, +(options.rateWindowLimit ?? 120));
  const store = new FileStore(dataDir);
  const buckets = new Map();

  const corsHeaders = (req) => {
    const origin = req.headers.origin || '';
    const allowed = allowedOrigins.has(origin) ? origin : [...allowedOrigins][0] || '';
    return {
      ...(allowed ? { 'Access-Control-Allow-Origin': allowed } : {}),
      'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin', 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    };
  };
  const sendJson = (req, res, body, status = 200) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, { ...corsHeaders(req), 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
  };
  const fail = (req, res, status, message, code = 'relay_error') => sendJson(req, res, { ok: false, code, message }, status);
  const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const rateAllowed = (req) => {
    const key = clientIp(req), t = now(), rec = buckets.get(key);
    if (!rec || t - rec.startedAt >= rateWindowMs) { buckets.set(key, { startedAt: t, count: 1 }); return true; }
    rec.count += 1;
    return rec.count <= rateWindowLimit;
  };
  const readBody = async (req) => {
    const chunks = []; let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) throw Object.assign(new Error('送信データが大きすぎるよ'), { status: 413 });
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    try { return text ? JSON.parse(text) : {}; }
    catch { throw Object.assign(new Error('JSONを認識できないよ'), { status: 400 }); }
  };
  const cleanupExpiredPairCodes = async () => {
    try {
      const { blobs } = await store.list('code/');
      for (const item of blobs.slice(0, 50)) {
        const rec = await store.get(item.key);
        if (!rec || +rec.expiresAt <= now()) await store.delete(item.key);
      }
    } catch {}
  };
  const getChannel = async (channelId) => {
    if (!/^[A-Za-z0-9_-]{12,80}$/.test(String(channelId || ''))) return null;
    return store.get(`channel/${channelId}`);
  };
  const authReceiver = async (channelId, receiverToken) => {
    const ch = await getChannel(channelId);
    return (!ch || ch.revokedAt || !secureMatch(receiverToken, ch.receiverHash)) ? null : ch;
  };
  const authSender = async (channelId, senderToken) => {
    const ch = await getChannel(channelId);
    return (!ch || ch.revokedAt || !ch.senderHash || !secureMatch(senderToken, ch.senderHash)) ? null : ch;
  };
  const firstActiveMessage = async (channelId) => {
    const prefix = `message/${channelId}/`;
    const { blobs } = await store.list(prefix);
    const items = [...blobs].sort((a, b) => a.key.localeCompare(b.key));
    const active = [];
    for (const item of items) {
      const id = item.key.slice(prefix.length), createdAt = Number(id.split('-')[0]);
      if (Number.isFinite(createdAt) && createdAt + MESSAGE_TTL_MS <= now()) { await store.delete(item.key); continue; }
      active.push(item);
    }
    while (active.length) {
      const item = active.shift(), rec = await store.get(item.key);
      if (!rec || +rec.expiresAt <= now()) { await store.delete(item.key); continue; }
      return { count: active.length + 1, first: { key: item.key, rec } };
    }
    return { count: 0, first: null };
  };
  const validatePayload = (payload) => {
    if (!payload || payload.format !== 'juggler-external-import-bulk' || !Array.isArray(payload.days)) return '送信JSONの形式を認識できないよ';
    if (!String(payload.shop || '').trim()) return '店舗名を認識できないよ';
    if (!payload.days.length || payload.days.length > 400) return '日別データ数が不正だよ';
    if (byteLength(payload) > MAX_PAYLOAD_BYTES) return '1便のJSONが大きすぎるよ。Launcherを最新版にして分割送信してね';
    return '';
  };

  const server = http.createServer(async (req, res) => {
    try {
      await store.init();
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/healthz') {
        const body = JSON.stringify({ ok: true, service: 'jugest-relay-vps' });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
        return res.end(body);
      }
      if (url.pathname !== '/api/relay') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      const origin = String(req.headers.origin || '');
      if (origin && !allowedOrigins.has(origin)) return fail(req, res, 403, 'このページからは中継APIを使えないよ', 'origin_denied');
      if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); return res.end(); }
      if (req.method !== 'POST') return fail(req, res, 405, 'POSTで呼んでね', 'method_not_allowed');
      if (!rateAllowed(req)) return fail(req, res, 429, 'アクセスが多すぎるよ。少し待ってから試してね', 'rate_limited');
      const body = await readBody(req), action = String(body.action || '');

      if (action === 'createPair') {
        await cleanupExpiredPairCodes();
        for (let attempt = 0; attempt < 12; attempt++) {
          const code = String(randomInt(100000, 1000000)), channelId = token(18), receiverToken = token(32);
          const createdAt = now(), expiresAt = createdAt + PAIR_TTL_MS;
          const r = await store.setJSON(`code/${code}`, { channelId, createdAt, expiresAt }, { onlyIfNew: true });
          if (!r?.modified) continue;
          await store.setJSON(`channel/${channelId}`, { version: 1, createdAt, claimedAt: 0, revokedAt: 0, receiverHash: digest(receiverToken), senderHash: '' });
          return sendJson(req, res, { ok: true, code, channelId, receiverToken, expiresAt });
        }
        return fail(req, res, 503, '連携コードを発行できなかったよ。少し待ってもう一度試してね', 'pair_busy');
      }

      if (action === 'claimPair') {
        const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
        if (!/^\d{6}$/.test(code)) return fail(req, res, 400, '6桁の連携コードを入れてね', 'bad_code');
        const key = `code/${code}`, pending = await store.get(key);
        if (!pending || +pending.expiresAt <= now()) { if (pending) await store.delete(key); return fail(req, res, 404, '連携コードが見つからないか、有効期限が切れてるよ', 'code_expired'); }
        const ch = await getChannel(pending.channelId);
        if (!ch || ch.revokedAt) { await store.delete(key); return fail(req, res, 404, '連携先が見つからないよ。ツール側でコードを発行し直してね', 'channel_missing'); }
        const senderToken = token(32); ch.senderHash = digest(senderToken); ch.claimedAt = now();
        await store.setJSON(`channel/${pending.channelId}`, ch); await store.delete(key);
        return sendJson(req, res, { ok: true, channelId: pending.channelId, senderToken, linkedAt: ch.claimedAt });
      }

      if (action === 'pairStatus') {
        const ch = await authReceiver(body.channelId, body.receiverToken);
        if (!ch) return fail(req, res, 401, '連携情報を確認できなかったよ', 'unauthorized');
        return sendJson(req, res, { ok: true, linked: !!ch.senderHash && !!ch.claimedAt, claimedAt: +ch.claimedAt || 0 });
      }

      if (action === 'send') {
        const ch = await authSender(body.channelId, body.senderToken);
        if (!ch) return fail(req, res, 401, '設定判別ツールとの連携が無効だよ。連携し直してね', 'unauthorized');
        const payloadError = validatePayload(body.payload);
        if (payloadError) return fail(req, res, 400, payloadError, 'bad_payload');
        const batchId = String(body.batchId || token(10)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || token(10);
        const chunkIndex = Math.max(1, Math.min(999, +body.chunkIndex || 1));
        const chunkTotal = Math.max(chunkIndex, Math.min(999, +body.chunkTotal || 1));
        const createdAt = now(), messageId = `${createdAt}-${token(8)}`;
        const rec = { version: 1, messageId, channelId: body.channelId, batchId, chunkIndex, chunkTotal, createdAt, expiresAt: createdAt + MESSAGE_TTL_MS, payload: body.payload };
        await store.setJSON(`message/${body.channelId}/${messageId}`, rec, { onlyIfNew: true });
        return sendJson(req, res, { ok: true, messageId, expiresAt: rec.expiresAt, chunkIndex, chunkTotal });
      }

      if (action === 'peek' || action === 'receive') {
        const ch = await authReceiver(body.channelId, body.receiverToken);
        if (!ch) return fail(req, res, 401, 'Launcher連携が無効だよ。連携し直してね', 'unauthorized');
        const { count, first } = await firstActiveMessage(body.channelId);
        if (action === 'peek') return sendJson(req, res, { ok: true, count, next: first ? messageMeta(first.rec) : null });
        return sendJson(req, res, { ok: true, count, message: first ? first.rec : null });
      }

      if (action === 'ack') {
        const ch = await authReceiver(body.channelId, body.receiverToken);
        if (!ch) return fail(req, res, 401, 'Launcher連携が無効だよ。連携し直してね', 'unauthorized');
        const id = String(body.messageId || '');
        if (!/^\d{10,20}-[A-Za-z0-9_-]{5,80}$/.test(id)) return fail(req, res, 400, '受信便IDが不正だよ', 'bad_message_id');
        await store.delete(`message/${body.channelId}/${id}`);
        return sendJson(req, res, { ok: true });
      }

      if (action === 'unlink') {
        const ch = await authReceiver(body.channelId, body.receiverToken);
        if (!ch) return fail(req, res, 401, 'Launcher連携が無効だよ', 'unauthorized');
        ch.revokedAt = now(); await store.setJSON(`channel/${body.channelId}`, ch);
        const { blobs } = await store.list(`message/${body.channelId}/`);
        await Promise.all(blobs.map(x => store.delete(x.key)));
        return sendJson(req, res, { ok: true });
      }

      return fail(req, res, 400, '中継APIの操作を認識できないよ', 'bad_action');
    } catch (e) {
      console.error('[juggler-relay-vps]', e);
      return fail(req, res, +e?.status || 500, e?.message || '中継APIでエラーが起きたよ', 'server_error');
    }
  });
  return server;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const port = Math.max(1, +(process.env.PORT || 8787));
  const host = process.env.HOST || '127.0.0.1';
  const server = createRelayServer();
  server.listen(port, host, () => console.log(`[jugest-relay-vps] listening on http://${host}:${port}`));
}
