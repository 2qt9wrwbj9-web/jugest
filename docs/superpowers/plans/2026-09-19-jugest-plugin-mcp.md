# JUGEST MCP Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private read-only MCP endpoint to JUGEST v6.0.2 that exposes exact existing JUGEST batch machine judgement plus authorized VPS store/PRE read tools for ChatGPT.

**Architecture:** Reuse `vps/src/analysis/runtime-adapter.mjs` to boot the production browser runtime and call its existing `externalJudge()` directly; do not copy protected probability math. Add a dependency-free MCP JSON-RPC handler mounted at `/mcp`; authorized store tools invoke the existing analytics handler in-process so authentication and data semantics remain single-source.

**Tech Stack:** Node.js 22 ESM, built-in `http`, existing JUGEST headless VM runtime, existing SQLite analytics API, node:test.

**Spec:** `docs/superpowers/specs/2026-09-19-jugest-plugin-mcp-design.md`

## Global Constraints

- Production baseline is `deploy/vps` at JUGEST v6.0.2 SHA `afe2c50a441468b296f887282df5f616f16fa769`.
- Do not change protected Juggler probability tables or reimplement `externalJudge()` math.
- Live judgement is observed-data-first; PRE/store-read information must not alter the judgement posterior.
- MCP v1 is read-only.
- No production deployment or merge to `deploy/vps` without Hiro's explicit approval immediately beforehand.

---

### Task 1: Exact batch machine judgement adapter

**Files:**
- Modify: `vps/src/analysis/runtime-adapter.mjs`
- Create: `vps/tests/mcp-machine-judge.test.mjs`

**Interfaces:**
- Produces: `runExistingMachineJudgement({rootDir,machines}) -> Promise<{machines:Array}>`
- Each result row includes normalized inputs, six-setting posterior `q`, `expectedSetting`, `p4`, `p5`, `p6`, existing `method`, reverse-inference metadata, and `reverseWarn`.

- [ ] **Step 1: Write the failing test**

Create a test that dynamically imports `runtime-adapter.mjs`, asserts `runExistingMachineJudgement` exists, rejects invalid/oversized inputs, and verifies valid Juggler rows return normalized six-setting posteriors. Include one row with no diff and one with diff so both bonus-only and reverse-diff existing paths are exercised.

- [ ] **Step 2: Run test to verify it fails**

Run through the existing branch CI (`sol/vps-*` triggers `.github/workflows/vps-canonical-ingest-tdd.yml`). Expected: FAIL because `runExistingMachineJudgement` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `runtime-adapter.mjs`, boot the existing runtime once per batch, retrieve `ctx.externalJudge` through `mustFunction`, validate the supported Juggler inputs, call the existing function for each row, convert VM values through `plain()`, and derive summary probabilities only from returned `q`.

- [ ] **Step 4: Run test to verify it passes**

Push the implementation and confirm branch CI passes the new test plus the full existing VPS/root suites.

- [ ] **Step 5: Commit**

Commit message: `feat: expose exact batch machine judgement`

---

### Task 2: Read-only MCP protocol handler

**Files:**
- Create: `vps/src/mcp-handler.mjs`
- Create: `vps/tests/mcp-handler.test.mjs`

**Interfaces:**
- Produces: `createJugestMcpHandler({rootDir,relayDbPath,canonicalDbPath,analyticsHandler?}) -> async (req,res)=>void`
- Supports `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
- Tool: `judge_machines` delegates only to `runExistingMachineJudgement`.

- [ ] **Step 1: Write the failing test**

Test initialization response, tool listing metadata, malformed JSON/unknown methods, `judge_machines` tool call, and read-only annotations. Test the handler using small fake Node request/response objects so no network server is needed.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL because `mcp-handler.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement the dependency-free JSON-RPC/Streamable HTTP subset with bounded request bodies, JSON responses, JSON-RPC error envelopes, tool-level `isError` responses, and the `judge_machines` tool schema. Return server instructions stating that store/PRE context must not be mixed into live judgement unless separately requested.

- [ ] **Step 4: Run test to verify it passes**

Confirm new handler tests and full suites pass in branch CI.

- [ ] **Step 5: Commit**

Commit message: `feat: add read-only JUGEST MCP handler`

---

### Task 3: Authorized store/PRE tools through existing analytics handler

**Files:**
- Modify: `vps/src/mcp-handler.mjs`
- Modify: `vps/tests/mcp-handler.test.mjs`

**Interfaces:**
- Adds tools: `list_stores`, `get_store_days`, `get_store_day`, `get_store_read`, `get_store_comparison`.
- Consumes existing `createAnalyticsHandler()` response contract.

- [ ] **Step 1: Write the failing test**

Inject a fake analytics handler and verify each MCP tool constructs the exact existing `/api/vps/...` GET path, forwards normalized receiver credentials, preserves store IDs/dates/limits, and returns structured content. Verify packed bearer `<channelId>:<receiverToken>` is expanded into the existing two-header auth form.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL because store tools and packed auth are absent.

- [ ] **Step 3: Write minimal implementation**

Add header normalization and an in-process analytics request adapter. Do not duplicate SQL or store authorization. Limit comparison/day list limits to the same ranges as the current analytics API.

- [ ] **Step 4: Run test to verify it passes**

Confirm MCP tests and full suites pass.

- [ ] **Step 5: Commit**

Commit message: `feat: expose authorized JUGEST store tools over MCP`

---

### Task 4: Mount `/mcp` in the existing web server

**Files:**
- Modify: `vps/src/web-server.mjs`
- Modify: `vps/tests/web-server.test.mjs`

**Interfaces:**
- `POST /mcp` routes to the MCP handler.
- Non-MCP static/API behavior remains unchanged.

- [ ] **Step 1: Write the failing test**

Add a web-server test that sends an MCP `initialize` POST and verifies a successful MCP response while existing `/api/health` and method restrictions remain unchanged.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL because `/mcp` currently falls into the static method restriction path.

- [ ] **Step 3: Write minimal implementation**

Construct `createJugestMcpHandler` beside the existing analytics/backfill handlers and route exact `/mcp` requests to it before static GET/HEAD enforcement.

- [ ] **Step 4: Run test to verify it passes**

Confirm full branch CI passes.

- [ ] **Step 5: Commit**

Commit message: `feat: mount JUGEST MCP endpoint`

---

### Task 5: Plugin-use documentation and pre-deploy verification

**Files:**
- Create: `docs/vps/JUGEST-MCP-PLUGIN.md`
- Optionally create/update test documentation only; no production config changes.

**Interfaces:**
- Documents endpoint, auth forms, tool contracts, screenshot workflow, and explicit separation of live judgement from PRE/store-read context.

- [ ] **Step 1: Document local/protocol smoke calls**

Include initialize, tools/list, judge_machines, and authorized store tool examples without embedding real secrets.

- [ ] **Step 2: Run verification**

Require green GitHub Actions for the feature branch, inspect changed files/diff, and verify `deploy/vps` has not moved.

- [ ] **Step 3: Prepare review artifact**

Open a draft PR from `sol/vps-jugest-plugin-mcp-20260919` to `deploy/vps` with a clear note that merge/deploy is blocked on Hiro approval.

- [ ] **Step 4: Stop before production**

Do not merge the PR, move `deploy/vps`, restart services, or change production credentials. Ask Hiro for explicit production approval only after all verification is complete.
