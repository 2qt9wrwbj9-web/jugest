---
name: jugest-live-analysis
description: Use JUGEST as the authoritative analysis backend for supported current-machine Juggler judgement and authorized JUGEST store analysis. Invoke it automatically for readable Juggler judgement screenshots even when the user does not mention JUGEST, and use the relevant store tools when the user asks for saved data, tendencies, PRE, status, history, or comparisons.
---

Use the live `jugest` MCP tools as the authoritative calculation and data source. The Plugin is a routing layer; JUGEST.net owns calculation logic, data, models, and analysis semantics.

## Implicit invocation rule

When a supported Juggler machine is being evaluated from current data, prefer JUGEST automatically even if the user does not mention JUGEST. This includes short requests such as `判別して`, `設定どう`, or `これどう` when the surrounding message or screenshot contains enough readable current-machine data.

For みんレポ/min-repo and similar pachislot data-site screenshots, route readable Juggler rows to `judge_machines`. Do not invoke JUGEST for generic pachislot questions that are not a supported JUGEST analysis intent.

## Intent-to-tool routing

- Current Juggler setting judgement or readable Juggler screenshot data → `judge_machines`
- Resolve an authorized store name → `list_stores`
- Ask which saved dates exist → `get_store_days`
- Read one saved business day → `get_store_day`
- Ask for store tendencies, allocation tendencies, machine/position patterns, or positive/negative store signals → `get_store_analysis`
- Ask whether store analysis is current, pending, or unavailable → `get_store_status`
- Ask for bounded analysis audit/history → `get_store_analysis_history`
- Ask for active PRE/store-read prediction → `get_store_prediction`
- Ask for PRE/current accuracy, legacy comparison, or historical walk-forward evaluation → `get_store_comparison`

## Current-machine judgement safety

- For current-machine setting judgement, extract only readable table number, model, games, BB, RB, and `diff` values and call `judge_machines` once with the readable batch.
- If `diff` is unreadable, omit it; never guess numeric values. If required games/BB/RB/model values are unreadable, exclude that row rather than inventing them.
- Do not reproduce or approximate JUGEST posterior math yourself.
- Keep screenshot extraction uncertainty separate from JUGEST calculation uncertainty.

## Evidence separation

A known store does not authorize mixing PRE/store tendencies into the current-machine posterior. Store identity by itself is not permission to alter `judge_machines` results with PRE, history, or allocation tendencies.

If the user requests both current judgement and store context, call both relevant tools and present them as separate evidence unless JUGEST exposes an approved purpose-built combined tool in the future.

## Store-data behavior

- Use `list_stores` when the user's store name must be resolved to an authorized `storeId`.
- Never infer access to a store that JUGEST does not return.
- Treat tool output as authoritative for JUGEST calculations and saved data.
- Never invent probabilities, PRE results, store records, dates, tendencies, status, or history when a tool is unavailable or returns an error.
- For broad store-analysis questions, prefer `get_store_analysis`; do not reconstruct store tendencies locally from raw saved days unless the user explicitly asks for the raw day data itself.

## Thin-Plugin rule

Never embed or reproduce JUGEST probability tables, PRE formulas, ranking formulas, store-analysis heuristics, or model internals in the Plugin Skill. Route the intent to the live tool and let JUGEST.net execute its current implementation.

Keep tool names and required inputs as the stable public contract. New additive output fields from JUGEST.net may be used when relevant without freezing those fields as permanent Plugin logic.
