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
- Do not expand the HTTP assistant-key whitelist in this project; the new capabilities are exposed through MCP.
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

- [ ] **Step 1: Extend the MCP fixture**

Add near the existing constants:
```js
const ANALYSIS_VERSION='vps-runtime-v1';
```

Seed before `db.close()`:
```js
const analysis={shop:'認証店舗',from:'2026-09-01',latest:'2026-09-18',days:18,rowCount:18,machines:[],positive:[],negative:[],patterns:[],machinePatterns:[]};
db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-analysis-default',ANALYSIS_VERSION,'2026-09-18',canonicalJson(analysis),hashCanonical(analysis),now);
```

Return `canonicalDbPath` from `fixture()` so the missing-snapshot and pending-status cases can mutate only disposable test state:
```js
return {base,canonicalDbPath,legacyAuth,assistantAuth,post,async close(){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})}};
```

- [ ] **Step 2: Write the failing contract assertions**

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

const db=openDatabase(f.canonicalDbPath);
db.prepare(`DELETE FROM client_snapshots WHERE store_id=? AND snapshot_type='store-analysis-default' AND version=?`).run('store-a',ANALYSIS_VERSION);
db.close();
const missingAnalysis=await (await f.post('tools/call',{name:'get_store_analysis',arguments:{storeId:'store-a'}}, {}, oauth)).json();
assert.equal(missingAnalysis.result.isError,false);
assert.equal(missingAnalysis.result.structuredContent.analysis,null);
```

- [ ] **Step 3: Run the targeted test and verify RED**

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
  description:'Read the current user-facing JUGEST store analysis for an authorized store, including tendency and pattern sections produced by JUGEST.net. This does not modify data or change setting judgement.',
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

```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs
```
Expected: analysis assertions PASS; failures remain only for status/history tools that are not implemented yet.

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

- [ ] **Step 1: Seed the analyzed status snapshot**

Add before `db.close()`:
```js
const status={status:'analyzed',generation:2,completedGeneration:2,businessDate:'2026-09-18'};
db.prepare(`INSERT INTO client_snapshots(store_id,snapshot_type,version,business_date,payload_json,payload_hash,updated_at) VALUES(?,?,?,?,?,?,?)`).run('store-a','store-latest-status',ANALYSIS_VERSION,'2026-09-18',canonicalJson(status),hashCanonical(status),now);
```

- [ ] **Step 2: Write analyzed and pending fallback assertions**

Add:
```js
const statusResult=await (await f.post('tools/call',{name:'get_store_status',arguments:{storeId:'store-a'}}, {}, oauth)).json();
assert.equal(statusResult.result.structuredContent.status.status,'analyzed');
assert.equal(statusResult.result.structuredContent.businessDate,'2026-09-18');
assert.equal('resources' in statusResult.result.structuredContent,false);

const db=openDatabase(f.canonicalDbPath);
db.prepare(`DELETE FROM client_snapshots WHERE store_id=? AND snapshot_type='store-latest-status' AND version=?`).run('store-a',ANALYSIS_VERSION);
db.prepare(`INSERT INTO analysis_refresh_state(store_id,analysis_version,generation,completed_generation,active_job_id,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(store_id,analysis_version) DO UPDATE SET generation=excluded.generation,completed_generation=excluded.completed_generation,active_job_id=excluded.active_job_id,updated_at=excluded.updated_at`).run('store-a',ANALYSIS_VERSION,3,2,null,'2026-09-19T00:00:00.000Z');
db.close();
const pendingResult=await (await f.post('tools/call',{name:'get_store_status',arguments:{storeId:'store-a'}}, {}, oauth)).json();
assert.deepEqual(pendingResult.result.structuredContent.status,{status:'pending',generation:3,completedGeneration:2});
assert.equal(pendingResult.result.structuredContent.updatedAt,'2026-09-19T00:00:00.000Z');
```

- [ ] **Step 3: Run targeted tests and verify RED**

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

```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs
```
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

Insert two receipts:
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

```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs
```
Expected: FAIL because `get_store_analysis_history` is not implemented.

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

```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test tests/mcp-api.test.mjs
```
Expected: PASS for the core MCP feature tests.

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

Inside the OAuth test, add:
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

Because Task 2 mutates disposable state in the OAuth test, place the analyzed-status legacy assertion in a fresh fixture/test or restore the `store-latest-status` snapshot before this assertion.

- [ ] **Step 4: Pin `judge_machines` semantic parity**

Keep these assertions unchanged:
```js
assert.equal(output.judgeVersion,'external-juggler-browser-parity-v1');
assert.equal(output.machines[0].method,'reverse-diff');
assert.ok(Math.abs(output.machines[0].expectedSetting-3.6317261654375623)<1e-11);
assert.equal('pre' in output,false);
assert.equal('storeRead' in output,false);
assert.equal('store' in output,false);
```

- [ ] **Step 5: Pin PIA policy behavior explicitly**

Run:
```bash
cd vps && node --test tests/store-access.test.mjs
```
Expected: owner mode allows only configured owner channels and fails closed; public mode exposes only explicit public-native metadata.

The standard MCP fixture continues to run with `JUGEST_PIA_ACCESS_MODE=public`; do not infer production owner-only behavior from that fixture.

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

### Task 5: Broaden the Plugin to the JUGEST analysis frontend

**Files:**
- Modify: `plugins/jugest/plugin.json`
- Modify: `plugins/jugest/skills/jugest-live-analysis/SKILL.md`
- Modify: `plugins/jugest/skills/jugest-live-analysis/agents/openai.yaml`
- Modify: `vps/tests/jugest-plugin-package.test.mjs`

**Interfaces:**
- Consumes: the nine stable MCP tools.
- Produces: Plugin metadata and routing instructions that map user intent to JUGEST tools without embedding JUGEST calculation logic.

- [ ] **Step 1: Write failing Plugin-package tests**

Change the version assertion and add exactly:
```js
assert.equal(manifest.version,'0.2.0');
assert.match(manifest.description,/JUGEST.*analysis/i);
assert.ok(manifest.extensions['com.openai'].interface.capabilities.includes('Read store tendency analysis'));
assert.ok(manifest.extensions['com.openai'].interface.capabilities.includes('Read PRE and comparison data'));

const skill=await read('skills/jugest-live-analysis/SKILL.md');
for(const tool of ['get_store_analysis','get_store_status','get_store_analysis_history'])assert.match(skill,new RegExp('`'+tool+'`'));
assert.match(skill,/intent.*tool|tool.*intent/i);
assert.doesNotMatch(skill,/probability tables|PRE formulas|ranking formulas/i);
```

Keep the existing assertions that `.app.json` points to `asdk_app_6aae6ef520dc8191af6ccfa59395524d`, no `mcp.json` exists, implicit Juggler invocation remains enabled, and current judgement stays separate from PRE/store-read.

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

Set interface fields to:
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
],
"defaultPrompt": [
  "このスクショの全台を設定判別して",
  "PIA大船の店舗傾向を見せて",
  "この店のPREと過去比較を見せて",
  "この店の分析は最新？"
]
```

- [ ] **Step 4: Replace the Skill with intent-first routing while preserving live judgement rules**

The resulting Skill must contain this routing table verbatim:
```markdown
## Intent-to-tool routing

- Current Juggler setting judgement or readable Juggler screenshot data → `judge_machines`
- Resolve an authorized store name → `list_stores`
- Ask which saved dates exist → `get_store_days`
- Read one saved business day → `get_store_day`
- Ask for store tendencies, allocation tendencies, machine/position patterns, positive/negative store signals → `get_store_analysis`
- Ask whether store analysis is current, pending, or unavailable → `get_store_status`
- Ask for bounded analysis audit/history → `get_store_analysis_history`
- Ask for active PRE/store-read prediction → `get_store_prediction`
- Ask for PRE/current accuracy, legacy comparison, or historical walk-forward evaluation → `get_store_comparison`
```

The Skill must also retain these rules:
```markdown
- For current-machine setting judgement, extract only readable table/model/G/BB/RB/diff values and call `judge_machines` once with the readable batch.
- If `diff` is unreadable, omit it; never guess numeric values.
- Do not reproduce or approximate JUGEST posterior math yourself.
- A known store does not authorize mixing PRE/store tendencies into the current-machine posterior.
- If the user requests both current judgement and store context, call both relevant tools and present them as separate evidence unless JUGEST exposes an approved combined tool.
- Treat tool output as authoritative for JUGEST calculations and saved data.
- Never embed or reproduce JUGEST probability tables, PRE formulas, ranking formulas, store-analysis heuristics, or model internals in the Plugin Skill.
- Do not invoke JUGEST for generic pachislot questions that are not a supported JUGEST analysis intent.
```

- [ ] **Step 5: Broaden `agents/openai.yaml` without weakening implicit live judgement**

Replace it with:
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
- Verify: all changed files.
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

- [ ] **Step 4: Verify protected surfaces were not changed**

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

- [ ] **Step 6: Re-run only the MCP discovery contract**

```bash
cd vps && JUGEST_PIA_ACCESS_MODE=public node --test --test-name-pattern="MCP tool list exposes" tests/mcp-api.test.mjs
```
Expected: PASS with exactly nine tools, `judge_machines` using `noauth`, and all store tools using OAuth `jugest:read`, `readOnlyHint:true`, `openWorldHint:false`.

- [ ] **Step 7: Prepare the PR summary**

Use:
```text
- Added get_store_analysis, get_store_status, get_store_analysis_history.
- Kept JUGEST.net authoritative; Plugin only routes intents.
- Preserved judgement math and PRE/store-read separation.
- Preserved OAuth, assistant read-key, legacy Receiver, and store authorization behavior.
- No admin/deploy/credential/backfill/resource controls exposed.
- Full VPS/root regressions and git diff --check pass.
```

- [ ] **Step 8: Stop before production deployment**

No merge to `deploy/vps` and no VPS production switch until Hiro explicitly approves the reviewed implementation/PR.
