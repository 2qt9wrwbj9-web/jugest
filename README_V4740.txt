JUGGLER / HANA HANA TOOL v4.7.4 — LAZY EXECUTION / UI PERFORMANCE PASS

v4.7.4 is a performance-only follow-up to v4.7.3. It keeps the same judgement, single-evidence, strict Champion, ranking, HANA hard-constraint and relay mathematics, but moves expensive work out of startup/category navigation and into explicit user operations.

Main changes
------------
- Startup no longer re-judges the full imported external database. The compact IndexedDB rows are unpacked in ~1200-table chunks with event-loop yields; derived q/ES/P4 values are calculated only when a feature actually needs them.
- External flat-row views are cached and invalidated only when underlying external data/judgement changes.
- Pages are lazy-rendered. Hidden categories are not rendered/precomputed at boot, and revisiting a clean page reuses the existing DOM/result instead of rebuilding it.
- Global autosave now prefers requestIdleCallback (1200ms deadline) with a 450ms fallback instead of serializing state ~40ms after ordinary clicks. pagehide/beforeunload still save immediately.
- Today Plan calculates only the selected store on explicit 「作戦を計算」. The former all-store behavior is retained as an explicit 「全店舗比較（明示実行・重い）」 option.
- Store Trend no longer recalculates for every filter change. Filters can be set first, then 「表示を更新」 performs the selected calculation. Rendering starts at 60 tables × 30 dates and can expand rows/dates on demand.
- Model Performance no longer calculates merely by entering the category or selecting the only store. 「性能を計算」 is explicit.
- Store Digital Twin / lifecycle and model answer checking no longer precompute merely because their category was opened. Heavy work is triggered by the relevant explicit operation.
- External import history initially renders 36 days without forcing 36 days of setting judgement. Raw G/diff summaries appear immediately; 「表示中を判別」 computes expected-setting summaries when requested. More history remains accessible in 36-day increments.
- Single-evidence result DOM starts with a bounded number of positive/negative cards and expands on demand. All evidence remains in the analysis result; this changes rendering only.
- Next-day target preparation, v4.7.1 caches/bounded history, v4.7.3 relay readiness hotfix and BOOKMARKLET_v4500 compatibility are retained.

What did NOT change
-------------------
- Juggler externalJudge formulas and posterior q/P4/P5/P6.
- HANA judgement formulas and hard constraints.
- v4.7.0 single-condition catalog, thresholds, evidence shrink, family de-duplication and practical ranking mathematics.
- Strict P4+/Champion gates, calibration, store-share constraint, move-comparison safety gates.
- Relay protocol/ACK behavior, Launcher acquisition/parser, 30 accesses / trailing 30 minutes limiter.
- Launcher VERSION 4.5.0 / PARSER_VERSION 4500 and BOOKMARKLET_v4500.

Expected UX effect
------------------
The biggest guaranteed structural change is that a ~180-day / ~52k-table store database is no longer fully re-judged during app startup. Heavy store prediction or 2/3-condition exploration can still be expensive when the user explicitly requests it; v4.7.4 is intended to stop those jobs from blocking unrelated startup/navigation.

Device performance must still be checked on the target iPhone/Safari; Node timings are not used as an iPhone speed guarantee.
