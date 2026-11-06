import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, readdirSync} from 'node:fs';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import {migrate} from '../upstream/vps/src/schema.mjs';
import {collectPiaPublicOnce, PIA_ENDPOINT} from '../upstream/vps/src/collectors/pia-public.mjs';
import {runPiaCollectionTick, restorePiaSnapshot} from '../lib/collectors/pia-collection.mjs';
import {handlePiaCollection} from '../lib/collectors/pia-collection-api.mjs';
import {handleStoreRead} from '../lib/store-read-api.mjs';
import {createSitesRelayStore} from '../lib/storage/relay-store.mjs';
import {sha256Text} from '../lib/storage/recovery.mjs';

const require = createRequire(import.meta.url);
let miniflare;
try { miniflare = await import('miniflare'); }
catch { miniflare = await import(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare')); }
const {Miniflare} = miniflare;
const store = 'pia:35', at = date => Date.parse(date + 'T16:00:00.000Z');
const date1 = '2026-09-22', date2 = '2026-09-23', date3 = '2026-09-24';
function snapshot(date, shift, {replacement = false, missing = false} = {}) {
  const ranking = [];
  for (let table = 3100; table < 3180; table++) {
    const newMachine = replacement && table === 3100;
    for (let day = newMachine ? 30 : 0; day < (newMachine ? 31 : 30); day++) {
      const id = day + shift;
      ranking.push({
        store_id: 35, machine_no: table, name: newMachine ? 'Ｓゴーゴージャグラー３ＫＡ' : 'ＳマイジャグラーⅤＫＤ',
        sis_machine_code: newMachine ? 'B' : 'A', store_machine_id: newMachine ? 'new' : String(table),
        out: 120 + (2500 + id * 37) * 3, special_out: 120, special_1: 10 + id, special_2d: 8 + id,
        difference: missing && table === 3100 && day === 29 ? null : id * 79 - 490,
      });
    }
  }
  return JSON.stringify({status: 0, ranking, server_date_time: {date, time: '01:00:00'}});
}
const pass = raw => async (url, options) => {
  assert.equal(url, PIA_ENDPOINT);
  assert.equal(options.method, 'POST');
  assert.equal(String(options.body), 'machine_type=S&store_id=35&limit=5000');
  return new Response(raw);
};
async function fixture(t) {
  const mf = new Miniflare({
    modules: true, script: 'export default{fetch(){return new Response("test")}}',
    compatibilityDate: '2026-05-15', d1Databases: {DB: 'test-pia'}, r2Buckets: ['BUCKET'], cf: false,
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB'), bucket = await mf.getR2Bucket('BUCKET');
  const dir = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) {
    const queries = readFileSync(new URL(file, dir), 'utf8').split('--> statement-breakpoint');
    for (const sql of queries.map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  }
  let clock = at('2026-09-21');
  const set = value => { clock = value; };
  const tick = (fetchImpl, options = {}) => runPiaCollectionTick({db, bucket, enabled: true, now: () => clock, fetchImpl, ...options});
  const rows = async sql => (await db.prepare(sql).all()).results;
  return {db, bucket, set, tick, rows};
}

test('PIA seed, 30-row delta, machine replacement, canonical rows and hashes match the original SQLite collector', async t => {
  const f = await fixture(t);
  const sqlite = new DatabaseSync(':memory:');
  const rawRoot = await mkdtemp(join(tmpdir(), 'jugest-pia-source-'));
  t.after(async () => {sqlite.close(); await rm(rawRoot, {recursive: true, force: true});});
  migrate(sqlite);
  for (const [date, raw] of [
    [date1, snapshot(date1, 0)], [date2, snapshot(date2, 1)], [date3, snapshot(date3, 2, {replacement: true})],
  ]) {
    const now = Date.parse(date + 'T01:00:00Z');
    f.set(now);
    const [source, target] = await Promise.all([
      collectPiaPublicOnce(sqlite, {rawRoot, nowIso: new Date(now).toISOString(), fetchImpl: pass(raw)}), f.tick(pass(raw)),
    ]);
    assert.equal(target.status, source.status);
    assert.equal(target.businessDate, source.businessDate ?? null);
    assert.equal((await f.tick(() => assert.fail('duplicate fetched'))).reason, 'done_today');
    if (!source.ingest) continue;
    const rawObject = await f.bucket.get((await f.rows(`SELECT raw_artifact_path FROM store_days WHERE business_date='${source.businessDate}'`))[0].raw_artifact_path);
    assert.equal(await rawObject.text(), raw);
    assert.equal(gunzipSync(await readFile(source.ingest.rawArtifactPath)).toString('utf8'), raw);
  }
  for (const sql of [
    'SELECT * FROM stores ORDER BY id',
    'SELECT store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,created_at,updated_at FROM store_days ORDER BY business_date',
    'SELECT * FROM machine_day_data ORDER BY business_date,machine_key',
    'SELECT store_id,analysis_version,generation,completed_generation,updated_at FROM analysis_refresh_state',
  ]) {
    assert.deepEqual(await f.rows(sql), sqlite.prepare(sql).all().map(row => ({...row})));
  }
  const source = sqlite.prepare('SELECT * FROM source_collector_state').get();
  const target = (await f.rows('SELECT * FROM sites_pia_collection_state'))[0];
  for (const key of ['last_snapshot_date','last_snapshot_hash','last_result','last_ingested_date','last_attempt_at','last_success_at','last_error']) assert.equal(target[key], source[key], key);
  const token = 'c'.repeat(64), channelId = 'pia_test_owner';
  await createSitesRelayStore('juggler-relay-v1', f).setJSON('channel/' + channelId, {receiverHash: await sha256Text(token), revokedAt: null});
  const headers = {authorization: 'Bearer ' + token, 'x-jugest-channel-id': channelId};
  const request = path => new Request('https://test.invalid/api/vps/' + path, {headers});
  const options = {...f, piaOwnerChannelIds: channelId};
  assert.equal((await handleStoreRead(request('stores/pia%3A35/status'), f)).status, 403);
  const api = await (await handleStoreRead(request('stores/pia%3A35/days/2026-09-23'), options)).json();
  const persisted = sqlite.prepare("SELECT payload_json FROM machine_day_data WHERE business_date='2026-09-23' ORDER BY machine_key").all().map(x => JSON.parse(x.payload_json));
  assert.deepEqual(api.day.machines, persisted);
  const status = await (await handleStoreRead(request('stores/pia%3A35/status'), options)).json();
  assert.equal(status.collection.businessDate, '2026-09-23');
  assert.equal(status.collection.status, 'ingested');
});

test('PIA tick applies JST due window, refuses premature and partial data, and recovers from a server failure', async t => {
  const f = await fixture(t);
  const seed = snapshot(date1, 0);
  assert.equal((await f.tick(pass(seed), {targetHour: 2})).reason, 'before_window');
  assert.equal((await f.tick(pass(seed))).status, 'seeded');
  f.set(at('2026-09-22'));
  assert.equal((await f.tick(pass(seed))).status, 'already_collected');
  assert.equal((await f.tick(() => assert.fail('cooldown fetched'))).reason, 'cooldown');
  f.set(at('2026-09-22') + 1_800_000);
  assert.equal((await f.tick(pass(snapshot(date2, 0)))).status, 'not_ready');
  f.set(at('2026-09-22') + 3_600_000);
  assert.equal((await f.tick(pass(snapshot(date2, 1, {missing: true})))).error, 'pia_missing_observed_value');
  f.set(at('2026-09-22') + 5_400_000);
  assert.equal((await f.tick(async () => new Response('offline', {status: 503}))).error, 'pia_http_503');
  assert.equal((await f.rows('SELECT COUNT(*) n FROM store_days'))[0].n, 0);
  f.set(at('2026-09-22') + 7_200_000);
  assert.equal((await f.tick(pass(snapshot(date2, 1)))).status, 'ingested');
  f.set(at('2026-09-23'));
  assert.equal((await f.tick(pass(snapshot(date2, 1)))).status, 'already_collected');
  f.set(at('2026-09-23') + 1_800_000);
  assert.equal((await f.tick(pass(snapshot(date1, 0)))).error, 'pia_snapshot_backwards');
  f.set(at('2026-09-23') + 3_600_000);
  assert.equal((await f.tick(pass(snapshot('2026-09-26', 4)))).error, 'pia_snapshot_in_future');
  f.set(at('2026-09-26'));
  assert.equal((await f.tick(pass(snapshot('2026-09-27', 5)))).status, 'gap_seeded');
  assert.equal((await f.rows('SELECT COUNT(*) n FROM store_days'))[0].n, 1);
  const state = (await f.rows('SELECT * FROM sites_pia_collection_state'))[0];
  assert.equal(state.last_ingested_date, '2026-09-22');
});

test('concurrent ticks, interrupted batch, database rollback, lost response and R2 restore preserve one official day', async t => {
  const f = await fixture(t);
  const seed = snapshot(date1, 0), raw = snapshot(date2, 1);
  let release, entered;
  const pending = new Promise(resolve => {release = resolve;});
  const active = new Promise(resolve => {entered = resolve;});
  const first = f.tick(async (...args) => {entered(); await pending; return pass(seed)(...args);});
  await active;
  assert.equal((await f.tick(() => assert.fail('parallel fetch'))).reason, 'running');
  release();
  assert.equal((await first).status, 'seeded');

  f.set(at('2026-09-22'));
  const source = (await f.rows('SELECT last_snapshot_key AS key FROM sites_pia_collection_state'))[0];
  await f.bucket.delete(source.key);
  assert.equal((await f.tick(() => assert.fail('missing baseline fetched'))).error, 'pia_raw_missing');
  await assert.rejects(restorePiaSnapshot({...f, rawText: raw}), /pia_backup_hash_mismatch/);
  await restorePiaSnapshot({...f, rawText: seed});

  const start = at('2026-09-22') + 1_800_000;
  f.set(start);
  await assert.rejects(f.tick(pass(raw), {onStage(stage) {if (stage === 'before-commit') throw Error('stopped');}}), /stopped/);
  assert.equal((await f.rows('SELECT COUNT(*) n FROM store_days'))[0].n, 0);
  f.set(start + 120_001);
  await f.db.prepare("CREATE TRIGGER stop_write BEFORE INSERT ON machine_day_data BEGIN SELECT RAISE(ABORT,'forced failure'); END").run();
  await assert.rejects(f.tick(pass(raw)), /forced failure/);
  assert.equal((await f.rows('SELECT COUNT(*) n FROM store_days'))[0].n, 0);
  assert.equal((await f.rows('SELECT COUNT(*) n FROM stores'))[0].n, 0);
  await f.db.prepare('DROP TRIGGER stop_write').run();
  f.set(start + 240_002);
  await assert.rejects(f.tick(pass(raw), {onStage(stage) {if (stage === 'committed') throw Error('response lost');}}), /response lost/);
  assert.equal((await f.tick(() => assert.fail('post-commit repeat fetched'))).reason, 'done_today');
  assert.equal((await f.rows('SELECT COUNT(*) n FROM store_days'))[0].n, 1);
  assert.equal((await f.rows('SELECT COUNT(*) n FROM machine_day_data'))[0].n, 80);
  assert.equal((await f.rows("SELECT COUNT(*) n FROM sites_pia_collection_attempts WHERE status='interrupted'"))[0].n, 2);
});

test('rate limit honors Retry-After and access denial pauses future ticks', async t => {
  const f = await fixture(t);
  assert.equal((await f.tick(async () => new Response('slow down', {status: 429, headers: {'retry-after': '3600'}}))).error, 'pia_rate_limited');
  f.set(at('2026-09-21') + 1_800_000);
  assert.equal((await f.tick(() => assert.fail('rate-limited fetch'))).reason, 'source_retry_after');
  f.set(at('2026-09-21') + 3_600_000);
  assert.equal((await f.tick(async () => new Response('forbidden', {status: 403}))).status, 'access_denied');
  f.set(at('2026-09-22'));
  assert.equal((await f.tick(() => assert.fail('access denial retried'))).reason, 'access_denied');
});

test('collector writer is off by default, authenticated separately, and cannot accept caller supplied source data', async () => {
  const token = 'e'.repeat(64), writerHash = await sha256Text(token);
  const request = (authorization, body) => new Request('https://test.invalid/api/pia/collect', {
    method: 'POST', headers: authorization ? {authorization} : {}, body,
  });
  let calls = 0;
  const run = async () => {calls++; return {attempt: false, reason: 'done_today'};};
  assert.equal((await handlePiaCollection(request('Bearer ' + token), {writerHash, run})).status, 404);
  assert.equal((await handlePiaCollection(request(''), {enabled: true, writerHash, run})).status, 401);
  assert.equal((await handlePiaCollection(request('Bearer ' + token, '{}'), {enabled: true, writerHash, run})).status, 400);
  assert.equal((await handlePiaCollection(request('Bearer ' + token), {enabled: true, writerHash, run})).status, 200);
  assert.equal(calls, 1);
});
