JUGGLER / HANA HANA TOOL v4.7.1 — PERFORMANCE MAINTENANCE
Date: 2026-08-25

Purpose
-------
v4.7.1 is a performance-only follow-up to v4.7.0 for large imported shop histories such as ~177 days / ~50k table-days.
The goal is to reduce UI stalls, repeated CPU work and steady-state memory pressure without changing the statistical or judgement result.

What was optimized
------------------
1. Date/history preparation
- Repeated date shifts, calendar metadata and scope/block metadata are cached/reused.
- Each row builds one bounded prior-history window and derives its 2/5/7/14-day features from that window instead of repeatedly walking the same prior dates.

2. Single-condition evidence engine
- Condition emission is streamed instead of allocating a full temporary condition-object array for every row.
- Immutable condition metadata is reused.
- Store-wide and machine-specific grouping share the same traversal where possible.
- After analysis completes, the full feature-packed historical row matrix is released; the UI retains compact analysis results, machine summaries and forecast aggregates instead.

3. Next-day forecast
- Long-run evidence is learned from the full selected analysis period as before.
- To create the target day's raw history features, only the latest 35 calendar days are rebuilt because the longest active target-side single-evidence lookback is 30 days.
- Candidate tables no longer each rescan the entire full-period row matrix for recent store/machine baselines.

4. v4 feature fitting
- Common machine/global baseline aggregates are reused across repeated feature fits on the same chronological split.
- Parsed cross-feature parts are cached instead of repeatedly splitting the same feature names.

Unchanged on purpose
--------------------
- externalJudge / Juggler judgement mathematics
- HANA HANA judgement mathematics and hard constraints
- single-condition catalog, thresholds, evidence families and score/shrink rules
- strict FDR / Champion gates
- strict P4+, calibration and store-share adjustment
- move-comparison safety gate
- 2-day short-term / 5,7,14-day medium-long design
- acquisition/parser logic
- Launcher VERSION 4.5.0 / PARSER_VERSION 4500
- BOOKMARKLET_v4500 and 30 accesses / trailing 30 minutes limiter

Validation philosophy
---------------------
A dedicated v4.7.1 regression loads the untouched v4.7.0 app and v4.7.1 side by side on the same synthetic historical dataset, runs the same v4 prediction, and requires the prediction/ranking snapshot to be identical. Timing is printed for information only and is not a pass/fail threshold because runtime varies by environment.

Remaining intentionally untouched performance areas
----------------------------------------------------
- Opening Today Plan for many stores can still be expensive because it synchronously evaluates multiple stores.
- Optional 2/3-condition exhaustive analysis remains inherently heavier than the recommended single-condition mode.
Changing those would affect UI behavior/architecture or analysis scope, so v4.7.1 deliberately stops before those trade-offs.
