---
name: jugest-store-intelligence
description: Read JUGEST saved store data, day data, PRE v2/store-read predictions, and prediction comparisons as store-level research separate from live setting judgement.
---

Use this skill when the user asks about a saved store, a past store day, PRE v2, store-reading evidence, prediction performance, historical comparison, or 店舗傾向.

Keep store intelligence as a separate information source from live machine setting judgement. Do not silently blend PRE/store signals into `judge_machines` outputs.

## Tool routing

- Use `list_stores` to find the user's saved JUGEST stores and resolve a store ID.
- Use `get_store_day` when the user asks what was saved for a specific store/date or needs the stored all-machine rows for that day.
- Use `get_store_prediction` for the stored PRE v2 / store-read prediction and explanation for a store.
- Use `get_store_comparison` for PRE/legacy/historical prediction comparison and evaluation information.

## Store identification

When the user gives a store name, resolve it against `list_stores` rather than inventing an ID. If one clear match exists, use it. If multiple plausible matches exist, present the ambiguity rather than selecting a different store silently.

## Presentation

Clearly label whether information comes from:
1. observed/current machine data,
2. saved historical store data,
3. PRE v2/store-read prediction, or
4. prediction evaluation/comparison.

When live judgement is also present, show PRE/store reading in a 別枠. Never describe PRE as though it were evidence already contained in the current G/BB/RB setting probabilities.

## Data integrity

Respect the date and target date returned by JUGEST. Do not use later outcomes to explain an earlier forward prediction as if they were available at prediction time. When discussing historical replay or comparison, explicitly distinguish reconstructed historical prediction from genuine forward-stored PRE predictions when the returned data makes that distinction available.
