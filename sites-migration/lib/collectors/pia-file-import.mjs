import {canonicalJson, hashCanonical} from '../../upstream/vps/src/canonical-json.mjs';
import {JUGGLER_MACHINE_KEYS, jugglerMachineName} from '../generated-judge.mjs';

export const MAX_PIA_FILE_BYTES = 128 * 1024;
const FORMAT = 'jugest-pia-day-v1';
const statement = (db, sql, ...values) => db.prepare(sql).bind(...values);
const fail = (code, status = 400) => Object.assign(new Error(code), {code, status});
const fields = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
const label = value => typeof value === 'string' && value === value.trim() && value.length > 0 &&
  value.length <= 120 && !/[\x00-\x1f\x7f]/.test(value);
const unsigned = value => Number.isSafeInteger(value) && value >= 0;
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

async function parseFile(bytes, sources, now) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw fail('empty_file');
  if (bytes.length > MAX_PIA_FILE_BYTES) throw fail('file_too_large', 413);
  let input;
  try { input = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw fail('invalid_json'); }
  if (!fields(input, ['format', 'storeId', 'sourceKey', 'permissionRef', 'date', 'machines']) ||
      input.format !== FORMAT || input.storeId !== 35 ||
      typeof input.sourceKey !== 'string' || !/^[a-z0-9-]{1,32}$/.test(input.sourceKey)) throw fail('invalid_file_metadata');
  const source = Object.hasOwn(sources, input.sourceKey) && sources[input.sourceKey];
  if (!source || !['authorized', 'synthetic'].includes(source.kind) || !label(source.label) ||
      !label(source.permissionRef) || source.permissionRef !== input.permissionRef) throw fail('source_not_approved', 403);
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(now));
  if (typeof input.date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(input.date) ||
      input.date > today || !Number.isFinite(Date.parse(input.date)) ||
      new Date(input.date).toISOString().slice(0, 10) !== input.date) throw fail('invalid_business_date');
  if (!Array.isArray(input.machines) || !input.machines.length || input.machines.length > 200) throw fail('invalid_machine_count');
  const seen = new Set();
  const machines = input.machines.map(row => {
    if (!fields(row, ['tableNo', 'machine', 'machineName', 'games', 'bb', 'rb', 'diff']) ||
        typeof row.tableNo !== 'string' || !/^[1-9]\d{0,7}$/.test(row.tableNo) ||
        typeof row.machine !== 'string' || !Object.hasOwn(machineNames, row.machine) ||
        row.machineName !== machineNames[row.machine] ||
        !unsigned(row.games) || !unsigned(row.bb) || !unsigned(row.rb) ||
        row.bb + row.rb > row.games || !Number.isSafeInteger(row.diff)) throw fail('invalid_machine_row');
    if (seen.has(row.tableNo)) throw fail('duplicate_table_number');
    seen.add(row.tableNo);
    return {
      tableNo: row.tableNo, machine: row.machine, category: 'juggler', sourceMachineName: row.machineName,
      games: row.games, bb: row.bb, rb: row.rb, diff: row.diff, gamesSource: 'observed', diffSource: 'observed',
    };
  }).sort((a, b) => Number(a.tableNo) - Number(b.tableNo));
  return {
    source, sourceKey: input.sourceKey, businessDate: input.date, machines,
    rawHash: await digest(bytes), normalizedHash: hashCanonical({date: input.date, machines}),
  };
}

const machineNames = Object.fromEntries(JUGGLER_MACHINE_KEYS
  .map(key => [key, jugglerMachineName(key)]));

function storedDay(db, storeId, businessDate) {
  return statement(db, 'SELECT source_hash,normalized_payload_hash,raw_artifact_path FROM store_days WHERE store_id=? AND business_date=?', storeId, businessDate).first();
}

function outcome(prior, {rawHash, normalizedHash}) {
  if (!prior) return 'new';
  if (prior.normalized_payload_hash !== normalizedHash) return 'revision_conflict';
  return prior.source_hash === rawHash ? 'duplicate' : 'same_data_different_file';
}

async function verifyOriginal(bucket, key, hash) {
  const object = key && await bucket.get(key);
  if (!object || object.size > MAX_PIA_FILE_BYTES ||
      await digest(await object.arrayBuffer()) !== hash) throw fail('original_verification_failed', 503);
}

export async function importPiaDay(bytes, {db, bucket, sources = {}, reviewKey, reviewedHash, now = Date.now()} = {}) {
  if (!db || !bucket) throw fail('sites_storage_unavailable', 503);
  if (!reviewKey) throw fail('review_key_unavailable', 503);
  const parsed = await parseFile(bytes, sources, now);
  const {source, sourceKey, businessDate, machines, rawHash, normalizedHash} = parsed;
  // Development data can never enter the production collector or owner store.
  const storeId = 'dev-pia-import-' + sourceKey;
  const sourceType = source.kind === 'synthetic' ? 'synthetic-pia-import' : 'authorized-pia-import';
  const name = 'PIA大船1（' + (source.kind === 'synthetic' ? '合成検証・' : '許可済み原本・') + source.label + ' [' + sourceKey + ']）';
  const summary = {storeId, name, businessDate, source: sourceType, machineCount: machines.length, rawHash, normalizedHash};
  const metadata = canonicalJson({
    source: sourceType, visibility: 'private', publicStoreId: 35,
    sourceKey, sourceLabel: source.label, permissionRef: source.permissionRef,
  });
  const store = await statement(db, 'SELECT source_metadata_json FROM stores WHERE id=?', storeId).first();
  if (store && store.source_metadata_json !== metadata) throw fail('source_registration_changed', 409);
  const prior = await storedDay(db, storeId, businessDate);
  const status = outcome(prior, parsed);
  // Bind approval to the exact bytes and the current permission registration.
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(reviewKey), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
  const reviewMessage = encoder.encode(canonicalJson({rawHash, metadata}));
  if (reviewedHash === undefined) {
    const signed = new Uint8Array(await crypto.subtle.sign('HMAC', keyMaterial, reviewMessage));
    const reviewToken = [...signed].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return {...summary, status, reviewToken, machines};
  }
  const signature = /^[a-f0-9]{64}$/.test(reviewedHash) && Uint8Array.from(reviewedHash.match(/../g), pair => Number.parseInt(pair, 16));
  if (!signature || !await crypto.subtle.verify('HMAC', keyMaterial, signature, reviewMessage)) throw fail('review_mismatch', 409);
  if (status === 'revision_conflict') throw fail('revision_conflict', 409);
  if (prior) {
    await verifyOriginal(bucket, prior.raw_artifact_path, prior.source_hash);
    return {...summary, status};
  }

  const key = 'pia-authorized-dev/' + sourceKey + '/' + businessDate + '/' + rawHash + '.json';
  await bucket.put(key, bytes, {onlyIf: {etagDoesNotMatch: '*'}, httpMetadata: {contentType: 'application/json'}});
  await verifyOriginal(bucket, key, rawHash);
  const at = new Date(now).toISOString();
  const writes = [
    statement(db, 'INSERT OR IGNORE INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(?,?,?,?,?)', storeId, name, metadata, at, at),
    statement(db, "SELECT json(CASE WHEN EXISTS(SELECT 1 FROM stores WHERE id=? AND source_metadata_json=?) THEN 'null' ELSE '!' END)", storeId, metadata),
    statement(db, 'UPDATE stores SET updated_at=? WHERE id=?', at, storeId),
    statement(db, `INSERT INTO store_days(store_id,business_date,parser_version,source_hash,normalized_payload_hash,quality_status,raw_artifact_path,created_at,updated_at)
      VALUES(?,?,?,?,?,'valid',?,?,?)`, storeId, businessDate, FORMAT, rawHash, normalizedHash, key, at, at),
  ];
  for (let i = 0; i < machines.length; i += 50) {
    const rows = machines.slice(i, i + 50).map((row, index) => [String(i + index).padStart(6, '0'), canonicalJson(row)]);
    writes.push(statement(db, `INSERT INTO machine_day_data(store_id,business_date,machine_key,payload_json)
      SELECT ?,?,json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)`, storeId, businessDate, JSON.stringify(rows)));
  }
  writes.push(statement(db, `INSERT INTO analysis_refresh_state(store_id,analysis_version,generation,updated_at)
    VALUES(?,'vps-runtime-v1',1,?) ON CONFLICT(store_id,analysis_version)
    DO UPDATE SET generation=generation+1,updated_at=excluded.updated_at`, storeId, at));
  try {
    await db.batch(writes);
  } catch (error) {
    // An acknowledgement may be lost after commit, or another review may
    // commit the same date first. The canonical day and originals stay intact.
    const current = await storedDay(db, storeId, businessDate);
    if (!current) throw error;
    const concurrent = outcome(current, parsed);
    if (concurrent === 'revision_conflict') throw fail(concurrent, 409);
    await verifyOriginal(bucket, current.raw_artifact_path, current.source_hash);
    return {...summary, status: concurrent};
  }
  return {...summary, status: 'imported'};
}
