# Independent numeric validation — 2026-10-17

Status: **passed**. 85,288 individual comparisons across 45 cases, 46,320 explicitly enumerated six-setting configurations. This reference enumerates configurations and Decimal polynomial coefficients; it does not import or reproduce the production dynamic program.

- Maximum absolute probability error: 2.6645352591003757e-15.
- Maximum absolute log-value error: 2.2737367544323206e-13.
- Probability/log acceptance tolerances: 3e-11 / 3e-9.
- All nine fixed sensitivity models, all three count marginals, medians, 90% intervals, sensitivity envelopes, event priors/posteriors/Bayes factors, normalized detection mixtures, exhaustive null maxima, baseline ratios, and exact/at-least conditional row distributions were compared. Conditional influence neutralizes one row's observation while preserving n, threshold and prior.
- Existing ordinary results were preserved exactly for 9 machines × 128 fixed-seed observations (1152 full results), including bonus and difference-based methods, callbacks and warnings; each is compared to a separately booted legacy runtime. This tests the capture boundary; it does not assert an independently maintained probability table.
- All-nine actual-table observations: 27; bonus logs independently recomputed from the existing runtime's exported tables, maximum difference 0. Table hash: `6a17eab7cbfcb4332cb70262046346656af5e3dab097677e8447c6ec6ff7abbb`.
- Neutral inputs through n=120 preserve their prior, BF=1 and e=1. Shared all-six prior follows (1+3^-n)/(4(n+1)); the independent-only model is separately checked as a sensitivity. n=19 exercises exact cumulative quantile boundaries.
- A complete finite observation space (two rows × three outcomes) independently checked each principal e-value against all 36 fixed setting assignments; the largest null expectation was 0.7779296875000001. These are finite normalized toy probabilities, not real-world validation.
- Zero support, impossible event conditioning, extreme log scale, zero prior component mass, and malformed input checks are included. Strong display remains disabled.

Reproduce from the repository root:

```bash
node scripts/allocation-validation/compare.mjs
```

Toolchain: Node v24.19.0; Python 3.12.14; NumPy 2.3.5; SciPy 1.17.0. Full case names, checks, hashes and outputs are in numeric-validation.json. Runtime: 6.50 seconds.

Limits: arithmetic agreement and model-internal e-value checks do not establish true settings or real-store calibration. No production data, remote access, or production mutation is used.

Sensitivity event diagnostics: compared 3,645 principal-event summaries and 207 selected exact/at-least detail summaries across all nine declared models against separate full-configuration prior/observed-mass sums. Each prior probability, posterior probability and log Bayes factor was checked. Every diagnostic remains unregistered for e-values, with null e-value/threshold, false model-pass and disabled strong display. Disabling sensitivity returns empty model and detail-comparison arrays.

A one-row fixture gives log BF = log(.5/.4) under the default low-group assumption, log(.5/.73) under the setting1-heavy assumption, and log(.5/.19) under the setting3-heavy assumption. The principal and exact-detail comparisons therefore cross BF=1 across the fixed assumptions, exercising the UI's assumption-dependence diagnostic without adding any new model.
