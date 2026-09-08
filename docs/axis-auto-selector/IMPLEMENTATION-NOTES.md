# Phase 1 implementation notes

Start: `astra/axis-auto-selector-shadow` at `a128347bdc2e0e9b41b327e18d4c3755a112b5d4`.
Runtime base: `273ed61ed2019365ae1b38d76288f20e9625c9e1`.
Pre-feature `npm test`: 64/64 commands PASS (including existing intentional Collector fault-injection error logs).

## Confirmed existing behavior and plan adjustments

1. The plan's `61fd208` is a documentation ancestor, not an alternative runtime base. All three required documents were read in the requested order. Runtime source at the requested HEAD is unchanged from base.
2. Legacy `v4HybridDayUtility` ranks by an unclamped weighted sum plus fixed bonus and Japanese numeric key tie-break. Visible `v4HybridApplyWeights` clamps the score and uses additional signal/P4/table tie-breaks. Capture both rather than conflate them.
3. Legacy optimizer uses final-holdout improvement to determine shrinkage. The new shadow subsystem must not copy that timing: candidate weights, including shrinkage, must be frozen before final holdout. No existing optimizer modification is permitted.
4. A `trainingCutoff` string alone cannot establish point-in-time safety. Add explicit prediction-only receipts and immutable history-prefix builder boundaries; keep outcome attachment separate. External normalized inputs remain an explicit provenance trust boundary, not proof of actual archived acquisition timestamps.
5. A full-history shadow profile may only predict a strictly later target. Historical audits must use prefix-only selections/receipts, never the final profile applied backward. Latest browser profiles are not a substitute for historical state.
6. `calendar-v1` stays unapproved/unavailable; its model/context overlap is not proven. Preserve existing fixed `hybridValidatedBonus` exactly once outside normalized weights.
7. Persist shadow JSON separately. Use uniquely named sibling temporary files rather than a shared `path.tmp`, preventing temporary-file collisions without touching browser save/restore or Device Sync.

No Production deployment, main/alias/environment action, Collector change or visible-ranking connection is authorized by this phase.

## Progress

2026-09-08 resume: remote main is now `273ed61` (user's authorized Production promotion outside this task); feature branch still `a128347`. All 26 captured runtime hashes match. Existing partial baseline helper/generator are being completed, not rewritten. Previous `/tmp` preflight log did not survive; its 64/64 PASS is historical, and final candidate requires fresh regression.

- Task 1: complete, commit `c4a5f22`; parity3/3 and production-preservation3/3, independent review approved. Five utility cases, three real runtime prediction cases, immutable fixture hash `d33aabb650494a7f8d51e7d5be706c7680b9c152259019c4714a91362ee69cf0`.
- Task 2: registry/adapter RED → GREEN complete, commit `7b055ff`; registry9/9 and combined parity12/12. Independent review resumed because the interrupted review result did not survive.
- Tasks 3–7: pending.

Latest resume: local HEAD `7b055ff` contains two unpushed implementation commits. No tracked partial diff or stash. Fresh registry/parity/preservation15/15 and protected26/26 PASS. New WORK-CHECKPOINT.md and tracked evidence preserve the local work; push only to the requested feature branch after each logical task per the user's updated requirement.
