# JUGEST Axis Auto-Selector — Phase 1 Shadow Core Report

Date: 2026-09-08

## Status

Phase 1 implements an isolated, headless **shadow-only** Axis Auto-Selector. It does not change the current JUGEST visible ranking, current browser `v4HybridProfiles`, Collector behavior, Device Sync, protected judgment mathematics, or Production deployment state.

Working branch: `astra/axis-auto-selector-shadow`

Implementation/test evidence checkpoint before this report: `a4f2068e9ce17f257ae1cb658b7233289032f65f`

Base: `273ed61ed2019365ae1b38d76288f20e9625c9e1` (`preview/v512-collector-batch`)

The temporary branch-only GitHub Actions workflow used to obtain independent Node/Linux verification was removed before the evidence checkpoint above.

## Architecture delivered

Phase 1 is additive and lives outside the authoritative browser ranking path.

- `research/axis-auto-selector/registry.mjs`
  - approved-axis registry, versions, source identity, aliases, availability metadata, correlation groups and caps.
- `research/axis-auto-selector/jugest-adapter.mjs`
  - maps already-computed current JUGEST prediction-row signals into normalized shadow input rows; does not recompute protected signals.
- `research/axis-auto-selector/evaluator.mjs`
  - point-in-time validation, current hybrid utility semantics, chronological split and pre-outcome source signature.
- `research/axis-auto-selector/selector.mjs`
  - bounded sparse non-negative ensemble search, validation/holdout gates and conservative shrinkage.
- `research/axis-auto-selector/profile.mjs`
  - isolated content-addressed shadow profile schema, stale/version/approval validation and atomic JSON persistence.
- `research/axis-auto-selector/shadow.mjs`
  - orchestration and per-row shadow audit output.
- `scripts/axis-auto-selector.mjs`
  - deterministic network-free headless CLI for normalized sample bundles.
- `scripts/axis-auto-selector-benchmark.mjs`
  - bounded synthetic runtime benchmark harness.

The browser runtime files `index.html`, `app-v510.js` and `core-v510.js` are intentionally untouched in Phase 1. Full source-data-to-signal generation is not claimed to be server-side reusable yet; normalized sample generation remains a separate boundary for a later pure-core/VPS extraction project.

The compact CLI test fixture supports `rowSets` / `rowsRef` only as fixture serialization. The CLI materializes those references into ordinary normalized row arrays before the Phase 1 core receives them.

## Approved registry policy

Initial automatic-selection registry:

| Axis | Source | Version | Approved | Correlation group | Max weight |
|---|---|---:|---|---|---:|
| `practical-v1` | current `row.practicalSignal` | 1 | yes | `practical` | 1.00 |
| `model-v1` | current `row.modelSignal` | 1 | yes | `model` | 1.00 |
| `strict-v1` | current `row.strictSignal` | 1 | yes | `strict` | 1.00 |
| `calendar-v1` | validated-calendar descriptor | 1 | **no** | `calendar-model` | 0.20 |

`calendar-v1` stays registered but `approved:false`. Phase 1 did not establish sufficiently strong point-in-time and overlap/double-count evidence to allow the calendar contribution to become a normalized selectable axis. The current JUGEST fixed validated-calendar bonus therefore remains outside the normalized three-axis weights exactly as in the current ranking semantics.

No fourth axis is forced.

## Selector defaults and adoption flow

Phase 1 defaults are:

```js
{
  maxActiveAxes: 4,
  minEvaluatedDays: 24,
  minTrainDays: 12,
  minValidationDays: 6,
  minHoldoutDays: 6,
  split: {train:.50, validation:.25, holdout:.25},
  weightStep: .10,
  minAxisAvailability: .80,
  validationMinAdvantage: .005,
  holdoutMinAdvantage: .002,
  holdoutMinWinRate: .55,
  maxCandidateEnsembles: 25000
}
```

Selection flow:

1. validate strict chronological point-in-time samples,
2. compute approved-axis availability from **training history only**,
3. remove unapproved/unavailable/source-aliased axes and enforce registry minimum history,
4. enumerate bounded positive `.10` simplex ensembles up to four active axes,
5. enforce per-axis and correlation-group caps,
6. select exactly one winner on training score only,
7. deterministic tie-break: higher score, fewer axes, then lexicographic axis IDs/weights,
8. require validation improvement against **both** current control and conservative fallback,
9. shrink the selected weights toward the conservative fallback after selection,
10. inspect final holdout exactly once,
11. if final holdout fails, retain CONTROL; do not try a runner-up.

The implementation returns machine-readable decision/reason fields. Phase 1 shadow adoption never changes the authoritative current ranking.

## Outcome and control semantics

The evaluator preserves the current hybrid research metric rather than claiming unavailable “true setting accuracy”.

Per valid day it uses store-relative Top3/Top5/Top10 lift for expected setting and P4+:

```text
ES  = .45*Top3_ES  + .35*Top5_ES  + .20*Top10_ES
P4  = .45*Top3_P4  + .35*Top5_P4  + .20*Top10_P4
utility = .72*ES + .28*(P4*3)
```

Period score:

```text
meanUtility - .12*sd/sqrt(n) + .035*(positiveDayRate - .5)
```

The current raw fixed validated-calendar bonus remains outside normalized axis weights.

The control comparator is the actual point-in-time current JUGEST ordering carried in each normalized sample, not a reconstructed approximation. The conservative fallback is `55/30/15` practical/model/strict plus the existing fixed bonus.

## Leakage and integrity proof

Phase 1 enforces these integrity properties:

- `trainingCutoff < targetDate` for every sample.
- target dates must be unique and strictly chronological.
- malformed or non-finite required values fail closed.
- sample validation snapshots and deep-freezes input.
- train/validation/final-holdout are chronological and non-overlapping.
- axis availability/minimum-history decisions use training history only.
- final holdout is not used to choose among candidate weights.
- a failed holdout cannot trigger runner-up selection.
- pre-outcome `sourceSignature()` includes prediction-time inputs/signals/provenance but excludes `actualES` and `actualP4`.
- changing target outcomes alone therefore does not change the source signature, while changing prediction-time signals does.
- duplicate target dates, duplicate row keys and duplicate source identities/aliases are rejected or deduplicated rather than becoming extra votes.

Synthetic poisoning tests cover future/target leakage behavior. Existing `store-optimization-research` chronology/future-poisoning tests also remained green.

## Shadow profile isolation

Shadow profiles use schema `jugest-axis-shadow-v1` and persist separately from current browser `v4HybridProfiles`.

Profiles record:

- content-addressed deterministic profile ID,
- store and source signature,
- trained-through date and audit timestamp,
- decision and reasons,
- selected axis IDs/versions/weights,
- train/validation/holdout summaries,
- control and fallback summaries,
- exact evaluation dates,
- integrity flags.

Validation fails safe if the current source signature differs, a selected axis is missing, its version changes, it becomes unapproved, profile identity is tampered, or weights are invalid/non-normalized.

File persistence writes a temporary file, flushes/closes it, then renames atomically. Existing browser save/restore and Device Sync were not modified.

## Shadow row audit

For a valid shadow champion the latest provided pre-outcome rows expose:

- `key`,
- current `controlRank` and `controlScore`,
- `shadowRank` and `shadowScore`,
- per-axis contribution,
- selected weights,
- fixed bonus,
- disagreement magnitude,
- profile ID,
- `shadowAvailable`.

If a selected signal is missing on a particular latest row, Phase 1 does not silently renormalize the remaining axes. That row fails safe to the control score and is marked `shadowAvailable:false`.

For a CONTROL profile, shadow rank/score mirror control rank/score.

## Runtime semantic parity

`tests/axis-auto-selector-runtime-parity.mjs` boots the real current JUGEST VM runtime, captures current prediction output, runs the isolated Phase 1 shadow core on copied signals, then calls current prediction again.

The following current visible fields are asserted unchanged within the same runtime before/after shadow execution:

- `rank`
- `aimScore`
- `hybridScore`
- `predP4`
- `predES`
- `practicalSignal`
- `modelSignal`
- `strictSignal`

The existing browser localStorage state, including existing `v4HybridProfiles`, is also asserted byte-identical. The isolated shadow profile file is verified not to contain the browser state key/profile storage.

## Protected preservation audit

Final base-to-evidence-checkpoint diff inspection found only additive Axis docs/research/scripts/tests plus the single `tests/commands.json` suite registration change.

No changes were made to:

- `index.html`
- `app-v510.js`
- `core-v510.js`
- Collector runtime
- Device Sync runtime
- externalJudge / Juggler or HANA probability tables
- strict Champion / Calibration / store-share constraint
- single-evidence arithmetic
- HANA hard constraints
- parser identity/sanity
- current visible ranking implementation

The existing preservation test independently passed 20 Production hashes and five byte-exact clean-jitter files.

## Verification evidence

Independent branch verification used GitHub Actions run `34182647680` at commit `26a06af11d8878abfd543f3a3a9c4d66ec2d5ae1`, Ubuntu 24.04 / Node v22.23.2.

Results:

- focused Axis suite: **50/50 tests PASS**,
- manual headless CLI sample: exit 0, `shadowOnly:true`, `SHADOW_CHAMPION`, 10 rows,
- full `npm test`: **65/65 commands PASS**,
- Collector V3: **33/33 tests PASS**,
- existing production/user-flow group: **26/26 PASS**,
- `ui-home-jobs`: **10/10 PASS**,
- `store-analysis-evidence-view`: PASS,
- `store-optimization-research`: PASS,
- `collector-preservation`: **20 Production hashes + five byte-exact clean jitter files PASS**,
- mandatory explicit post-suite regressions: all PASS.

No Production deployment or promotion was performed.

## Performance evidence

Recorded separately in `docs/axis-auto-selector/performance.json` from the same Node 22 CI run.

| Scenario | Dates | Approved axes | Candidates | Elapsed | Approx. heap snapshot max |
|---|---:|---:|---:|---:|---:|
| deterministic fixture | 24 | 3 | 66 | 78.158 ms | 5,162,512 B |
| synthetic longer run | 180 | 3 | 66 | 422.409 ms | 9,875,104 B |

Both are far below the hard `25,000` candidate cap. These are single CI measurements, not latency SLAs; the recorded heap value is the larger of before/after snapshots, not a sampled true peak.

## Environment-specific floating-point fixture note

The immutable Task 1 captured runtime fixture exposed one platform/runtime-level one-ULP difference in a historical `modelSignal` value (`0.8705304158820335` vs `0.8705304158820334`) under both GitHub Actions Node 20 and Node 22.

The immutable expected fixture was **not** rewritten. The baseline comparator was narrowed to:

- exact equality for object shape, strings, booleans, null, arrays and integer numbers,
- at most an 8-ULP-scale tolerance for finite non-integer floating-point leaves.

A comparator regression test proves the observed one-ULP drift passes, a materially larger floating difference fails, and integer/rank differences fail. Separately, the same-process runtime parity test remains exact before/after Phase 1 shadow execution.

This is a test portability adjustment, not a change to current JUGEST calculation semantics.

## Deviations from the initial concept

- No server/VPS source-data extraction was added. Phase 1 deliberately accepts normalized point-in-time sample bundles only.
- No UI was added. Phase 1 uses a developer/headless audit surface only.
- `calendar-v1` was not approved.
- No current browser hybrid functions were extracted or modified; parity was proven around them instead.
- The compact CLI fixture serializer (`rowSets` / `rowsRef`) is test-harness convenience only, not a new domain input format.

These deviations preserve the original safety boundary rather than changing it.

## Remaining risks

- Real-store historical evidence has not yet been run across the available store population in this Phase 1 implementation report.
- The current browser remains the authoritative source of protected signal generation; normalized source-to-signal extraction for a future VPS is still a separate high-risk core-extraction task.
- Selection thresholds are conservative provisional defaults and need empirical Phase 2 evidence before any promotion discussion.
- Axis-level explicit correlation groups protect known overlap, but future axes will require stronger residual/correlation/double-count audits.
- Calendar evidence remains intentionally unapproved until point-in-time provenance and overlap with the current fixed calendar bonus/model signal are demonstrated.
- A shadow champion is only an experimental profile; it is not evidence of guaranteed real-world improvement or profit.

## Recommended Phase 2

Keep current visible ranking authoritative and run historical shadow evaluation only.

1. Build/obtain point-in-time normalized sample bundles for each eligible store without future leakage.
2. Run the headless selector across stores and time ranges.
3. Record per-store control vs fallback vs shadow metrics, selected-axis weights, profile stability, missingness and abstention rates.
4. Check sensitivity to split boundaries and provisional adoption thresholds without touching final holdout after inspection.
5. Audit residual/correlation behavior and identify whether any current axis dominates because it duplicates another signal.
6. Separately investigate `calendar-v1` point-in-time provenance and double-count overlap; keep it unapproved unless that audit passes.
7. Produce a Phase 2 evidence report before any Preview UI integration or ranking-promotion proposal.

Any later change that lets shadow results affect JUGEST’s visible ranking is a separate protected-regression project and requires Hiro’s explicit approval before Production promotion.
