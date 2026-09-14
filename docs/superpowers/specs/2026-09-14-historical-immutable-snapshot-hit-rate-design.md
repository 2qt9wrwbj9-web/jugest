# Historical Immutable Snapshot + Hit Rate Design

Date: 2026-09-14
Status: approved in chat
Target branch: `sol/historical-immutable-snapshot-hit-rate`

## Purpose

Stop an in-progress historical PRE-vs-current walk-forward run from resetting when old canonical days are added or corrected, while keeping each run internally immutable and future-leak-free. Also expose intuitive Top1/Top3/Top5 day-level hit rates for LIVE and historical comparison without changing prediction or judgment math.

## Immutable run snapshot

When a historical comparison run is created, persist the exact canonical day inputs used by that run into run-owned snapshot rows. The snapshot includes each eligible business date and the normalized machine rows needed by both replay engines and the outcome scorer. Its content is immutable for the lifetime of the run and is covered by the run history identity.

Every target processed by that run reads only from these snapshot rows. It must not re-read mutable `store_days` / `machine_day_data` for replay inputs. Therefore a run that started with 195 candidates stays a 195-candidate run and can progress 86/195 -> 87/195 -> ... -> 195/195 even if canonical history changes meanwhile.

Existing prediction semantics remain unchanged: for target D, engines receive only snapshot days < D, and D is revealed only for scoring after both predictions are produced.

## Canonical changes while a run is active

Do not mark a queued/running run stale merely because current canonical history identity differs from its immutable snapshot.

Instead record that a refresh is pending for the store/replay version. The active run continues from its durable cursor using its original snapshot. Repeated canonical changes coalesce into one pending refresh.

When the active run reaches complete, compare current canonical history with the completed snapshot identity. If a refresh is pending and the identity differs, create one successor run from a fresh immutable snapshot and clear/coalesce the pending state. The successor has its own run id, identity, candidate count and cursor.

A newly appended live day beyond the active snapshot range must not restart the active run. It may be included in a later successor snapshot when a refresh is legitimately requested.

Old completed/stale runs and their day results remain available for audit; no historical day row is rewritten.

## Migration / existing in-progress runs

Existing runs created before immutable snapshot support have no run-owned snapshot and cannot honestly be continued under the new guarantee. On first refresh after deployment, retain them for audit and create one new immutable-snapshot run from current canonical history. From that point onward the reset loop is eliminated. Do not fabricate snapshot rows for already-processed legacy targets from today's mutable canonical state.

## Hit-rate definition

Do not change `scorePredictionRows`, winner semantics, quality, lift, ranking, outcome proxy, or protected Juggler/HANA/PRE/current prediction logic.

For each scored engine-day, existing metric `topK.overlap` already records how many machines overlap between predicted TopK and actual TopK. Define a day-level TopK hit as `overlap > 0`.

For each engine and comparison window expose:

- Top1 hit rate = scored engine-days with `top1.overlap > 0` / scored engine-days.
- Top3 hit rate = scored engine-days with `top3.overlap > 0` / scored engine-days.
- Top5 hit rate = scored engine-days with `top5.overlap > 0` / scored engine-days.
- For each K return `hits`, `days`, and `rate` so UI can render `38/48日 79.2%`.

This is deliberately different from existing average TopK overlap `rate` and lift. Existing metrics stay visible for analytical normalization; hit rate is the human-readable primary success measure.

Use the same aggregation definition for LIVE, historical cumulative, and recent30 windows.

## API and UI

Extend existing comparison summary objects; do not create a separate endpoint. Add hit-rate aggregates alongside existing engine metrics for LIVE and historical views.

In `PRE版 精度比較`, add a clear `実的中率` section above or adjacent to analytical lift metrics. Show 新版 and 現行 for Top1 / Top3 / Top5 with percentage and `hits/days日`. Keep lift, coverage, rank correlation, wins/losses and quality delta unchanged.

Historical view may show a compact notice such as `新しいデータあり・完了後に再検証予定` while a pending refresh exists. This notice must not imply that current progress will reset.

## Safety constraints

- No changes to Juggler/HANA probability tables or judgment math.
- No changes to PRE/current prediction/ranking semantics, strict Champion, Calibration, store-share constraint, or HANA hard constraints.
- No future leakage: target/future snapshot days cannot enter prediction for D.
- No evidence double counting.
- Collector/raw/canonical ingest durability and Push ACK semantics unchanged.
- Historical work remains low priority and Collector-preemptible.
- Production branch is not modified without a fresh explicit approval after candidate SHA and tests are presented.

## Required tests

1. Create an immutable run, process part of it, mutate/add canonical history inside its original date range, request refresh, and prove run id/total/processed/cursor remain unchanged and the next replay uses original snapshot data.
2. Repeated canonical changes while active coalesce and do not create multiple successor runs.
3. Completing an active run with pending changed history creates exactly one fresh successor snapshot/run with the new candidate count.
4. Appending a live day does not reset or expand an active snapshot.
5. Future-day poisoning still cannot change an earlier prediction.
6. Restart/resume uses the same immutable snapshot and cursor.
7. Legacy pre-snapshot in-progress runs are retained for audit and replaced once, rather than silently mixing mutable inputs.
8. Hit-rate aggregation returns correct hits/days/rate for Top1/3/5 independently of average overlap rate/lift.
9. LIVE and historical summaries expose identical hit-rate shapes, including recent30.
10. UI renders percentages and hit/day counts for both engines and both tabs.
11. Existing comparison metrics, winner counts, durability tests, Collector tests and production-preservation tests remain green.
