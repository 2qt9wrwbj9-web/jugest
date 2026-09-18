# JUGEST MCP Plugin Guide

## Purpose

JUGEST exposes a private read-only MCP endpoint for ChatGPT so the assistant can:

- judge Juggler machines from observed current data,
- read authorized JUGEST store/day data,
- read PRE/store-read snapshots separately,
- read PRE/current historical comparison evidence separately.

The live setting posterior is **observed-data-first**. Store name, PRE, store trends, and historical prediction context do not automatically modify `judge_machines` results.

## Endpoint

After production deployment, the MCP endpoint is:

```text
https://jugest.net/mcp
```

Transport is Streamable HTTP JSON-RPC. The current implementation is stateless and supports:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

## Authentication

JUGEST reuses the existing receiver credentials. Do not commit real credentials to Git.

### Existing two-header form

```text
x-jugest-channel-id: <channelId>
Authorization: Bearer <receiverToken>
```

### Packed bearer form

For a client that can provide one bearer secret:

```text
Authorization: Bearer <channelId>:<receiverToken>
```

The MCP layer expands this internally and delegates authentication/store scoping to the existing `/api/vps` analytics handler.

`initialize`, `ping`, and `tools/list` do not expose private data. In a production-configured server, `judge_machines` and store tools require valid receiver authentication.

## Tools

### `judge_machines`

Batch live setting judgement for up to 200 Juggler rows.

Supported initial machine keys:

```text
my im go fk hp gg mr um
```

Input:

```json
{
  "machines": [
    {
      "machineNo": "101",
      "machine": "my",
      "games": 5230,
      "bb": 24,
      "rb": 18,
      "diff": 850
    }
  ]
}
```

`diff` is optional. If it is absent, JUGEST uses its existing bonus-only path. If it is present, JUGEST uses the existing protected runtime path, including the current reverse-inference behavior where applicable.

The MCP implementation does not copy Juggler probability tables. It boots the existing JUGEST runtime, imports a synthetic in-memory day, and reads the protected judgement result through `JUGEST_CORE_BRIDGE`.

Output includes:

- normalized machine input,
- six-setting posterior `q`,
- `expectedSetting`,
- `p4`, `p5`, `p6`,
- judgement method,
- reverse-inference metadata where available,
- warning state.

### `list_stores`

Lists stores visible to the authenticated JUGEST receiver channel.

### `get_store_days`

Reads available canonical dates for one store. `limit` is bounded to 1–366.

### `get_store_day`

Reads one canonical store day, including stored machine data.

### `get_store_read`

Reads the active PRE/store-read snapshot. This is **separate store-reading context** and must not silently alter the posterior from `judge_machines`.

### `get_store_comparison`

Reads PRE/current and historical comparison evidence. `limit` is bounded to 1–366. This is research/evaluation context, not live setting evidence.

## Screenshot workflow

Recommended ChatGPT behavior:

```text
User uploads data-site screenshot(s)
  ↓
ChatGPT vision extracts:
  machine number / machine / games / BB / RB / diff when visible
  ↓
ChatGPT calls judge_machines once for the batch
  ↓
JUGEST returns protected posterior values
  ↓
ChatGPT presents the result, optionally sorted for readability
```

Important rules:

1. Image understanding is ChatGPT's job; setting probability calculation is JUGEST's job.
2. Never invent an unreadable screenshot value. Flag uncertain cells and ask for a clearer crop only when the uncertainty materially changes the judgement.
3. A store name alone does not authorize mixing PRE/store context into the live posterior.
4. If the user asks for store-reading context, call `get_store_read` separately and label it separately.
5. If the user asks how PRE has performed, use `get_store_comparison` separately.

## Example MCP messages

Initialize:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {"name": "example", "version": "1"}
  }
}
```

List tools:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

Judge a batch:

```json
{
  "jsonrpc":"2.0",
  "id":3,
  "method":"tools/call",
  "params":{
    "name":"judge_machines",
    "arguments":{
      "machines":[
        {"machineNo":"101","machine":"my","games":5230,"bb":24,"rb":18,"diff":850}
      ]
    }
  }
}
```

Read PRE separately:

```json
{
  "jsonrpc":"2.0",
  "id":4,
  "method":"tools/call",
  "params":{
    "name":"get_store_read",
    "arguments":{"storeId":"<storeId>"}
  }
}
```

## ChatGPT plugin packaging

The JUGEST server side should be deployed and verified first. Then create the ChatGPT plugin/Skill configuration that points to the stable HTTPS MCP endpoint and teaches ChatGPT the tool-use rules above.

The Skill should explicitly enforce:

- `judge_machines` is the default for live screenshot judgement,
- live posterior uses observed data only,
- store/PRE tools are separate contextual reads,
- do not reproduce JUGEST probability math in the model,
- prefer one batch call instead of one tool call per machine.

## Production boundary

Creating this code, running tests, and preparing a review branch/PR does not deploy it. Production requires an explicit approval immediately before merging/promoting to `deploy/vps` or restarting the production service.
