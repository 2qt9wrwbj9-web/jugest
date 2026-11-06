// Emit SQL exclusively for the independent preview, using the source repo's
// checked-in September 21 public observations. There is no database/network IO.
import {readFileSync} from 'node:fs';
import {canonicalJson, hashCanonical} from '../../../upstream/vps/src/canonical-json.mjs';

const source = JSON.parse(readFileSync(new URL('../../../upstream/tests/fixtures/group-pia-observed-20260921.json', import.meta.url), 'utf8'));
if (source.date !== '2026-09-21' || source.storeName !== 'PIA大船1' || source.rows.length !== 106) {
  throw Error('Unexpected public observation fixture');
}
const id = 'dev-pia-observed', name = source.storeName + '（9月21日公開観測・検証用）';
const version = 'archived-public-observation-v1';
const at = source.date + 'T00:00:00.000Z';
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const list = values => values.map(quote).join(',');
const rows = source.rows.map(row => ({...row, category: 'juggler', gamesSource: 'observed', diffSource: 'observed'}));
const hash = hashCanonical(rows);
const metadata = canonicalJson({source: 'pia-public-ranking-top', visibility: 'public', provenance: source.source, previewOnly: true});
console.log('INSERT OR IGNORE INTO stores(id,name,source_metadata_json,created_at,updated_at) VALUES(' + list([id, name, metadata, at, at]) + ');');
console.log('INSERT OR IGNORE INTO store_days(store_id,business_date,parser_version,normalized_payload_hash,quality_status,created_at,updated_at) VALUES(' + list([id, source.date, version, hash, 'valid', at, at]) + ');');
for (const [index, row] of rows.entries()) {
  console.log('INSERT OR IGNORE INTO machine_day_data(store_id,business_date,machine_key,payload_json) VALUES(' +
    list([id, source.date, String(index).padStart(6, '0'), canonicalJson(row)]) + ');');
}
