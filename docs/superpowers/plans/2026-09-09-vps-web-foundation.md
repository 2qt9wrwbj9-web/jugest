# VPS Web Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing JUGEST web UI directly from the VPS with a small health API, without touching Production, `main`, or protected judgement logic.

**Architecture:** Reuse the repository root as the static web root instead of duplicating the current JUGEST front-end. Add a small dependency-free Node HTTP service under `vps/src/`, keep it separate from the memory-aware analysis coordinator, and run it as its own systemd service bound to localhost for a future reverse proxy/domain.

**Tech Stack:** Node.js >=22.13.0, built-in `node:http`, built-in test runner, systemd.

**Spec:** Current VPS direction supersedes the older Vercel-to-VPS Collector import design. This plan implements only the first VPS-native web-serving slice.

## Global Constraints

- Do not modify `main`.
- Do not deploy or promote Production.
- Do not change judgement math, strict Champion, Calibration, store-share constraint, Juggler/HANA formulas, HANA hard constraints, single-evidence logic, or ranking semantics.
- Preserve the existing v5.1.2 front-end files byte-for-byte.
- Keep the Phase 1 2 GiB scheduler behavior unchanged.
- Do not expose VPS source, tests, docs, research, `.git`, or `.github` through the web service.
- Bind the Node service to `127.0.0.1` by default; public HTTPS/domain termination is a later reverse-proxy step.

---

### Task 1: Static JUGEST web server and health endpoint

**Files:**
- Create: `vps/tests/web-server.test.mjs`
- Create: `vps/src/web-server.mjs`

**Interfaces:**
- Produces: `createWebHandler({rootDir})`
- Produces: `createWebServer({rootDir})`
- HTTP: `GET|HEAD /api/health` -> `200 {"ok":true,"service":"jugest-vps-web"}`
- HTTP: `GET|HEAD /` -> repository-root `index.html`

- [ ] Write failing HTTP tests for health, `/`, static assets, blocked internal directories, 404s, and 405s.
- [ ] Run `cd vps && node --test tests/web-server.test.mjs` and verify RED because `src/web-server.mjs` does not exist.
- [ ] Implement a dependency-free HTTP server with MIME handling, path validation, symlink containment, and an internal-directory denylist.
- [ ] Re-run the focused tests and verify GREEN.

### Task 2: VPS web process entrypoint

**Files:**
- Create: `vps/tests/web-main.test.mjs`
- Create: `vps/src/web-main.mjs`
- Modify: `vps/package.json`
- Create: `vps/systemd/jugest-web.service`

**Interfaces:**
- Produces: `readWebConfig(env)` -> `{rootDir,host,port}`
- Produces: `runWebServer({config,logger})`
- Environment: `JUGEST_WEB_ROOT`, `JUGEST_WEB_HOST`, `JUGEST_WEB_PORT`

- [ ] Write failing tests for explicit environment parsing, invalid ports, and starting an ephemeral HTTP listener.
- [ ] Run the focused test and verify RED because the entrypoint does not exist.
- [ ] Implement `web-main.mjs` with localhost/3000 defaults and graceful SIGTERM/SIGINT shutdown.
- [ ] Add `npm run web` and a hardened `jugest-web.service` unit.
- [ ] Re-run focused tests and verify GREEN.

### Task 3: Regression and branch verification

**Files:**
- No production-logic files beyond Task 1/2.

- [ ] Run all VPS tests with `cd vps && npm test`.
- [ ] Confirm the branch diff does not modify root `index.html`, protected judgement files, `main`, Vercel Production config, or Phase 1 scheduler logic.
- [ ] Confirm `/api/health`, `/`, a JS asset, blocked `/vps/...`, missing file, and POST behavior from the test suite.
- [ ] Record the branch head and test result; do not deploy to the VPS or Production without explicit user approval.
