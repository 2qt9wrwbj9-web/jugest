import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRelayServer } from '../vps/relay-server.mjs';

const origin = 'https://2qt9wrwbj9-web.github.io';
const dir = await mkdtemp(path.join(os.tmpdir(), 'jugest-relay-'));
const server = createRelayServer({ dataDir: dir, allowedOrigins: new Set([origin]), rateWindowLimit: 1000 });
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;

async function api(body, customOrigin = origin) {
  const res = await fetch(`${base}/api/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(customOrigin ? { origin: customOrigin } : {}) },
    body: JSON.stringify(body),
  });
  return { res, json: await res.json() };
}

try {
  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const denied = await api({ action: 'createPair' }, 'https://evil.example');
  assert.equal(denied.res.status, 403);
  assert.equal(denied.json.code, 'origin_denied');

  const pair = await api({ action: 'createPair' });
  assert.equal(pair.res.status, 200);
  assert.match(pair.json.code, /^\d{6}$/);
  assert.ok(pair.json.channelId);
  assert.ok(pair.json.receiverToken);

  const beforeClaim = await api({ action: 'pairStatus', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken });
  assert.equal(beforeClaim.json.linked, false);

  const claim = await api({ action: 'claimPair', code: pair.json.code });
  assert.equal(claim.res.status, 200);
  assert.equal(claim.json.channelId, pair.json.channelId);
  assert.ok(claim.json.senderToken);

  const afterClaim = await api({ action: 'pairStatus', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken });
  assert.equal(afterClaim.json.linked, true);

  const payload = {
    format: 'juggler-external-import-bulk', shop: 'テスト店舗', successDays: 1,
    days: [{ date: '2026-08-28', machines: [{ no: 1, model: 'テスト', games: 5000, big: 20, reg: 18 }] }],
  };
  const sent = await api({ action: 'send', channelId: pair.json.channelId, senderToken: claim.json.senderToken, payload, batchId: 'test-batch', chunkIndex: 1, chunkTotal: 1 });
  assert.equal(sent.res.status, 200);
  assert.ok(sent.json.messageId);

  const peek = await api({ action: 'peek', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken });
  assert.equal(peek.json.count, 1);
  assert.equal(peek.json.next.shop, 'テスト店舗');
  assert.equal(peek.json.next.days, 1);

  const receive = await api({ action: 'receive', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken });
  assert.equal(receive.json.count, 1);
  assert.deepEqual(receive.json.message.payload, payload);

  const ack = await api({ action: 'ack', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken, messageId: sent.json.messageId });
  assert.equal(ack.json.ok, true);

  const empty = await api({ action: 'receive', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken });
  assert.equal(empty.json.count, 0);
  assert.equal(empty.json.message, null);

  const unlink = await api({ action: 'unlink', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken });
  assert.equal(unlink.json.ok, true);

  const afterUnlink = await api({ action: 'pairStatus', channelId: pair.json.channelId, receiverToken: pair.json.receiverToken });
  assert.equal(afterUnlink.res.status, 401);
  assert.equal(afterUnlink.json.code, 'unauthorized');

  console.log('vps relay regression passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
