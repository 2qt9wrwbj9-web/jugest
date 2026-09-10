# JUGEST VPS Native Collector Verification

This document is the non-production handoff for the VPS-native ana-slo collector. The collector feature branch is safe to install for inspection, but **the timer must remain disabled until an explicit live-canary approval**.

## Safety boundary

- Do not move `main` as part of collector verification.
- Do not move `deploy/vps` until the release is explicitly approved.
- Do not enable `jugest-collector.timer` during installation-only verification.
- First live acquisition is one store and exactly one source request.
- Global source concurrency remains 1.
- `403`/`429` blocks all collection for 45 minutes.
- Ordinary failures delay only the affected store/date for 45 minutes.
- `404`/`410` becomes `excluded` only after at least 3 misses and 24 hours from the first miss.

## 1. Installation-only verification

Run after the feature has been released to `/opt/jugest/current` but before any collector timer is enabled:

```bash
cd /opt/jugest/current/vps
sudo bash scripts/install-collector.sh
node scripts/migrate.mjs
node scripts/collector.mjs status
systemctl is-enabled jugest-collector.timer || true
systemctl is-active jugest-collector.timer || true
```

Expected:

- installer completes without changing `/etc/jugest/jugest.env`;
- `/var/lib/jugest/collector/raw` exists and is owned by `jugest`;
- `jugest-collector.timer` is still disabled/inactive;
- no ana-slo request is made by installation or `status`.

Useful inspection:

```bash
systemctl cat jugest-collector.service
systemctl cat jugest-collector.timer
sudo ls -ld /var/lib/jugest /var/lib/jugest/collector /var/lib/jugest/collector/raw
```

## 2. Register one canary store, disabled first

Replace the placeholders with the approved first store. `history-start` is the oldest date to seed as pending; the normal initial target is roughly the agreed 13-month history through yesterday.

```bash
cd /opt/jugest/current/vps
node scripts/collector.mjs add \
  --store-id '<STORE_ID>' \
  --slug '<ANA_SLO_SLUG>' \
  --name '<STORE_NAME>' \
  --history-start '<YYYY-MM-DD>'
node scripts/collector.mjs list
node scripts/collector.mjs status
```

The newly added store must show `enabled: false`. Adding it must not access ana-slo.

## 3. Enable the one canary store and inspect targets

```bash
node scripts/collector.mjs enable --store-id '<STORE_ID>'
node scripts/collector.mjs status
```

Expected: pending targets are generated only through yesterday, never the current JST business date. The newest eligible missing date should be selected first.

To inspect raw collector state without requiring a separate sqlite3 package:

```bash
node --input-type=module - <<'NODE'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.env.JUGEST_DB_PATH||'/var/lib/jugest/jugest.sqlite');
for(const row of db.prepare(`
  SELECT store_id,business_date,state,retry_after,attempt_count,not_found_count,last_http_status,last_error_class
  FROM collector_days
  ORDER BY business_date DESC,store_id
  LIMIT 20
`).all()) console.log(row);
db.close();
NODE
```

## 4. Live canary: exactly one source request

**Run only after explicit approval for the live canary.** The timer stays disabled. The environment override bounds this invocation to exactly one source request.

```bash
cd /opt/jugest/current/vps
JUGEST_COLLECTOR_MAX_REQUESTS=1 \
JUGEST_COLLECTOR_MAX_RUN_MS=60000 \
node scripts/collector.mjs collect-now
```

Then immediately inspect:

```bash
node scripts/collector.mjs status
sudo journalctl -u jugest-collector.service -n 100 --no-pager
sudo find /var/lib/jugest/collector/raw -type f -name '*.html.gz' -printf '%p %s bytes\n' | tail -20
node --input-type=module - <<'NODE'
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(process.env.JUGEST_DB_PATH||'/var/lib/jugest/jugest.sqlite');
console.log('collector_days');
for(const row of db.prepare(`SELECT * FROM collector_days ORDER BY business_date DESC,store_id LIMIT 5`).all()) console.log(row);
console.log('store_days');
for(const row of db.prepare(`SELECT store_id,business_date,parser_version,quality_status,raw_artifact_path,normalized_payload_hash FROM store_days ORDER BY business_date DESC LIMIT 5`).all()) console.log(row);
console.log('machine counts');
for(const row of db.prepare(`SELECT store_id,business_date,COUNT(*) AS machines FROM machine_day_data GROUP BY store_id,business_date ORDER BY business_date DESC LIMIT 5`).all()) console.log(row);
db.close();
NODE
```

A successful canary requires all of the following before the day is considered collected:

1. HTTP success;
2. parser success with supported Juggler/HANA rows;
3. quality acceptance;
4. gzip raw HTML archive success;
5. SQLite canonical save success.

If any required stage fails, the collector day must remain retryable rather than being falsely marked collected.

## 5. Stop/disable commands

These are the immediate stop commands and are safe to run whenever behavior is unexpected:

```bash
sudo systemctl disable --now jugest-collector.timer
sudo systemctl stop jugest-collector.service
node /opt/jugest/current/vps/scripts/collector.mjs disable --store-id '<STORE_ID>'
```

Disabling a store stops future automatic collection but does not erase already collected canonical data or archived HTML.

## 6. Manual reacquisition of one date

A collected or excluded date is not automatically fetched again. Explicit reset is required:

```bash
node scripts/collector.mjs reset-day --store-id '<STORE_ID>' --date '<YYYY-MM-DD>'
node scripts/collector.mjs status
```

Reset changes the acquisition state back to pending while preserving the previous successful canonical payload until a new successful replacement is committed.

## 7. Timer activation after canary acceptance

Do not run this during the first canary. Only after the one-request canary and logs/data are approved:

```bash
sudo systemctl enable --now jugest-collector.timer
systemctl is-enabled jugest-collector.timer
systemctl is-active jugest-collector.timer
systemctl list-timers jugest-collector.timer --all
```

The timer polls approximately once per minute. The collector itself enforces the 04:00 JST daily target gate, newest-missing-first selection, retry cooldowns, global 403/429 block, 10–30 second pacing, and the single global acquisition lock.

## 8. Rollback behavior

The web release can be rolled back independently using the existing VPS release mechanism. Collector data lives outside release directories under `/var/lib/jugest`, so a release symlink switch does not delete the SQLite database or raw HTML archive.

Before a rollback, stop the collector timer/service with the commands in section 5. Do not delete `/var/lib/jugest/jugest.sqlite` or `/var/lib/jugest/collector/raw` as part of a code rollback.
