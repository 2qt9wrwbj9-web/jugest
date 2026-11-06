import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readdirSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {importPiaDay} from '../lib/collectors/pia-file-import.mjs';
import {handleDevelopmentPiaImport} from '../dev/pia-import.mjs';
import {handleDevelopmentSession, readDevelopmentPrincipal} from '../dev/session.mjs';
import {handleOwnerView} from '../lib/owner-view.mjs';
import {handleStoreRead} from '../lib/store-read-api.mjs';
import {createSitesStoreConnection} from '../client/sites-store-connection.mjs';
import {judgeMachinesPublic} from '../lib/generated-judge.mjs';

const require = createRequire(import.meta.url);
let miniflare;
try { miniflare = await import('miniflare'); }
catch { miniflare = await import(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare')); }
const {Miniflare} = miniflare;
const now = Date.parse('2026-09-22T15:10:00Z');
const source = {kind: 'synthetic', label: '再現用', permissionRef: 'synthetic-v20-test'};
const sources = {test: source};
const input = {
  format: 'jugest-pia-day-v1', storeId: 35, sourceKey: 'test', permissionRef: source.permissionRef, date: '2026-09-23',
  machines: [
    {tableNo: '3100', machine: 'my', machineName: 'マイジャグラーⅤ', games: 5401, bb: 21, rb: 20, diff: -34},
    {tableNo: '3097', machine: 'go', machineName: 'ゴーゴージャグラー3', games: 7713, bb: 31, rb: 29, diff: 679},
  ],
};
const bytes = (value = input, space = 2) => Buffer.from(JSON.stringify(value, null, space) + '\n');

async function fixture(t) {
  const mf = new Miniflare({modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-05-15', d1Databases: {DB: 'test'}, r2Buckets: ['BUCKET'], cf: false});
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB'), bucket = await mf.getR2Bucket('BUCKET');
  const dir = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
    for (const sql of readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint').map(x => x.trim()).filter(Boolean)) {
      await db.prepare(sql).run();
    }
  }
  return {db, bucket};
}

test('file validation and read-only review reject mismatches and require proof from the same session', async () => {
  const noWrite = {db: {prepare: () => ({bind: () => ({first: () => null})})}, bucket: {}, sources, now, reviewKey: 'fixture-session'};
  for (const [value, code] of [
    [{...input, storeId: 36}, 'invalid_file_metadata'],
    [{...input, sourceKey: 'constructor'}, 'source_not_approved'],
    [{...input, permissionRef: 'public-visible'}, 'source_not_approved'],
    [{...input, date: '2026-09-24'}, 'invalid_business_date'],
    [{...input, date: '2026-02-31'}, 'invalid_business_date'],
    [{...input, machines: [input.machines[0], input.machines[0]]}, 'duplicate_table_number'],
    ...[{machineName: '異なる機種'}, {games: null}, {bb: -1}, {rb: 99999}, {diff: 0.1}, {tableNo: '03097'}].map(change =>
      [{...input, machines: [{...input.machines[0], ...change}]}, 'invalid_machine_row']),
  ]) await assert.rejects(importPiaDay(bytes(value), noWrite), {code});
  await assert.rejects(importPiaDay(Buffer.from([255]), noWrite), {code: 'invalid_json'});
  await assert.rejects(importPiaDay(Buffer.alloc(128 * 1024 + 1), noWrite), {code: 'file_too_large'});
  const review = await importPiaDay(bytes(), noWrite);
  assert.equal(review.status, 'new');
  assert.equal(review.machines[0].tableNo, '3097');
  assert.equal(review.rawHash, createHash('sha256').update(bytes()).digest('hex'));
  await assert.rejects(importPiaDay(bytes(input, 0), {...noWrite, reviewedHash: review.reviewToken}), {code: 'review_mismatch'});
  await assert.rejects(importPiaDay(bytes(), {...noWrite, reviewKey: 'another-session', reviewedHash: review.reviewToken}), {code: 'review_mismatch'});
});

test('verified original and D1 day survive repeated, reformatted, conflicting and interrupted import', async t => {
  const {db, bucket} = await fixture(t);
  const options = {db, bucket, sources, now, reviewKey: 'fixture-session'};
  const raw = bytes();
  const review = await importPiaDay(raw, options);
  const save = {...options, reviewedHash: review.reviewToken};
  assert.equal((await bucket.list()).objects.length, 0);
  assert.equal(await db.prepare('SELECT COUNT(*) FROM store_days').first('COUNT(*)'), 0);
  const corruptBucket = {put: (...args) => bucket.put(...args), get: async key => new Response('corrupt')};
  await assert.rejects(importPiaDay(raw, {...save, bucket: corruptBucket}), {code: 'original_verification_failed'});
  await assert.rejects(importPiaDay(raw, {...save, db: {prepare: sql => db.prepare(sql), batch: () => {throw Error('interrupted before commit')}}}), /interrupted/);
  assert.equal(await db.prepare('SELECT COUNT(*) FROM store_days').first('COUNT(*)'), 0);
  assert.equal((await bucket.list()).objects.length, 1);
  const lostAck = {prepare: sql => db.prepare(sql), batch: async writes => {await db.batch(writes);throw Error('lost acknowledgement')}};
  assert.equal((await importPiaDay(raw, {...save, db: lostAck})).status, 'duplicate');
  const prior = await db.prepare('SELECT * FROM store_days').first();
  assert.equal(prior.normalized_payload_hash, review.normalizedHash);
  assert.deepEqual(Buffer.from(await (await bucket.get(prior.raw_artifact_path)).arrayBuffer()), raw);
  assert.equal((await importPiaDay(raw, save)).status, 'duplicate');
  const differentLayout = bytes({...input, machines: [...input.machines].reverse()}, 0);
  const duplicate = await importPiaDay(differentLayout, options);
  assert.equal(duplicate.status, 'same_data_different_file');
  assert.equal((await importPiaDay(differentLayout, {...options, reviewedHash: duplicate.reviewToken})).status, 'same_data_different_file');
  const revision = bytes({...input, machines: [{...input.machines[0], diff: 0}]});
  const conflict = await importPiaDay(revision, options);
  assert.equal(conflict.status, 'revision_conflict');
  await assert.rejects(importPiaDay(revision, {...options, reviewedHash: conflict.reviewToken}), {code: 'revision_conflict'});
  assert.deepEqual(await db.prepare('SELECT * FROM store_days').first(), prior);
  assert.equal(await db.prepare('SELECT generation FROM analysis_refresh_state').first('generation'), 1);
  assert.equal((await bucket.list()).objects.length, 1);
});

test('development file route requires same-origin and a dev session; the original browser cache reads the imported rows', async t => {
  const {db, bucket} = await fixture(t);
  const options = {db, bucket, enabled: true, sources, now: () => now};
  const origin = 'https://dev.test';
  const post = new Request(origin + '/api/dev-session', {method: 'POST', headers: {origin}});
  const login = await handleDevelopmentSession(post, options);
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const url = origin + '/api/dev-pia-import';
  assert.equal((await handleDevelopmentPiaImport(new Request(url), options)).status, 401);
  assert.equal((await handleDevelopmentPiaImport(new Request(url, {headers: {cookie}}), {...options, enabled: false})).status, 404);
  const postFile = (headers = {}) => new Request(url, {method: 'POST', headers: {cookie, origin, 'content-type': 'application/json', ...headers}, body: bytes()});
  assert.equal((await handleDevelopmentPiaImport(postFile({origin: 'https://other.test'}), options)).status, 403);
  const form = await (await handleDevelopmentPiaImport(new Request(url, {headers: {cookie}}), options)).text();
  assert.match(form, /保存前に照合する/);
  assert.doesNotThrow(() => new Function(form.split('<script>')[1].split('</script>')[0]));
  const preview = await (await handleDevelopmentPiaImport(postFile(), options)).json();
  assert.equal(preview.status, 'new');
  const saved = await (await handleDevelopmentPiaImport(postFile({'x-jugest-reviewed-hash': preview.reviewToken}), options)).json();
  assert.equal(saved.status, 'imported');
  const principal = await readDevelopmentPrincipal(new Request(origin, {headers: {cookie}}), options);
  const connection = createSitesStoreConnection({cookieAuth: true, storage: null, eventTarget: new EventTarget(),
    fetchFn: async (path, init) => {
      const headers = new Headers(init.headers);
      headers.set('x-jugest-channel-id', principal.channelId);
      headers.set('authorization', 'Bearer ' + principal.token);
      return handleStoreRead(new Request(origin + path, {...init, headers}), {db, bucket, developmentImports: true, piaOwnerChannelIds: principal.channelId});
    }});
  const direct = (await connection.client.listStores()).find(row => row.id === saved.storeId);
  assert.equal(direct.visibility, 'private');
  assert.equal(direct.source, 'synthetic-pia-import');
  await connection.refresh();
  assert.equal(connection.cache.getOverview(saved.name).collector.enabled, false);
  const rows = connection.cache.getDay(saved.name).rows;
  assert.equal(rows.length, 2);
  const {machines} = await judgeMachinesPublic(input.machines);
  for (const row of rows) {
    const expected = machines.find(x => x.tableNo === row.tableNo);
    assert.deepEqual(row.q, expected.q);
    assert.equal(row.expectedSetting, expected.expectedSetting);
  }
  assert.equal((await connection.client.getStatus(saved.name)).status.status, 'pending');
  assert.deepEqual((await connection.client.getAnalysisHistory(saved.name)).history, []);
});

test('owner scope allows only approved PIA rows, saved analysis and pure same-origin judgment', async t => {
  const {db, bucket} = await fixture(t);
  const options = {enabled: true, ownerId: 'site-user-owner', userId: 'site-user-owner', db, bucket};
  const origin = 'https://owner.test';
  const at = new Date(now).toISOString();
  for (const [id, metadata] of [
    ['pia:35', {source: 'pia-public-ranking-top', visibility: 'public'}],
    ['dev-pia-observed', {source: 'pia-public-ranking-top', visibility: 'public'}],
    ['pia:35:import:approved', {source: 'authorized-pia-import', visibility: 'private'}],
    ['pia:35:import:synthetic', {source: 'synthetic-pia-import', visibility: 'private'}],
  ]) await db.prepare('INSERT INTO stores VALUES(?,?,?,?,?)').bind(id, id, JSON.stringify(metadata), at, at).run();
  const get = (path, config = {}, init) => handleOwnerView(new Request(origin + path, init), {...options, ...config});
  assert.equal((await get('/api/owner-view', {enabled: false})).status, 404);
  assert.equal((await get('/api/owner-view', {ownerId: undefined})).status, 503);
  assert.equal((await get('/api/vps/stores', {userId: null}, {headers: {'oai-authenticated-user-id': options.ownerId}})).status, 401);
  assert.equal((await get('/api/vps/stores', {userId: 'someone-else'})).status, 403);
  const list = await (await get('/api/vps/stores')).json();
  assert.deepEqual(list.stores.map(row => row.id), ['pia:35', 'pia:35:import:approved']);
  assert.equal((await get('/api/vps/stores/dev-pia-observed/days')).status, 403);
  assert.equal((await get('/api/vps/stores/pia%3A35/days')).status, 200);
  assert.equal((await get('/api/vps/stores/pia%3A35/status')).status, 200);
  assert.equal((await get('/api/vps/stores/pia%3A35/analysis/default')).status, 200);
  assert.equal((await get('/api/vps/stores/pia%3A35/analysis/history')).status, 200);
  for (const path of ['/api/vps/stores/pia%3A35/analysis/jobs', '/api/vps/stores/pia%3A35/analysis/jobs/1/advance', '/api/pia/collect', '/api/dev-pia-import']) {
    assert.equal((await get(path, {}, {method: 'POST'})).status, 403);
  }
  const post = headers => ({method: 'POST', headers, body: JSON.stringify({machines: input.machines})});
  assert.equal((await get('/api/vps/judge/machines', {}, post({origin: 'https://other.test'}))).status, 403);
  assert.deepEqual(await (await get('/api/vps/judge/machines', {}, post({origin}))).json(), await judgeMachinesPublic(input.machines));
  assert.equal(await db.prepare('SELECT COUNT(*) FROM sites_analysis_jobs').first('COUNT(*)'), 0);
});
