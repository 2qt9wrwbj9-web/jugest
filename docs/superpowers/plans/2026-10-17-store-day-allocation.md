# 店舗単日投入分析 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for integration, and superpowers:dispatching-parallel-agents for the independent pure-math and data-provenance units. Use test-first changes and keep task ownership separate.

**Goal:** 店舗・営業日を指定し、9ジャグラーの投入台数・全456/56/6・半分/1/3以上を、全組合せ平均と慎重な比較で表示する。

**Architecture:** 原本を伴う厳密な読取、既存尤度捕捉、純粋な投入計算、独立結果キャッシュ、既存店舗画面に追加する表示を分ける。元DBと既存の数学/同期/PREを変更しない。

**Tech Stack:** 現行JavaScript、Node>=22.13、node:sqlite、既存custom-element UI、Python/SciPy独立計算。

**Spec:** `docs/superpowers/specs/2026-10-17-store-day-allocation-design.md`（Library取得版SHA256 ec071bc98264c23f0234ab24c2918f6829b7705db4f7c10639f0ca37abfc1223）。

## Global Constraints

- Baseline: deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5。専用branch work/store-day-allocation-20261017。
- 本番デプロイ・本番DB/環境/サービスの変更は禁止。開発branchへのcommit/pushは許可済み。
- 個別判別数学・確率表・個別q/期待設定・既存group判別・同期/PRE/予測の意味を変更しない。
- 9キーは my,my6,im,go,fk,hp,gg,mr,um。未対応は台帳に残す。
- 0Gは原本でBB=RB=0が立証できたときだけ中立行。欠損/推定G/矛盾を0へ変換しない。
- 全台数を全組合せ平均。二項係数の除算を必須とする。結果を見た台の選別は禁止。
- 主表示はボーナス、既存差枚判別は別参考。確率表の複製や改変禁止。
- 強判定は未校正で有効化しない。モデル内通過と実店舗的中率を混同しない。
- 日本語で結論・不確実性・保留理由を先に伝える。通常UIに生の英語識別名を出さない。
- 全機種集合、固定版、宣言M/alphaをフィルターで変更しない。

## Review Focus

1. 原本にnull/空欄があるのにcanonicalが0：不明として保留し、中立0Gにしない。
2. PIAの同一履歴が複数日繰返す/入替がある：現在台帳を過去日にそのまま使わない。
3. 同日訂正中のヘッダー/台行：同一read snapshot、入力hashで失効する。
4. PIA viewer/assistant-readが新URLへ入る：許可された店舗のみ、他店結果や原本パスを漏らさない。
5. 全6/無情報/ゼロ尤度/設定3対4：包含、前提依存、保留を維持し、強判定を捏造しない。

## Task 1: Pure allocation mathematics

**Files:** Create `store-day-allocation.js`, `tests/store-day-allocation.mjs`; no legacy math files.

**Interfaces:** globalThis.JUGESTStoreDayAllocation, classic IIFE usable through Node import and browser script.

`analyzeMachine({rows,familySize=9,alpha=.05,detail=null,includeSensitivity=true})`.

Rows contain `{id,tableNo,machine,input:{games,bb,rb,diff},bonusLogs:[6],logs:[6],individual:{q,...}}`; core may accept `logs` when bonusLogs omitted for isolated numerical tests. Authoritative service always supplies bonusLogs. Maximum n=120.

Output `{ok,version,n,bands,detail,warnings,strongEnabled:false}`. `bands` is an array with ids `456`,`56`,`6`; each band has `distribution`,`priorDistribution`,`expected`,`median`,`interval:{lo,hi}`,`sensitivityRange:{lo,hi}`,`events`. Principal events ids `all`,`half`,`third` have `{kind:'atLeast',count,priorProbability,posteriorProbability,logBF,logEValue,logThreshold,modelPass,strongEnabled:false,baselines}`. Fixed-count evaluation is available via `detail:{band,kind:'exact'|'atLeast',count}`; exact events have no positive e declaration unless separately registered. Detail returns conditional per-row distributions without changing ordinary q. Addition of well-defined diagnostics allowed; naming changes must be coordinated.

- [x] Write failing tests for two-row enumeration, neutral logs, priors, mixed shared components, all6 prior, inclusive marginal consistency, null maximum, e<=1 for all with 0G, exact/atLeast, immutability, malformed input.
- [x] Observe failure from missing feature before implementation.
- [x] Implement log-space count DP, shared4 mixture, bivariate marginals, prior conditioning, baselines, fixed normalized detection mixtures, maximum null, fixed-count and conditional detail.
- [x] Implement fixed sensitivity set: shared4 flat (default), independent flat, 70/10/10/10 flat, shared4 binomial .1, shared4 beta-binomial(1,4), shared4 low-group .7/.2/.1, shared4 low-group .1/.2/.7, high4 mixture .25/.5/.125/.125, high6 mixture .25/.125/.125/.5. No same-data fitting.
- [x] Run scoped tests; record RED/GREEN and performance. Parent runs whole suites after integration.

## Task 2: Read-only canonical and native provenance

**Files:** Create `vps/src/allocation/store-day.mjs`, `provenance.mjs`, `results.mjs`, and focused `vps/tests/allocation-*.test.mjs` for those modules. Do not edit analytics/UI or core math.

**Interface:** `loadAllocationSnapshot({dbPath,rawRoot,storeId,date})` returns `{ok,code?,store,date,snapshot,roster,groups,unsupported,quality}`. Groups contain `{machine,machineName,nInstalled,nObserved,eligible,reasons,rows,zeroGamesN,lowGamesN,diffN}`; rows preserve strict observed numeric fields and provenance. `snapshot` carries source/normalized/raw/roster hashes, exact date and verification scope. `roster.status` is verified/partial/unverified and retains unsupported native rows. Unknown installation count is null, never equated to observed count.

`AllocationResultStore` in results.mjs uses a separate supplied sqlite path or bounded memory; keys include exact store/date/input/roster/model/scope hashes. It must never migrate the canonical DB. Store query is separate from computation and subject to authorization in Task3.

- [x] Write failing tests for exact day not found, missing-vs-zero, duplicates, replaced machine, unsupported roster, native vs repackaged, revision changes, read-only snapshot and no canonical/schema/job mutation.
- [x] Observe failure, then implement readOnly SQLite snapshot reads and safe raw archive reads confined to rawRoot.
- [x] Reuse pure source parser/PIA difference derivation when possible. Validate original fields before Number conversions; compare canonical to native day observations and same-day complete roster. For PIA, use stored current/previous native snapshots when needed to establish a unique day, and be conservative where installation/date is ambiguous. Do not fetch source sites or start collectors.
- [x] Add independent result cache, version/correction invalidation, bounded entries.
- [x] Run scoped tests and report limitations without claiming every canonical day has native provenance.

## Task 3: Existing likelihood adapter, service and authorization

**Files:** Create `vps/src/allocation/likelihoods.mjs`, `service.mjs`, `handler.mjs`; minimally modify `vps/src/analytics-handler.mjs`, `web-server.mjs`, `access/handler.mjs`, browser client, and deployment file lists if required.

**Interfaces:** `captureAllocationLikelihoods({rootDir,rows})` preserves legacy individual results, bonusLogs, combined logs/table hash. `analyzeStoreDay({storeId,date,detail?})` reads Task2 snapshot, reserves full principal event family M from roster before exclusions, invokes Task1 per complete eligible group, and returns a store/date/input-hash report with all groups/unsupported/reasons. Unverified data yields reference/held result, never fabricated full coverage.

Route: GET/HEAD `/api/vps/stores/:id/days/:date/allocation`; optional strict query machine/band/kind/count/detail. No input logs or priors accepted from public API. GET has no existing canonical writes/PRE/collector/sync side effects. New result sidecar is opt-in until deployment procedure explicitly creates it; memory caching works without migration.

- [x] Tests first for legacy result parity, no prior double count, 0G bypass, detail contract, unsupported/incomplete groups, principal M stable under filter, hash cache invalidation, auth matrix and no legacy side effects.
- [x] Add capture adapter through existing runtime callbacks, not a cloned model.
- [x] Wire handler before legacy openDatabase/migrate. Read canonical with readonly utilities; authorize store before returning cached data.
- [x] Add only bounded read permission for PIA and read-only keys. Keep public judge_machines unchanged. Add browser cookie transport for the exact new read route.
- [x] Bound CPU/concurrency/cache and allow cancellation/timeouts. Use worker/job if measured cost requires it.
- [x] Run focused and existing server/client tests.

## Task 4: Store-day UI

**Files:** Create `store-day-allocation-view.js`; modify `app-v510.js`, `app-v510.css`, `index.html`, `build.mjs`, relevant static/deploy allowlists; new `tests/store-day-allocation-ui.mjs` and browser tests.

- [x] Tests first for store/date selection, render of complete/held/unsupported groups, no default event percentages/strong badges, sorting retaining M, stale request invalidation, detail exact count vs atLeast, escaping.
- [x] Add 投入分析 next to existing 台データ with the same selected store and exact day.
- [x] Display installation coverage, estimate interval and sensitivity envelope, all/half/third, uncertainty/reasons; 320px card layout.
- [x] Detail: count histogram, ordinary individual q and conditional q separate, hypotheses, baselines, fixed count selector, assumptions and unverified calibration note.
- [x] Include new files in built and VPS-patched serving; verify old build anchors and legacy pages.
- [x] Run mobile Chromium/WebKit widths 320/375/390/430 where environment supports them, include built and patched versions.

## Task 5: Independent numerical and operational validation

**Files:** Create independent Python reference, simulation/benchmark scripts and versioned evidence under docs/development/store-day-allocation-20261017.

- [x] Python full configuration enumeration for small n and independent coefficient arithmetic; compare all marginals/events/prior/conditional/e/null values with production.
- [x] Preserve all legacy functions/tables numerically against baseline 9x128 or existing parity checks.
- [x] Fixed seed screening across nine machines, n/G/all-low/intermediate/K/all4/all6/mixed; disjoint validation seeds, targeted store-family false positives and boundary misclassification, report power/misses/hold rates and confidence limits. Large generation must not run on production.
- [x] Read-only export of bounded native production snapshot/canonical input only, verify local input provenance; run new engine locally, never alter production.
- [x] Run benchmark n58/60/120 and sample store, then both whole root and VPS suites.
- [x] Calibration remains disabled if validation is outside coverage or release gate unmet. Save manifests for every evaluated condition.

## Task 6: Independent review, fixes, saving

- [x] Create separate math and integration review packages against baseline; fresh reviewers read spec/plan/diff and test evidence.
- [x] Reproduce/fix meaningful findings, rerun affected tests and whole suites when changes warrant it.
- [x] Save implementation/evidence/preview/deploy instructions; commit only intended files to work/store-day-allocation-20261017 and push that branch only.
- [x] Verify remote branch SHA, clean intended worktree, and unchanged production reference.
- [x] Report feature behavior, measured performance/calibration limitations, unresolved risks and exact deployment/migration/rollback steps. Do not merge/deploy.

## Final execution status — 2026-10-18

Completed within the approved reference-analysis scope. Root88/88 commands, VPS642/642 tests, independent85,288 numeric comparisons, final simulation190,188 scores, and Chromium12/12 source/built/patched scenarios passed. Independent review INT-01..10 and math findings are resolved. WebKit could not be installed; Safari and real-world calibration remain unverified. Practical strong-detection power failed its release gate; strongEnabled remains false. Production has not been changed. Final saving and remote work-branch verification are recorded in the progress ledger and verification.json.
