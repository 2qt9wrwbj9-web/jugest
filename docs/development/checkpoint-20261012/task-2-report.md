# Task 2 implementation report

Status: DONE — ready for independent UI/code review and root's full-suite/browser validation.

- Work branch: `work/parallel-group-judge-20261010`.
- Approved production baseline: `f728b2587a9bdd81541ccb50d3ae802a8492486a`.
- Task 2 UI product commit: `b70149eb2604c0a9aec8f3c38a8c3de55709d16a`.
- Task 2 start/review base: `f95d012`; subsequent root-owned validation commits were present before this product commit.
- Task 1 group engine: `45b1a8f7faa3baafb9f8ba50bfaf3af5391b9c15`, consumed without edits.
- Read `AGENTS.md`, the full design specification, task-2 brief, task-2 extra ownership/interface instructions and task-1 report before implementation.
- No subagents, network mutations, push, merge, production deployment, production restart, production data writes, protected engine changes, or root-owned test/doc edits were performed.

## Owned committed files

1. `app-v510.js` — input-only draft persistence, validated reload, group report lifecycle and controls, duplication, result sorting integration, persistence failure notice.
2. `app-v510.css` — dense two-line mobile rows, 44px row controls, compact result bands and group-report styles within the authorized independent judgement style block.
3. `judgement-view.js` — dense row editor, duplication controls, stable sorting of result presentation, ordinary six-setting probability band, accessible P4+/P5+/P6 explanations.
4. `group-judge-view.js` — new frozen, pure display API `JUGESTGroupJudgeView.render(report,{hypothesis='all456'})`.
5. `index.html` — script tags only: load the group engine and group display after the existing judgement modules.
6. `build.mjs` — file list only: include the two new modules in the browser build.
7. `tests/helpers/runtime.mjs` — module list only: load the shared group modules in the headless runtime.
8. `vps/src/analysis/runtime-adapter.mjs` — loader list only: load the shared group modules; no judgement adapter logic or response changes.
9. `tests/commands.json` — additive checks/tests only: group engine/display syntax, group math tests, parallel UI tests, root-owned baseline regression and fixed-seed simulation scripts. SciPy is not a product/runtime dependency or default test-suite dependency.
10. `tests/parallel-group-ui.mjs` — new focused UI/state/render tests.
11. `tests/helpers/judgement-preservation.mjs` — pin the reviewed independent UI/style block hashes; exact, counted source restorations for the bounded storage constructor/load/persist/change additions and exact group-loader removal anchors. Original protected production/math fixtures and hashes remain unchanged.

This working report is intentionally left in the existing ignored task-record area, following root's handoff instruction. Root owns the tracked formal validation report and browser evidence.

## Implemented behavior

The editor shows each row as two aligned lines: identity/machine/duplicate/delete, then G/BB/RB/difference. Every number input and machine selector uses 16px text; duplicate/delete controls are 44×44px. Thin dividers, restrained cards and the existing probability palette keep the display consistent with the single judgement screen. The editor retains `data-observed-field`, `data-observed-row` and `data-observed-card` attributes. Addition, deletion and bulk judgement actions and labels remain available. A duplicate is inserted immediately after its source with a fresh row id, blank table number, copied draft fields, no result and no copied errors.

Drafts are written only to the existing `jugest:v510:ui` entry as `observedDrafts:{version:1,single,rows}`. Input fields become strings and preserve explicit `0`, negative difference and empty difference. Only inputs and UI preferences are saved; result objects, diagnostics, errors and group reports are never cached. Reload validates the schema and field types, generates fresh unique ids, restores supported drafts and leaves every individual result and the group report null. Unknown versions and malformed data are ignored. Normal older mode/debug/UI fields keep their meanings. Read/write payloads are bounded at 2 MiB, draft restoration at 1,000 rows, and individual stored field text at 2,048 characters; 200-row restoration is explicitly tested. A real storage exception/unavailable storage/oversize write sets a short unsaved-input notice, patches its existing DOM in place, and clears the notice after a successful write. Normal saves add no visible warning.

Editing a field changes its draft and persists it, clears that row's result/errors, removes that row's result DOM and the whole group report, and retains the other rows' individual results. It never calls the full render method while typing. The input node, focus, caret and scroll position can therefore survive ordinary edits. Adding, deleting, duplicating and imports also invalidate the group result. Bulk judgement uses the exact existing individual adapter, then analyzes the complete nonempty set only when the group switch is enabled. Any nonempty invalid or unjudged row blocks the whole group with a compact Japanese error. Blank rows are skipped; duplicate nonblank table numbers and engine limits remain engine errors and are not silently filtered out.

The new switch has `data-observed-group-toggle` and `role="switch"`. Switching on can analyze current cached complete results, and switching off clears the report; neither rejudges individuals nor mutates their q. Result sort selector values are `input`, `tableNo`, `expectedSetting`, `p4`, `p5`, `p6`. Sorting operates on a copied list, preserves stable ties and leaves draft order and row ids unchanged. The normal individual result, grape estimate, six-setting band, details, settings/debug screen, history and back actions remain intact. Allocation selector values are `all456`, `all56`, `all6`. Sorting, allocation changes, details and returning to the list only display cached results; they do not invoke either judgement engine.

The pure group report shows aggregate G/BB/RB and observed rates, all three hypotheses' two evidence ratios and refutation states, and the most incompatible row. Difference totals are explicitly either complete or the known sum for `x/n` entered rows; missing differences are not zero-filled. Labels distinguish `既存モデルの根拠比` from `ボーナスだけの根拠比`, each hypothesis from its own complement, and root-model approximation from bonus-only comparisons. A short initial explanation says evidence is a ratio rather than an event probability, uses equal setting weights, and says no refutation is no proof. Full ratio mechanics, nesting and dependent evidence explanation are in a disclosure.

Ratios format from their logs; extreme ratios use powers of ten and impossible support receives words rather than leaking `Infinity` or numerical-underflow zero. Refutation derives its label from `logFamilyP < log(.05)` and formats tiny p values from their retained logarithms. The selected conditional block prominently says `仮説成立時・等重みの条件付き推定`. It shows expected setting counts and the top three count profiles, with the remaining upper-eight profiles in a disclosure. Profiles longer than 12 machines use compact setting counts instead of up to 60 repeated digits. Conditional row distributions and per-row argmax assignments are separately disclosed and explained as distinct from the most likely unordered profile. Unsupported conditional output shows its reason rather than fake zero certainty. Weight sensitivity, refutation mechanics/limits, homogeneous same-setting bonus-only aggregate judgement and full warnings are disclosures. Low exposure/machine mixing and reverse-warning counts appear compactly; 60 row warnings do not create 60 initial warning paragraphs. All row text, warnings and errors are escaped; long table numbers are bounded/wrapped or ellipsized by their display context.

## TDD and focused verification

1. Added `tests/parallel-group-ui.mjs` before implementation. Initial `node --test tests/parallel-group-ui.mjs` failed 0/10 because `group-judge-view.js` did not exist (exit 1).
2. Implemented the display, state lifecycle, persistence, row editor and loaders. Initial functional pass was 9/10; the remaining new test had attempted to require a result-sort control before judging any results. Its setup was corrected to bulk-judge before asserting result-only controls; no old test or expectation was weakened.
3. Added the real storage-failure test before its implementation. The suite showed 10 pass / 1 fail because the previous silent catch did not report unsaved state. Implemented the in-place notice and obtained 11/11.
4. `node --check app-v510.js` and `node --check group-judge-view.js`: passed.
5. `node --test tests/parallel-group-ui.mjs tests/judgement-page.mjs tests/judgement-factor-spectrum.mjs tests/production-preservation.mjs`: **38/38 passed**, no skipped/cancelled tests.
6. `node tests/collector-preservation.mjs`: **PASS**, 20 original protected production hashes and five byte-exact clean jitter files, namespace/diagnostic exclusion checks unchanged.
7. `node tests/group-judge-regression.mjs`: **1,024/1,024 full existing individual outputs exactly equal** to the approved baseline across eight machines, including nonfinite/undefined values preserved by root's strengthened comparison.
8. `node tests/group-judge-simulation.mjs`: **PASS**, fixed seed `0x20261010`, seven scenarios × 400 trials, root's two weak-row examples, and observed public-data cases. This was root's independent test script, not a changed product calculation or claim of calibrated accuracy.
9. `node --test vps/tests/judgement-page.test.mjs vps/tests/judge-single-source.test.mjs`: **9/9 passed**, all eight browser/bridge/public MCP equivalences intact.
10. `node build.mjs`: **PASS** after the final product changes. Both group files are delivered; existing source-patch anchors/build transforms remain intact. The existing focused test also boots the VPS-patched index and checks its observed adapter.
11. `git diff --check` and `git diff --cached --check`: **PASS**. Index was empty before staging; the product commit staged exactly the eleven owned files above. Root's modified browser test was not staged.

The tests cover input reload/zero retention, single/parallel mutation persistence, storage failure, unsupported/malformed/oversized saved data, 200 rows and unique ids, duplicate clearing, stable sorting, no rejudge during display, unchanged q on group mode switches, invalid/missing/unjudged-row group blocking, blank-row omission, duplicate-number error, selective edit invalidation without full render, display purity/escaping, extreme log ratios and tiny p, unavailable conditionals, 60-row compact profiles and stable browser-control attributes. Existing tests cover all eight individual machines, exact summaries, diagnostics in one invocation, side-effect isolation, details/grape/debug/history/back preservation and production/source-patch compatibility.

Root reported a separate initial Chromium 153 / VPS-patched 320/375/390 run passing all operations, geometry/font/touch targets, focus/scroll and escaping with zero page errors. At the report handoff, root reported Chromium built and patched six scenarios complete and WebKit validation in progress. These browser/full-suite runs are root-owned and their final results should be cited from root's formal validation report; this task does not claim that unfinished work as complete.

## Self-review, limits and remaining root work

No unresolved issue identified in the owned implementation. The explicit storage bounds above are intentional robustness limits and unsupported/invalid restored drafts do not partially resurrect results. Sorting is a result presentation control and appears only after there are results. Group analysis remains limited to 2–60 machines while ordinary parallel drafts can exceed that size. A saved switch restores its preference, but reload always requires judgement before any group report exists.

The renderer never changes the group engine's math or captured individual outputs. Approximate difference evidence, assumed setting weights, selection/stopping limits, lack of event priors and non-proof of nonrejection remain visible design limitations. Full root/VPS test suites, all 12 Chromium/WebKit × built/VPS-patched × 320/375/390 scenarios, independent UI/code review, final validation documentation and development-branch remote save are root-owned remaining handoff work. Production was not changed.

## Independent review correction round 1

Fix commit: `205e390afce28a530b2d8ae54b8c196319ff3b62` on the same development branch. Owned fix files: `app-v510.js`, `tests/helpers/judgement-preservation.mjs`, `tests/parallel-group-ui.mjs`, `vps/src/analysis/runtime-adapter.mjs` only. Root's browser-test changes were not staged. This section supersedes the initial report's storage-bound completeness and VPS-loader conclusions.

Independent review found an important save/restore boundary mismatch: the first UI implementation could successfully write a payload containing a 2,049-character field or 1,001 rows although reload rejected that payload wholesale. That was a real input-loss bug. `observedDraftError(drafts)` now validates the versioned schema, row count, every row/field's supported type and field length in one place shared by save and restore. Save checks that validator before `localStorage.setItem`, and rejected writes leave the last valid payload byte-for-byte intact. Live drafts are never truncated, removed or replaced. The existing in-place failure notice now identifies the overlong field, excessive row count, payload size or actual storage-write problem; field/row failures are not described as merely a quota problem. Returning to valid input saves all current edits, clears the failure state and restores normally on reload.

Root's full VPS suite also found an important compatibility regression: adding the group modules to the traditional headless analysis loader made a minimal existing legacy-plan fixture return HTTP 500. Group modules are unnecessary for that runtime; they remain available in the browser tags/shared test runtime and for direct Node consumption. The loader additions were removed. The entire `vps/src/analysis/runtime-adapter.mjs` is now byte-exact to the approved baseline, including its original EOF. No existing fixture or test expectation was changed.

TDD evidence:

- Added two tests before the persistence fix. `node --test --test-name-pattern='one overlong|1001 drafts' tests/parallel-group-ui.mjs` failed **0/2**, specifically because both unreloadable saves incorrectly reported `persistenceFailed:false`.
- The tests now verify 200 valid rows with one 2,049-character field, unchanged last valid save during repeated/render-time attempts, intact live field text, exact restoration of the prior 200 rows, accumulated unsaved edits retained after successful recovery, and the 1,000/1,001-row boundary with complete restoration after returning to the limit. The same focused command now passes **2/2**.
- Ran the unchanged existing `node --test --test-name-pattern='legacy-plan endpoint' vps/tests/analytics-api.test.mjs` before removing the loader additions: **0/1**, HTTP **500 instead of 200**. The exact same test after correction passes **1/1**, HTTP 200.

Final correction-round checks:

- `node --check app-v510.js`: PASS.
- `node --test tests/parallel-group-ui.mjs tests/judgement-page.mjs tests/judgement-factor-spectrum.mjs tests/production-preservation.mjs`: **40/40 PASS**.
- `JUGEST_ACCESS_ENABLED=0 JUGEST_PIA_ACCESS_MODE=public node --test vps/tests/analytics-api.test.mjs vps/tests/analysis-runtime.test.mjs vps/tests/judgement-page.test.mjs vps/tests/judge-single-source.test.mjs`: **21/21 PASS**. These are the existing package's standard test-only environment settings. An initial direct run without those settings passed 19/21 but two unrelated public PIA tests failed access-mode expectations; rerunning with the package's exact environment passed every test.
- `node tests/collector-preservation.mjs`: PASS, the original 20 production hashes and five byte-exact clean jitter files remain intact.
- `node tests/group-judge-regression.mjs`: **1,024/1,024 full individual outputs exactly equal** to the approved baseline.
- `node build.mjs`: PASS after the fixes.
- `git diff --check` / `git diff --cached --check`: PASS; staged exactly the four owned fix files.

Only the authorized independent UI block SHA pin and the exact persistence-method source restoration were updated in the preservation helper. Original mathematical/library/production hash fixtures remain unchanged. Both important findings are addressed with reproducing tests; root owns the full-suite/browser revalidation and independent rereview. No production changes or remote mutations.
