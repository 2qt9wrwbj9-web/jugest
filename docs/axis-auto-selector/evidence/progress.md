# SDD ledger — plan: docs/superpowers/plans/2026-09-08-axis-auto-selector.md

Start: astra/axis-auto-selector-shadow @ a128347bdc2e0e9b41b327e18d4c3755a112b5d4. Existing checkout clean; switched only to user's requested branch. Base 273ed61. No new worktree, no deployment.

## Preflight interface scan

| Tasks | Producer / consumer | Finding |
| --- | --- | --- |
| 1 | baseline fixture / live VM assertions | Documentation SHA 61fd208 is an ancestor; current requested HEAD is a128347. Capture before feature files. |
| 2 | registry / row adapter | Exact signal mapping, null availability, calendar unapproved. |
| 3 | sample validation / utility | Need separate frozen prediction receipt and outcome attachment; metadata assertion alone is not a PIT builder. |
| 4 | train search / later guards | Holdout must not tune shrinkage or eligible axes. |
| 5 | profile schema / stale validator | Need trained-through and prediction target enforcement, not only source signature. |
| 6 | profile / latest rows | Latest prediction must be strictly later than all profile evaluation dates. Never back-apply latest profile. |
| 7 | source runtime / parity | No runtime import or changes; additive tests only. |
| 1,3 | legacy utility fixture / evaluator | utility ranking is unclamped sum + Japanese numeric key tie-break; visible ranking uses clamped score and different tie-break. Keep both distinct. |
| 1,7 | current prediction fixture / live before-after parity | Must cover real generated rows and nonempty stored profile state. |
| 2,3 | mapped row / scoring | Keep outcomes out of prediction receipt, preserve fixed bonus once. |
| 2,4 | approved registry / search | Alias source dedup and group caps apply also after shrinkage. |
| 2,5 | axis version / profile validator | Changed approval/version invalidates. |
| 2,6 | row contributions / audit | Exact original axes; no new protected formulas. |
| 3,4 | chronological samples / train selector | Raw candidate train-only; validation gates/shrink then frozen final holdout weights. |
| 3,5 | signature / persisted profile | Data identity includes observations for staleness, prediction hash excludes unrevealed outcomes. |
| 3,6 | PIT builder / orchestration | Callbacks see cloned frozen <target history; normalized external provenance remains caller trust boundary. |
| 4,5 | accepted weights / profile | Explicit CONTROL no-adoption with auditable reasons. |
| 4,6 | selected profile / historical audit | Historical predictions require prefix-only state, never global latest weights. |
| 5,6 | file persistence / CLI | Unique temporary file + atomic rename; preserve other stores; no browser storage use. |
| 2–6,7 | new modules / commands | Add one combined test command after focused suites pass. |

Ruling: Keep the requested existing feature branch checkout rather than create another worktree — it is clean and no concurrent work is present — cost if wrong is workspace contention; no other editor is dispatched concurrently.
Ruling: Treat 61fd208 in plan as documentation ancestor, a128347 as implementation start and 273ed61 as runtime base — verified git ancestry — cost if wrong is baseline misidentification, checked by runtime hashes.
Ruling: Preserve utility and visible ranking as separate behavioral controls — actual code differs in clamping and tie-break — cost if wrong is misleading metric parity; tests must cover both.
Ruling: Do not copy legacy holdout-based shrink timing. Shadow shrink is frozen using train/validation only before final holdout — user's leakage rule is authoritative — cost if wrong is different research candidate, never current ranking.
Ruling: Add PIT receipt/provenance helpers within the planned adapter/evaluator boundary — sample trainingCutoff alone cannot demonstrate freeze-before-outcome — cost if wrong is a stricter input contract, documented for CLI.
Ruling: Use unique sibling temporary files for profile persistence rather than one shared path.tmp — avoid colliding concurrent writers — cost if wrong is more temporary files on crash; no shared browser state.

Task 1: in progress.

2026-09-08 resume: main273ed61 verified, feature HEAD a128347. Partial helper/generator completed without starting over. Previous worker unavailable after quota, resumed with axis_baseline_resume.
Task 1: complete (commits a128347..c4a5f22, review clean by axis_baseline_review; parity3/3, preservation3/3). Fixture SHA d33aabb650494a7f8d51e7d5be706c7680b9c152259019c4714a91362ee69cf0. Host ICU collation sensitivity documented, not a new defect.
Task 2: in progress (base c4a5f22).
