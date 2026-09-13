# PRE Shadow Accuracy Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the new research store-read as PRE primary output, keep the current JUGEST store-reading path as a shadow baseline, score both on identical future data, and expose the live comparison under the existing top-left settings entry.

**Architecture:** Persist immutable per-engine prediction snapshots before the target day, score them later against the same canonical target-day `diff` outcome proxy, and expose deterministic aggregates through the authenticated VPS analytics API. The browser consumes `store-read-v1` first for Today Plan, falls back to the current path when unavailable, and adds `設定 > PRE版 精度比較` without changing protected setting-judgment math.

**Tech Stack:** Node.js ESM, built-in `node:test`, SQLite, existing JUGEST headless runtime adapter, existing VPS coordinator/job queue, Shadow DOM browser UI.

**Spec:** `docs/superpowers/specs/2026-09-13-pre-shadow-accuracy-comparison-design.md`

## Global Constraints

- Do not change Juggler or HANA probability tables.
- Do not change `externalJudge`, reverse judgment, posterior setting math, HANA hard constraints, strict Champion, Calibration, or store-share constraint.
- Do not change canonical raw-data retention, Collector contracts, or existing `DAILY_ANALYSIS` result semantics.
- The current JUGEST store-reading engine is the shadow source of truth; do not rewrite a simplified proxy for it.
- Backfilled walk-forward metrics and live PRE shadow metrics must remain separate.
- A prediction used for live evaluation must be immutable once target-day data can exist.
- PRE primary output may fall back to the current engine, but fallback days are excluded from new-vs-current wins/losses.
- Production deployment remains out of scope until Hiro gives separate explicit approval.

---

### Task 1: Immutable live prediction persistence and deterministic scorer

**Files:**
- Modify: `vps/src/schema.mjs`
- Create: `vps/src/research/live-comparison.mjs`
- Create: `vps/tests/live-comparison.test.mjs`

**Interfaces:**
- Produces: `persistLivePrediction(db, prediction) -> {inserted:boolean,row:object}`
- Produces: `listLivePredictions(db,{storeId,targetDate?,engine?}) -> object[]`
- Produces: `scorePredictionRows({predictionRows,outcomeRows}) -> metrics`
- Produces: `scoreLiveComparisonDay(db,{storeId,targetDate,outcomeRows,outcomeInputHash,nowIso}) -> comparison|null`
- Produces: `buildComparisonSummary(db,{storeId,limit=90}) -> payload`

- [ ] **Step 1: Write failing schema/persistence tests**

Add tests that migrate an in-memory DB, insert the same `pre_research` live prediction twice, then attempt to insert a different payload for the same `(store, targetDate, engine, engineVersion, modelFingerprint)` identity. Assert the identical insert is idempotent and the conflicting insert preserves the first payload rather than overwriting it.

```js
const first=persistLivePrediction(db,{storeId:'s1',targetDate:'2026-09-14',engine:'pre_research',engineVersion:'store-read-v1',modelFingerprint:'fp-a',featureVersion:'store-features-v1',sourceFrontierDate:'2026-09-13',inputHash:'in-a',rankings:[{machineKey:'107',tableNo:'107',machineName:'マイジャグラーV',score:1,rank:1}],createdAt:'2026-09-13T12:00:00.000Z'});
const second=persistLivePrediction(db,{...same});
assert.equal(first.inserted,true);
assert.equal(second.inserted,false);
assert.equal(listLivePredictions(db,{storeId:'s1',targetDate:'2026-09-14'}).length,1);
```

Run: `cd vps && node --test tests/live-comparison.test.mjs`
Expected: FAIL because the tables/module do not exist.

- [ ] **Step 2: Add durable tables**

Extend `migrate()` with:

```sql
CREATE TABLE IF NOT EXISTS store_prediction_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  target_date TEXT NOT NULL,
  engine TEXT NOT NULL CHECK(engine IN ('pre_research','current_shadow')),
  engine_version TEXT NOT NULL,
  model_fingerprint TEXT NOT NULL DEFAULT '',
  feature_version TEXT,
  source_frontier_date TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(store_id,target_date,engine,engine_version,model_fingerprint),
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS store_prediction_snapshots_store_target_idx ON store_prediction_snapshots(store_id,target_date,engine);

CREATE TABLE IF NOT EXISTS store_prediction_scores (
  prediction_id INTEGER PRIMARY KEY,
  store_id TEXT NOT NULL,
  target_date TEXT NOT NULL,
  engine TEXT NOT NULL,
  scorer_version TEXT NOT NULL,
  outcome_proxy_version TEXT NOT NULL,
  outcome_input_hash TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  score_hash TEXT NOT NULL,
  scored_at TEXT NOT NULL,
  FOREIGN KEY(prediction_id) REFERENCES store_prediction_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS store_prediction_scores_store_target_idx ON store_prediction_scores(store_id,target_date,engine);
```

- [ ] **Step 3: Implement minimal persistence helpers**

In `live-comparison.mjs`, use `canonicalJson/hashCanonical`, validate `YYYY-MM-DD`, and use `INSERT ... ON CONFLICT DO NOTHING`. On conflict, read and return the original row. Never update `payload_json`, `payload_hash`, `source_frontier_date`, or `created_at`.

Normalize ranking rows to:

```js
{machineKey:String,tableNo:String,machineName:String,rank:Number,score:Number}
```

- [ ] **Step 4: Write failing metric tests**

Use three deterministic machine lists to assert exact Top1/3/5 overlap, lift, Spearman, and coverage. Add a future-leak guard by changing days after the target date and asserting the score for the earlier target is unchanged.

- [ ] **Step 5: Implement scoring**

Reuse the same ranking definitions as `vps/src/research/model-search.mjs` but keep comparison-specific public helpers in `live-comparison.mjs`. Required metric shape:

```js
{
  machineCount,
  coverage,
  top1:{overlap,rate,lift},
  top3:{overlap,rate,lift},
  top5:{overlap,rate,lift},
  rankCorrelation,
  quality
}
```

with:

```js
quality = top3.lift*100 + top5.lift*10 + rankCorrelation;
```

Use `WIN_EPSILON=1e-6`. Store score rows idempotently by `prediction_id`; if `outcome_input_hash` changes, keep the original scored row and surface the mismatch as an exclusion reason rather than silently rescoring live history.

- [ ] **Step 6: Implement aggregate summary**

`buildComparisonSummary()` returns:

```js
{
  live:{days,newWins,currentWins,ties,excluded,newEngine,currentEngine,recent30,rows},
  historical:null
}
```

Only count a win/tie when both engines have valid scored rows for the same target date. `rows` include reason codes for missing/fallback/hash-conflict days.

- [ ] **Step 7: Run tests and commit**

Run: `cd vps && node --test tests/live-comparison.test.mjs`
Expected: PASS.

Commit: `feat: persist and score PRE shadow predictions`

---

### Task 2: Capture immutable PRE research predictions

**Files:**
- Modify: `vps/src/research/store-read-output.mjs`
- Modify: `vps/src/jobs/feature-build.mjs`
- Modify: `vps/tests/store-read-output.test.mjs` if present; otherwise create `vps/tests/store-read-live.test.mjs`

**Interfaces:**
- Consumes: `persistLivePrediction()` from Task 1.
- Produces: every valid `store-read-v1` refresh also records the first immutable `pre_research` prediction for that target date.

- [ ] **Step 1: Write failing test**

Activate/refresh an active research model for frontier `2026-09-13`; assert the mutable client snapshot still targets `2026-09-14` and `store_prediction_snapshots` contains exactly one `pre_research` prediction with the same ranking hash.

Then refresh the same target using a different in-memory model score and assert the client snapshot may refresh but the live evaluation row remains the original first prediction.

- [ ] **Step 2: Implement prediction capture**

In `persistStoreReadSnapshot()`, after the normal `client_snapshots` upsert, call:

```js
persistLivePrediction(db,{
  storeId:id,
  targetDate,
  engine:'pre_research',
  engineVersion:STORE_READ_VERSION,
  modelFingerprint:fingerprint,
  featureVersion:version,
  sourceFrontierDate:frontier,
  inputHash:hashCanonical({storeId:id,frontier,featureVersion:version,days}),
  rankings,
  createdAt:at
});
```

Do not alter the public `store-read-v1` payload shape except for metadata already present.

- [ ] **Step 3: Verify feature-build semantics stay unchanged**

Run focused store-read/feature-build tests plus:

`cd vps && node --test tests/feature-build*.test.mjs tests/research-loop.test.mjs`

Expected: PASS with existing research scheduling unchanged.

- [ ] **Step 4: Commit**

Commit: `feat: capture live PRE research predictions`

---

### Task 3: Run the current JUGEST store-reading path as a low-priority shadow job

**Files:**
- Modify: `vps/src/analysis/runtime-adapter.mjs`
- Create: `vps/src/analysis/shadow-refresh-state.mjs`
- Create: `vps/src/jobs/shadow-predict.mjs`
- Modify: `vps/src/analysis/daily-analysis.mjs`
- Modify: `vps/src/coordinator.mjs`
- Modify: `vps/src/schema.mjs`
- Create: `vps/tests/shadow-predict.test.mjs`
- Modify: `vps/tests/coordinator.test.mjs`

**Interfaces:**
- Produces: `runExistingStorePlan({rootDir,shop,sourceStoreId,days,targetDate}) -> normalized current ranking`
- Produces: `requestShadowPrediction(db,{storeId,frontierDate,nowIso}) -> {state,job}`
- New job type: `SHADOW_PREDICT`, priority `70`, size class `medium`, estimated lease `512 MiB`, max attempts `3`.

- [ ] **Step 1: Write failing runtime-adapter test**

Boot the real current runtime with canonical days ending `2026-09-13`, call `runExistingStorePlan(... targetDate:'2026-09-14')`, and assert every imported day is `< targetDate` and the returned payload contains ordered `{machineKey,tableNo,machineName,rank,score}` rows.

The adapter must call the current bridge path that feeds Today Plan (`getTodayPlan` / existing current plan logic) rather than a new approximation.

- [ ] **Step 2: Extend the runtime adapter**

Refactor the shared boot/import portion into an internal helper while preserving `runExistingStoreAnalysis()` behavior byte-for-byte at its public boundary. `runExistingStorePlan()` must import only `days.filter(day=>day.date<targetDate)`.

Normalize current ranking score using its own existing ordered output. If the current engine exposes `aimScore`, use it as `score`; otherwise preserve rank and use `score = -rank` only as a stable ordering value. Do not invent PRE probability values.

- [ ] **Step 3: Write failing shadow scheduling tests**

Add `shadow_refresh_state`:

```sql
CREATE TABLE IF NOT EXISTS shadow_refresh_state (
  store_id TEXT PRIMARY KEY,
  requested_frontier_date TEXT,
  completed_frontier_date TEXT,
  active_job_id INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY(active_job_id) REFERENCES jobs(id) ON DELETE SET NULL
);
```

Test coalescing so one active `SHADOW_PREDICT` exists per store and the newest requested frontier wins.

- [ ] **Step 4: Implement `shadow-refresh-state.mjs`**

Follow `feature-refresh-state.mjs` patterns. Use idempotency key:

```js
`shadow:${storeId}:current-v5:${frontierDate}`
```

and payload `{storeId,targetFrontierDate,engineVersion:'current-v5'}`.

- [ ] **Step 5: Write failing worker test**

Seed canonical data through frontier `2026-09-13`, execute a `SHADOW_PREDICT` descriptor, and assert it persists a `current_shadow` prediction targeting `2026-09-14` using `sourceFrontierDate='2026-09-13'`.

- [ ] **Step 6: Implement `shadow-predict.mjs`**

Copy the child-process telemetry/heartbeat pattern from `feature-build.mjs`. Load at most 180 valid canonical days, trim to requested frontier, run `runExistingStorePlan()`, call `persistLivePrediction()`, complete shadow refresh state, and emit `task_start` / `complete` messages.

- [ ] **Step 7: Schedule shadow work after operational analysis**

At the end of successful `executeDailyAnalysis()`, request shadow prediction for the latest canonical frontier after the existing feature refresh request. Return `shadowJobId` as additive metadata only; do not change the analysis result snapshot.

- [ ] **Step 8: Wire coordinator resource controls**

Add `SHADOW_PREDICT_WORKER` and include `SHADOW_PREDICT` in the bounded low-priority research/auxiliary concurrency set. Preserve `DAILY_ANALYSIS` precedence. A queued/running daily-analysis job must prevent shadow work from taking the only research slot.

- [ ] **Step 9: Run focused tests and commit**

Run:

`cd vps && node --test tests/shadow-predict.test.mjs tests/coordinator.test.mjs tests/daily-analysis-worker.test.mjs`

Expected: PASS.

Commit: `feat: run current store reading as PRE shadow`

---

### Task 4: Score completed target days and expose authenticated comparison API

**Files:**
- Create: `vps/src/analysis/comparison-refresh.mjs`
- Modify: `vps/src/analysis/daily-analysis.mjs`
- Modify: `vps/src/analytics-handler.mjs`
- Modify: `vps/tests/analytics-api.test.mjs`
- Create: `vps/tests/comparison-refresh.test.mjs`

**Interfaces:**
- Consumes: Task 1 scorer and summary builder.
- Produces: `scoreAvailableComparisonDays(db,{storeId,throughDate,nowIso}) -> {scored,excluded}`
- API: `GET /api/vps/stores/:storeId/research/comparison?limit=90`

- [ ] **Step 1: Write failing comparison-refresh test**

Persist PRE/current predictions for `2026-09-14`, then seed canonical target-day rows. Assert `scoreAvailableComparisonDays()` gives both engines the exact same `outcomeInputHash`, does nothing for a future target without canonical data, and remains idempotent on rerun.

- [ ] **Step 2: Implement scoring refresh**

For each unscored prediction with `target_date <= throughDate`, load exactly that target day from canonical storage. Convert machines to `{machineKey,tableNo,machineName,outcomeScore:diff}` and hash the canonical scoring input. Score both engines independently against that exact input object.

Call the scorer after canonical data/DAILY_ANALYSIS completion; it is lightweight DB/CPU work and must not alter analysis output semantics.

- [ ] **Step 3: Write failing API tests**

In `analytics-api.test.mjs`, verify:

- unauthorized request => `401`,
- another Collector channel's store => `403`,
- valid owner => `200`,
- `limit` is bounded `1..366`,
- response separates `live` from `historical`,
- model fingerprint/current version and per-day reason codes are returned.

- [ ] **Step 4: Implement route**

In `analytics-handler.mjs` add:

```js
if(parts.length===6&&parts[4]==='research'&&parts[5]==='comparison'){
  const limit=Math.min(366,Math.max(1,Math.trunc(Number(url.searchParams.get('limit'))||90)));
  const comparison=buildComparisonSummary(db,{storeId,limit});
  sendJson(req,res,200,{ok:true,store:access.store,comparison});
  return;
}
```

- [ ] **Step 5: Run tests and commit**

Run: `cd vps && node --test tests/comparison-refresh.test.mjs tests/analytics-api.test.mjs`
Expected: PASS.

Commit: `feat: expose PRE shadow accuracy comparison`

---

### Task 5: Browser client, PRE primary Today Plan, and Settings accuracy screen

**Files:**
- Modify: `vps-browser-analytics.mjs`
- Modify: `app-v510.js`
- Modify: `app-v510.css`
- Create: `tests/v512-pre-shadow-ui.mjs`
- Modify: `tests/run-regressions.mjs` to include the new regression file if the runner uses an explicit list.

**Interfaces:**
- Browser client: `getStoreRead(shop)` and `getResearchComparison(shop,{limit=90})`.
- UI state: `settingsOpen`, `settingsScreen`, `comparisonResult`, `comparisonLoading`, `comparisonScope`.
- Action: top-left settings button -> settings sheet/page -> `PRE版 精度比較`.

- [ ] **Step 1: Write failing browser-client tests**

Assert `getStoreRead('店A')` calls `/stores/:id/research/store-read`; `getResearchComparison('店A',{limit:30})` calls `/stores/:id/research/comparison?limit=30`, both with existing Collector auth headers.

- [ ] **Step 2: Implement browser client methods**

Return normalized objects without changing `resolveStore()` authentication behavior.

- [ ] **Step 3: Write failing UI structure regression**

Read `app-v510.js` as text or boot the existing UI test harness. Assert:

- `.topbar-side` is replaced/wired as a settings button, not a sixth bottom-nav item,
- settings contains a `PRE版 精度比較` action,
- the comparison screen has summary, Top1/3/5, rank-correlation, recent-30, lost-days, exclusions, and collapsed debug sections,
- PRE marker appears in the version area,
- Today Plan has explicit research-first and current-fallback labels.

- [ ] **Step 4: Implement top-left Settings entry**

Replace the inert top-left placeholder with an `.icon-btn` gear button preserving the existing three-column topbar. Add a settings sheet/page with one new row `PRE版 精度比較`; do not create another bottom-nav workspace.

- [ ] **Step 5: Implement comparison loading/rendering**

On opening the comparison screen call `getResearchComparison(activeStore,{limit:90})`. Render:

- live scored day count,
- PRE/current quality side-by-side,
- PRE wins/current wins/ties,
- recent-30 delta,
- Top1/Top3/Top5 lift/rate,
- Spearman,
- biggest PRE loss days,
- excluded/fallback rows,
- collapsed fingerprint/frontier/hash diagnostics.

Historical/backfill, when absent, is labeled separately and never merged into live totals.

- [ ] **Step 6: Make Today Plan research-first**

Change `runTodayPlan()` to:

1. call authenticated `getStoreRead(activeStore)`,
2. accept it only when `storeRead.status==='ready'` and `storeRead.targetDate===planDate`,
3. render PRE ranked candidates with rank/table/machine/research score and PRE metadata,
4. otherwise call the existing bridge `getTodayPlan()` and mark the result `{source:'current_fallback'}`.

Never map research `score` into `predP4`, `predES`, or protected setting probabilities.

- [ ] **Step 7: Add CSS without disturbing protected navigation**

Reuse existing panel/grid tokens. Add only settings/comparison/PRE-badge classes. Keep bottom-nav layout `repeat(5,1fr)` unchanged.

- [ ] **Step 8: Run root tests and commit**

Run: `npm test`
Expected: PASS including the new PRE UI regression.

Commit: `feat: add PRE primary read and shadow comparison UI`

---

### Task 6: Full regression, protection audit, and deployment checkpoint

**Files:**
- Create or update: `docs/vps/PRE-SHADOW-ACCURACY-VERIFICATION.md`
- Update: `WORK-CHECKPOINT.md` if present.

**Interfaces:**
- Produces: a reproducible verification report and deployment candidate SHA. Does not deploy.

- [ ] **Step 1: Run full VPS suite**

Run: `cd vps && npm test`
Expected: all tests pass.

- [ ] **Step 2: Run full root suite**

Run: `npm test`
Expected: all regressions pass.

- [ ] **Step 3: Run Collector/preservation suites explicitly if they are not already covered by `npm test`**

Run the repository's existing Collector and production-preservation commands/files from `tests/run-regressions.mjs`; record exact pass counts in the report.

- [ ] **Step 4: Compare protected files against the pre-feature checkpoint**

Compare the implementation HEAD with `17520e29d7460ffeef3ccd7e4273c5f4aba68cb5` and verify no unintended changes to protected probability tables/judgment math. Expected intentional client changes are limited to PRE UI and research-first Today Plan routing; protected math remains unchanged.

- [ ] **Step 5: Write verification report**

Document:

- implementation SHA,
- all test counts,
- schema additions,
- shadow scheduling priority/resource limits,
- future-leak/immutability tests,
- PRE fallback behavior,
- protected-file audit,
- explicit statement: `Production not deployed; awaiting Hiro approval`.

- [ ] **Step 6: Commit checkpoint**

Commit: `docs: verify PRE shadow accuracy candidate`

Stop here. Ask Hiro for explicit production deployment approval before changing `deploy/vps`, `main`, Vercel production, or the live VPS.
