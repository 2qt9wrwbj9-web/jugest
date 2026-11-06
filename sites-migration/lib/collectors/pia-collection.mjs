import {canonicalJson, hashCanonical} from '../../upstream/vps/src/canonical-json.mjs';
import {sha256Text} from '../storage/recovery.mjs';
import {
  derivePiaBusinessDay, fetchPiaPublicSnapshot, isPiaJuggler, PIA_COLLECTOR_ID,
  PIA_ENDPOINT, PIA_PARSER_BUILD, PIA_SOURCE_STORE_ID, PIA_STORE_NAME,
  shouldAttemptPiaCollection,
} from './generated-pia.mjs';

const SOURCE = 'pia-public-ranking-top';
const LEASE_MS = 120_000;
const MAX_RAW_BYTES = 12_000_000;
const DAY_MS = 86_400_000;
const dateMs = date => Date.parse(date + 'T00:00:00Z');
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);
const state = db => statement(db, 'SELECT * FROM sites_pia_collection_state WHERE collector_id=?', PIA_COLLECTOR_ID).first();
const fail = code => Object.assign(new Error(code), {code});

async function readRaw(bucket, key, hash) {
  const object = await bucket.get(key);
  if (!object) throw fail('pia_raw_missing');
  if (object.size > MAX_RAW_BYTES) throw fail('pia_raw_too_large');
  const rawText = await object.text();
  if (await sha256Text(rawText) !== hash) throw fail('pia_raw_hash_mismatch');
  return rawText;
}

async function archiveSnapshot(bucket, snapshot) {
  const key = `pia-public/35/${snapshot.snapshotDate}/${snapshot.snapshotHash}.json`;
  const written = await bucket.put(key, snapshot.rawText, {
    onlyIf: {etagDoesNotMatch: '*'},
    httpMetadata: {contentType: 'application/json'},
    customMetadata: {sha256: snapshot.snapshotHash},
  });
  if (!written) await readRaw(bucket, key, snapshot.snapshotHash);
  return key;
}

async function limitedFetch(fetchImpl, url, options) {
  const response = await fetchImpl(url, {...options, redirect: 'error'});
  if (response.status === 401 || response.status === 403) {
    const error = fail('pia_access_denied');
    error.httpStatus = response.status;
    throw error;
  }
  if (response.status === 429) {
    const error = fail('pia_rate_limited');
    error.retryAfter = response.headers.get('retry-after');
    throw error;
  }
  if (!response.ok) throw fail(`pia_http_${response.status}`);
  return {
    ok: true,
    async text() {
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', {fatal: true});
      let size = 0, text = '';
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) return text + decoder.decode();
          size += value.byteLength;
          if (size > MAX_RAW_BYTES) throw fail('pia_raw_too_large');
          text += decoder.decode(value, {stream: true});
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
    },
  };
}

// The source accepts numbers or numeric strings. Null/blank/booleans must not
// become observed zeros through Number(value).
function checkObservedNumbers(snapshot) {
  for (const row of snapshot.ranking) {
    if (!isPiaJuggler(row)) continue;
    for (const field of ['out', 'special_out', 'special_1', 'special_2d', 'difference']) {
      const value = row[field];
      if (!(typeof value === 'number' || typeof value === 'string' && value.trim()) ||
          !Number.isFinite(Number(value))) throw fail('pia_missing_observed_value');
    }
  }
}

async function claim(db, clock, options) {
  await statement(db, 'INSERT OR IGNORE INTO sites_pia_collection_state(collector_id) VALUES(?)', PIA_COLLECTOR_ID).run();
  const prior = await state(db);
  const at = clock.getTime();
  if (prior.lease_until > at) return {attempt: false, reason: 'running'};
  if (prior.last_result === 'access_denied') return {attempt: false, reason: 'access_denied'};
  if (prior.retry_not_before > at) return {attempt: false, reason: 'source_retry_after'};
  const gate = shouldAttemptPiaCollection({prepare: () => ({get: () => prior})}, {now: clock, ...options});
  if (!gate.attempt) return gate;

  const id = crypto.randomUUID(), startedAt = clock.toISOString();
  const claimed = 'EXISTS(SELECT 1 FROM sites_pia_collection_state WHERE collector_id=? AND lease_owner=?)';
  const writes = await db.batch([
    statement(db, `UPDATE sites_pia_collection_state SET lease_owner=?,lease_until=? WHERE collector_id=?
      AND lease_owner IS ? AND last_attempt_at IS ? AND (lease_until IS NULL OR lease_until<=?)`,
    id, at + LEASE_MS, PIA_COLLECTOR_ID, prior.lease_owner, prior.last_attempt_at, at),
    statement(db, `UPDATE sites_pia_collection_attempts SET status='interrupted',finished_at=?,error='lease_expired'
      WHERE id=? AND status='running' AND ${claimed}`, startedAt, prior.lease_owner, PIA_COLLECTOR_ID, id),
    statement(db, `INSERT INTO sites_pia_collection_attempts(id,jst_date,started_at,status)
      SELECT ?,?,?,'running' WHERE ${claimed}`, id, gate.jstDate, startedAt, PIA_COLLECTOR_ID, id),
  ]);
  return writes[0].meta.changes === 1
    ? {...gate, id, startedAt, prior}
    : {attempt: false, reason: 'claim_changed'};
}

async function dayWrites(db, day, snapshot, rawKey, at) {
  const storeId = PIA_SOURCE_STORE_ID;
  const normalizedHash = hashCanonical(day);
  const stored = await statement(db, 'SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?', storeId, day.date).first();
  const store = await statement(db, 'SELECT source_metadata_json FROM stores WHERE id=?', storeId).first();
  if (store && JSON.parse(store.source_metadata_json)?.source !== SOURCE) throw fail('pia_store_conflict');
  if (stored) {
    if (stored.normalized_payload_hash !== normalizedHash) throw fail('pia_business_day_conflict');
    return {writes: [], changed: false};
  }
  const metadata = canonicalJson({
    visibility: 'public', publicStoreId: 35, endpoint: PIA_ENDPOINT, snapshotDate: snapshot.snapshotDate,
    historyWindowDays: 30, source: SOURCE, parserBuild: PIA_PARSER_BUILD, latestRevision: 1,
  });
  const writes = [
    statement(db, `INSERT INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_metadata_json=excluded.source_metadata_json,updated_at=excluded.updated_at
      WHERE json_extract(stores.source_metadata_json,'$.source')=?`, storeId, PIA_STORE_NAME, metadata, at, at, SOURCE),
    statement(db, `SELECT json(CASE WHEN EXISTS(SELECT 1 FROM stores WHERE id=?
      AND json_extract(source_metadata_json,'$.source')=?) THEN 'null' ELSE '!' END)`, storeId, SOURCE),
    statement(db, `INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,
      quality_status,raw_artifact_path,created_at,updated_at) VALUES(?,?,?,?,?,'valid',?,?,?)`,
    storeId, day.date, PIA_PARSER_BUILD, snapshot.snapshotHash, normalizedHash, rawKey, at, at),
  ];
  // Canonical row keys and payload bytes match original ingest. Bound each
  // insert's JSON argument while keeping all rows in the same D1 batch.
  for (let i = 0; i < day.machines.length; i += 50) {
    const rows = day.machines.slice(i, i + 50).map((machine, index) => [
      String(i + index).padStart(6, '0'), canonicalJson(machine),
    ]);
    writes.push(statement(db, `INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json)
      SELECT ?,?,json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)`,
    storeId, day.date, JSON.stringify(rows)));
  }
  // Record dirty analysis input. Existing manual analysis remains available.
  writes.push(statement(db, `INSERT INTO analysis_refresh_state(store_id,analysis_version,generation,updated_at)
    VALUES(?,'vps-runtime-v1',1,?) ON CONFLICT(store_id,analysis_version)
    DO UPDATE SET generation=analysis_refresh_state.generation+1,updated_at=excluded.updated_at`, storeId, at));
  return {writes, changed: true};
}

function retryAt(retryAfter, startedAt) {
  if (!retryAfter) return null;
  const started = Date.parse(startedAt);
  const candidate = /^\d+$/.test(retryAfter) ? started + Number(retryAfter) * 1000 : Date.parse(retryAfter);
  return Number.isSafeInteger(candidate) && candidate > started ? candidate : null;
}

async function finish(db, claim, result, writes, now) {
  const {id, startedAt} = claim;
  const {snapshot, rawKey, businessDate, importedCount, diagnostics, error, advance, success} = result;
  const at = now();
  const finishedAt = new Date(at).toISOString();
  await db.batch([
    statement(db, `SELECT json(CASE WHEN EXISTS(SELECT 1 FROM sites_pia_collection_state
      WHERE collector_id=? AND lease_owner=? AND lease_until>?) THEN 'null' ELSE '!' END)`, PIA_COLLECTOR_ID, id, at),
    ...writes,
    statement(db, `UPDATE sites_pia_collection_attempts SET status=?,finished_at=?,snapshot_date=?,snapshot_hash=?,
      raw_key=?,business_date=?,row_count=?,machine_count=?,imported_count=?,diagnostics_json=?,error=? WHERE id=?`,
    result.status, finishedAt, snapshot?.snapshotDate ?? null, snapshot?.snapshotHash ?? null, rawKey ?? null,
    businessDate ?? null, snapshot?.rowCount ?? null, snapshot?.machineCount ?? null, importedCount ?? null,
    diagnostics ? JSON.stringify(diagnostics) : null, error ?? null, id),
    statement(db, `UPDATE sites_pia_collection_state SET last_snapshot_date=COALESCE(?,last_snapshot_date),
      last_snapshot_hash=COALESCE(?,last_snapshot_hash),last_snapshot_key=COALESCE(?,last_snapshot_key),
      last_result=?,last_ingested_date=COALESCE(?,last_ingested_date),last_attempt_at=?,
      last_success_at=COALESCE(?,last_success_at),last_error=?,retry_not_before=?,lease_owner=NULL,lease_until=NULL
      WHERE collector_id=? AND lease_owner=?`,
    advance ? snapshot.snapshotDate : null, advance ? snapshot.snapshotHash : null, advance ? rawKey : null,
    result.status, result.status === 'ingested' ? businessDate : null, startedAt, success ? startedAt : null,
    error ?? null, result.retryNotBefore ?? null, PIA_COLLECTOR_ID, id),
  ]);
}

export async function runPiaCollectionTick({
  db, bucket, enabled = false, fetchImpl = fetch, now = Date.now, minMachineCount = 80,
  targetHour = 0, targetMinute = 0, cooldownMs = 30 * 60_000, onStage = () => {},
} = {}) {
  if (!enabled) return {attempt: false, reason: 'disabled'};
  if (!db || !bucket) throw fail('pia_storage_unavailable');
  const run = await claim(db, new Date(now()), {targetHour, targetMinute, cooldownMs});
  if (!run.attempt) return run;
  await onStage('claimed');
  const {prior, startedAt} = run;
  let snapshot, rawKey, result, writes = [];
  try {
    const previous = prior.last_snapshot_key
      ? JSON.parse(await readRaw(bucket, prior.last_snapshot_key, prior.last_snapshot_hash))
      : null;
    snapshot = await fetchPiaPublicSnapshot({
      fetchImpl: (url, options) => limitedFetch(fetchImpl, url, options),
      minMachineCount, previousSnapshot: previous,
    });
    rawKey = await archiveSnapshot(bucket, snapshot);
    if (snapshot.snapshotDate > run.jstDate) throw fail('pia_snapshot_in_future');
    checkObservedNumbers(snapshot.data);
    const gap = (dateMs(snapshot.snapshotDate) - dateMs(prior.last_snapshot_date)) / DAY_MS;
    if (!previous) result = {status: 'seeded', advance: true, success: true};
    else if (gap === 0) result = {status: 'already_collected'};
    else if (gap < 0) throw fail('pia_snapshot_backwards');
    else if (gap > 1) result = {status: 'gap_seeded', advance: true, success: true, error: `snapshot gap ${gap} days; dates were not inferred`};
    else {
      const derived = derivePiaBusinessDay(previous, snapshot.data, snapshot.snapshotDate, {minComparable: Math.min(20, minMachineCount)});
      const diagnostics = derived.diagnostics;
      if (!derived.ready) result = {status: 'not_ready', diagnostics, error: 'PIA rolling history not ready'};
      else {
        const day = await dayWrites(db, derived.day, snapshot, rawKey, startedAt);
        writes = day.writes;
        result = {status: 'ingested', businessDate: derived.businessDate, importedCount: derived.machines.length,
          diagnostics, changed: day.changed, advance: true, success: true};
      }
    }
  } catch (error) {
    const code = error?.code ?? 'pia_collection_error';
    result = {
      status: code === 'pia_access_denied' ? 'access_denied' : 'failed',
      error: error.httpStatus ? `pia_http_${error.httpStatus}` : code === 'pia_collection_error' ? String(error.message).slice(0, 240) : code,
      retryNotBefore: retryAt(error?.retryAfter, startedAt),
    };
    writes = [];
  }
  await onStage('before-commit');
  await finish(db, run, {...result, snapshot, rawKey}, writes, now);
  await onStage('committed');
  return {
    attempt: true, id: run.id, status: result.status, snapshotDate: snapshot?.snapshotDate ?? null,
    businessDate: result.businessDate ?? null, rowCount: snapshot?.rowCount ?? null,
    machineCount: snapshot?.machineCount ?? null, importedCount: result.importedCount ?? null,
    error: result.error ?? null,
  };
}

export async function readPiaCollectionStatus(db) {
  const row = await state(db);
  if (!row) return null;
  return {
    status: row.last_result, snapshotDate: row.last_snapshot_date, businessDate: row.last_ingested_date,
    lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at,
    running: row.lease_until > Date.now(),
  };
}

// A verified source backup may repair a missing object with no D1 state
// change. Do not replace a conflicting object or accept substitute bytes.
export async function restorePiaSnapshot({db, bucket, rawText}) {
  const row = await state(db);
  if (!row?.last_snapshot_key || await sha256Text(rawText) !== row.last_snapshot_hash) throw fail('pia_backup_hash_mismatch');
  const snapshot = JSON.parse(rawText);
  if (snapshot?.server_date_time?.date !== row.last_snapshot_date || !Array.isArray(snapshot.ranking)) throw fail('pia_backup_invalid');
  await archiveSnapshot(bucket, {rawText, snapshotHash: row.last_snapshot_hash, snapshotDate: row.last_snapshot_date});
}
