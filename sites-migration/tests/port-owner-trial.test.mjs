import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256Text} from '../lib/storage/recovery.mjs';
import {ownerTrialBlocksWrites, serveOwnerTrial} from '../lib/owner-trial.mjs';

const origin = 'https://trial.test';
const headers = {
  'oai-authenticated-user-id': 'owner-synthetic',
  'oai-authenticated-user-email': 'fixture@example.invalid',
};
const base = {JUGEST_OWNER_VIEW: '1', JUGEST_OWNER_USER_ID: headers['oai-authenticated-user-id']};
function serve(path, {env = base, init, development, renderApp} = {}) {
  return serveOwnerTrial(new Request(origin + path, init), env, {development, renderApp});
}
const owner = {headers};

test('owner preflight refuses data even if both identity headers reach the raw Worker', async () => {
  assert.equal(ownerTrialBlocksWrites({}), false);
  assert.equal(ownerTrialBlocksWrites(base), true);
  assert.equal(ownerTrialBlocksWrites({JUGEST_OWNER_TRIAL_STOP: '1'}), true);
  const preflight = await serve('/api/owner-view', {init: owner});
  assert.deepEqual(await preflight.json(), {ok: true, authenticated: true, readsEnabled: false});
  assert.equal((await serve('/api/vps/stores', {init: owner})).status, 403);
  assert.equal((await serve('/api/owner-view')).status, 401);
  assert.equal((await serve('/api/owner-view', {development: true, init: owner})).status, 401);
  assert.equal((await serve('/api/owner-view', {env: {JUGEST_OWNER_VIEW: '1'}, init: owner})).status, 503);
  assert.equal((await serve('/api/owner-view', {init: {headers: {...headers, 'oai-authenticated-user-id': 'other'}}})).status, 403);
  assert.equal((await serve('/api/owner-view', {init: {headers: {'oai-sites-authorization': 'Bearer synthetic'}}})).status, 401);
  assert.equal((await serve('/', {init: {method: 'HEAD'}})).status, 401);
  const anonymous = await serve('/');
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get('location'), '/signin-with-chatgpt?return_to=%2F');
});

test('worker trial closes alternate routes and writes before reaching storage', async () => {
  const env = {...base, JUGEST_OWNER_TRIAL_READS: 'verified', JUGEST_OWNER_TRIAL_STORES: 'pia:35', DB: {}, BUCKET: {}};
  for (const path of ['/api/dev-session', '/api/dev-pia-import', '/api/pia/collect', '/api/public/judge', '/mcp', '/index.html', '/relay-bridge.html', '/api/raw']) {
    for (const method of ['GET', 'POST']) assert.equal((await serve(path, {env, init: {...owner, method}})).status, 404);
  }
  for (const path of [
    '/api/vps/stores/pia%3A35/analysis/jobs', '/api/vps/stores/pia%3A35/analysis/jobs/1/advance',
    '/api/vps/stores/pia%3A35/days', '/api/vps/stores', '/api/vps/judge/machines',
  ]) assert.equal((await serve(path, {env, init: {...owner, method: 'POST'}})).status, 403);
  for (const id of ['pia%3A35%2Fother', 'pia%3A35%ZZ', 'dev-pia-observed', 'pia:35:import:unlisted']) {
    assert.equal((await serve('/api/vps/stores/' + id + '/days', {env, init: owner})).status, 403);
  }
  assert.equal((await serve('/', {env: {...env, JUGEST_OWNER_TRIAL_STOP: '1'}, init: owner})).status, 503);
});

test('trial responses suppress sensitive cache and failure details, including HEAD requests', async () => {
  const sample = () => new Response('shell', {headers: {
    'cache-control': 'public, max-age=7200', 'etag': 'internal', 'last-modified': 'internal',
    'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true',
  }});
  const root = await serve('/', {init: owner, renderApp: sample});
  assert.equal(await root.text(), 'shell');
  assert.equal(root.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(root.headers.get('cross-origin-resource-policy'), 'same-origin');
  for (const name of ['etag', 'last-modified', 'access-control-allow-origin', 'access-control-allow-credentials']) {
    assert.equal(root.headers.has(name), false);
  }
  assert.equal(await (await serve('/', {init: {...owner, method: 'HEAD'}, renderApp: sample})).text(), '');
  for (const renderApp of [() => {throw Error('fixture-internal-path')}, () => new Response('fixture-internal-path', {status: 500})]) {
    const response = await serve('/', {init: owner, renderApp});
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {ok: false, code: 'owner_trial_unavailable'});
  }
});

test('first empty trial enrolls a fingerprint using an expected email; data requires a pinned ID', async () => {
  const emailHash = await sha256Text(headers['oai-authenticated-user-email']);
  const fingerprint = await sha256Text('jugest-sites-owner-v1:' + headers['oai-authenticated-user-id']);
  const env = {JUGEST_OWNER_VIEW: '1', JUGEST_OWNER_TRIAL_BOOTSTRAP_EMAIL_SHA256: emailHash};
  const read = (path, flags = env, init = owner) => serve(path, {env: flags, init});
  assert.equal((await read('/api/owner-view', env, {headers: {...headers, 'oai-authenticated-user-email': 'other@example.invalid'}})).status, 403);
  const status = await read('/api/owner-view');
  assert.deepEqual(await status.json(), {ok: true, authenticated: true, readsEnabled: false, ownerFingerprint: fingerprint});
  assert.equal((await read('/api/vps/stores')).status, 403);
  assert.equal((await read('/api/owner-view', {...env, JUGEST_OWNER_TRIAL_READS: 'verified'})).status, 503);
  const pinned = {JUGEST_OWNER_VIEW: '1', JUGEST_OWNER_TRIAL_OWNER_SHA256: fingerprint};
  assert.equal((await read('/api/owner-view', pinned, {headers: {...headers, 'oai-authenticated-user-id': 'other'}})).status, 403);
  assert.deepEqual(await (await read('/api/owner-view', pinned)).json(), {ok: true, authenticated: true, readsEnabled: false});
});
