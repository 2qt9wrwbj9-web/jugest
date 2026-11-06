import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync, readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {handleStoreRead} from '../../../lib/store-read-api.mjs';
import {createSitesRelayStore} from '../../../lib/storage/relay-store.mjs';
import {sha256Text} from '../../../lib/storage/recovery.mjs';
import {hashCanonical} from '../../../upstream/vps/src/canonical-json.mjs';
import {judgeMachinesPublic as originalJudge} from '../../../upstream/vps/src/mcp-handler.mjs';

const require = createRequire(import.meta.url);
let miniflare;
try { miniflare = await import('miniflare'); }
catch { miniflare = await import(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare')); }
const mf = new miniflare.Miniflare({
  modules: true, script: 'export default {fetch(){return new Response("verification")}}',
  compatibilityDate: '2026-05-15', d1Databases: {DB: 'test-pia-observed'}, r2Buckets: ['BUCKET'], cf: false,
});
try {
  const db = await mf.getD1Database('DB'), bucket = await mf.getR2Bucket('BUCKET');
  const migrations = new URL('../../../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(x => x.endsWith('.sql')).sort()) {
    for (const query of readFileSync(new URL(file, migrations), 'utf8').split('--> statement-breakpoint')) {
      if (query.trim()) await db.prepare(query.trim()).run();
    }
  }
  const sql = execFileSync(process.execPath, [fileURLToPath(new URL('./observed-preview-sql.mjs', import.meta.url))], {encoding: 'utf8'});
  await db.batch(sql.trim().split('\n').map(line => db.prepare(line)));
  const fixture = JSON.parse(readFileSync(new URL('../../../upstream/tests/fixtures/group-pia-observed-20260921.json', import.meta.url), 'utf8'));
  const channelId = 'development_observed', token = 'f'.repeat(64);
  await createSitesRelayStore('juggler-relay-v1', {db, bucket}).setJSON('channel/' + channelId, {receiverHash: await sha256Text(token), revokedAt: null});
  const options = {db, bucket, piaOwnerChannelIds: channelId};
  const headers = {authorization: 'Bearer ' + token, 'x-jugest-channel-id': channelId, 'content-type': 'application/json'};
  const request = (path, init = {}) => new Request('https://test.invalid/api/vps/' + path, {headers, ...init});
  const list = await (await handleStoreRead(request('stores'), options)).json();
  assert.equal(list.stores[0].latestDate, fixture.date);
  assert.equal(list.stores[0].dayCount, 1);
  const days = await (await handleStoreRead(request('stores/dev-pia-observed/days'), options)).json();
  assert.equal(days.days[0].machineCount, fixture.rows.length);
  const payload = await (await handleStoreRead(request('stores/dev-pia-observed/days/' + fixture.date), options)).json();
  const rows = payload.day.machines.map(({tableNo, machine, games, bb, rb, diff}) => ({tableNo, machine, games, bb, rb, diff}));
  assert.deepEqual(rows, fixture.rows);
  const machines = rows.map(({machine, games, bb, rb, diff}) => ({machine, G: games, BB: bb, RB: rb, diff}));
  const judgeResponse = await handleStoreRead(request('judge/machines', {method: 'POST', body: JSON.stringify({machines})}), options);
  assert.equal(judgeResponse.status, 200);
  const actual = await judgeResponse.json(), expected = await originalJudge(machines);
  assert.deepEqual(actual, JSON.parse(JSON.stringify(expected)));
  console.log(JSON.stringify({
    provenance: fixture.source, currentLiveCapture: false, date: fixture.date, count: rows.length,
    inputHash: hashCanonical(rows), originalJudgeHash: hashCanonical(expected), sitesJudgeHash: hashCanonical(actual),
    inputsMatch: true, judgeOutputsMatch: true, storeAnalysisHistoryDays: 1, browserVerified: false,
  }, null, 2));
} finally {
  await mf.dispose();
}
