# JUGEST VPS Canonical Ingest + Analysis Verification

Date: 2026-09-12 JST  
Branch: `sol/vps-canonical-ingest-analysis`  
Browser-path implementation commit: `b637f285ad6456e4bede82156c7853b1e917070c`  
Clean verification checkpoint before this document: `5f3bcbb64d0f567a51287cf06277b9e94a4258e5`  
GitHub Actions run: `34626908919`  
Node: `22.23.2`

## Result

The feature branch now implements the intended analytical path:

`iPhone Shortcut -> VPS Relay -> immutable raw archive -> canonical SQLite -> durable analysis scheduling -> existing JUGEST analysis runtime on VPS -> durable snapshots/receipts -> authenticated VPS read API -> JUGEST store-analysis UI`

On this path, browser IndexedDB is no longer the analytical source of truth for ordinary store-analysis viewing, and the browser does not start the local heavy store-analysis engine by default.

This is a feature-branch verification only. No Production promotion or deployment was performed by this work.

## Task 7 browser migration

The browser-side migration is implemented with these constraints:

- `vps-browser-analytics.mjs` reads the existing linked Collector receiver credentials from `jugglerRelayReceiver:v1`.
- Analytics GET requests use the authenticated `/api/vps/...` endpoints and are channel-scoped by the existing receiver credential.
- Store analysis resolves the active store from the authenticated VPS store list and reads the precomputed `analysis/default` snapshot.
- The VPS browser client contains no `externalDbGet`, `externalDbSet`, or IndexedDB analytical dependency.
- Ordinary `store-analysis` navigation requests the VPS snapshot instead of starting local historical analysis.
- The legacy local heavy runner remains only as an explicit rollback/developer fallback gated by `global.JUGEST_LOCAL_ANALYSIS_FALLBACK === true`.
- The store-analysis UI presents the actual fixed VPS worker contract: `180日 / 2000G / 単一 / 最低4日`.
- The old editable local-heavy analysis controls are removed from the ordinary store-analysis screen.
- The refresh action is now `VPS解析結果を更新`.

## Existing VPS analytical backend preserved

The feature branch already contained and continues to preserve:

- immutable SHA-qualified raw HTML gzip archive;
- canonical store/day/machine persistence in SQLite;
- idempotent same-hash replay and atomic corrected-day replacement;
- fail-closed PushV2 acknowledgement until canonical persistence and durable analysis scheduling succeed;
- explicit semantic failure budget separate from execution/defer attempts;
- one-at-a-time `DAILY_ANALYSIS` heavy worker admission for the initial 2 GiB VPS policy;
- canonical SQLite -> normalized JUGEST history reconstruction;
- existing JUGEST store-analysis runtime executed headlessly rather than reimplementing protected analysis formulas;
- durable analysis snapshots, receipts, dirty/coalesced per-store refresh state, and one follow-up refresh when new data arrives during a run;
- authenticated, channel-scoped, read-only analytical API that does not expose raw artifact paths/content.

## Fresh verification evidence

GitHub Actions run `34626908919` verified the committed branch state without mutating `app-v510.js`:

- deterministic Task 7 patch check: no diff; the checked-in `app-v510.js` already contained the complete bounded migration;
- Task 7 focused browser/static tests: **8/8 PASS**;
- root regression suite: **64/64 commands PASS**;
- VPS test suite: **93/93 tests PASS**;
- `tests/ui-home-jobs.mjs`: **10/10 PASS**;
- Collector batch V3 focused suite: **33/33 PASS**;
- grouped user-flow / recovery / production-preservation suite: **26/26 PASS**;
- Collector preservation gate: **PASS 20 Production hashes + five byte-exact clean jitter files**.

The preservation suite also verified:

- Production icons, parser, math libraries, and untouched Vercel APIs remain byte-exact;
- protected inline math/research sections remain identical to the captured Production baseline;
- fresh public build still uses the checked-in runtime source plus only the approved bounded transforms;
- FOUC and existing v5.1.2 UI/Collector/Device Sync regressions remain green.

Task 7 intentional exact hashes recorded by the preservation manifest:

- `app-v510.js`: `e12abb9ee2829422ae13182eaff145e728725f08627b3dab958ea7b5a9a6b191`
- `tests/ui-home-jobs.mjs`: `11a689e5d5cf0ba087a991e2fae46b165503f2dc47602d1336c2133722784d5b`

All other protected hashes retain their existing expected values.

## Protected semantics

This migration does **not** intentionally change:

- Juggler/HANA probability tables;
- `externalJudge` judgement math;
- single-evidence math/catalog;
- strict Champion;
- Calibration;
- store-share constraint;
- HANA hard constraints;
- ranking or prediction semantics.

The VPS worker runs the existing JUGEST analytical runtime headlessly instead of maintaining a second approximation of those semantics.

## Deliberately unchanged acquisition boundary

The VPS does not directly scrape ana-slo. Acquisition remains:

1. iPhone Shortcut obtains the source page/data;
2. Shortcut sends it through the VPS Collector/Relay path;
3. the VPS owns raw retention, canonical normalization/persistence, scheduling, analysis, snapshots, and analytical reads after receipt.

This keeps the acquisition edge thin while moving analytical memory and compute to the VPS.

## Remaining environment validation before promotion

The code-level migration is verified on this feature branch, but the following live-environment checks are still required before a Production promotion decision:

- physical iPhone Shortcut -> deployed KAGOYA VPS PushV2 using the real linked channel;
- real VPS filesystem write of the immutable raw artifact and canonical SQLite rows;
- installed/running coordinator service claiming the scheduled `DAILY_ANALYSIS` job under the real 2 GiB host conditions;
- real snapshot publication and authenticated `/api/vps/...` read from the deployed browser origin;
- end-to-end JUGEST UI rendering the real VPS snapshot for the same store/channel;
- operational observation of logs, memory pressure, retry/failure state, and one-at-a-time heavy worker behavior.

Those checks require the actual deployed environment and are intentionally not represented as completed by unit/integration CI alone.

## Promotion / deployment status

- `main`: unchanged by this work.
- `deploy/vps`: unchanged by this work.
- Production JUGEST: unchanged by this work.
- Production VPS/services/DNS/systemd: no deployment or promotion performed by this work.
- Promotion decision: **not executed**. Explicit Hiro approval is required immediately before any Production deployment/promotion.

## Resume point

If development resumes from this checkpoint, do not rebuild Tasks 1-7 from scratch. Start from this feature branch and perform the live KAGOYA/iPhone end-to-end validation above. Any deployment or merge into a production-serving branch must remain a separate, explicitly approved step.
