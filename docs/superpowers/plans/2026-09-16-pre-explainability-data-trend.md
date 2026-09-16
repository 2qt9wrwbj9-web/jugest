# PRE Explainability + Store Data/Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable PRE explanations plus store/machine data summaries while preserving all protected ranking/judgment semantics.

**Architecture:** Keep model/ranking/scoring code behavior unchanged and add pure audit/aggregation helpers around existing outputs. Extend the VPS historical-comparison UI for exclusion labels/explanations and extend the existing v5.1 store bridge/UI for requested aggregates. Prefer small pure helpers with direct tests.

**Tech Stack:** Node.js 22, ES modules, built-in `node:test`, existing JUGEST browser bridge/UI and VPS research modules.

**Spec:** `docs/superpowers/specs/2026-09-16-pre-explainability-data-trend.md`

## Global Constraints
- PRE score/rank and Quality formula must not change.
- Protected judgment math, strict Champion, calibration and store constraints must not change.
- PRE explanation fields are audit/display-only.
- No per-table payout-rate field.
- Aggregate payout rate is `100 * (1 + totalDiff / (3 * totalGames))` over valid observed rows.
- Production deployment is allowed only after all regression suites pass.

---

### Task 1: Regression tests for requested behavior
**Files:** create `tests/vps-pre-explainability-store-summary.mjs`; inspect existing VPS/static tests.
- [ ] Add assertions for human-readable exclusion labels while preserving raw codes.
- [ ] Add assertions that PRE explanation contains 0–100 aim/confidence, independent family count and evidence details without changing `score`/`rank`.
- [ ] Add assertions for selected-day overall and per-machine totals/averages/rates/settings.
- [ ] Add assertions for trend per-machine average setting + aggregate payout rate and no per-table payout rate.
- [ ] Run CI and confirm RED failures are caused by missing new behavior.

### Task 2: PRE audit explanation + exclusion labels
**Files:** modify `vps/src/research/historical-pre-simulator.mjs`, `vps-ui-historical-comparison.mjs`, and narrowly related browser/API adapter code only if required.
- [ ] Derive explanations from the already-selected model/axes; do not modify scoring or ranking order.
- [ ] Collapse matched predicates into independent fact families for display counts.
- [ ] Add Japanese exclusion-reason mapping to LIVE/historical rows while retaining raw codes in audit details.
- [ ] Run scoped tests then full CI.

### Task 3: Store data and trend summaries
**Files:** modify bridge/UI through the existing transform/patch path used by the deploy line; add pure summary helpers where possible.
- [ ] Selected-day summary: overall total diff, average diff, aggregate actual payout rate.
- [ ] Per-machine selected-day summary: total diff, average diff, aggregate actual payout rate, average expected setting.
- [ ] Trend result: per-machine average expected setting + aggregate actual payout rate; preserve existing table ranking fields.
- [ ] Keep per-table UI unchanged except for surrounding summaries.
- [ ] Run scoped tests then full CI.

### Task 4: Release verification and production deploy
**Files:** release branch only; no protected-math edits.
- [ ] Compare branch against `deploy/vps` and confirm changed files are limited to planned audit/UI/aggregation surfaces and tests/docs.
- [ ] Confirm all GitHub Actions jobs pass.
- [ ] Fast-forward `deploy/vps` to the verified commit.
- [ ] Verify the deploy branch moved to the exact tested SHA.
- [ ] Verify production health/version externally and inspect deploy status/log evidence when available.
