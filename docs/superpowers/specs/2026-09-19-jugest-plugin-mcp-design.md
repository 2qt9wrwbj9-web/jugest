# JUGEST MCP Plugin Bridge Design

## Goal

Expose JUGEST v6.0.2 to ChatGPT through a small, read-only MCP surface without duplicating protected judgement math or mixing store-read/PRE signals into live machine judgement.

## Product behavior

The primary live-use workflow is:

1. The user provides one or more data-site screenshots to ChatGPT.
2. ChatGPT extracts machine number, JUGEST machine key/name, games, BB, RB, and difference when visible.
3. ChatGPT calls one JUGEST batch judgement tool.
4. JUGEST performs all setting-probability computation with the existing protected runtime.
5. ChatGPT presents per-machine posterior q, expected setting, P4+, P5+, P6, method, warnings, and optionally sorts the returned rows for presentation.

Live judgement is based on the machine's observed data. Store name or store context MUST NOT automatically alter the posterior. PRE v2/store-read data is exposed through separate read tools and may be shown alongside live judgement only when requested or clearly labeled as separate context.

## Architecture

### Exact judgement reuse

`vps/src/analysis/runtime-adapter.mjs` already boots the production browser runtime in a Node VM. Add `runExistingMachineJudgement()` there. It MUST reuse the runtime's existing protected judgement path rather than reimplement probability tables, reverse-difference inference, or posterior math.

The production browser's internal `externalJudge()` function is not exported on the VM global. Therefore the server adapter constructs one synthetic in-memory store day, imports it through the existing `JUGEST_CORE_BRIDGE.previewExternalJson()` / `saveExternalJsonPreview()` path, and reads the judged rows through `JUGEST_CORE_BRIDGE.getStoreDay()`. A parity test compares the resulting posterior with the existing protected store-day judgement path.

Input rows:

```js
{
  machineNo?: string,
  machine: string,
  games: number,
  bb: number,
  rb: number,
  diff?: number | null
}
```

Output rows:

```js
{
  machineNo: string | null,
  machine: string,
  machineName: string,
  games: number,
  bb: number,
  rb: number,
  diff: number | null,
  q: number[6],
  expectedSetting: number,
  p4: number,
  p5: number,
  p6: number,
  method: string,
  estimatedGrape: number | null,
  estimatedGrapeCount: number | null,
  grapeCountLo: number | null,
  grapeCountHi: number | null,
  reverseWarn: boolean
}
```

The first release supports Juggler keys only (`my`, `im`, `go`, `fk`, `hp`, `gg`, `mr`, `um`). HANA can be added later through the same runtime contract after the screenshot workflow is validated.

### MCP endpoint

Add `POST /mcp` to the existing Node HTTP server. Keep the implementation dependency-free so the current VPS deployment/install behavior is unchanged.

The endpoint implements the stateless Streamable HTTP JSON-RPC subset needed by the ChatGPT connection:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

Responses use JSON when the client accepts JSON. No server-initiated notifications, resources, prompts, SSE stream, or UI are required in v1.

### MCP tools

Initial tools:

- `judge_machines`: batch live judgement using observed machine data only.
- `list_stores`: existing authorized VPS store list.
- `get_store_days`: existing authorized day index.
- `get_store_day`: existing authorized stored machine-day data.
- `get_store_read`: existing authorized PRE/store-read snapshot.
- `get_store_comparison`: existing authorized PRE-vs-legacy/current historical comparison.

Store tools MUST reuse the current analytics handler contract instead of copying SQL/query semantics.

### Authentication

The first release targets Hiro's private/single-user connection. It reuses the same JUGEST receiver credentials as `/api/vps`.

Accepted private credential forms:

1. Existing headers: `Authorization: Bearer <receiverToken>` plus `x-jugest-channel-id: <channelId>`.
2. Optional packed bearer form for a client that can supply one secret: `Authorization: Bearer <channelId>:<receiverToken>`.

For packed credentials, the MCP layer reconstructs the two existing analytics headers before invoking the current analytics handler. No new credential store or database table is added.

This receiver-token scheme is intentionally scoped to the private/personal deployment. It is **not** the final authentication design for a generally published or multi-user ChatGPT Plugin. Before such distribution, implement the MCP authorization profile with OAuth 2.1, protected-resource metadata, token validation, scopes, and the required authentication challenge flow.

### Store API reuse

The MCP handler creates/reuses `createAnalyticsHandler()` and invokes it in-process with a small synthetic request/response adapter for GET paths. This keeps authentication, store scoping, response formats, and audit behavior in one implementation.

### Safety and limits

- MCP v1 is read-only.
- `judge_machines` accepts at most 200 rows per call.
- No PRE/store prior is combined into the judgement posterior.
- Invalid machine keys, non-finite inputs, negative counts, BB+RB > games, and malformed dates produce structured tool errors.
- Tool descriptions explicitly tell the model that screenshots are parsed by ChatGPT but probability calculation belongs to JUGEST.
- On a production-configured server, `judge_machines` performs the same receiver-auth gate used by the existing analytics scope before running the headless judgement.

## Deployment boundary

Implementation, tests, branch commits, and a draft PR may be prepared without production deployment. Merging/promoting to `deploy/vps` or restarting production requires explicit approval from Hiro immediately before that action.
