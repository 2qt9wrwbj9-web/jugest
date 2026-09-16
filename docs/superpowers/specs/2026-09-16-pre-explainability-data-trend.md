# PRE Explainability + Store Data/Trend Spec

## Goal
Ship a bounded production update that makes PRE predictions auditable and adds requested store-level/machine-level data summaries without changing protected prediction or judgment semantics.

## PRE comparison / prediction requirements
- Keep PRE ranking, model search, scoring, Quality formula, outcome proxy, protected JUGEST judgment math, strict Champion/calibration/store constraints, and current-shadow ranking unchanged.
- Show human-readable exclusion reasons for every historical/LIVE comparison row that is excluded.
- Preserve raw exclusion codes in audit/debug information.
- PRE prediction rows must expose an audit-only explanation derived from the already-selected model/axes; explanation must not feed back into score or rank.
- Show a 0–100 display-only aim index, a 0–100 display-only confidence, independent evidence-family count, matched evidence count, and evidence details.
- Avoid counting duplicate/overlapping predicates as multiple independent reasons; collapse evidence by an underlying-fact family key before counting.

## Store data requirements
- On the selected-date 台データ screen, show overall total diff, average diff, and aggregate actual payout rate before the table list.
- Below the overall summary, show per-machine total diff, average diff, aggregate actual payout rate, and average expected setting.
- Aggregate actual payout rate uses `100 * (1 + totalDiff / (3 * totalGames))`, using only rows with finite observed diff and positive games.
- Existing per-table rows remain; no per-table payout-rate field is added.

## Trend requirements
- Keep the existing per-table average-setting/confidence ranking unchanged.
- Add per-machine period summaries with average expected setting and aggregate actual payout rate.
- Do not add per-table average payout rate.

## Safety / release
- Use TDD: add failing regression tests before implementation.
- Full root + VPS test suites must pass.
- Production deployment is explicitly authorized for this task after verification.
