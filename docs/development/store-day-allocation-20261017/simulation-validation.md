# Fixed-exposure simulation validation — 2026-10-17

Status: **reference only; strong display disabled**. Generated 476,928 machine-group observations and scored 190,188 with the production engine. No outcome-based selection. Development and validation RNG streams are disjoint.

The broad grid covers all 9 supported machine tables, n=6/12/24/58/60/120, G=0/500/3000/6000/9000, and 9 fixed layouts. Per cell, 32 development +96 validation observations were generated; the first 2 + 8 respectively were scored. The targeted n12/G6000 study scores every observation for 8 layouts,256 development and 2,048 validation complete stores per layout. Each store has 9 groups and a fixed M=81, alpha=.05.

All observations are independent fixed-exposure multinomial draws from the existing runtime's probability table, with fixed settings and complete collection. The legacy log formula was audited through 27 real callback calls; maximum error 0.

## Validation store families

All reported bounds are 95% Wilson intervals. Family false positive means at least one false principal modelPass in a complete simulated store; strong display was disabled for every group.

| Layout | Store family false positives | Any principal modelPass |
|---|---|---|
| all3 | 0.00% [0.00%, 0.19%] (0/2048) | 0.00% [0.00%, 0.19%] (0/2048) |
| half-minus-one6 | 0.00% [0.00%, 0.19%] (0/2048) | 0.00% [0.00%, 0.19%] (0/2048) |
| third6 | 0.00% [0.00%, 0.19%] (0/2048) | 0.00% [0.00%, 0.19%] (0/2048) |
| half4 | 0.00% [0.00%, 0.19%] (0/2048) | 0.00% [0.00%, 0.19%] (0/2048) |
| all4 | 0.00% [0.00%, 0.19%] (0/2048) | 0.00% [0.00%, 0.19%] (0/2048) |
| all6 | not applicable; all claims true | 86.38% [84.82%, 87.79%] (1769/2048) |
| mixed46 | 0.00% [0.00%, 0.19%] (0/2048) | 2.69% [2.07%, 3.48%] (55/2048) |
| prior-shared4 | 0.00% [0.00%, 0.19%] (0/2048) | 5.08% [4.21%, 6.12%] (104/2048) |

## Power, misses and boundary ambiguity

The principal e-value rule is deliberately conservative. The following are validation group-level modelPass power for the 456 band, with each event evaluated against its true count. These are model-internal passes, not released strong badges.

| Layout | All456 power | At least half456 power | At least third456 power |
|---|---|---|---|
| half4 | not true | 0.00% [0.00%, 0.02%] (0/18432) | 0.00% [0.00%, 0.02%] (0/18432) |
| all4 | 0.00% [0.00%, 0.02%] (0/18432) | 0.00% [0.00%, 0.02%] (0/18432) | 0.00% [0.00%, 0.02%] (0/18432) |
| all6 | 0.00% [0.00%, 0.02%] (0/18432) | 2.65% [2.43%, 2.89%] (488/18432) | 17.17% [16.63%, 17.72%] (3164/18432) |
| mixed46 | 0.00% [0.00%, 0.02%] (0/18432) | 0.00% [0.00%, 0.02%] (0/18432) | 0.30% [0.23%, 0.39%] (55/18432) |

For true exactly one-third setting6 (remaining setting3), the descriptive posterior P(K456≥half)≥.5 rate was 78.44% [77.84%, 79.03%] (14458/18432); the corrected modelPass false-half rate was 0.00% [0.00%, 0.02%] (0/18432). A .5 posterior threshold is a diagnostic, not a release rule. Exact per-machine rates, band-specific false passes, power, misses, interval widths and expected-count error are retained in JSON.

## Model-consistent posterior calibration

The prior-shared4 family samples component, count, positions and settings from the declared coherent prior before observations. Only this stratum tests posterior calibration under the declared model. Other fixed layouts deliberately differ from that prior. Reliability bins and Brier scores are in JSON.

| Band | Central 90% interval coverage (validation) |
|---|---|
| 456 | 95.41% [95.10%, 95.70%] (17586/18432) |
| 56 | 96.77% [96.51%, 97.02%] (17837/18432) |
| 6 | 96.92% [96.66%, 97.16%] (17865/18432) |

## Performance and reproducibility

Scoring and streaming took 314.8 seconds on Node v24.19.0; Python 3.12.14, NumPy 2.3.5, SciPy 1.17.0. No-sensitivity n120 median: 44.10ms; full sensitivity/detail benchmark samples are in JSON. Maximum observed single scoring time: 123.26ms.

Table hash: `6a17eab7cbfcb4332cb70262046346656af5e3dab097677e8447c6ec6ff7abbb`. Seed derivations, every stream identifier, selection counts and output fingerprint are in simulation-seeds.json. Fixed input source hashes are in simulation-validation.json.

Reproduce from repository root:

```bash
node scripts/allocation-validation/simulate.mjs
```

## Limits

- Generated and scored counts differ for the broad grid; only predeclared first 2 development / first 8 validation repetitions per grid cell were scored.
- Every targeted family observation was scored; each simulated store contains all nine supported machine groups and all 81 principal declarations.
- Fixed layout posterior frequencies and central interval coverage are not a universal calibration test; prior-shared4 is the separately identified model-consistent calibration sample.
- Zero observed errors do not mean zero risk; report sample sizes and confidence bounds. Rare events, adversarial configurations beyond these layouts, and deployment data remain unverified.
- No simulated difference/coin observations, adaptive play, informative missingness, source errors, or real-store true setting labels are included.
- Strong display remains disabled regardless of modelPass; model-internal simulation does not establish a real-store error rate.

## Additional release-gate measurements

The source hashes, unique seed streams, manifest-selected sample totals, scored totals and generation fingerprint were independently rechecked by `scripts/allocation-validation/summarize.py`. All checks matched. The JSON retains every original aggregate and now includes this derived summary.

The all-six family contains no false principal claims, so its zero false-positive count is structural. The all-setting3 and boundary family conditions supply meaningful false-claim checks; each observed zero false-positive stores in 2,048 independent validation stores, with 95% Wilson upper bound 0.1872% for that simulated condition.

A simulated all-six store passing any weaker event does not mean all-six was detected. At n=12/G=6,000, the event-specific all-six-layout results are:

| Band | Event | Model-pass power | Misses |
|---|---|---|---|
| 456 | all | 0.00% [0.00%, 0.02%] (0/18,432) | 100.00% [99.98%, 100.00%] (18,432/18,432) |
| 456 | half | 2.65% [2.43%, 2.89%] (488/18,432) | 97.35% [97.11%, 97.57%] (17,944/18,432) |
| 456 | third | 17.17% [16.63%, 17.72%] (3,164/18,432) | 82.83% [82.28%, 83.37%] (15,268/18,432) |
| 56 | all | 0.00% [0.00%, 0.02%] (0/18,432) | 100.00% [99.98%, 100.00%] (18,432/18,432) |
| 56 | half | 0.01% [0.00%, 0.04%] (2/18,432) | 99.99% [99.96%, 100.00%] (18,430/18,432) |
| 56 | third | 0.34% [0.27%, 0.44%] (63/18,432) | 99.66% [99.56%, 99.73%] (18,369/18,432) |
| 6 | all | 0.00% [0.00%, 0.02%] (0/18,432) | 100.00% [99.98%, 100.00%] (18,432/18,432) |
| 6 | half | 0.00% [0.00%, 0.02%] (0/18,432) | 100.00% [99.98%, 100.00%] (18,432/18,432) |
| 6 | third | 0.00% [0.00%, 0.02%] (0/18,432) | 100.00% [99.98%, 100.00%] (18,432/18,432) |

For true half-setting4 and all-setting4 layouts, all true 456 declarations had zero passes in 18,432 groups per layout. The miss rate is 100% [99.98%, 100%]. These results fail a practical power gate for strong-candidate release.

All 190,188 results kept `strongEnabled=false` exactly; this is a release switch, not a sampled success probability. Among validation groups, no principal model-pass occurred in:

| Cohort | No principal model-pass |
|---|---|
| validation|grid | 95.39% [95.09%, 95.68%] (18,544/19,440) |
| validation|family | 97.75% [97.67%, 97.82%] (144,132/147,456) |

These are uncertainty/hold diagnostics within complete generated inputs. The simulation does not exercise source-provenance or unsupported-input holds.

Posterior calibration diagnostics from the separately sampled declared shared prior (18,432 validation groups) are:

| Band | Event | Brier score | 10-bin weighted absolute calibration gap |
|---|---|---|---|
| 456 | all | 0.05474 | 0.28 percentage points |
| 456 | half | 0.12104 | 0.67 percentage points |
| 456 | third | 0.11020 | 0.48 percentage points |
| 56 | all | 0.02665 | 0.18 percentage points |
| 56 | half | 0.10532 | 0.55 percentage points |
| 56 | third | 0.12637 | 0.53 percentage points |
| 6 | all | 0.01274 | 0.17 percentage points |
| 6 | half | 0.07208 | 0.52 percentage points |
| 6 | third | 0.10650 | 0.42 percentage points |

These diagnostics concern only the declared prior and fixed-exposure bonus model. They do not make posterior event frequencies valid under arbitrary fixed layouts: the true-one-third scenario's 78.44% posterior half overstatement is a direct example of the assumption dependence. Numerical correctness, model-internal error control and real-store accuracy remain separate conclusions.

Recheck integrity and regenerate this supplement without rescoring:

```bash
python3 scripts/allocation-validation/summarize.py
```
