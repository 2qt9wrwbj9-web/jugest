# Task 1 implementation report

Status: DONE

- Work branch: `work/parallel-group-judge-20261010`.
- Approved baseline: `f728b2587a9bdd81541ccb50d3ae802a8492486a`.
- Task commit: `45b1a8f7faa3baafb9f8ba50bfaf3af5391b9c15`.
- Owned changes: `group-judge.js`, `tests/group-judge.mjs` only.
- Read repository `AGENTS.md`, task-1 brief/extra contract, and the complete mathematical design before implementation.
- No protected judgement mathematics, loaders, UI, tables, adapters, production branch, production service, production data, or external application was modified by this task. No push, merge, deployment, or production restart was performed.

## Implementation

`globalThis.JUGESTGroupJudge` is a frozen pure IIFE API with `VERSION`, `analyze(entries)`, and frozen numerical `__test` helpers. It consumes the successful adapter result and never reconstructs primary logs from individual `q`. Original input/results stay unchanged, including frozen objects; repeated calls are deterministic.

The input contract requires all 2–60 rows, distinct row ids, distinct nonblank trimmed table numbers, successful individual results, six numeric normalized individual probabilities, six finite or `-Infinity` logs with at least one finite entry, and six ordered setting metadata entries with positive finite BB/RB denominators whose probabilities sum below one. It preserves the existing shared input validator semantics; an equivalent standalone fallback supports Node without that global. Machine/table-key mismatch and same-machine BB/RB table mismatch fail closed. Per-row games stop at 10,000,000 for group analysis only. BigInt accumulation certifies final sums and preserves canceling safe differences without imposing an arbitrary difference limit. Errors are Japanese strings; no invalid row is silently discarded.

Evidence ratios use per-row log stabilization, log-sum-exp, and a two-state complement DP. The complement is accumulated from disjoint first-outside/already-outside states and is never found by subtracting nearly equal likelihood products. Its prior normalization uses stable `log1mexp`; near-unit allowed mass derives its log from the positive outside mass. Captured primary logs and independently recomputed three-outcome bonus logs remain separate. Each hypothesis exposes equal/lower/upper weight sensitivities with explicit six-element weight arrays.

Conditional individual distributions restrict the captured logs to each hypothesis under equal weights. Expected counts and count profiles have six components. The full count-profile polynomial DP retains every assignment's multiplicity, uses log coefficients, and returns the top eight profiles plus the separate per-row argmax assignment. When captured logs give no allowed support for a row, evidence is `-Infinity` and conditional output is explicitly `available:false` with its Japanese reason; no invented probability distribution is returned. A complement with zero support gives `Infinity` evidence.

Refutation precomputes each row/setting's three binomial CDFs once, then implements exactly the design's `max_s[min(1,3 min F)]` rule, row Bonferroni correction, and additional three-hypothesis correction. `p`, `logP`, `familyP`, `logFamilyP`, `refuted`, weakest row, selected-setting channels, and allowed-setting channel details are available. When an ordinary probability underflows, the finite log probability remains available. Boundary values are exact; continued-fraction incomplete beta uses stable Loader binomial PMF/Stirling/deviance normalization instead of subtracting huge log-gamma values. Failure to converge or represent required finite arithmetic returns a Japanese error rather than claiming exact probability zero.

Aggregates distinguish complete `diff` from partial `knownDiff` and `diffN`; missing differences are never filled with zero. Zero observed bonuses have null observed denominators. Mixed machines still use row-specific bonus tables for evidence/refutation but disable the homogeneous reference. The homogeneous reference is bonus-only under a shared single-setting assumption and never uses aggregate difference.

Warnings explain low exposure, missing differences, mixed machines, reverse warnings, approximate difference evidence, weight assumptions, same-setting reference, dependence between alternate calculations, and selected-after-observation/stopping limitations. Event posterior/prior percentages are not computed.

Concrete additive shapes agreed with root:

- Hypothesis ids: `all456`, `all56`, `all6`.
- Aggregate machines: `{key,name,n}[]`.
- Conditional adds `available` and unavailable `reason`.
- Map assignment: `{id,tableNo,setting,probability}[]`.
- Refutation rows: `{id,tableNo,p,logP,setting,channels,settings}`; channels are `{bb:{p,logP},rb:{p,logP},total:{p,logP}}`.
- Worst row: `{id,tableNo,logCompatibility}` where compatibility is max allowed minus max all.
- Helpers: `__test.binomialLowerTail(n,k,p) -> {p,logP}`, `__test.logEvidenceRatio(logRows,allowed,weights)`, `__test.log1mexp`.

## TDD and focused verification

1. Created the complete focused test file before the engine. `node --test tests/group-judge.mjs` failed with `ENOENT` for `group-judge.js` (exit 1), confirming the feature was missing.
2. Implemented the engine and obtained 16/16 passing tests.
3. Self-review found that sparse `q` arrays could bypass `Array.some`. Added a failing contract case: `node --test tests/group-judge.mjs` showed 16 pass / 1 fail and specifically accepted a malformed `[1,<five holes>]` distribution. Fixed sparse probability/log/table checks using dense validation. Added the valid 60-row bound test.
4. Final `node --check group-judge.js`: passed.
5. Final `node --test tests/group-judge.mjs`: 17/17 passed, zero skipped/cancelled, about 603 ms total. The 60-row full profile/refutation test took about 343 ms locally (Node 24.19.0).
6. `git diff --cached --check`: passed before the owned-files commit. Staging contained exactly the two owned files. `git status --short` after commit was clean.

Focused tests cover independent two-/three-row enumeration of all settings for primary and bonus evidence and all three sensitivities; neutral evidence; complete small allocation enumeration and multiplicity; count-profile versus per-row MAP distinction; order/offset invariance; nearly all-high concentration; impossible support; direct binomial PMF sums for small n; exact endpoints; fixed SciPy/80-digit Decimal reference vectors through 10,000,000 trials including near-0/near-1 probabilities and underflow; the setting-wise refutation rule/corrections; compatibility selection; partial/zero differences and zero bonuses; homogeneous versus mixed reference; duplicate/missing/malformed/extreme inputs; 60-row normalization; warnings; and frozen real successful adapter results from all eight machines.

Independent root verification reported while this implementation was active (root owns those artifacts and reproduces them): 412 SciPy CDF cases with maximum absolute CDF error `3.18e-12` and maximum log error `1.44e-11`; 27 independent full-setting enumerations with maximum log-ratio difference `1.07e-14`; seven fixed-seed scenarios of 400 simulations each and 106 existing public observed rows passed. These were not used to rewrite expected values or protected individual calculations.

The repository-wide root/VPS suites and browser integration are intentionally owned by root per task authorization; this task did not run or claim those integration checks.

## Self-review and limits

No unresolved implementation issue identified in the owned scope. The engine cannot determine whether a result is stale relative to a separate UI draft because drafts are not part of `analyze({id,result}[])`; root owns invalidation and freshness integration. It does verify internal machine/table consistency and fails closed on incomplete result data. Extremely large finite log differences/sums beyond representable double arithmetic fail closed. Approximate difference-model evidence, assumed setting weights, sampling/stopping selection, and lack of an event prior remain explicit design limits rather than calibrated probability claims.

Ready for independent mathematical review and root integration. No production changes.
