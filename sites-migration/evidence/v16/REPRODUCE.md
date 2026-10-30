# 保存版16 独立復元・追試・再開

配布ZIPを展開し、`python VERIFY_EVIDENCE.py`、`python VERIFY_GIT_RESTORE.py`。SITES_SAVED_VERSION.jsonとDELIVERY_INDEX.jsonの完全SHAが再開正本。取得済みSite全local refsをbundle、元repositoryのshallow履歴/objects/shallow markerを別archiveへ保持。全GitHub履歴を取得したとは主張しない。source/には省略のない全ソース/4管理正本/全ログがある。

Node24（最低22.13、node:sqlite必要）、lock依存を公式Sites install helperから導入。SiteはSites skillのsource helperで開く。公開不要/禁止。元固定commitは1f8c29fc458f34e11e546fb57944d0fc31db98a5。public packageはsites-migration/upstream→..symlinkと直接Miniflare依存を維持。

## コマンド

- Site全回帰：`node --test --test-concurrency=1 tests/port-*.test.mjs`
- public package：元repository rootで`node --test --test-concurrency=1 sites-migration/tests/*.test.mjs`
- 元front/VPS：`npm test`、`npm test --prefix vps`
- 生成：Siteで`npm run prepare:jugest`。生成前後のtracked差分不変を確認。公式build-site.mjsでbuild。
- 元feature子プロセス/全保存値：`JUGEST_COMPARE_REPORT=1 node --test tests/port-feature-side-effects.test.mjs`
- PRE全行/日次：`JUGEST_COMPARE_REPORT=1 node --test tests/port-formal-pre.test.mjs tests/port-pre-jobs.test.mjs`
- 研究→PRE実Queue：`node evidence/v16/native-research-chain.mjs`
- 4scale元数学/前版との全工程：`python evidence/v16/run-comparisons.py`→`python evidence/v16/summarize-memory.py`
- 新active/PRE負荷：`node evidence/v16/active-pre-load.mjs 180 160`等4scale（90/180/240×106、180×160）。元FEATURE_BUILDのlatest180仕様は保持。
- 正式holdout：`node evidence/v16/holdout-comparison.mjs`、`node evidence/v16/holdout-load.mjs 180 160`等4scale。
- 実OOM：`node evidence/v16/oom-recovery.mjs`、同`machine-only`、`cycle-oom-recovery.mjs`、`holdout-oom-recovery.mjs`、`active-pre-oom-recovery.mjs feature-build`、同`formal-pre`。各命令はローカルworkerdを意図的に枯渇させる。
- 管理正本：`python evidence/v16/validate-ledger.py`
- 物理schema監査：`node evidence/v16/schema-comparison.mjs --audit`。引数なしは厳密schema差を示し失敗する。これは既知の物理互換未達であり、成功と読み替えない。generate-schema-comparison.mjsは履歴の作成手順でappend型のため**最終schemaへ再実行禁止**。
- メモリ集計：`python evidence/v16/build-memory-report.py`

全コマンドとexit・件数はcommand-results.json、全生ログはlogs/。修正前失敗も収録。個別試験を全体成功へ代用しない。

## 次回の最初の作業

1. native保存receipt/最新版を照合し、4管理正本とDEPENDENCIES/FAULT_REPORT/HOST_VALIDATION_PLANを読む。
2. 元daily-analysisのPRE日次受付と、正式trialのterminal評価→active採用後続のcall graph/条件/履歴/CASを固定元で確認。安全に未採用結果から移植し、元全保存値・旧active保持を比較。
3. PRE長期trial/全failure境界と大容量active snapshotのR2公開adapter。R-SCHEMAのdefault/null差は元入力/API境界の意味を確認しschema adapter方針を記録。
4. ACCESS専用bindingの提供方法と招待/enrollment発行/WebAuthn/Origin/CSRFを独立試験で進める。通常DBに混在させない。
5. host非公開Queue/Cron/第2D1/総memory観測の正式interface確認。公開が必要なcanaryのみ最後に明示許可を求める。外部恒久基盤を追加しない。
6. Sync/Collector/パチンコ/MCP/OAuth/本番移行など残る55機能を正本の依存順で進める。

成果物作成/ZIP収録/永続保存/再取得/ユーザー共有を区別する。保存版16のSHAは保存後の外部receiptを正本にする（source自身に自己SHAを埋め込まない）。
