# VPS Settings / Backfill / Analysis Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dismissible failed-analysis UI, move Collector connection settings behind a top-left Settings gear, and migrate existing iPhone `externalDays` into VPS canonical analysis storage.

**Architecture:** Keep protected JUGEST runtime files semantically unchanged. Add a VPS-only index source patch that exposes cloned `externalDays` and injects a focused UI enhancement module. Add a Collector-key-authenticated backfill Relay action and a dedicated canonical backfill ingest path that only fills missing VPS days.

**Tech Stack:** Node.js 22, browser ES modules, Shadow DOM, Node `node:test`, SQLite (`node:sqlite`), existing Relay Collector runtime.

**Spec:** `docs/superpowers/specs/2026-09-12-vps-settings-backfill-chipfix-design.md`

## Global Constraints

- Do not change protected judgment, probability, calibration, Champion, store-share, HANA or ranking semantics.
- Device backfill never overwrites an existing VPS canonical day.
- Backfill uses existing Collector sender-key authentication.
- Production integration is fast-forward-only to `deploy/vps`; no force update and no `main` change.

---

### Task 1: Device backfill canonical ingest

**Files:**
- Create: `vps/src/ingest/device-backfill.mjs`
- Create: `vps/test/device-backfill.test.mjs`

**Interfaces:**
- Produces: `ingestDeviceBackfillDay(db, input)` returning `{inserted, duplicate, conflict, storeId, businessDate, normalizedHash, machineCount, jobId}`.

- [ ] **Step 1: Write failing tests** for inserting a missing day, treating same-hash as duplicate, and preserving an existing different-hash canonical day.
- [ ] **Step 2: Run the focused VPS test** and confirm the module/test fails because `device-backfill.mjs` does not exist.
- [ ] **Step 3: Implement minimal ingest** using `canonicalJson`, `hashCanonical`, `archiveRawArtifact`, and `requestStoreAnalysisRefresh`; archive canonical JSON with provenance `device-indexeddb-backfill-v1` and never overwrite an existing `store_days` row.
- [ ] **Step 4: Run focused test and full VPS tests**.

### Task 2: Authenticated Relay backfill action

**Files:**
- Modify: `api/_collector-batch-v3.js`
- Modify: `vps/src/relay-handler.mjs`
- Create: `vps/test/device-backfill-relay.test.mjs`

**Interfaces:**
- Consumes: `ingestDeviceBackfillDay()` from Task 1.
- Produces: Relay action `iosCollectorBackfillV1` with max 30 days and per-day results.

- [ ] **Step 1: Write failing Relay tests** for unauthorized request, configured-shop insert, unconfigured-shop skip, and >30 day rejection.
- [ ] **Step 2: Run focused tests and confirm RED**.
- [ ] **Step 3: Add `iosCollectorBackfillV1` to Collector key-authenticated read-only action sets** so existing sender-token auth is reused.
- [ ] **Step 4: Install VPS-only action handler** in `relay-handler.mjs`, normalize shop names, resolve `sourceStoreId`, call `ingestDeviceBackfillDay`, continue per-day on validation errors, and return counts/results.
- [ ] **Step 5: Run focused and full VPS tests**.

### Task 3: VPS index patch and browser enhancement module

**Files:**
- Create: `vps/src/ui-source-patch.mjs`
- Create: `vps-ui-enhancements.mjs`
- Modify: `vps/src/web-server.mjs`
- Create: `vps/test/ui-source-patch.test.mjs`
- Create: `tests/vps-ui-enhancements-static.mjs`

**Interfaces:**
- Produces: `patchJugestIndexSource(source)`.
- Browser bridge addition: `getVpsBackfillDays()` returns a cloned `externalDays` snapshot.

- [ ] **Step 1: Write failing source/static tests** that require module injection, bridge exposure, gear UI, settings/collector page hooks, failed-chip acknowledgement, connection-panel removal and backfill request action.
- [ ] **Step 2: Run focused tests and confirm RED**.
- [ ] **Step 3: Implement deterministic source patch** with exact anchors and idempotency guards.
- [ ] **Step 4: Update VPS web server** to read/patch HTML index responses while preserving ordinary streaming for other assets.
- [ ] **Step 5: Implement `vps-ui-enhancements.mjs`**: gear button, Settings hub + Collector child page, hidden auto-fetch setup panel, migration UI, batched backfill, and failed-chip acknowledgement.
- [ ] **Step 6: Run focused tests and root/VPS suites**.

### Task 4: Verification and production rollout

**Files:**
- No protected-domain files should change.

- [ ] **Step 1: Compare feature branch to `deploy/vps`** and verify only planned files/docs changed.
- [ ] **Step 2: Run/obtain fresh full-suite verification** for root and VPS tests.
- [ ] **Step 3: Fast-forward `deploy/vps` to the verified feature head without force**.
- [ ] **Step 4: Wait for deploy timer and verify live `/api/health`**.
- [ ] **Step 5: Verify live index contains the enhancement module reference and the live enhancement module exposes Settings/backfill hooks**.
