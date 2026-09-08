# Task 1 report — immutable axis-selector control baseline

Date: 2026-09-08  
Branch: `astra/axis-auto-selector-shadow`  
Resume HEAD: `a128347bdc2e0e9b41b327e18d4c3755a112b5d4`  
Runtime base recorded by fixture: `273ed61ed2019365ae1b38d76288f20e9625c9e1`
Task commit: `c4a5f22` (`test: capture axis selector control baseline`)

## Status

Task 1 is complete. The control fixture was generated from the untouched current `window.V4_TEST` runtime before any shadow feature module existed. No runtime, protected math, production, deployment, or shadow implementation file was changed.

## Committed scope

- `tests/fixtures/axis-auto-selector-baseline.json`
  - exact normalized 55/30/15 fallback weights;
  - five utility characterizations, including numeric-key ties, fixed validated bonus/raw scoring, multi-day stability, empty input, and fewer-than-ten valid rows;
  - three real `V4_TEST.predictStore` output paths: custom-source fallback, fresh stored profile, and historical target rejection of a newer stored profile;
  - all twelve rows for each prediction, preserving rank, `aimScore`, `hybridScore`, `predP4`, `predES`, component signals, and fixed validated-calendar bonus.
- `tests/axis-auto-selector-parity.mjs`
  - replays the fixture against the live control runtime;
  - separately asserts `hybridNormWeights`, `hybridEvaluate`, `predictStore`, and `hybridStoredWeights` behavior;
  - imports no current or future shadow module.
- `tests/helpers/axis-auto-selector-baseline.mjs`
  - deterministic synthetic history/state builders and compactors shared by parity now and Task 7 later;
  - encodes non-finite numbers before plain JSON serialization so `NaN`/infinities cannot silently become `null`.

The temporary fixture generator was used only to produce the immutable JSON and was removed before commit. This is the one decomposition addition to the plan's two named outputs: the reusable helper prevents the parity replay from duplicating a large deterministic history builder and preserves `predP4`/`predES` for later Task 7 checks.

## Determinism and fixture checks

Two consecutive generator runs produced the same fixture SHA-256:

```text
before=d33aabb650494a7f8d51e7d5be706c7680b9c152259019c4714a91362ee69cf0
after=d33aabb650494a7f8d51e7d5be706c7680b9c152259019c4714a91362ee69cf0
fixture invariants: PASS
```

The invariant check confirmed five utility cases, explicit `-Infinity`/`NaN` strings for both degenerate results, 12 sequentially ranked rows in every prediction case, finite `predP4`/`predES`, and stored-profile decisions `[false, true, false]` across the three paths.

## Focused verification output

Syntax checks:

```text
$ node --check tests/helpers/axis-auto-selector-baseline.mjs
$ node --check tests/axis-auto-selector-parity.mjs
```

Both exited 0 with no output.

Parity:

```text
$ node tests/axis-auto-selector-parity.mjs
✔ immutable fixture identifies the untouched runtime baseline (1.112201ms)
✔ current hybrid normalization and utility outputs match the captured control (23.352379ms)
✔ current prediction ordering, scores, signals and stored-profile behavior match the captured control (2083.161823ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2115.588067
```

Production preservation:

```text
$ node --test tests/production-preservation.mjs
✔ Production icons, parser, math libraries and untouched Vercel APIs remain byte-exact (8.454131ms)
✔ Protected inline math and research sections remain identical to the captured Production (4.007047ms)
✔ Fresh public build uses checked-in runtime source plus only approved bounded transforms (10.967856ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 95.996232
```

## Concerns / remaining verification

- The fixture intentionally freezes exact IEEE-754 outputs and current Japanese numeric collation behavior; changes in protected runtime math or supported Node/ICU behavior will produce an explicit parity failure.
- Only Task 1's focused suites were rerun. The historical 64/64 preflight remains contextual evidence, not a fresh final-suite claim; the implementation plan reserves the complete regression/performance run for the final task.
- Controller-owned `docs/axis-auto-selector/IMPLEMENTATION-NOTES.md`, `docs/axis-auto-selector/protected-hashes.json`, and `docs/axis-auto-selector/checkpoint.json` remain untracked and are excluded from this task commit.
