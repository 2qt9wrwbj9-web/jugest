# JUGEST Plugin Full Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing JUGEST ChatGPT App/MCP surface so every current user-facing JUGEST analysis capability is reachable through stable high-level tools while keeping JUGEST.net authoritative.

**Architecture:** Keep the Plugin thin and route user intents to stable MCP tools. Add three read-only MCP tools backed by existing canonical snapshots/receipts, then broaden Plugin metadata and routing instructions without duplicating JUGEST logic. Preserve all existing authentication, store authorization, judgement math, PRE behavior, and App binding.

**Tech Stack:** Node.js ESM, built-in `node:test`, SQLite via existing JUGEST DB helpers, MCP JSON-RPC 2026-07-28 + legacy fallback, OpenAI Plugin package files.

**Spec:** `docs/superpowers/specs/2026-09-22-jugest-plugin-full-frontend-design.md`

## Global Constraints

- Plugin remains a thin routing layer; JUGEST.net/VPS remains the source of truth.
- Existing MCP tool names and required inputs remain backward-compatible.
- Add only user-facing read capabilities; no admin/deploy/credential/backfill/resource tools.
- `judge_machines` remains current-machine observed-data-only and mathematically unchanged.
- PRE/store-read remains separate evidence unless a future approved combined JUGEST tool exists.
- OAuth `jugest:read`, assistant read key, and legacy Receiver auth keep current store authorization boundaries.
- Do not change PRE score/rank, strict Champion, calibration, store-share constraints, ranking/model search, or probability tables.
- Production deploy is a separate explicit approval gate after implementation and verification.

## Review Focus

1. Missing analysis snapshots must return a successful tool response with `analysis: null`, not crash or fabricate data.
2. Pending analysis without a status snapshot must derive a safe status from `analysis_refresh_state` exactly as the existing HTTP API does.
3. Analysis history must be bounded even when a store has many receipts and must never expose raw artifact paths, tokens, or filesystem state.
4. Every new tool must reject cross-channel private stores while respecting the configured PIA access policy.
5. Existing `judge_machines` output and evidence separation must remain unchanged after the MCP surface grows.

---

### Task 1: Add `get_store_analysis`

**Files:**
- Modify: `vps/tests/mcp-api.test.mjs`
- Modify: `vps/src/mcp-handler.mjs`

**Interfaces:**
- Consumes: authorized `storeId`; `client_snapshots` row where `snapshot_type='store-analysis-default'` and `version='vps-runtime-v1'`.
- Produces: `get_store_analysis({storeId}) -> {ok,store,analysis,businessDate,payloadHash,updatedAt}`.

- [ ] **Step 1: Seed an analysis snapshot in the MCP fixture**

Add near the existing constants:
```js
const ANALYSIS_VERSION='vps-runtime-v1';
```

Seed before `db.close()`:
```js
const analysis={shop:'認証店舗',from:'2026-09-01',latest:'2026-09-18',days:18,rowCount:18,machines:[],positive:[],negative:[],patterns:[],machinePatterns:[]};
db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-analysis-default',ANALYSIS_VERSION,'2026-09-18',canonicalJson(analysis),hashCanonical(analysis),now);
```

- [ ] **Step 2: Write the failing MCP contract test**

Update the expected tool list to:
```js
[
  'judge_machines','list_stores','get_store_days','get_store_day',
  'get_store_analysis','get_store_status','get_store_analysis_history',
  'get_store_prediction','get_store_comparison'
]
```

Inside the OAuth store-tools test add:
```js
const analysisResult=await (await f.post('tools/call',{name:'get_store_analysis',arguments:{storeId:'store-a'}}, {}, oauth)).json();
assert.equal(analysisResult.result.structuredContent.analysis.shop,'認証店舗');
assert.equal(analysisResult.result.structuredContent.businessDate,'2026-09-18');
assert.doesNotMatch(JSON.stringify(analysisResult),/raw-secret|html\.gz|artifact|receiver-token/i);
```

- [ ] **Step 3: Run the targeted test and verify RED**

Run:
```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs
```
Expected: FAIL because the three new tool names are not listed and `get_store_analysis` is unknown.

- [ ] **Step 4: Add the tool definition and minimal implementation**

In `vps/src/mcp-handler.mjs`, add:
```js
const ANALYSIS_VERSION='vps-runtime-v1';
```

Add this secured tool before `get_store_prediction`:
```js
securedTool({
  name:'get_store_analysis',title:'Get store analysis',
  description:'Read the current user-facing JUGEST store analysis for an authorized store, including current tendency and pattern sections produced by JUGEST.net. This does not modify data or change setting judgement.',
  inputSchema:{type:'object',additionalProperties:false,properties:{storeId:{type:'string',minLength:1}},required:['storeId']},
  annotations:{readOnlyHint:true,openWorldHint:false}
}),
```

Add this branch in `runTool` after `get_store_day`:
```js
if(name==='get_store_analysis'){
  const row=db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-analysis-default' AND version=?`).get(storeId,ANALYSIS_VERSION);
  return toolResult({
    ok:true,store:access.store,
    analysis:row?safeJson(row.payload_json,null):null,
    businessDate:row?.business_date??null,
    payloadHash:row?.payload_hash??null,
    updatedAt:row?.updated_at??null
  },{modern});
}
```

- [ ] **Step 5: Run the targeted test**

Run the same command. Expected: remaining failures are only for the not-yet-implemented status/history tools.

- [ ] **Step 6: Commit**

```bash
git add vps/src/mcp-handler.mjs vps/tests/mcp-api.test.mjs
git commit -m "feat: expose store analysis over MCP"
```

---

### Task 2: Add `get_store_status`

**Files:**
- Modify: `vps/tests/mcp-api.test.mjs`
- Modify: `vps/src/mcp-handler.mjs`

**Interfaces:**
- Consumes: `store-latest-status` snapshot and `analysis_refresh_state` for the authorized store.
- Produces: `get_store_status({storeId}) -> {ok,store,status,businessDate,payloadHash,updatedAt}`.

- [ ] **Step 1: Seed analyzed and pending status cases**

Seed the normal status:
```js
const status={status:'analyzed',generation:2,completedGeneration:2,businessDate:'2026-09-18'};
db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-latest-status',ANALYSIS_VERSION,'2026-09-18',canonicalJson(status),hashCanonical(status),now);
```

Seed a second authorized store for the no-snapshot pending case:
```js
seedStore('store-pending','解析待ち店舗',CHANNEL);
db.prepare(`INSERT INTO analysis_refresh_state(store_id,analysis_version,generation,completed_generation,active_job_id,updated_at) VALUES(?,?,?,?,?,?)`).run('store-pending',ANALYSIS_VERSION,3,2,null,now);
```

- [ ] **Step 2: Write failing assertions**

Add:
```js
const statusResult=await (await f.post('tools/call',{name:'get_store_status',arguments:{storeId:'store-a'}}, {}, oauth)).json();
assert.equal(statusResult.result.structuredContent.status.status,'analyzed');
assert.equal(statusResult.result.structuredContent.businessDate,'2026-09-18');
assert.equal('resources' in statusResult.result.structuredContent,false);

const pendingResult=await (await f.post('tools/call',{name:'get_store_status',arguments:{storeId:'store-pending'}}, {}, oauth)).json();
assert.deepEqual(pendingResult.result.structuredContent.status,{status:'pending',generation:3,completedGeneration:2});
```

- [ ] **Step 3: Run targeted tests and verify RED**

Run:
```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs
```
Expected: FAIL on `get_store_status`.

- [ ] **Step 4: Add tool definition and implementation**

Add:
```js
securedTool({
  name:'get_store_status',title:'Get store analysis status',
  description:'Read freshness and processing state for the current JUGEST analysis of an authorized store. This is user-facing analysis state and does not expose VPS resource telemetry.',
  inputSchema:{type:'object',additionalProperties:false,properties:{storeId:{type:'string',minLength:1}},required:['storeId']},
  annotations:{readOnlyHint:true,openWorldHint:false}
}),
```

Add the branch:
```js
if(name==='get_store_status'){
  const row=db.prepare(`SELECT business_date,payload_json,payload_hash,updated_at FROM client_snapshots WHERE store_id=? AND snapshot_type='store-latest-status' AND version=?`).get(storeId,ANALYSIS_VERSION);
  const refresh=db.prepare(`SELECT generation,completed_generation,active_job_id,updated_at FROM analysis_refresh_state WHERE store_id=? AND analysis_version=?`).get(storeId,ANALYSIS_VERSION);
  const status=row?safeJson(row.payload_json,null):{
    status:refresh&&refresh.generation>refresh.completed_generation?'pending':'unavailable',
    generation:refresh?.generation??0,
    completedGeneration:refresh?.completed_generation??0
  };
  return toolResult({
    ok:true,store:access.store,status,
    businessDate:row?.business_date??null,
    payloadHash:row?.payload_hash??null,
    updatedAt:row?.updated_at??refresh?.updated_at??null
  },{modern});
}
```

- [ ] **Step 5: Run targeted tests**

Expected: status assertions PASS; only history-related failures remain.

- [ ] **Step 6: Commit**

```bash
git add vps/src/mcp-handler.mjs vps/tests/mcp-api.test.mjs
git commit -m "feat: expose store analysis status over MCP"
```

---

### Task 3: Add `get_store_analysis_history`

**Files:**
- Modify: `vps/tests/mcp-api.test.mjs`
- Modify: `vps/src/mcp-handler.mjs`

**Interfaces:**
- Consumes: authorized `storeId`, optional `limit` integer 1..100, `analysis_receipts`.
- Produces: `get_store_analysis_history({storeId,limit?}) -> {ok,store,limit,history[]}` where each row is `{targetDate,component,version,inputHash,outputHash,createdAt}`.

- [ ] **Step 1: Seed bounded history data**

Insert two receipts so ordering and limiting can be tested:
```js
db.prepare(`INSERT INTO analysis_receipts(store_id,target_date,component,version,input_hash,output_hash,created_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','2026-09-17','store-analysis-default',ANALYSIS_VERSION,'a'.repeat(64),'b'.repeat(64),'2026-09-18T00:00:00.000Z');
db.prepare(`INSERT INTO analysis_receipts(store_id,target_date,component,version,input_hash,output_hash,created_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','2026-09-18','store-analysis-default',ANALYSIS_VERSION,'c'.repeat(64),'d'.repeat(64),'2026-09-19T00:00:00.000Z');
```

- [ ] **Step 2: Write failing history assertions**

Add:
```js
const history=await (await f.post('tools/call',{name:'get_store_analysis_history',arguments:{storeId:'store-a',limit:1}}, {}, oauth)).json();
assert.equal(history.result.structuredContent.limit,1);
assert.deepEqual(history.result.structuredContent.history.map(x=>x.targetDate),['2026-09-18']);
assert.deepEqual(Object.keys(history.result.structuredContent.history[0]).sort(),['component','createdAt','inputHash','outputHash','targetDate','version'].sort());
assert.doesNotMatch(JSON.stringify(history),/raw-secret|html\.gz|artifact|receiver-token|model_json|filesystem/i);
```

- [ ] **Step 3: Run targeted tests and verify RED**

Run the MCP test command. Expected: FAIL because history tool is not implemented.

- [ ] **Step 4: Add tool definition and implementation**

Add:
```js
securedTool({
  name:'get_store_analysis_history',title:'Get store analysis history',
  description:'Read bounded user-facing JUGEST analysis receipt history for an authorized store. Returns audit metadata only and never raw artifacts, credentials, or operator filesystem state.',
  inputSchema:{type:'object',additionalProperties:false,properties:{
    storeId:{type:'string',minLength:1},
    limit:{type:'integer',minimum:1,maximum:100,default:50}
  },required:['storeId']},
  annotations:{readOnlyHint:true,openWorldHint:false}
}),
```

Add:
```js
if(name==='get_store_analysis_history'){
  const limit=Math.min(100,Math.max(1,Math.trunc(Number(args?.limit)||50)));
  const rows=db.prepare(`SELECT target_date,component,version,input_hash,output_hash,created_at FROM analysis_receipts WHERE store_id=? ORDER BY id DESC LIMIT ?`).all(storeId,limit);
  return toolResult({
    ok:true,store:access.store,limit,
    history:rows.map(row=>({
      targetDate:row.target_date,component:row.component,version:row.version,
      inputHash:row.input_hash,outputHash:row.output_hash,createdAt:row.created_at
    }))
  },{modern});
}
```

- [ ] **Step 5: Run targeted tests**

Expected: the core MCP file is GREEN.

- [ ] **Step 6: Commit**

```bash
git add vps/src/mcp-handler.mjs vps/tests/mcp-api.test.mjs
git commit -m "feat: expose store analysis history over MCP"
```

---

### Task 4: Lock authentication, authorization, and backward compatibility

**Files:**
- Modify: `vps/tests/mcp-api.test.mjs`
- Test only: `vps/src/mcp-handler.mjs`

**Interfaces:**
- Consumes: the nine-tool MCP surface from Tasks 1-3.
- Produces: regression coverage proving the new tools inherit existing auth/store boundaries without changing current judgement or existing tool contracts.

- [ ] **Step 1: Add assistant-read coverage for all three new tools**

In the assistant-key test add:
```js
for(const name of ['get_store_analysis','get_store_status','get_store_analysis_history']){
  const args=name==='get_store_analysis_history'?{storeId:'store-a',limit:10}:{storeId:'store-a'};
  const response=await (await f.post('tools/call',{name,arguments:args},{},f.assistantAuth)).json();
  assert.equal(response.result.isError,false,name);
}
```

- [ ] **Step 2: Add cross-channel denial coverage**

Add:
```js
for(const name of ['get_store_analysis','get_store_status','get_store_analysis_history']){
  const args=name==='get_store_analysis_history'?{storeId:'store-b',limit:10}:{storeId:'store-b'};
  const denied=await (await f.post('tools/call',{name,arguments:args},{},oauth)).json();
  assert.equal(denied.result.isError,true,name);
  assert.match(denied.result.content[0].text,/forbidden/i);
}
```

- [ ] **Step 3: Preserve legacy Receiver compatibility**

Extend the legacy Receiver test:
```js
const status=await (await f.post('tools/call',{name:'get_store_status',arguments:{storeId:'store-a'}})).json();
assert.equal(status.result.isError,false);
assert.equal(status.result.structuredContent.status.status,'analyzed');
```

- [ ] **Step 4: Pin `judge_machines` semantic parity**

Keep the existing expected value assertion unchanged:
```js
assert.ok(Math.abs(output.machines[0].expectedSetting-3.6317261654375623)<1e-11);
```
Also assert the result still contains no `pre`, `storeRead`, or `store` fields.

- [ ] **Step 5: Test PIA policy in both explicit modes**

Do not rewrite the MCP fixture to assume production owner-only behavior. Keep the standard suite explicit with `JUGEST_PIA_ACCESS_MODE=public`, and run the existing store-access policy test separately:
```bash
cd vps && node --test tests/store-access.test.mjs
```
Expected: owner mode allows only configured owner channels and fails closed; public mode exposes only explicit public-native metadata.

- [ ] **Step 6: Run auth/regression tests**

```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs tests/store-access.test.mjs tests/juggler-external-judge.test.mjs
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add vps/tests/mcp-api.test.mjs
git commit -m "test: lock expanded MCP authorization contract"
```

---

### Task 5: Broaden the Plugin from live judgement to the JUGEST analysis frontend

**Files:**
- Modify: `plugins/jugest/plugin.json`
- Modify: `plugins/jugest/skills/jugest-live-analysis/SKILL.md`
- Modify: `plugins/jugest/skills/jugest-live-analysis/agents/openai.yaml`
- Modify: `vps/tests/jugest-plugin-package.test.mjs`

**Interfaces:**
- Consumes: the nine stable MCP tools.
- Produces: Plugin metadata and routing instructions that map user intent to JUGEST tools without embedding JUGEST calculation logic.

- [ ] **Step 1: Write failing Plugin-package tests first**

Change expected manifest version to `0.2.0` and add assertions equivalent to:
```js
assert.match(manifest.description,/JUGEST analysis frontend|JUGEST.*analysis/i);
assert.ok(manifest.extensions['com.openai'].interface.capabilities.includes('Read store tendency analysis'));
assert.ok(manifest.extensions['com.openai'].interface.capabilities.includes('Read PRE and comparison data'));

const skill=await read('skills/jugest-live-analysis/SKILL.md');
for(const tool of ['get_store_analysis','get_store_status','get_store_analysis_history'])assert.match(skill,new RegExp('`'+tool+'`'));
assert.match(skill,/intent.*tool|tool.*intent/i);
assert.doesNotMatch(skill,/probability table|PRE formula|ranking formula/i);
```
Keep the existing assertions that `.app.json` points to `asdk_app_6aae6ef520dc8191af6ccfa59395524d`, no `mcp.json` exists, implicit Juggler invocation remains enabled, and current judgement stays separate from PRE.

- [ ] **Step 2: Run Plugin tests and verify RED**

```bash
cd vps && node --test tests/jugest-plugin-package.test.mjs
```
Expected: FAIL on version/description/new routing assertions.

- [ ] **Step 3: Update `plugin.json`**

Set:
```json
"version": "0.2.0",
"description": "Use JUGEST as the ChatGPT analysis frontend for Juggler setting judgement, authorized store data, store tendencies, PRE/store prediction, analysis status, and prediction comparisons."
```

Use interface values:
```json
"shortDescription": "JUGEST analysis from live Juggler data to store/PRE context",
"longDescription": "Use JUGEST.net as the authoritative backend for current Juggler setting judgement and authorized store analysis. Route store tendencies, saved dates, PRE/store prediction, analysis freshness, analysis history, and prediction comparisons to JUGEST tools without reproducing JUGEST calculation logic in ChatGPT.",
"capabilities": [
  "Judge Juggler screenshots",
  "Judge current Juggler machines",
  "Read authorized JUGEST store data",
  "Read store tendency analysis",
  "Read PRE and comparison data",
  "Read analysis status and history"
]
```

Use default prompts:
```json
[
  "このスクショの全台を設定判別して",
  "PIA大船の店舗傾向を見せて",
  "この店のPREと過去比較を見せて",
  "この店の分析は最新？"
]
```

- [ ] **Step 4: Rewrite the Skill around intent routing**

Keep the existing screenshot extraction rules and evidence separation, but add a compact routing section exactly mapping:
```text
current Juggler judgement -> judge_machines
store resolution -> list_stores
saved dates -> get_store_days
saved day -> get_store_day
store tendencies -> get_store_analysis
analysis freshness -> get_store_status
analysis audit/history -> get_store_analysis_history
active PRE/store-read -> get_store_prediction
PRE/current evaluation -> get_store_comparison
```
State that tool outputs are authoritative and that the Skill must not reproduce JUGEST probability tables, PRE formulas, store-analysis heuristics, or model internals.

- [ ] **Step 5: Broaden `agents/openai.yaml` without weakening implicit live judgement**

Use:
```yaml
interface:
  display_name: "JUGEST Analysis"
  short_description: "Route Juggler and store analysis requests to JUGEST"
  default_prompt: "JUGESTでこのデータを分析して"

policy:
  allow_implicit_invocation: true
```

- [ ] **Step 6: Run Plugin-package tests**

```bash
cd vps && node --test tests/jugest-plugin-package.test.mjs
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/jugest vps/tests/jugest-plugin-package.test.mjs
git commit -m "feat: broaden JUGEST plugin to full analysis frontend"
```

---

### Task 6: Full verification and release-readiness gate

**Files:**
- Verify: all changed files
- Do not modify production behavior unless a failing regression proves a defect introduced by Tasks 1-5.

**Interfaces:**
- Produces: a reviewable branch ready for PR; no production merge/deploy in this task.

- [ ] **Step 1: Run targeted MCP and Plugin tests**

```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs tests/store-access.test.mjs tests/jugest-plugin-package.test.mjs tests/juggler-external-judge.test.mjs
```
Expected: PASS.

- [ ] **Step 2: Run the complete VPS suite**

```bash
cd vps && npm test
```
Expected: every test PASS.

- [ ] **Step 3: Run the root regression suite**

```bash
cd .. && npm test
```
Expected: every root regression command PASS.

- [ ] **Step 4: Verify the protected surfaces were not changed**

Run:
```bash
git diff --name-only 911221ddd4cab92d345729ca619c7c6d645370be...HEAD
```
Expected changed implementation/package files are limited to:
```text
vps/src/mcp-handler.mjs
vps/tests/mcp-api.test.mjs
plugins/jugest/plugin.json
plugins/jugest/skills/jugest-live-analysis/SKILL.md
plugins/jugest/skills/jugest-live-analysis/agents/openai.yaml
vps/tests/jugest-plugin-package.test.mjs
docs/superpowers/specs/2026-09-22-jugest-plugin-full-frontend-design.md
docs/superpowers/plans/2026-09-22-jugest-plugin-full-frontend.md
```
If any judgement, PRE model, ranking, calibration, store-share, model-registry, Collector mutation, or deploy-control file appears unexpectedly, stop and review before proceeding.

- [ ] **Step 5: Run whitespace/diff validation**

```bash
git diff --check 911221ddd4cab92d345729ca619c7c6d645370be...HEAD
```
Expected: no output.

- [ ] **Step 6: Inspect tool discovery manually**

Start the test server through the existing MCP test fixture or a local disposable server and verify `tools/list` contains exactly nine tools in the intended order, with `judge_machines` no-auth and all store tools `oauth2`/`jugest:read`, `readOnlyHint:true`, `openWorldHint:false`.

- [ ] **Step 7: Prepare PR summary**

PR summary must state:
```text
- Added get_store_analysis, get_store_status, get_store_analysis_history.
- Kept JUGEST.net authoritative; Plugin only routes intents.
- Preserved judgement math and PRE/store-read separation.
- Preserved OAuth, assistant read-key, legacy Receiver, and store authorization behavior.
- No admin/deploy/credential/backfill/resource controls exposed.
- Full VPS/root regressions and git diff --check pass.
```

- [ ] **Step 8: Commit any final test-only fixes, then stop before production deployment**

No merge to `deploy/vps` and no VPS production switch until Hiro explicitly approves the reviewed implementation/PR.
