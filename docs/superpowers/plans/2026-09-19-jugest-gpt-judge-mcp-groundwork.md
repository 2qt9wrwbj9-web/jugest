# JUGEST GPT Judge / MCP Groundwork Implementation Plan

> **Baseline:** `deploy/vps` @ `afe2c50a441468b296f887282df5f616f16fa769` (JUGEST v6.0.2)

**Goal:** Expose JUGEST's existing external-data Juggler setting discrimination as an authenticated, stateless VPS batch interface that a future ChatGPT MCP tool can call, while preserving current browser judgement math exactly.

**Architecture:** Extract a server-side pure Juggler external-judge module that mirrors the protected browser `externalJudge()` / `reverseCore()` path. The endpoint accepts observed machine data only and returns posterior P1-P6, expected setting, P4+/P5+/P6 and reverse-difference diagnostics. It must not consult PRE v2, store-read, store history, or any store prior. The existing Collector channel authentication remains the authorization boundary. After the HTTP interface is proven, expose it through a small MCP tool without changing the judgement math.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing JUGEST VPS HTTP server and SQLite auth store.

## Non-negotiable constraints

- Preserve current Juggler `externalJudge()` semantics exactly.
- `diff` present: use the current `reverse-diff` path with play-style likelihood mixture.
- `diff` absent: use the current `bonus-only` fallback.
- Default judgement is based only on the supplied current machine observations.
- Store name / store ID must never silently mix PRE v2 or store tendencies into the setting posterior.
- The first release is Juggler-only (`my`, `im`, `go`, `fk`, `hp`, `gg`, `mr`, `um`).
- No persistence of submitted live/screenshot data.
- No production deployment without Hiro's explicit approval.

### Task 1: Characterize current browser judgement math

**Files:**
- Create: `vps/tests/juggler-external-judge.test.mjs`
- Create later: `vps/src/judge/juggler-external-judge.mjs`

1. Add fixed reference vectors covering bonus-only and reverse-diff paths.
2. Cover ordinary 50/50 unknown-style mixing and Happy/Mister 45/45/10 mixing.
3. Cover all eight Juggler keys at least once.
4. Run tests and confirm RED because the server module does not yet exist.
5. Implement the pure module with the exact existing constants and equations.
6. Run tests and confirm GREEN.

### Task 2: Add authenticated stateless batch HTTP endpoint

**Files:**
- Modify: `vps/src/analytics-handler.mjs`
- Create: `vps/tests/judge-api.test.mjs`

Endpoint: `POST /api/vps/judge/machines`

Request shape:
```json
{
  "machines": [
    {"tableNo":"101","machine":"my","games":5230,"bb":24,"rb":18,"diff":1200}
  ]
}
```

Response preserves input order and returns one result per row. It does not rank or apply store context.

1. Add API tests first: auth required, POST allowed only on judge route, malformed payload rejected, batch output correct, omitted diff falls back to bonus-only, existing analytics routes remain read-only.
2. Run tests and confirm RED.
3. Add minimal POST branch to `analytics-handler.mjs`, reusing current Collector receiver authentication.
4. Keep all existing GET/HEAD route behavior unchanged.
5. Run API tests and full VPS test suite.

### Task 3: Prepare MCP surface

**Files:**
- To be chosen after confirming current OpenAI MCP/plugin specification.

1. Re-check current official OpenAI MCP/plugin documentation before coding the transport.
2. Expose a small read/compute-only tool surface, initially centered on `judge_machines` plus existing store-read tools.
3. Describe `judge_machines` so ChatGPT extracts screenshot values and calls JUGEST rather than calculating posterior probabilities itself.
4. Explicitly state that PRE/store tendencies are separate tools and are not automatically incorporated into setting judgement.
5. Add tool-level tests/contract checks where practical.

### Task 4: Verification and handoff

1. Run focused judge tests.
2. Run full `vps` test suite.
3. Inspect diff against `afe2c50...` for accidental judgement/auth changes.
4. Report branch/commit/test evidence.
5. Stop before any production deployment and ask Hiro for explicit approval.
