# Axis Auto-Selector Phase 2A — Historical Walk-Forward

## Status

Phase 2A historical replay and the bounded Fast Runner are implemented on `sol/axis-phase2a-fast-runner` as research-only, shadow-only infrastructure.

Latest code verification source commit: `5e6be05895e18f2fae8c217e0988c331a44c8d2e`.
GitHub Actions run: `34232296375` on Node `22.23.2` — focused Fast Runner tests, full regression, and mandatory preservation regressions all PASS.

No main merge, Production deployment, visible-ranking connection, Collector change, Device Sync change, or protected judgment-math change was made.

## Purpose

Phase 2A asks:

> Given only information available before each historical target date, would the Phase 1 Axis Auto-Selector have ranked that store's machines better than the current point-in-time JUGEST control?

It does not claim to recover hidden true settings. End-of-day JUGEST `expectedSetting` / `p4` are outcome proxies.

## Point-in-time pipeline

1. Read a JUGEST full-backup JSON, direct `externalDays`, or a direct day array.
2. Filter the requested store before expanding/processing unrelated stores.
3. Expand packed external machine rows without mutating the source input.
4. For each historical target date D, give the prediction runtime only history dated `< D`.
5. Capture current control rank/score, practical/model/strict signals, fixed validated bonus, and the pre-outcome source signature.
6. Only after the prediction is frozen, attach D's end-of-day outcome proxy.
7. Keep the first 24 usable samples as warm-up by default.
8. For every later date, choose the shadow profile using previously revealed samples only, freeze the receipt, then score D.
9. Aggregate control-vs-shadow utility, Top3/5/10 ES/P4, wins/ties, abstention, profile changes and axis usage.

## Fast Runner execution policy

Historical replay initially became memory-heavy when one worker retained a JUGEST runtime across many target dates. The production-independent research runner now uses a strict lifecycle:

`one target date -> fresh worker/runtime -> compute -> post completed result to parent -> terminate worker -> free worker heap/cache`

Completed samples/receipts remain in the parent process; only worker runtime memory is discarded.

Concurrency is bounded by CPU, estimated memory pressure, target count and an explicit maximum. Automatic/default maximum concurrency is **3 workers**. CLI overrides remain available for controlled research, but the default is intentionally conservative because four concurrent full JUGEST runtimes showed worse resource pressure in measurement.

The Fast Runner records `workerLifecycle: "per-target"` and one audit chunk per target date. Tests require the parallel result to be semantically identical to the sequential current-JUGEST replay.

## Leakage controls

Regression tests cover:

- prediction source dates strictly earlier than target date;
- duplicate dates / malformed chronology fail closed;
- target outcome poisoning cannot alter that target's pre-outcome profile/ranks/hash;
- future poisoning cannot alter earlier samples/receipts;
- historical state is revealed one target at a time;
- warm-up remains 24 usable samples by default;
- per-target parallel execution returns the same historical samples as sequential replay;
- worker recycling changes execution lifetime only, not ranking semantics.

Every real-store run below also re-ran the latest two built target dates sequentially and matched the Fast Runner exactly: **6/6 target comparisons PASS across three stores**.

## Real backup evidence — 2026-09-08

The same JUGEST full backup was replayed for three stores. All results are OOS-style walk-forward with 24 usable-sample warm-up and current point-in-time `v4PredictStore` as CONTROL.

| Store | History | Built samples | Evaluated | Shadow days | Shadow / Control wins | Mean utility delta | Top5 ES delta | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| グリーン | 210 days / 9,030 rows | 165 | 141 | 26 | 7 / 15 | **-0.008257** | **-0.012274** | negative |
| ジアス大船 | 134 days / 14,469 rows | 89 | 65 | 13 | 4 / 3 | **+0.006337** | **+0.006459** | positive |
| セブンS川崎店 | 150 days / 16,500 rows | 105 | 81 | 15 | 2 / 3 | **+0.001503** | **+0.000602** | small positive mean, mixed win count |

### グリーン

- 190 target worker tasks; build compute ~288.2 s.
- 141 evaluated days after warm-up.
- Shadow adopted 26/141 days; abstain/control rate 81.56%.
- 7 Shadow wins, 15 Control wins, 119 ties.
- Mean utility delta: **-0.0082567027**.
- Top3 ES/P4 delta: **-0.0074497 / -0.0024292**.
- Top5 ES/P4 delta: **-0.0122740 / -0.0035998**.
- Top10 ES/P4 delta: **-0.0040241 / -0.0011542**.
- On the 26 actual Shadow-adoption days, mean utility delta was **-0.0447767**.
- Latest two targets matched sequential replay exactly.

### ジアス大船

- 114 target worker tasks; build compute ~282.0 s.
- 65 evaluated days after warm-up.
- Shadow adopted 13/65 days; abstain/control rate 80.0%.
- 4 Shadow wins, 3 Control wins, 58 ties.
- Mean utility delta: **+0.0063372366**.
- Top3 ES/P4 delta: **+0.0078794 / +0.0027384**.
- Top5 ES/P4 delta: **+0.0064593 / +0.0018145**.
- Top10 ES/P4 delta: **+0.0028234 / +0.0010799**.
- On Shadow-adoption days, mean utility delta was **+0.0316862**.
- Latest two targets matched sequential replay exactly.

### セブンS川崎店

- 130 target worker tasks; build compute ~336.6 s.
- 81 evaluated days after warm-up.
- Shadow adopted 15/81 days; abstain/control rate 81.48%.
- 2 Shadow wins, 3 Control wins, 76 ties.
- Mean utility delta: **+0.0015025322**.
- Top3 ES/P4 delta: **+0.0030667 / +0.0007967**.
- Top5 ES/P4 delta: **+0.0006019 / +0.0001848**.
- Top10 ES/P4 delta: **-0.0000042 / +0.0000139**.
- On Shadow-adoption days, mean utility delta was **+0.0081137**.
- Latest two targets matched sequential replay exactly.

## Three-store combined view

Across **287 evaluated days**:

- Shadow adopted on **54 days (18.82%)**; CONTROL/abstain on 233 days.
- 13 Shadow wins, 21 Control wins, 253 ties.
- Among non-ties, Shadow win rate was **38.24%**.
- Evaluated-day-weighted mean utility delta was **-0.0021971**.
- Weighted Top3 ES/P4 delta: **-0.0010099 / -0.0003484**.
- Weighted Top5 ES/P4 delta: **-0.0043973 / -0.0013054**.
- Weighted Top10 ES/P4 delta: **-0.0013387 / -0.0003185**.
- Across the 54 actual Shadow-adoption days, mean utility delta was **-0.0116772**.

The evidence is heterogeneous: the selector improved ジアス大船 and was slightly positive on average at セブンS川崎店, but the loss at グリーン was large enough to make the combined result negative.

This is exactly why Phase 2 remains shadow-only. A short positive window or a successful validation/holdout profile is not sufficient evidence for Production promotion.

## Axis behavior observed

At ジアス大船, accepted profiles were strongly `practical-v1` dominant; `model-v1` appeared only once. At セブンS川崎店, `practical-v1` also dominated most accepted profiles, with occasional model contribution. グリーン used a materially more balanced practical/strict mix and selected model more often, yet its OOS result was negative.

This suggests the next research question is not simply "make the selector more aggressive." The important failure mode is **store-specific post-selection instability**: a profile can pass train/validation/final-holdout gates and still perform poorly in subsequent walk-forward operation.

## Verification

Fresh GitHub Actions verification on `5e6be05895e18f2fae8c217e0988c331a44c8d2e`, run `34232296375`:

- focused Fast Runner / Phase 2A tests: PASS;
- full regression suite: PASS;
- mandatory Production preservation regressions: PASS;
- per-target lifecycle regression: PASS;
- default automatic max-concurrency regression: PASS;
- parallel-vs-sequential sample parity: PASS.

Earlier Phase 2A and Phase 1 verification remains covered by the full suite, including protected runtime, Collector and ranking-preservation checks.

Temporary verification/export workflows used during development were removed after successful verification.

## Commands

One-shot full-backup pipeline:

```bash
node scripts/axis-phase2a.mjs \
  --input /path/to/jugest-backup.json \
  --store "STORE NAME" \
  --output /path/to/phase2a-report.json \
  --bundle-output /path/to/phase2a-samples.json \
  --warmup 24 \
  --workers auto \
  --shadow
```

Useful research controls:

- `--workers auto|N`
- `--memory-budget-mb N`
- `--max-workers N` (default 3)
- `--start YYYY-MM-DD`
- `--end YYYY-MM-DD`
- `--min-prior N`

All Phase 2A execution paths require explicit `--shadow`.

## Evidence files

Machine-readable real-store summary:

`docs/axis-auto-selector/evidence/phase2a-real-store-summary-2026-09-08.json`

## Readiness / decision

**Production promotion: NO-GO.**

Phase 2A infrastructure itself is ready for continued research and larger real-store replay. The next architecture candidate is a separate **Phase 2B operational OOS gate** that observes only already-revealed post-selection performance and can return a store to CONTROL when a previously accepted Shadow ensemble becomes unstable. Any such gate must be evaluated with new chronological separation so the three-store evidence above is not reused as both design data and final proof.

`calendar-v1` remains `approved:false`. Visible ranking and Production remain unchanged until an explicit later promotion decision by Hiro.
