# VPS Relay Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing iPhone Collector relay from Vercel Blob to KAGOYA VPS while preserving the current Collector V2 API and browser behavior.

**Architecture:** Reuse the existing relay runtime in `api/_relay-web.js`, but inject a VPS-local SQLite-backed blob-store adapter instead of Vercel Blob. Route `/api/relay` through the existing VPS web service, and give that service a persistent writable state directory. The JUGEST browser continues calling relative `/api/relay`, so `jugest.net` automatically talks to the VPS relay once deployed.

**Tech Stack:** Node.js 22, built-in `node:sqlite`, existing JUGEST relay runtime, systemd, existing VPS auto-deploy.

**Spec:** Existing Collector V2 behavior in `api/_relay-web.js` and current project constraints.

## Global Constraints

- Keep `main` unchanged.
- Preserve Collector V2 action names and payload semantics.
- Do not change judgement math, strict Champion, Calibration, store-share constraints, Juggler/HANA formulas, HANA hard constraints, ranking or single-evidence logic.
- Keep current FOUC and home-screen icon behavior.
- No direct ana-slo access from the VPS; the iPhone Shortcut remains the source fetcher.
- Keep Vercel relay untouched as rollback/fallback during migration.
- Production promotion only after tests pass.

---

### Task 1: Add a VPS-local durable relay store

**Files:**
- Create: `vps/src/relay-store.mjs`
- Test: `vps/tests/relay-store.test.mjs`

**Interfaces:**
- Produces: `createRelayStore(name,{dbPath})` with the same `set`, `setJSON`, `get`, `getWithMetadata`, `list`, and `delete` interface used by the existing relay runtime.

- [ ] **Step 1: Write failing tests** for create/get/update, only-if-new, conditional ETag writes, list-by-prefix and delete.
- [ ] **Step 2: Run `cd vps && npm test` and verify the new tests fail.**
- [ ] **Step 3: Implement the SQLite-backed adapter** using `node:sqlite`, WAL mode, atomic transactions and per-key revision ETags.
- [ ] **Step 4: Run `cd vps && npm test` and verify the store tests pass.**
- [ ] **Step 5: Commit the store and tests.**

### Task 2: Expose the existing Collector V2 relay on the VPS web server

**Files:**
- Create: `vps/src/relay-handler.mjs`
- Modify: `vps/src/web-server.mjs`
- Test: `vps/tests/web-server.test.mjs`

**Interfaces:**
- Consumes: `createRelayRuntime({createStore})` from `api/_relay-web.js` and `createRelayStore` from Task 1.
- Produces: POST `/api/relay` on `jugest.net` with the existing relay protocol.

- [ ] **Step 1: Write failing HTTP tests** proving `/api/relay` accepts POST, creates an iPhone Collector key/channel, and persists state across a new handler instance using the same SQLite file.
- [ ] **Step 2: Run `cd vps && npm test` and verify the route tests fail.**
- [ ] **Step 3: Implement the Web Request/Response adapter** and route `/api/relay` before static-file handling.
- [ ] **Step 4: Run `cd vps && npm test` and verify all VPS tests pass.**
- [ ] **Step 5: Run root `npm test` to confirm protected application behavior is unchanged.**
- [ ] **Step 6: Commit the route integration.**

### Task 3: Give the production web service durable writable relay storage

**Files:**
- Modify: `vps/systemd/jugest-web.service`
- Test: `vps/tests/web-server.test.mjs` or a focused systemd assertion test.

**Interfaces:**
- Produces: `/var/lib/jugest` as the writable persistent state path used by the web service.

- [ ] **Step 1: Add a failing assertion** that the unit grants only the required persistent state path.
- [ ] **Step 2: Run VPS tests and verify failure.**
- [ ] **Step 3: Add `StateDirectory=jugest` and set the relay DB path default to `/var/lib/jugest/relay.sqlite`.**
- [ ] **Step 4: Run VPS and root regression tests.**
- [ ] **Step 5: Commit the service hardening update.**

### Task 4: Production verification and cutover

**Files:**
- No application logic changes unless verification finds a defect.

**Interfaces:**
- Produces: working `https://jugest.net/api/relay`; Vercel remains untouched as fallback.

- [ ] **Step 1: Compare the feature branch with `deploy/vps` and confirm only relay/VPS infrastructure files changed.**
- [ ] **Step 2: Fast-forward `deploy/vps` to the tested feature head.**
- [ ] **Step 3: Install the updated `jugest-web.service` on the VPS once, run `systemctl daemon-reload`, and restart the service.**
- [ ] **Step 4: Verify `/api/health`, POST `/api/relay`, and persistence across a web-service restart.**
- [ ] **Step 5: On `jugest.net`, issue a fresh iPhone Collector key and change the Shortcut endpoint to `https://jugest.net/api/relay`.**
- [ ] **Step 6: Run a one-item Collector V2 round trip before starting the v2.5 multi-fetch trial.**
