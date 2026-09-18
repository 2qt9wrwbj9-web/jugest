# JUGEST ChatGPT MCP Design

Date: 2026-09-19
Baseline: `deploy/vps` at `afe2c50a441468b296f887282df5f616f16fa769` (JUGEST v6.0.2)

## Goal

Expose a small, read-only JUGEST MCP surface for ChatGPT so Hiro can:

1. paste screenshots from public data sites,
2. let ChatGPT vision extract machine rows,
3. send the structured rows to JUGEST in one batch,
4. receive the same setting posterior that the existing JUGEST judgment engine would produce,
5. separately inspect saved store data / PRE v2 / historical comparisons when explicitly requested.

The first release is private/single-user oriented. Multi-user identity mapping is out of scope for v1, but the tool/service boundary must not prevent adding it later.

## Non-negotiable judgment policy

The default judgment is **observed-data first**.

- G / BB / RB / optional difference and other explicitly supplied machine observations are the judgment evidence.
- A store name being present does **not** automatically inject PRE v2, store tendencies, historical ranking, or any other store prior into setting judgment.
- PRE/store-read data remains a separate tool/result path.
- Any future fusion of observed judgment and store prior must be explicit and auditable; it is not part of this v1.

This protects interpretation and avoids accidental evidence double counting.

## Architecture

### Image extraction

ChatGPT vision handles screenshot-to-structured-row extraction. JUGEST does not implement OCR/image upload in v1.

Expected normalized row shape:

```json
{
  "tableNo": "412",
  "machine": "my",
  "games": 5230,
  "bb": 24,
  "rb": 18,
  "diff": 850
}
```

`diff` is optional. Machine may initially be supplied as a JUGEST key; name resolution can accept known display aliases conservatively.

### Judgment source of truth

Do not copy probability tables or reimplement formulas.

The VPS already boots the real browser JUGEST runtime through `vps/src/analysis/runtime-adapter.mjs`. The runtime exposes the protected existing judgment function at `V4_TEST.externalJudge`.

The new batch service will boot that runtime once per batch and call the existing function for every row. Derived display metrics (expected setting, P4+, P5+, P6) are calculated directly from the returned six-setting posterior `q`.

### MCP surface

Keep the tool count small.

Primary tool:

- `judge_machines` — observed-data-only batch judgment, including a one-row batch for a single machine.

Read-only store tools:

- `list_stores`
- `get_store_day`
- `get_store_read`
- `get_store_comparison`

The store tools reuse existing authenticated JUGEST data boundaries rather than granting arbitrary database access.

## `judge_machines` behavior

Input:

- 1–200 rows per call.
- Each row: optional `tableNo`, required known machine, `games > 0`, `bb >= 0`, `rb >= 0`, optional finite `diff`.
- Reject impossible `bb + rb > games`.
- Unknown machines produce a per-row validation error; one bad row must not discard otherwise valid screenshot rows.

Output per valid row:

- normalized `tableNo`
- normalized machine key and display name
- normalized input
- `q` (six-setting posterior)
- `expectedSetting`
- `p4`
- `p5`
- `p6`
- existing JUGEST judgment `method`
- reverse-estimation fields/warning when the current engine supplies them

Batch output also includes counts for accepted/rejected rows. Ordering preserves input order; conversational ranking is primarily ChatGPT's responsibility.

## Store/PRE separation

`judge_machines` has no store identifier and cannot read PRE/store data. This is deliberate.

When Hiro asks for store reading, ChatGPT calls a store-data tool separately and may present the two sections side by side. It must not claim that PRE changed the setting posterior unless a later explicit fusion feature exists.

## Security

- No arbitrary SQL, path, or URL inputs.
- No write/mutation tools in v1.
- Store data remains owner-scoped.
- Public production MCP must use an authentication method supported by ChatGPT for customer-specific data before exposure.
- Secrets are never returned in tool results or audit logs.
- Production deployment requires Hiro's explicit approval.

## Performance

- Boot the headless JUGEST runtime once per `judge_machines` batch, not once per machine.
- Cap v1 batches at 200 machines.
- No store analysis/PRE computation occurs inside observed judgment.

## Required regression guarantees

1. For the same machine key and observed values, MCP judgment must match current `V4_TEST.externalJudge` exactly for posterior `q` and engine method.
2. Derived expected setting/P4+/P5+/P6 must be deterministic functions of that returned `q`.
3. Difference-present and difference-absent paths both preserve existing JUGEST behavior.
4. Existing browser judgment, store analysis, PRE v2 and historical comparison math are not modified.
5. Partial batch validation does not discard valid rows.

## Out of scope for v1

- iPhone/local run-record sync into ChatGPT.
- OCR inside JUGEST.
- Automatic store-prior fusion.
- Setting-math changes or probability-table changes.
- Write actions.
- General multi-user account lifecycle.
