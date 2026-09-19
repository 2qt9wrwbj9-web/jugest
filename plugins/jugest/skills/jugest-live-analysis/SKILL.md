---
name: jugest-live-analysis
description: Automatically use JUGEST when the user wants Juggler setting judgement from current-machine data or a data-site screenshot, including みんレポ/min-repo style screenshots, even if the user does not mention JUGEST. Also use JUGEST for saved store days, PRE/store prediction, or prediction comparisons when those are explicitly requested.
---

Use the `jugest` MCP tools as the authoritative calculation/data source for JUGEST workflows.

## Implicit invocation rule

When a supported Juggler machine is being evaluated from current data, prefer JUGEST automatically even if the user does not mention JUGEST. This includes short requests such as `判別して`, `設定どう`, `これどう`, or similar wording when the surrounding message or screenshot contains enough current-machine data to judge.

For みんレポ/min-repo and similar pachislot data-site screenshots, if the user asks for setting judgement or an evaluation of the shown Juggler machines, route the readable rows to `judge_machines` instead of calculating a local posterior yourself.

For generic pachislot questions that are not asking for current-machine Juggler setting judgement, do not invoke JUGEST merely because a Juggler model is mentioned.

## Current-machine setting judgement

1. When the user supplies a data-site screenshot, extract each visible table number, Juggler model, games, BB, RB, and coin difference (`diff`) when reliably readable.
2. Map supported models to JUGEST keys: `my`=マイジャグラーV, `im`=ネオアイムジャグラー, `go`=ゴーゴージャグラー3, `fk`=ファンキージャグラー2, `hp`=ハッピージャグラーVⅢ, `gg`=ジャグラーガールズSS, `mr`=ミスタージャグラー, `um`=ウルトラミラクルジャグラー.
3. Do not guess unreadable numeric values. If `diff` is unreadable, omit it so JUGEST deliberately uses its bonus-only fallback. If G/BB/RB or the model is unreadable for a row, exclude that row from the batch and tell the user which row could not be judged.
4. Call `judge_machines` once with all readable machines. Do not reproduce or approximate JUGEST posterior math yourself.
5. Present the returned JUGEST results. For fast live use, prioritize table number, expected setting, P4+, and the setting 1-6 posterior. Sort only when the user asks for ranking or when ranking clearly helps the live decision; do not alter the underlying probabilities.

### Critical separation rule

Current-machine setting judgement is based on the observed current machine data supplied to `judge_machines`.

A known store name or store ID does **not** authorize mixing PRE v2, store tendencies, historical allocation, or store-read scores into the setting posterior. Do not call `get_store_prediction` merely because the store is known.

Use store prediction/history only when the user explicitly asks for store reading, PRE, tendencies, historical comparison, or an explicitly combined assessment. When both are requested, report current-machine judgement and store-read information as separate evidence unless the user explicitly asks for a combined model supported by JUGEST.

## Saved JUGEST store data

1. Use `list_stores` to resolve a store name to its authorized `storeId` when necessary.
2. Use `get_store_days` to see which saved dates exist.
3. Use `get_store_day` for per-machine data on a specific saved business date.
4. Use `get_store_prediction` only for PRE/store-read prediction context.
5. Use `get_store_comparison` for PRE/legacy live and historical evaluation metrics.
6. Never infer access to stores that the tools do not return.

## Reliability

- Treat tool output as the source of truth for JUGEST calculations and saved data.
- Never invent a JUGEST probability, PRE result, saved date, or store record when a tool is unavailable or returns an error.
- Keep screenshot extraction uncertainty separate from JUGEST calculation uncertainty.
- For live play, prefer one batch tool call over many single-machine calls.
