# VPS Research Pipeline Phase 1 — Pre-deploy Checkpoint

Date: 2026-09-13
Branch: `sol/vps-research-pipeline-phase1-impl`
Code baseline: `b80ee907f1200612c0bcca8e9a3974fb993378c7`
VPS deploy baseline: `deploy/vps` at `40b22b2f0e66dad99f908e97cf4719d877a42619`

## Status

The research candidate is ready for the next deployment-gated validation step, but it has **not** been promoted to `deploy/vps` or Production.

The branch is 65 commits ahead of the current `deploy/vps` baseline. The compare is confined to VPS/research/test/documentation surfaces. No changes are present in the protected browser/runtime judgment files such as `index.html`, `app-v510.js`, `core-v510.js`, `hanahana-judge.js`, or `missing-inference.js`.

## Implemented research path

The candidate contains the full store-reading research path built around existing canonical data and the existing job coordinator:

- measured `DAILY_ANALYSIS`
- deterministic `FEATURE_BUILD`
- versioned store feature snapshots
- low-priority/coalesced research scheduling
- walk-forward dataset generation
- axis discovery with support/FDR/fold guards
- model search and deterministic fingerprints
- chronological train/validation/holdout handling
- research champion registry and convergence loop
- `BACKTEST -> MODEL_SEARCH -> BACKTEST` research-cycle orchestration
- active `store-read` snapshot refresh after feature build
- authenticated read-only API for the active store-read snapshot
- bounded VPS task/resource diagnostics

The candidate does not intentionally modify protected Juggler/HANA judgment math, strict Champion, Calibration, store-share constraint, single-evidence arithmetic, or HANA hard constraints.

## Fresh verification on exact code baseline

GitHub Actions run `34743422247` verified code baseline `b80ee907f1200612c0bcca8e9a3974fb993378c7` successfully.

Observed results:

- VPS test suite: 144/144 PASS
- root regression command suite: 69/69 PASS
- Collector V3: 33/33 PASS
- production/user-flow regressions: 26/26 PASS
- home/job regressions: 10/10 PASS
- Collector preservation: 20/20 Production hashes PASS
- byte-exact clean-jitter preservation: 5/5 PASS
- build/regression verification completed successfully

The integrated research tests also cover:

- future-day poisoning cannot change an earlier prediction row
- chronological 60/20/20 train/validation/holdout split
- stable axis discovery guards
- validation-based model search
- deterministic model fingerprints
- repeat/no-improvement convergence
- persisted research champion and research-cycle scheduling

## Coordinator runtime design

The candidate web runtime starts the Coordinator as a supervised child process when the canonical DB is configured. If the child exits unexpectedly, the supervisor schedules a restart after 5 seconds. This removes the prior architectural possibility of the web service remaining healthy while the queue has no Coordinator merely because the Coordinator was never started by the web process.

This is verified at code/test level. It is not yet evidence that the candidate is currently running on the production VPS.

## Live VPS observation

A read-only public check of `https://jugest.net/api/health` on 2026-09-13 returned:

```json
{"ok":true,"service":"jugest-vps-web"}
```

This proves the current public VPS web service is reachable. It does **not** prove that this research candidate is deployed, nor does it prove current queue/Coordinator state. The detailed resource endpoint is authenticated and was not bypassed.

## Remaining validation gate

The remaining meaningful gap is real-data validation of this exact candidate on the VPS data/runtime:

`canonical data -> DAILY_ANALYSIS -> FEATURE_BUILD -> research cycle -> active store-read snapshot -> authenticated read API`

The repository does not contain the live store raw/canonical database, so this step cannot be honestly replaced by another repository-only test. The current `deploy/vps` ref is behind the candidate, therefore validating this exact candidate against live VPS data requires a controlled deployment/shadow deployment or an equivalent copy of the production canonical DB.

## Stop rule

Do **not** move `deploy/vps`, deploy this candidate to the live VPS, merge to Production, or otherwise promote the candidate without Hiro's explicit approval immediately before that action.

Until that approval, the correct state is:

> Code-complete and regression-green research candidate; live real-data candidate validation is the next gated step; Production unchanged.
