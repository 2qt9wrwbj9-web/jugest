# Historical Immutable Snapshot + Hit Rate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make historical walk-forward runs finish against an immutable run-owned data snapshot despite canonical backfills/corrections, then show intuitive Top1/3/5 day-level hit rates in LIVE and historical comparison.

**Architecture:** Persist normalized run-owned historical day snapshots at run creation and make the historical worker read only those rows. Canonical changes during an active immutable run set/coalesce a pending refresh; completion creates one successor snapshot/run if needed. Hit rates are summary-only aggregates derived from existing `topK.overlap` metrics and do not alter scoring or prediction semantics.

**Tech Stack:** Node.js ESM, better-sqlite3/SQLite, existing VPS queue/coordinator, browser JS UI, node:test.

**Spec:** `docs/superpowers/specs/2026-09-14-historical-immutable-snapshot-hit-rate-design.md`

## Global Constraints

- Do not change Juggler/HANA judgment math, PRE/current ranking semantics, strict Champion, Calibration, store-share constraint, or HANA hard constraints.
- For target D, replay engines may receive only snapshot days `< D`; D is revealed only for scoring.
- Collector/raw/canonical ingest and successful Push ACK durability semantics stay unchanged.
- Historical work remains low-priority and Collector-preemptible.
- No production branch update without fresh explicit approval after exact candidate SHA and verification.

---

### Task 1: Immutable historical snapshot persistence and lifecycle

**Files:**
- Modify: `vps/src/schema.mjs`
- Modify: `vps/src/research/historical-comparison.mjs`
- Modify: `vps/src/analysis/historical-refresh-state.mjs`
- Test: existing historical comparison/refresh/resume test files under `vps/tests/`; add focused test file if clearer.

**Interfaces:**
- Produce `persistHistoricalRunSnapshot(db,{runId,days})` and `loadHistoricalRunSnapshot(db,{runId})` (names may be private/exported-for-test but semantics fixed).
- `ensureHistoricalComparisonRun` returns the current immutable active run without stale/reset when mutable canonical identity changes; records pending refresh.
- A completed immutable run with pending changed identity creates exactly one successor run/snapshot.

- [ ] Write RED tests proving a partially processed immutable run retains run id, total candidates, processed count and cursor after canonical backfill/correction; snapshot rows remain byte/canonical-equivalent to creation input.
- [ ] Run focused historical tests and confirm the new assertions fail under current stale/restart behavior.
- [ ] Add schema for run-owned snapshot days plus durable pending-refresh state. Use primary/unique keys that make snapshot creation idempotent and preserve old run auditability.
- [ ] Change run creation to insert the normalized snapshot transactionally with the run. Make history identity describe the persisted snapshot.
- [ ] Change refresh logic so queued/running immutable runs are not marked stale on canonical change; coalesce a pending refresh instead.
- [ ] Add completion/successor logic: after current run completes, create at most one fresh successor if pending canonical identity differs; otherwise clear/no-op.
- [ ] Add migration behavior for pre-snapshot active runs: retain old run for audit and create one fresh immutable run; never mix today's canonical data into already-processed legacy run.
- [ ] Run focused tests until GREEN and commit.

### Task 2: Historical worker consumes only immutable snapshot

**Files:**
- Modify: `vps/src/jobs/historical-compare.mjs`
- Modify if needed: `vps/src/research/historical-comparison.mjs`
- Test: historical worker/future-poisoning/resume tests under `vps/tests/`.

**Interfaces:**
- Worker receives runId/targetDate as today but obtains replay `days` from `loadHistoricalRunSnapshot`.
- Worker must not call mutable canonical `loadStoreDays` for replay/history/outcome rows of an immutable run; store display metadata may be loaded separately without changing replay inputs.

- [ ] Write RED tests: mutate canonical after snapshot creation and prove next target prediction/outcome input uses original snapshot; append future/live day and prove candidate count/cursor do not expand.
- [ ] Add restart/resume test proving reopened worker uses the same snapshot and cursor.
- [ ] Replace worker identity-recheck/stale-restart path with snapshot load and validation. Keep one-target-per-job scheduling and task telemetry.
- [ ] Preserve `< targetDate` cutoff inside `compareHistoricalTarget`; target day only supplies outcome after predictions.
- [ ] On terminal target, trigger refresh lifecycle so a pending changed canonical history can schedule one successor after completion.
- [ ] Run future-poisoning, chronology, resume, historical job and refresh tests until GREEN; commit.

### Task 3: Day-level Top1/Top3/Top5 hit-rate aggregation

**Files:**
- Modify: `vps/src/research/live-comparison.mjs`
- Modify: `vps/src/research/historical-summary.mjs`
- Test: live comparison and historical summary tests.

**Interfaces:**
- Add summary shape `hitRates: {top1:{hits,days,rate},top3:{hits,days,rate},top5:{hits,days,rate}}` to each engine aggregate.
- Same shape must exist for cumulative and `recent30` aggregates in LIVE and historical summaries.
- Hit is `Number(metrics.topK.overlap) > 0`; denominator is engine-days with metrics.

- [ ] Write RED aggregation tests with known overlap values, including a day where average overlap rate is nonzero but day-level hit definition remains independently testable.
- [ ] Implement one small shared/pattern-equivalent aggregation helper without changing `scorePredictionRows` or quality/lift calculations.
- [ ] Extend LIVE and historical cumulative/recent30 summaries with hitRates.
- [ ] Run focused tests and assert existing lift/rate/quality values are unchanged; commit.

### Task 4: Comparison UI shows real hit rates and pending-refresh status

**Files:**
- Modify: `vps-ui-historical-comparison.mjs`
- Test: `vps/tests/ui-historical-comparison.test.mjs` and/or existing UI patch tests.

**Interfaces:**
- Render `実的中率` for Top1/Top3/Top5, 新版/現行版, as percentage plus `hits/days日`.
- Render in both LIVE and 過去検証 tabs.
- If historical summary reports pending refresh while current run is active/complete transition, show `新しいデータあり・完了後に再検証予定` or equivalent.
- Keep analytical lift/coverage/rank-correlation table intact.

- [ ] Write RED UI tests for both tabs and exact hit/day count rendering.
- [ ] Add compact hit-rate table/cards using existing mobile-safe layout and `fmtPct`.
- [ ] Add pending-refresh notice without implying current progress resets.
- [ ] Verify store selector and scroll-preservation regressions remain GREEN; commit.

### Task 5: Full regression and candidate audit

**Files:**
- No semantic production changes; tests/docs only if a regression requires a scoped fix.

- [ ] Run complete VPS test suite, root regression suite, Collector tests, production-preservation tests, chronology/future-poisoning tests and syntax/idempotence checks used by current CI.
- [ ] Confirm protected math/research files outside planned scope are unchanged or semantically preserved.
- [ ] Compare candidate branch against `deploy/vps`; require ahead-only/zero-behind or otherwise stop and reconcile safely without force.
- [ ] Record exact candidate SHA and exact successful CI run/checks.
- [ ] Stop before production and ask ヒロ for fresh explicit deployment approval.
