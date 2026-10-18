# Implementation ledger

- User authorized implementation, independent review, work-branch commit/push. Production deployment, deploy/vps/main merge/push, production services/config/data/migration are prohibited without immediate explicit permission.
- Workspace: `/workspace/scratch/ad7c23290e80/jugest-store-day-impl`; branch `work/store-day-allocation-20261017`; base `1f8c29fc458f34e11e546fb57944d0fc31db98a5`.
- Library three design inputs were retrieved; ZIP integrity checked. Design SHA256 `ec071bc98264c23f0234ab24c2918f6829b7705db4f7c10639f0ca37abfc1223`. Approved spec and plan are committed in def8a17.
- Read-only GitHub deploy/vps and production current checks remain at base. No production mutation has occurred.

## Final implementation and verification — 2026-10-18

- Pure all-count shared-prior engine frozen: `d69631c56ed0334eef8685c0298a0f4ec05d78c8622e7971475c6b2bf1067ce6`. Bonus likelihoods captured from the authoritative existing runtime; ordinary q and legacy math unchanged. Difference-inclusive scores remain a separate approximate reference.
- Strict native provenance reader, store/day identity, complete roster, missing-vs-real-zero distinction, duplicate/machine checks, same-day correction invalidation. Membership and observation-day proofs are separate. Unsupported/ambiguous rows remain visible.
- Read-only owner/viewer/assistant/OAuth API, dedicated readonly store lookup, worker/concurrency/abort/timeout, bounded separate result cache. No legacy schema/PRE/sync/collector changes.
- Owner retries a cached partial calculation failure; readonly viewers can still inspect the saved partial result. Added RED/GREEN regression and independent INT-10 closure.
- Final UI frozen; Chromium153 with Japanese fonts passed all12 source/built/VPS-patched cases at320/375/390/430px. Scoped UI22+VPSv2 5 passed. WebKit ZIP/lock installation failed, so Safari/iPhone remains unverified.
- Fresh `npm test`:88/88 commands. Fresh `npm --prefix vps test`:642/642 tests. Existing local pachinko fixture needs empty `/var/lib/jugest`; only the isolated test environment was prepared.
- Protected original expectations remain. Reviewed allocation UI hunks are restored by a hash-pinned preservation helper; manifestSHA256 `6c770351309ae6599771a49d74bad32f94afa93a9777bdfe8ead9349b471cd4a`.
- Independent high-precision reference:85,288 comparisons,45 cases,46,320 exhaustive configurations; max probability error2.66e-15/log2.27e-13. Legacy9x128 full results identical. Independent math review final extra13,122 checks passed; no unresolved findings.
- Final fixed-core simulation:476,928 generated groups,190,188 scored,314.81s,9,752 unique disjoint RNG streams. summarize.py independently verified hashes/counts/fingerprint. Strong display disabled for every result. Practical exact-all detection power failed; zero observed false positives in specified simulated conditions is not a real-world guarantee.
- Final real-data reproduction uses sanitized public-observation fixture (SHA6831ec85b1765d852d18eddf06433fc6c80e969ec51c1470bf325681a4974090), not operational export. Roster107, supported106 (58/24/24), one confirmed0G; unsupported1 remains observation-held; local canonical unchanged. InputHash552b8f9b1da6ea074a7de4ad21fb6425763be80e06c97fe38beddda697c3497c.
- Final quiet local full-path benchmark2-CPU affinity:1000rows3.197s, cached162ms, peakRSS194MiB, JSON8.17MB. Concurrent suite load produced5.1s; not a production latency or2GiB-container guarantee.
- Integration independent final review72 VPS tests,27 UI/client tests,27 math tests,21 file hashes checked. INT-01..10 closed; no unresolved critical/important finding in reviewed scope.
- Implementation report, API/operation/rollback notes, evidence index, and final verification manifest saved with the repository. Strong detection, Safari, real-world calibration and optional persistent cache setup are explicitly outstanding scope/risks.

## Saving checkpoint

Product changes and evidence are ready for the authorized work-branch commit and push. Preserve this worktree. Do not deploy or update production refs. Final git/remote verification is recorded after saving; see the final commit history and verification.json.
