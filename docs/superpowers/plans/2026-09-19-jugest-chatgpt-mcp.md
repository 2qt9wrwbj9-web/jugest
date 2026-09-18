# JUGEST ChatGPT MCP Implementation Plan

Date: 2026-09-19
Design: `docs/superpowers/specs/2026-09-19-jugest-chatgpt-mcp-design.md`
Baseline: JUGEST v6.0.2 `afe2c50a441468b296f887282df5f616f16fa769`

## Task 1 — Protected batch judgment adapter

Files:
- modify `vps/src/analysis/runtime-adapter.mjs`
- add/modify `vps/tests/analysis-runtime.test.mjs`

TDD:
1. Add tests for a new `runExistingMachineJudgementBatch` export.
2. Verify RED because export/behavior does not exist.
3. Implement the smallest adapter that boots the current runtime once and calls `ctx.V4_TEST.externalJudge`.
4. Validate 1–200 rows, preserve valid rows when another row is invalid, and compute expected setting/P4/P5/P6 strictly from `q`.
5. Verify GREEN and existing analysis-runtime tests.

## Task 2 — MCP tool service independent of transport

Files:
- add `vps/src/mcp/tools.mjs`
- add `vps/tests/mcp-tools.test.mjs`

TDD:
1. Add failing tests for `judge_machines` dispatch and schema-level validation.
2. Implement a transport-agnostic tool registry/dispatcher.
3. Ensure `judge_machines` only calls observed-data judgment; no store/PRE inputs are accepted.
4. Add read-only store tool adapters using existing owner-scoped JUGEST data/API boundaries.

## Task 3 — MCP Streamable HTTP transport

Files:
- add MCP transport module under `vps/src/mcp/`
- integrate or mount `/mcp` through the VPS web entry point with minimal coupling
- add transport tests
- update `vps/package.json` only if the official MCP SDK is required

TDD:
1. Test initialization/tool listing/tool call behavior before implementation.
2. Test unsupported methods/content types and bounded request body behavior.
3. Implement Streamable HTTP using the official MCP SDK rather than a homemade protocol when dependency verification is available.
4. Do not expose private JUGEST data without an authenticated production boundary.

## Task 4 — Store read tools

Tools:
- `list_stores`
- `get_store_day`
- `get_store_read`
- `get_store_comparison`

Requirements:
- reuse existing channel/store ownership authorization
- read-only
- no arbitrary SQL
- no PRE fusion into `judge_machines`

## Task 5 — Plugin/skill package

Files (exact location to follow current OpenAI plugin packaging requirements):
- skill instructions
- plugin MCP dependency manifest/config

Instructions must explicitly say:
- screenshots are parsed by ChatGPT vision
- call `judge_machines` with structured rows
- default judgment is observed-only
- store/PRE calls are separate and never silently blended
- report ambiguous screenshot digits/rows rather than inventing values

## Task 6 — Verification

Run fresh:
- focused judgment tests
- MCP tool tests
- MCP transport tests
- full `cd vps && npm test`
- root regression suite if production source files outside `vps/` change

Review the git diff to confirm protected browser judgment math/probability tables are unchanged.

## Task 7 — Pre-deploy checkpoint

Stop before any production merge/deploy. Report:
- branch/commit(s)
- test evidence
- changed files
- unresolved production OAuth/network configuration

Only deploy after Hiro explicitly approves.
