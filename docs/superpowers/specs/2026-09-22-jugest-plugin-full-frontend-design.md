# JUGEST Plugin Full Frontend Design

Date: 2026-09-22
Status: Approved by Hiro
Baseline: `deploy/vps` at `911221ddd4cab92d345729ca619c7c6d645370be`

## 1. Intent

JUGEST Plugin becomes the ChatGPT-facing frontend for JUGEST rather than a second implementation of JUGEST logic.

The authoritative product remains JUGEST.net and its VPS services, canonical database, PRE/store-read engine, setting-judgement runtime, and future analysis engines.

The Plugin should primarily decide **which stable JUGEST tool to call for a user intent**. It must not duplicate calculation logic, probability tables, PRE logic, store-analysis logic, or data ownership rules.

Success means JUGEST.net can evolve rapidly while the public Plugin remains thin and stable. Existing MCP tool contracts remain backward-compatible wherever practical, so server-side upgrades are picked up automatically by the same Plugin calls.

## 2. Design principles

1. **Thin Plugin, thick JUGEST.net.** Product logic lives server-side.
2. **Intent-level tools, not UI/API mirroring.** MCP tools represent user goals, not internal screen structure.
3. **Stable public contracts.** Tool names and required inputs are treated as public interfaces.
4. **Server-side evolution.** Internal algorithms, models, payload detail, and data freshness may improve without Plugin releases when contracts remain compatible.
5. **No hidden evidence mixing.** Current-machine judgement remains separate from PRE/store tendencies unless JUGEST explicitly provides a combined model and the user requests it.
6. **Least privilege.** Public Plugin exposes user-facing functions only; operational/admin functions remain private.

## 3. Current baseline

The current Plugin package already binds the registered ChatGPT App through `.app.json` and deliberately does not bundle a desktop-only `mcp.json`.

Current MCP tools:

- `judge_machines`
- `list_stores`
- `get_store_days`
- `get_store_day`
- `get_store_prediction`
- `get_store_comparison`

Current JUGEST.net analytics already exposes additional user-facing data not yet represented as MCP tools, including default store analysis, analysis status, and analysis receipt/history data.

The assistant/PRE read-only credential is already accepted by MCP store tools and resolves the owning Collector channel server-side. OAuth remains the normal account connection path for public Plugin use.

## 4. Public Plugin scope

The Plugin should expose all **user-facing JUGEST analysis capabilities** that make sense in conversational use.

Included categories:

- current-machine Juggler setting judgement
- authorized store discovery
- saved business dates and day-level machine data
- store tendency / store analysis
- PRE/store-read prediction
- PRE/current comparison and historical walk-forward evaluation
- analysis freshness / status
- useful user-facing analysis history

Excluded categories:

- VPS deploy/restart/control
- Collector mutation or credential management
- assistant key generation/revocation
- device backfill and ingestion administration
- raw artifact paths or internal filesystem state
- system resource telemetry intended for operators
- model registry mutation, promotion controls, or other research-admin actions

These remain JUGEST administrative capabilities, not public Plugin capabilities.

## 5. Recommended tool surface

Keep all current tools and add high-level read tools only where a distinct user intent exists.

### Existing stable tools

`judge_machines`
: Judge one or more supported current Juggler machines from observed machine data. This remains isolated from store/PRE evidence.

`list_stores`
: Resolve stores available to the authenticated user.

`get_store_days`
: List saved valid business dates for one store.

`get_store_day`
: Read saved per-machine data for one store/date.

`get_store_prediction`
: Read active PRE/store-read output.

`get_store_comparison`
: Read live and historical PRE/current comparison metrics.

### New high-level tools

`get_store_analysis`
: Read the current user-facing store-analysis snapshot. It should expose the same analysis concepts JUGEST.net uses for store tendencies, machine patterns, positive/negative signals, and future compatible analysis sections without binding the Plugin to UI markup.

`get_store_status`
: Read analysis freshness and processing state for one store so ChatGPT can distinguish ready, pending, stale/unavailable, and latest analyzed dates.

`get_store_analysis_history`
: Read bounded user-facing analysis history/receipts for one store. Return audit-friendly metadata only, never raw paths or secrets.

These tools are intentionally broad enough that server-side analysis can improve without creating one MCP tool per chart, tab, or filter.

## 6. Contract stability policy

Public MCP tools are a compatibility boundary.

For an existing public tool:

- keep the tool name stable;
- do not remove or rename required input fields without a migration path;
- prefer adding optional inputs over changing existing semantics;
- prefer additive output fields over removing or repurposing existing fields;
- keep existing machine/store identifiers stable where feasible;
- document intentional breaking changes as a new tool or explicit versioned contract.

Internal implementation may change freely: PRE versions, ranking engines, feature generation, probability tables, analysis algorithms, storage schema, caching, and calculation performance are server concerns as long as the public contract still means the same thing.

This is the mechanism that lets Plugin routing remain stable while JUGEST.net keeps advancing.

## 7. Plugin routing responsibilities

The Plugin skill should describe intent-to-tool routing, not reproduce JUGEST domain logic.

Examples:

- current Juggler setting judgement or readable screenshot data → `judge_machines`
- store lookup → `list_stores`
- saved day availability → `get_store_days`
- one historical business day → `get_store_day`
- store tendencies / allocation tendencies → `get_store_analysis`
- active PRE / store-read → `get_store_prediction`
- PRE accuracy / legacy comparison / historical walk-forward → `get_store_comparison`
- whether analysis is ready/current → `get_store_status`
- bounded audit/history request → `get_store_analysis_history`

The skill should avoid embedding probability tables, PRE formulas, model versions, store-analysis heuristics, or a hardcoded copy of the product's internal feature taxonomy.

Machine model mapping may remain only where the model must translate screenshot text into the stable `judge_machines` machine key. Long term, machine support should be discoverable from the live tool schema where practical.

## 8. Evidence separation

The current separation rule remains mandatory.

`judge_machines` answers the posterior from observed current-machine data only.

Store identity alone does not authorize PRE/store history to alter that posterior. If the user asks for both current-machine judgement and store context, ChatGPT may call both relevant tools but must present them as separate evidence unless JUGEST.net exposes a purpose-built combined model/tool in the future.

This preserves the existing v4.x/JUGEST judgement philosophy and prevents double counting.

## 9. Authentication and authorization

Public Plugin use should use the existing OAuth path and `jugest:read` scope for user-facing read tools.

The dedicated `jugest_read_...` credential remains a developer/assistant read-only path. It should continue to resolve the owning Collector channel server-side and should never grant more store access than the corresponding authenticated owner context.

Existing Collector Receiver credentials remain supported for compatibility but are not the public Plugin UX.

Authorization continues to be enforced by JUGEST.net. The Plugin must never infer that a store is accessible just because the user names it.

## 10. Server-side evolution rules

Changes that should normally require **no Plugin package release**:

- improved setting-judgement math behind `judge_machines` while preserving semantics;
- PRE/store-read model upgrades behind `get_store_prediction`;
- additional fields or sections in `get_store_analysis`;
- fresher canonical data or new data sources;
- performance, caching, storage, and internal schema changes;
- richer comparison metrics added additively to `get_store_comparison`.

Changes that may require MCP schema review but should still avoid a Plugin package release when possible:

- new optional tool inputs;
- additive output schema fields;
- a genuinely new high-level MCP tool for a new user intent.

Changes that require a Plugin package update:

- changing Plugin metadata, description, capabilities, or default prompts;
- changing skill routing/instructions materially;
- adding/removing packaged skills or other Plugin files.

## 11. Testing strategy

Implementation must preserve the existing protected behavior and add explicit coverage for the expanded public surface.

Required tests:

- MCP tool-list contract includes the existing tools plus the three new high-level tools;
- every new tool is read-only and closed-world;
- OAuth, assistant read key, and legacy Receiver auth preserve current authorization boundaries;
- cross-channel private stores remain forbidden;
- PIA access follows the configured production access policy rather than test-environment assumptions;
- `get_store_analysis` returns the current store-analysis snapshot without raw artifact paths or secrets;
- `get_store_status` reports the current analysis state without exposing operator-only resource telemetry;
- `get_store_analysis_history` is bounded and redacts internal paths/secrets;
- `judge_machines` outputs remain byte/semantic compatible with the protected judgement path;
- no new tool changes PRE score/rank, strict Champion, calibration, store-share constraints, or judgement probabilities.

Run the targeted MCP/plugin suites, the complete VPS suite, root regression suite, and `git diff --check` before merge.

## 12. Plugin package changes

The Plugin description and skill should be broadened from "Juggler screenshot judgement plus some PRE reads" to "JUGEST analysis frontend" while retaining strong implicit routing for supported live Juggler judgement.

The skill should organize routing by user intent and refer to live JUGEST tools by purpose. It should not freeze today's internal feature names as permanent product truth.

The registered ChatGPT App binding remains the existing `.app.json` App ID. Do not add a bundled `mcp.json` unless the deployment model itself changes intentionally.

Plugin metadata should continue to describe only capabilities actually available through the registered App/MCP server.

## 13. Rollout

Phase 1 expands the MCP surface to cover the user-facing capabilities that already exist in JUGEST.net today.

Phase 2 updates Plugin metadata and skill routing so ChatGPT can use those tools naturally from conversational requests.

Phase 3 runs App/Plugin review readiness checks and prepares the published Plugin package without changing JUGEST judgement or PRE behavior.

Future JUGEST.net features should first be evaluated against the existing high-level tool contracts. Add a new MCP tool only when the user intent is genuinely distinct and cannot be represented cleanly by an additive extension to an existing contract.

## 14. Success criteria

The design is successful when:

1. ChatGPT can reach every current user-facing JUGEST analysis capability through stable high-level tools.
2. A normal JUGEST.net algorithm/model update does not require a Plugin package update.
3. New server-side analysis fields can appear additively without breaking old callers.
4. Public Plugin use cannot reach operational/admin-only functions.
5. Current-machine judgement remains mathematically and semantically unchanged by the Plugin expansion.
6. PRE/store-read remains a separate evidence source unless JUGEST later introduces an explicitly approved combined model.
7. The Plugin package stays small enough that its primary long-term responsibility is routing, not product logic.

## 15. Explicit non-goals for this project

- redesigning PRE v2 or changing its promotion/evaluation math;
- changing setting probability tables or current-machine judgement math;
- exposing Collector administration to public Plugin users;
- reproducing JUGEST.net UI screens inside ChatGPT;
- making Plugin code the source of truth for JUGEST feature logic.

Any future change that alters judgement mathematics, ranking/model search, evidence combination, strict Champion, calibration, or store-share behavior remains a separate design decision requiring Hiro's approval.
