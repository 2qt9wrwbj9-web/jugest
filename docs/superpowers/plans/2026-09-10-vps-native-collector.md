# JUGEST VPS Native Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VPS-native ana-slo collector that durably tracks per-store/per-date acquisition state, fetches only eligible missing dates, archives successful HTML, and writes normalized data into the existing VPS SQLite store/day tables without touching protected judgement logic or production branches.

**Architecture:** Add a collector-only subsystem under `vps/src/collector/` with pure parsing, durable SQLite state, source transport, raw-HTML archiving, and one bounded collection engine. A small CLI and systemd oneshot/timer call the same engine. The existing web service and resource-aware analysis coordinator remain separate and unchanged.

**Tech Stack:** Node.js >=22.13, `node:sqlite`, built-in `fetch`, `node:zlib`, `node:crypto`, `node:fs`, `node:test`, systemd.

**Spec:** `docs/superpowers/specs/2026-09-10-vps-native-collector-design.md`

## Global Constraints

- Work only on `sol/vps-native-collector` during implementation.
- `main` must remain untouched.
- `deploy/vps` must remain untouched until an explicit later production authorization.
- Scope is VPS-side acquisition and durable storage only; no JUGEST UI work in this plan.
- Do not change judgement math, strict Champion, Calibration, store-share constraints, Juggler/HANA probability tables, HANA hard constraints, single-evidence, ranking, or prediction semantics.
- Automatic collection begins at 04:00 JST and never auto-fetches the current JST date.
- Newest eligible `pending` date is selected first across enabled stores.
- Global source concurrency is 1.
- Normal source pacing is a random 10–30 seconds after each attempted request.
- Ordinary failures retry the affected day after exactly 45 minutes while other dates remain eligible.
- HTTP 403/429 blocks all source acquisition for 45 minutes.
- HTTP 404/410 becomes `excluded` only after at least 3 such failures and at least 24 hours since the first 404/410.
- `collected` days are never automatically re-fetched; only `reset-day` may return `collected`/`excluded` to `pending`.
- Successful raw HTML is gzip archived outside the release symlink, default `/var/lib/jugest/collector/raw`.
- Collector systemd units are installed disabled; no continuous live source collection is enabled by implementation/CI.

---

### Task 1: Collector schema and durable state repository

**Files:**
- Modify: `vps/src/schema.mjs:1-110`
- Create: `vps/src/collector/repository.mjs`
- Create: `vps/tests/collector-repository.test.mjs`

**Interfaces:**
- Consumes: existing `openDatabase(path)` and `migrate(db)`.
- Produces: `addCollectorStore(db,input)`, `listCollectorStores(db)`, `setCollectorStoreEnabled(db,{storeId,enabled,nowIso})`, `ensureCollectorTargets(db,{now,historyBackfill})`, `recoverExpiredCollectorRuns(db,{nowIso})`, `peekEligibleCollectorDay(db,{nowIso,todayJst})`, `claimCollectorDay(db,{storeId,businessDate,owner,nowIso,leaseExpiresIso})`, `markCollectorFailure(db,input)`, `markCollectorCollected(db,input)`, `resetCollectorDay(db,{storeId,businessDate,nowIso})`, `getCollectorControl(db)`, `setGlobalBlock(db,{untilIso,nowIso})`.

- [ ] **Step 1: Write failing schema/repository tests**

Add tests that migrate an in-memory DB and assert the three collector tables exist, then exercise store add/list/enable/disable and state transitions. Include an explicit reset preservation assertion:

```js
const before=db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get(storeId,date);
resetCollectorDay(db,{storeId,businessDate:date,nowIso:NOW});
assert.equal(getCollectorDay(db,storeId,date).state,'pending');
assert.deepEqual(db.prepare('SELECT normalized_payload_hash FROM store_days WHERE store_id=? AND business_date=?').get(storeId,date),before);
```

Also test that expired `running` rows return to `pending`, but unexpired rows do not.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
cd vps
node --test tests/collector-repository.test.mjs
```

Expected: FAIL because collector tables/module do not exist.

- [ ] **Step 3: Extend the migration**

Add `collector_stores`, `collector_days`, `collector_control`, and `collector_days_sched_idx` exactly as specified in the design. Initialize control row id=1 with `INSERT OR IGNORE` and a valid timestamp supplied by repository initialization rather than embedding wall-clock SQL semantics.

- [ ] **Step 4: Implement repository primitives**

Use prepared statements and short SQLite transactions. Store dates as `YYYY-MM-DD` and timestamps as ISO 8601. `claimCollectorDay` must update only a currently `pending`, retry-eligible row. `resetCollectorDay` clears retry/run/error scheduling fields but must not delete `store_days`, `machine_day_data`, or archived HTML metadata.

- [ ] **Step 5: Add JST target generation tests**

Use fixed clocks around the 04:00 JST boundary. At `2026-09-10T03:59:59+09:00`, do not create the 9/9 daily target solely due to the daily gate. At `2026-09-10T04:00:00+09:00`, ensure 9/9 exists. For initial backfill, create every date from `history_start` through 9/9 and never 9/10.

- [ ] **Step 6: Add newest-first eligibility tests**

Insert multiple stores/dates with mixed `pending`, `collected`, `excluded`, future `retry_after`, and disabled stores. Assert `peekEligibleCollectorDay` returns the newest eligible date and that a delayed day does not block an older eligible date.

- [ ] **Step 7: Run focused tests GREEN and commit**

```bash
cd vps
node --test tests/collector-repository.test.mjs
git add src/schema.mjs src/collector/repository.mjs tests/collector-repository.test.mjs
git commit -m "feat: add durable native collector state"
```

Expected: focused suite PASS.

---

### Task 2: Pure ana-slo parser extraction with parity fixtures

**Files:**
- Create: `vps/src/collector/ana-parser.mjs`
- Create: `vps/tests/fixtures/ana-juggler.html`
- Create: `vps/tests/fixtures/ana-hanahana.html`
- Create: `vps/tests/collector-parser.test.mjs`
- Read-only reference: `ana-single-day.js`
- Read-only reference: `ana-launcher.js`

**Interfaces:**
- Produces: `PARSER_VERSION`, `parseAnaSloHtml({html,date,sourceUrl,expectedMedian})` returning `{date,sourceUrl,machines,quality}` with the existing machine row shape.

- [ ] **Step 1: Create representative fixture tests before implementation**

Build minimal static HTML fixtures containing the same table/header forms the browser parser accepts. Assert Juggler and HANA rows normalize to expected machine keys, categories, table numbers, games, diff, BB, and RB.

Example assertion shape:

```js
assert.deepEqual(day.machines[0],{
  machine:'my',category:'juggler',sourceMachineName:'マイジャグラーV',
  tableNo:'275',games:8123,diff:1450,bb:31,rb:29
});
```

- [ ] **Step 2: Add duplicate/conflict and malformed-200 tests**

Cover explicit-machine-table preference, same-table duplicate collapse, conflicting machine names on the same physical table number being removed, nullable diff, and a page with no supported target rows returning `machines.length===0` with quality diagnostics.

- [ ] **Step 3: Run parser tests RED**

```bash
cd vps
node --test tests/collector-parser.test.mjs
```

Expected: FAIL because `ana-parser.mjs` does not exist.

- [ ] **Step 4: Extract parser semantics without browser globals**

Move only pure helpers/alias data from the current acquisition parser: HTML entity decoding, tag stripping, machine alias normalization, numeric parsing, table/row scanning, explicit-table preference, duplicate/conflict handling, machine counts, and quality grading. Do not import `document`, `location`, IndexedDB, localStorage, cookies, wake lock, or UI code.

- [ ] **Step 5: Run parser tests GREEN and verify browser source remains unchanged**

```bash
cd vps
node --test tests/collector-parser.test.mjs
git diff --exit-code deploy/vps -- ../ana-single-day.js ../ana-launcher.js
```

Expected: parser tests PASS and the two browser files have no branch diff.

- [ ] **Step 6: Commit**

```bash
git add vps/src/collector/ana-parser.mjs vps/tests/fixtures vps/tests/collector-parser.test.mjs
git commit -m "feat: extract server-safe ana-slo parser"
```

---

### Task 3: Source fetcher and atomic raw HTML archive

**Files:**
- Create: `vps/src/collector/source.mjs`
- Create: `vps/src/collector/archive.mjs`
- Create: `vps/tests/collector-io.test.mjs`

**Interfaces:**
- Produces: `buildAnaSloUrl({date,slug})`, `fetchAnaSloDay({date,slug,transport,timeoutMs})`, `archiveRawHtml({root,storeId,date,html,fsApi})` returning `{path,sha256,bytes}`.

- [ ] **Step 1: Write fetch-contract tests**

Use an injected fake transport and assert the exact URL is `https://ana-slo.com/YYYY-MM-DD-<slug>-data/`, redirects are followed, timeout signal is supplied, and the returned object contains `status`, `finalUrl`, `html`, and elapsed diagnostics without logging response bodies.

- [ ] **Step 2: Write archive tests**

Use a temporary directory. Assert successful archive creates `<root>/<store>/YYYY/MM/YYYY-MM-DD.html.gz`, decompresses byte-for-byte to the original HTML, SHA-256 matches the original HTML bytes, and no temporary file remains after atomic rename.

- [ ] **Step 3: Run IO tests RED**

```bash
cd vps
node --test tests/collector-io.test.mjs
```

- [ ] **Step 4: Implement bounded fetch and archive**

Use `AbortSignal.timeout(timeoutMs)` with built-in `fetch` by default. For archive, `mkdir` the parent, write gzip bytes to a same-directory randomized `.tmp`, chmod mode `0600`, then `rename` atomically. On any write/rename error, clean the temporary file best-effort and rethrow.

- [ ] **Step 5: Run IO tests GREEN and commit**

```bash
cd vps
node --test tests/collector-io.test.mjs
git add src/collector/source.mjs src/collector/archive.mjs tests/collector-io.test.mjs
git commit -m "feat: add collector source and raw archive IO"
```

---

### Task 4: Atomic canonical persistence and collector engine

**Files:**
- Create: `vps/src/collector/persist.mjs`
- Create: `vps/src/collector/engine.mjs`
- Create: `vps/tests/collector-engine.test.mjs`
- Modify only if shared canonical hashing is already exposed safely: `vps/src/queue.mjs`; otherwise keep hashing local to collector to avoid unrelated queue changes.

**Interfaces:**
- Consumes: repository, parser, source, archive.
- Produces: `persistCollectedDay(db,{store,day,rawArtifact,nowIso})`, `runCollectorOnce(options)`.
- `runCollectorOnce` returns a sanitized summary such as `{result,attempted,collected,failed,excluded,blockedUntil,nextEligible}`.

- [ ] **Step 1: Write atomic persistence tests**

Seed an old successful store/day and machine rows. Assert a successful replacement deletes/replaces the complete machine set in one DB transaction. Inject a throw before commit and assert old `store_days`, old machine rows, and collector state survive unchanged.

Use deterministic transport machine keys in array order:

```js
const machineKey=String(index).padStart(6,'0');
```

- [ ] **Step 2: Write ordinary failure and cooldown tests**

With a fixed clock, assert network/5xx/parser/archive/DB failures return the day to `pending` with `retry_after = now + 45 minutes`. Assert another eligible date can then be selected. Assert 403 and 429 additionally set `collector_control.global_block_until = now + 45 minutes`, and a run during that block calls the injected transport zero times.

- [ ] **Step 3: Write 404/410 exclusion tests**

For each status, verify attempts 1 and 2 stay `pending`; attempt 3 before 24 hours still stays `pending`; an attempt after both count>=3 and elapsed>=24h becomes `excluded`. Non-404/410 errors must never increase `not_found_count` toward exclusion.

- [ ] **Step 4: Write successful acquisition transaction tests**

Require this sequence to complete before `collected`: HTTP ok, basic HTML sanity, parser non-empty, acceptable quality, archive success, canonical DB commit. Inject failure after archive preparation and before DB commit and assert state is not `collected`; stale archive may exist but must not be referenced by canonical DB state.

- [ ] **Step 5: Write pacing and global-concurrency tests**

Inject `random()` and `sleep(ms)`. Assert computed waits remain inclusive 10,000–30,000ms and only one transport request is in flight. A single bounded run may process multiple eligible rows sequentially up to `maxRequests`/`maxRunMs`, never in parallel.

- [ ] **Step 6: Run engine tests RED**

```bash
cd vps
node --test tests/collector-engine.test.mjs
```

- [ ] **Step 7: Implement canonical hashing/persistence**

Use deterministic object-key-sorted JSON for the normalized `day` payload and SHA-256. In one SQLite transaction: upsert `stores`, upsert `store_days`, delete/insert full `machine_day_data`, and transition matching `collector_days` row to `collected` with raw path/hash and success metadata. Do not enqueue protected analysis jobs.

- [ ] **Step 8: Implement `runCollectorOnce`**

At run start: recover stale `running`, ensure targets, inspect global cooldown, then repeatedly claim the newest eligible day. Use a unique owner token, a short running lease, injected clock/random/sleep/transport/archive for tests, and stop immediately after activating a 403/429 global block.

- [ ] **Step 9: Run engine tests GREEN and commit**

```bash
cd vps
node --test tests/collector-engine.test.mjs
git add src/collector/persist.mjs src/collector/engine.mjs tests/collector-engine.test.mjs
git commit -m "feat: add VPS native collector engine"
```

---

### Task 5: Administrative CLI and dry-run status

**Files:**
- Create: `vps/scripts/collector.mjs`
- Create: `vps/tests/collector-cli.test.mjs`
- Modify: `vps/package.json:8-16`

**Interfaces:**
- CLI commands: `add`, `list`, `enable`, `disable`, `status`, `collect-now`, `reset-day`.
- Environment: `JUGEST_DB_PATH`, optional `JUGEST_COLLECTOR_RAW_ROOT`, optional bounded-run knobs used only for operations/tests.

- [ ] **Step 1: Write CLI validation tests**

Assert malformed dates/slugs fail before DB/source access. Assert `add` defaults disabled, `enable`/`disable` change only collector registration, `reset-day` preserves canonical data, and `status` prints the next eligible target without making any source request.

- [ ] **Step 2: Run CLI tests RED**

```bash
cd vps
node --test tests/collector-cli.test.mjs
```

- [ ] **Step 3: Implement CLI**

Use a small argument parser with explicit command branches. `collect-now` calls `runCollectorOnce`; it must honor global cooldown, retry_after, 10–30 second pacing, and collected/excluded protection exactly like timer execution. `status` remains read-only except safe stale-run recovery only if explicitly invoked via a separate maintenance path; default status should not mutate source state.

- [ ] **Step 4: Add package scripts**

Add:

```json
"collector": "node scripts/collector.mjs",
"collector:status": "node scripts/collector.mjs status"
```

Do not modify existing scripts.

- [ ] **Step 5: Run CLI tests GREEN and commit**

```bash
cd vps
node --test tests/collector-cli.test.mjs
git add scripts/collector.mjs tests/collector-cli.test.mjs package.json
git commit -m "feat: add native collector admin CLI"
```

---

### Task 6: Disabled-by-default systemd integration

**Files:**
- Create: `vps/systemd/jugest-collector.service`
- Create: `vps/systemd/jugest-collector.timer`
- Create: `vps/scripts/install-collector.sh`
- Create: `vps/tests/collector-install.test.mjs`

**Interfaces:**
- Service runs `/usr/bin/node /opt/jugest/current/vps/scripts/collector.mjs collect-now` as user/group `jugest`.
- Timer runs approximately once per minute but is not enabled by installer.

- [ ] **Step 1: Write installer/unit tests**

Read the unit/install files as text and assert: service is `Type=oneshot`, `User=jugest`, uses `/opt/jugest/current`, has network ordering, has write access only to configured collector/database paths needed by the service, timer cadence is approximately one minute, and installer never runs `systemctl enable` or `systemctl start` for the collector.

- [ ] **Step 2: Run install tests RED**

```bash
cd vps
node --test tests/collector-install.test.mjs
```

- [ ] **Step 3: Implement hardened unit files and installer**

The installer creates `/var/lib/jugest/collector/raw` with owner `jugest:jugest` and mode `0700`, installs units to `/etc/systemd/system`, runs `systemctl daemon-reload`, and explicitly prints that the timer remains disabled pending canary approval. It must not overwrite `/etc/jugest/jugest.env`.

- [ ] **Step 4: Run install tests GREEN and commit**

```bash
cd vps
node --test tests/collector-install.test.mjs
git add systemd/jugest-collector.service systemd/jugest-collector.timer scripts/install-collector.sh tests/collector-install.test.mjs
git commit -m "feat: add disabled native collector systemd units"
```

---

### Task 7: Full regression, semantic guard, and canary handoff documentation

**Files:**
- Create: `docs/vps/VPS-NATIVE-COLLECTOR-VERIFICATION.md`
- Modify tests only if a newly discovered collector bug requires a test-first fix; do not weaken existing assertions.

**Interfaces:**
- Produces exact non-production installation, status, one-store registration, manual one-shot, inspection, disable, and rollback commands for the later canary gate.

- [ ] **Step 1: Run all VPS tests**

```bash
cd vps
npm test
```

Expected: all existing and new VPS tests PASS.

- [ ] **Step 2: Run root regression suite**

From repository root:

```bash
npm test
```

Expected: PASS with no protected semantic regression.

- [ ] **Step 3: Verify protected/browser surfaces were not changed**

Run branch comparisons against the implementation base and confirm no unintended changes in judgement/UI/acquisition browser files:

```bash
git diff --name-only deploy/vps...HEAD
git diff --exit-code deploy/vps -- hanahana-judge.js ana-single-day.js ana-launcher.js app-v510.js app-v510.css core-v510.js
```

Expected: only collector/VPS schema/package/docs/test files differ; protected/browser files exit clean.

- [ ] **Step 4: Verify production refs did not move as part of implementation**

Record the pre-canary remote SHAs for `main` and `deploy/vps` and compare them to the known implementation-base refs. Do not update either ref.

- [ ] **Step 5: Write canary verification document**

Document these exact phases without executing production collection:

```bash
cd /opt/jugest/current/vps
sudo ./scripts/install-collector.sh
node scripts/collector.mjs status
```

Then document the later explicit-approval-only sequence for one canary store: migrate, add disabled store, inspect generated pending dates, enable that store, run exactly one bounded manual request, inspect `collector_days`, `store_days`, `machine_day_data`, gzip archive, and journald, then disable if anything is unexpected. Include:

```bash
sudo systemctl disable --now jugest-collector.timer
sudo systemctl stop jugest-collector.service
```

as immediate stop commands.

- [ ] **Step 6: Commit verification docs**

```bash
git add docs/vps/VPS-NATIVE-COLLECTOR-VERIFICATION.md
git commit -m "docs: add native collector canary verification"
```

- [ ] **Step 7: Final branch verification**

Run:

```bash
git status --short
git log --oneline --decorate -n 10
git diff --stat deploy/vps...HEAD
```

Expected: clean worktree; feature branch only; no production ref updates.

At completion, report the feature-branch head, exact test counts/results, changed files, and the proposed canary commands/store/date. Do **not** enable the collector timer or advance `deploy/vps` until the user explicitly approves the live canary.
