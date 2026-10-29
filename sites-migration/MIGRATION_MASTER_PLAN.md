# JUGEST 完全移植マスター計画（authoritative / 保存版14）

元fixed deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5。再開Site13@00c5edcac2a2f1597db91800f08d176da9b746fe、GitHub work/sites-migration-20261027@d2f6513944a8d63d90e8ea33c8c8a06ed5eff34e。保存後の正確なSHA/receiptはZIP参照。公開許可ではない。

55機能IDを全て維持。各行は「local実装」「元比較」「画面/API」「local無人」「実Sites」「最終gate」を分離する。対象subsetの合格と全機能完成を混同しない。host未検証のため全体完成の行・完成率は出さない。元155source/42SQL表+relay_kv/全fixed treeの索引はevidence/v13原本とv14コピー。同じsourceを再調査して進捗扱いにしない。動的UI/実配信/全APIのsemantic完全監査は未完（B-COVERAGE）。

## 次の依存順と停止条件

1. CYCLE-04/B-HOLDOUT：研究収束まではlocal完成。元holdoutの全歴代champion・固定input・better/rankRows/score/予測行/hashを段階保存し、再開・原子的確定を検証する。active model/PREは別gate。
2. AUTH-01/03/U-ACCESS-BINDING：専用DBでのsession互換単位を足場に、Sites第2D1の提供条件を確認。canonical DBへ認証表を混在させない。正式WebAuthn/招待発行/rate/全scopeへ進む。
3. B-MEM/AN-02：4規模/繰返しでも単純な候補参照解放のピーク改善は不確定。高コストcheckpointは導入しない。元共通母集団・候補順・全BHの契約をpure kernelで固定してから分割を検証する。研究/他機能を停止させない。
4. U-QUEUE/B-HOST：HOST_VALIDATION_PLAN.mdの提供interface/非公開実行を確認し、公開が必要なhost canaryの最終操作だけ別承認へ分ける。外部恒久基盤なし。
5. 正式PRE/過去・店舗横断比較→Collector/自動収集→端末同期→pachinko/全MCP/OAuth→許可された実データ移行を、依存と権限の完成順に接続する。独立pure計算/変換の試験は先行可能。

機械的再開：receipt→本書→BLOCKERS→ACCEPTANCE→STATUS→evidence/v14/REPRODUCE.md。機械可読行はmigration-matrix.json。UNKNOWNは不可能とも完成とも扱わない。

## UI-01 本番パッチ適用フロントと主要画面

- 元ファイル/関数/API: index.html;app-v510.js;vps/src/ui-source-patch.mjs:patchJugestIndexSource
- Sites対応: scripts/prepare-jugest-assets.mjs;client/sites-store-connection.mjs
- 状態: 部分実装
- 互換性と境界: 閲覧/解析の対象経路は再利用。全導線の統合は未完
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["API-01", "MATH-01"]
- 障害: ["B-HOST", "B-COVERAGE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## UI-02 PWA/service worker/offline/cache/更新

- 元ファイル/関数/API: site.webmanifest; index.html:manifest/icon/apple meta（固定treeにsw.js/service worker登録は見当たらず）
- Sites対応: public/site.webmanifest; public/index.html; scripts/prepare-jugest-assets.mjs
- 状態: 仕様・対応方法が未確認
- 互換性と境界: PWA manifest/icon再利用。service workerが元で動くとは推定しない。offline/新origin/device動作は未検証
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "仕様・対応方法が未確認", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["UI-01"]
- 障害: ["U-PWA"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## UI-03 設定・実戦・端末履歴・インポート/エクスポート

- 元ファイル/関数/API: index.html;core-v510.js;app-v510.js
- Sites対応: public/index.html;public/core-v510.js
- 状態: 部分実装
- 互換性と境界: 原UIコード保持。実端末データ移行は未実施
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["SYNC-01"]
- 障害: ["B-MIGRATE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## UI-04 管理・PIA閲覧画面

- 元ファイル/関数/API: access-ui.mjs;vps/src/access/pages.mjs
- Sites対応: public/access-ui.mjs
- 状態: 未実装
- 互換性と境界: 画面ファイルがあるだけでは正式認証成立としない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["AUTH-01"]
- 障害: ["B-AUTH"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## MATH-01 ジャグラー単台判別/公衆judge

- 元ファイル/関数/API: judgement-model.js;vps/src/mcp-handler.mjs:judgeMachinesPublic
- Sites対応: lib/generated-judge.mjs;app/api/public/judge/route.ts
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 元現行機種の数値比較済み
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## MATH-02 ハナハナ/欠損推定/複数台・全台系

- 元ファイル/関数/API: hanahana-judge.js;missing-inference.js;group-judge.js
- Sites対応: public/hanahana-judge.js;public/group-judge.js
- 状態: 部分実装
- 互換性と境界: 原数学source再利用。全画面API組合せ/host未検証
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["UI-01"]
- 障害: ["B-COVERAGE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## API-01 店舗一覧/営業日/台データ

- 元ファイル/関数/API: vps/src/analytics-handler.mjs:createAnalyticsHandler /api/vps/stores/{id}/days
- Sites対応: lib/store-read-api.mjs;lib/generated-store-read.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 日付/件数/並び/欠損/権限を元比較
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01", "AUTH-02"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## API-02 保存分析/解析履歴/状態

- 元ファイル/関数/API: vps/src/analytics-handler.mjs analysis/default,analysis/history,status
- Sites対応: lib/store-read-api.mjs;lib/analysis/job-api.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 保存値と安全な結果取得。元refresh全意味は別
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["JOB-01", "DATA-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## API-03 legacy-plan/正式store-read/comparison/resource API

- 元ファイル/関数/API: vps/src/analytics-handler.mjs legacy-plan,research/store-read,research/comparison,system/resources
- Sites対応: lib/generated-store-read.mjs（read subset）
- 状態: 部分実装
- 互換性と境界: 正式writer/監視/全レスポンス互換は未接続
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-01", "COMP-01", "OPS-01"]
- 障害: ["B-COVERAGE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## AN-01 店舗傾向/パターン・全体解析

- 元ファイル/関数/API: index.html:brutePrepare,bruteGenerate;vps/src/jobs/daily-analysis.mjs
- Sites対応: lib/analysis/compiled-worker.mjs;lib/analysis/jobs.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 固定入力で元default分析の比較済み。全option範囲は未完
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["API-01", "JOB-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## AN-02 現行予測/全モデル/ランキング

- 元ファイル/関数/API: index.html:v5AnalyzeStore,v4PredictStore,bruteSingleGenerate
- Sites対応: scripts/generate-worker-analysis.mjs;lib/analysis/compiled-worker.mjs
- 状態: 技術的障害あり
- 互換性と境界: 全候補評価後の索引/機種group参照を解放。全BH集合・演算/候補/同点順は不変。4規模元8値/全出力一致。ピーク改善とhost128MBは未証明
- 証拠: evidence/v14/model-comparison.json; memory-results.json; MEMORY_REPORT.md
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "技術的障害あり", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["AN-01"]
- 障害: ["B-MEM"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 単純解放ではピーク低下不確定。元共通母集団/候補順を固定したpure候補kernel・全BHの契約試験から分割の可否を判定

## AN-03 v5前半checkpoint/台別特徴量分割

- 元ファイル/関数/API: index.html:v5PrepareHistory,v5Backtest,brutePrepare
- Sites対応: lib/analysis/model-prefix.mjs;machine-batches.mjs;machine-row-codec.mjs
- 状態: 部分実装
- 互換性と境界: 数学一致。全行統合/全体モデルは単一呼出し
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["AN-02", "JOB-01"]
- 障害: ["B-MEM", "R-COST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## FEAT-01 FEATURE_BUILD/特徴量永続化

- 元ファイル/関数/API: vps/src/jobs/feature-build.mjs;research/feature-builder.mjs
- Sites対応: lib/analysis/feature-build.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 元特徴量の値/hash/行互換を維持。opt-inで成功確定と同じtransactionに研究loop/固定BT/outboxを追加
- 証拠: 既存元SQLite比較回帰; cycle-sqlite-final.log; native-cycle.log; BROWSER_CHECK.md
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["API-01", "JOB-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## BT-01 研究BACKTEST/学習・検証予測行

- 元ファイル/関数/API: vps/src/jobs/backtest.mjs;research/backtest.mjs
- Sites対応: lib/analysis/research-backtest.mjs;generated-backtest-kernel.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 元SQLite行/順位/score/hash比較、holdout封印
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["FEAT-01", "JOB-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## BT-02 大容量BACKTEST保存・再開

- 元ファイル/関数/API: vps/src/jobs/backtest.mjs:persistSplit
- Sites対応: lib/analysis/backtest-staging.mjs;generated-research-dataset.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 同値canonical hash、private SQL stageと最終原子確定
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["BT-01", "DATA-01"]
- 障害: ["R-D1", "R-COST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## SEARCH-01 軸探索/最大128候補/未昇格評価保存

- 元ファイル/関数/API: vps/src/jobs/model-search.mjs;research/axis-discovery.mjs;research/model-search.mjs
- Sites対応: lib/analysis/research-model-search.mjs;generated-model-search-kernel.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 元子process/全candidate比較。昇格なし
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["BT-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## CYCLE-01 BACKTEST→MODEL_SEARCH自動受付

- 元ファイル/関数/API: vps/src/analysis/research-cycle.mjs:recordBacktestCompletion,scheduleModelSearch
- Sites対応: lib/analysis/research-transition.mjs; jobs.mjs; background-runner.mjs; worker/index.ts
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 既存の未昇格BACKTEST→探索を維持。opt-in cycleはroot単位にidentityを固定し、同じsnapshot/modelから後続を自動受付
- 証拠: tests/port-research-transition.test.mjs（既存）; port-research-cycle.test.mjs; evidence/v14/logs/native-cycle.log; BROWSER_CHECK.md
- 画面/API: 元解析画面の過去検証から自動探索、nextJobIdと保存履歴で再取得
- 開発環境: nativeローカルQueue・画面とも完走。配信失敗/重複/古世代/最終rollbackを検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["BT-01", "SEARCH-01", "JOB-02"]
- 障害: ["B-PIPELINE"]
- 完成条件: 元logical identity/入力/モデル/round/holdout分離の一致、再試行/重複/権限/画面の試験を維持しhost無人実行を検証
- 次作業: ホストQueue契約と再配信を検証。元logical keyはcontextに保持しインフラidentityはchannel/input/rootで分離

## CYCLE-02 研究loop/frontier/generation/再試行履歴

- 元ファイル/関数/API: vps/src/analysis/research-cycle.mjs:getResearchLoop,ensureResearchCycle
- Sites対応: db/schema.ts:researchLoops/sitesResearchContext; drizzle/0011*,0012*; lib/analysis/research-transition.mjs
- 状態: 部分実装
- 互換性と境界: frontier/gen/round/noImprove/repeated/stateを元と比較。決定latchと原子的publication、入力・実装・世代・registry snapshotをfence。正式holdout後状態は未移植
- 証拠: port-research-cycle.test.mjsの6分岐・全cycle元SQLite比較・rollback/race; cycle-oom-results.json
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-01"]
- 障害: ["B-PIPELINE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 正式holdoutの固定model集合・予測行/score保存・復旧を移植

## CYCLE-03 champion昇格・候補棄却/履歴

- 元ファイル/関数/API: vps/src/analysis/research-cycle.mjs:recordModelSearchCompletion,upsertCandidate
- Sites対応: lib/analysis/research-cycle.mjs; jobs.mjs; drizzle/0013*,0014*; client/analysis-job-panel.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 研究championの採用/棄却/歴史化を元recordModelSearchCompletionと比較。candidate/世代/score/createdAt更新規則を維持。active modelは変更しない
- 証拠: evidence/v14/logs/cycle-sqlite-final.log; native-cycle.log; real-cycle-oom.log; browser-promoted.txt
- 画面/API: 既存解析panelの研究cycle checkboxから開始、採否/履歴/個別結果を表示。開発用権限のみ
- 開発環境: 6分岐と実データ合成cycle、故障・競合・実OOM復旧が合格
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-02"]
- 障害: ["B-PIPELINE"]
- 完成条件: 対象採否/履歴/次logical job/権限/競合の比較を維持し、実hostで同じ決定・復旧を確認。正式採用と混同しない
- 次作業: ホスト無人運用/監視を検証、正式holdoutとactive-model採用を別gateで実装

## CYCLE-04 反復/無改善収束/holdout解禁

- 元ファイル/関数/API: vps/src/research/model-search.mjs:shouldConverge;research/holdout.mjs:finalizeSealedHoldout
- Sites対応: lib/analysis/research-cycle.mjs:planResearchDecision; evidence/v14/holdout-boundary.mjs（元のみ）
- 状態: 部分実装
- 互換性と境界: 元shouldConvergeをそのまま使用。repeat/no_improvement終了を比較。移植先はconverged_holdout_pendingで封印継続。元本番はdaysを渡してholdout確定まで進むため、そこは明確な未移植差分
- 証拠: cycle-sqlite-final.log（days=null境界まで一致）; holdout-boundary.json（元正式評価のみ）; native-cycle.log
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-03"]
- 障害: ["B-PIPELINE", "B-HOLDOUT"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 全歴代championの固定集合、元better/rankRows/holdout hashと予測行を分割保存して一致・再開・原子確定を検証

## PRE-01 active model/store-read生成・説明

- 元ファイル/関数/API: vps/src/research/store-read-output.mjs;store-read-explain.mjs
- Sites対応: read subsetのみ
- 状態: 未実装
- 互換性と境界: 現行予測を正式PREと呼ばない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-04"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## PRE-02 PRE-v2正式trial/champion/challenger

- 元ファイル/関数/API: vps/src/research/pre-v2/trial.mjs;trial-store.mjs;formal-start.mjs
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: 元正式試験開始/権限/状態を再利用する必要
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-01", "AUTH-01"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## PRE-03 PRE-v2 relevance/outcome/NDCG/sequential

- 元ファイル/関数/API: vps/src/research/pre-v2/relevance.mjs;outcome.mjs;ndcg.mjs;sequential.mjs
- Sites対応: 原sourceのみ
- 状態: 未実装
- 互換性と境界: 元定義/時系列評価/閾値を変更しない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-02"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## PRE-04 正式model/prediction store・日次loop・auto start

- 元ファイル/関数/API: vps/src/research/pre-v2/formal-model-store.mjs;formal-prediction-store.mjs;formal-daily-loop.mjs;formal-auto-start.mjs
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: 履歴・予測時点・結果確定の互換が必要
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-02", "JOB-03"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## COMP-01 予測と実績・shadow/答え合わせ

- 元ファイル/関数/API: vps/src/jobs/shadow-predict.mjs;research/live-comparison.mjs;analysis/comparison-refresh.mjs
- Sites対応: read subsetのみ
- 状態: 未実装
- 互換性と境界: 予測時点と実績を分離
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-01", "API-01"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## COMP-02 過去比較/歴史PRE/walk-forward

- 元ファイル/関数/API: vps/src/jobs/historical-compare.mjs;research/historical-comparison.mjs;historical-pre-simulator.mjs;historical-summary.mjs
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: 過去時点のモデル/入力/順位を保持する必要
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-01", "COMP-01"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## JOB-01 lease/attempt/固定入力/結果確定/回収

- 元ファイル/関数/API: vps/src/queue.mjs;analysis/refresh-state.mjs;child-runner.mjs
- Sites対応: lib/analysis/jobs.mjs;input-snapshot.mjs
- 状態: 部分実装
- 互換性と境界: Sites専用queueで元retry意味を再利用。全job type互換未完
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## JOB-02 永続outbox/Queue無人配信/復旧

- 元ファイル/関数/API: vps/src/coordinator.mjs;coordinator-supervisor.mjs
- Sites対応: lib/analysis/dispatch.mjs;background-runner.mjs;worker/index.ts
- 状態: 部分実装
- 互換性と境界: local native Queue/OOM成功、host binding未確認
- 証拠: 既存Queue/outbox回帰 + evidence/v13/native-research-chain.mjs; transition-new-fixed.log
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["JOB-01"]
- 障害: ["U-QUEUE", "B-UNATTENDED"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: ホストbinding供給とdispatch自動回復を検証。公開なしでは実host完了としない

## JOB-03 定期scheduler/日次実行/collector barrier

- 元ファイル/関数/API: vps/src/main.mjs;web-main.mjs;scheduler-policy.mjs;collector-aware-coordinator.mjs
- Sites対応: worker/index.ts（handlerのみ）
- 状態: 仕様・対応方法が未確認
- 互換性と境界: handler存在はhost Cronがある証拠でない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "仕様・対応方法が未確認", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["JOB-02", "COLL-01"]
- 障害: ["U-QUEUE", "B-UNATTENDED"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## COLL-01 PIA自動収集・fetch cadence・scheduler

- 元ファイル/関数/API: vps/src/collectors/pia-public.mjs;pia-scheduler.mjs
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: 外部取得/parse/頻度/利用条件/許可を検証
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-02", "JOB-03"]
- 障害: ["U-EXTERNAL"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## COLL-02 PIAバックフィル/取得queue

- 元ファイル/関数/API: vps/src/collectors/pia-backfill-once.mjs;ingest/device-backfill.mjs
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: 取得対象/履歴/排他/途中再開を保持
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["COLL-01"]
- 障害: ["U-EXTERNAL"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## COLL-03 iOS/Launcher/collector状態・batch-v3・連携コード

- 元ファイル/関数/API: api/_relay-web.js;api/_collector-state-v3.js;api/_collector-batch-v3.js;ana-launcher.js
- Sites対応: lib/storage/relay-store.mjs（保存部品だけ）
- 状態: 未実装
- 互換性と境界: 連携protocol全体は未移植
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["SYNC-01", "AUTH-02"]
- 障害: ["B-SYNC", "U-EXTERNAL"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## COLL-04 canonical ingest/品質/生データarchive/device backfill API

- 元ファイル/関数/API: vps/src/ingest/canonical-ingest.mjs;raw-archive.mjs;device-backfill-handler.mjs
- Sites対応: canonical read/freeze subsetのみ
- 状態: 部分実装
- 互換性と境界: 本番取り込み・ファイルarchive/エラー互換未接続
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01", "COLL-03"]
- 障害: ["B-MIGRATE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## SYNC-01 Relay永続revision/条件付き更新

- 元ファイル/関数/API: vps/src/relay-store.mjs:createRelayStore
- Sites対応: lib/storage/relay-store.mjs;recovery.mjs
- 状態: 部分実装
- 互換性と境界: 保存部品の同時更新/5MB/復旧済み。Relay API全体未完
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["B-SYNC"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## SYNC-02 端末Sync/競合/履歴/チャンク同期

- 元ファイル/関数/API: api/sync.js;api/_sync-web.js;sync-core.js
- Sites対応: public/sync-core.js（sourceのみ）
- 状態: 未実装
- 互換性と境界: UI存在は独立Syncの成立を示さない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["SYNC-01", "AUTH-02"]
- 障害: ["B-SYNC"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## SYNC-03 既存端末localStorage/IndexedDB引継ぎ

- 元ファイル/関数/API: index.html;core-v510.js;sync-core.js
- Sites対応: 未接続
- 状態: 仕様・対応方法が未確認
- 互換性と境界: 異originのbrowser storageは自動共有できない。export/import等を検証
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "仕様・対応方法が未確認", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["SYNC-02"]
- 障害: ["B-MIGRATE", "U-PWA"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## AUTH-01 正式WebAuthn/passkey/RP ID/session

- 元ファイル/関数/API: vps/src/access/handler.mjs;access/store.mjs;access/config.mjs
- Sites対応: lib/access/d1-sessions.mjs（専用DBのsession/challenge部分のみ）
- 状態: 部分実装
- 互換性と境界: 元session認証/期限/失効/one-use challengeのD1互換を合成SQLite比較。v2 nullable expiryと専用DB境界を維持。WebAuthn ceremony/register/login routeは未移植
- 証拠: tests/port-access-sessions.test.mjs; logs/access-schema-final.log; access-public-final.log
- 画面/API: 正式authへの接続なし。既存DEV authは別のまま
- 開発環境: 独立ACCESS bindingの合成試験のみ。canonical DB・v1型schemaを拒否
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-03"]
- 障害: ["B-AUTH", "U-ACCESS-BINDING", "U-RPID"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 第2D1供給契約を確認し、署名検証/再認証/発行/登録/招待の同等transactionを移植

## AUTH-02 receiver/assistant-read/店舗閲覧scope

- 元ファイル/関数/API: vps/src/assistant-read-key.mjs;store-access.mjs
- Sites対応: lib/generated-store-auth.mjs;generated-store-policy.mjs
- 状態: 部分実装
- 互換性と境界: 既存read拒否とDEV検証。正式発行/失効/PIA権限全体未完
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["SYNC-01"]
- 障害: ["B-AUTH"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## AUTH-03 招待/追加管理者/再認証/失効・rate limit

- 元ファイル/関数/API: vps/src/access/handler.mjs;access/store.mjs
- Sites対応: lib/access/d1-sessions.mjs（admin/credential/invite失効部分）
- 状態: 部分実装
- 互換性と境界: 元失効のSQL・auditを比較。招待/追加管理者発行、viewer単体失効、rate limit、正式管理画面は未移植
- 証拠: port-access-sessions.test.mjs; 元access/store.mjsとのaudit/戻り値比較
- 画面/API: 公開API/画面への接続なし
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["AUTH-01"]
- 障害: ["B-AUTH", "U-ACCESS-BINDING"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 専用DB提供・正式ceremonyと失効/招待/rateの全操作へ接続

## PACHI-01 パチンコcollector/生snapshot/台履歴

- 元ファイル/関数/API: vps/src/pachinko/collector.mjs;snapshot.mjs;schema.mjs;store.mjs
- Sites対応: sourceのみ
- 状態: 未実装
- 互換性と境界: 独立パチンコDB領域・日時・snapshot membershipを維持
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["COLL-01", "DATA-04"]
- 障害: ["B-PACHI"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## PACHI-02 推定/回転率/遊タイムranking/モデル

- 元ファイル/関数/API: vps/src/pachinko/estimator.mjs;models.mjs;store.mjs;pachinko-rotation-ranking.mjs
- Sites対応: public/pachinko-rotation-ranking.mjs（assetのみ）
- 状態: 部分実装
- 互換性と境界: browser計算assetだけではserver機能完成でない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PACHI-01"]
- 障害: ["B-PACHI"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## PACHI-03 パチンコ全API/画面/閲覧権限

- 元ファイル/関数/API: vps/src/pachinko/handler.mjs;vps-ui-pachinko.mjs;pachinko-browser.mjs
- Sites対応: public/vps-ui-pachinko.mjs（assetのみ）
- 状態: 未実装
- 互換性と境界: stores/matrix/records/yutimeと全UI操作
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PACHI-01", "PACHI-02", "AUTH-01"]
- 障害: ["B-PACHI"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## MCP-01 公開judge_machines/MCP schema

- 元ファイル/関数/API: vps/src/mcp-handler.mjs:judge_machines
- Sites対応: app/mcp/route.ts;lib/generated-mcp-tool.mjs
- 状態: 部分実装
- 互換性と境界: 判別toolだけの範囲を全MCPと呼ばない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["MATH-01"]
- 障害: ["B-MCP"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## MCP-02 list_stores/get_store_days/day/analysis/status/history

- 元ファイル/関数/API: vps/src/mcp-handler.mjs:list_stores,get_store_days,get_store_day,get_store_analysis,get_store_status,get_store_analysis_history
- Sites対応: HTTP read subsetのみ
- 状態: 未実装
- 互換性と境界: MCP auth/tool schema/入出力/エラーを全tool照合
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["API-01", "AUTH-02"]
- 障害: ["B-MCP"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## MCP-03 get_store_prediction/get_store_comparison

- 元ファイル/関数/API: vps/src/mcp-handler.mjs:get_store_prediction,get_store_comparison
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: 正式PRE/context分離/読み取りscopeを保持
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-01", "COMP-01"]
- 障害: ["B-MCP"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## OAUTH-01 discovery/register/authorize/token/refresh/revoke

- 元ファイル/関数/API: vps/src/oauth-handler.mjs:createOAuthHandler /oauth/* /.well-known/*
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: issuer/resourceのjugest.net固定を勝手に流用しない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["AUTH-02", "SYNC-01"]
- 障害: ["B-MCP", "U-EXTERNAL"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## DATA-01 canonical SQLite全table/key/FK/history→D1/R2

- 元ファイル/関数/API: vps/src/schema.mjs;db.mjs
- Sites対応: db/schema.ts;drizzle/;lib/storage/
- 状態: 部分実装
- 互換性と境界: read/解析に必要なsubset。全table移行未完
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: []
- 障害: ["B-MIGRATE", "R-D1"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## DATA-02 raw取得ファイル/archive/参照/容量

- 元ファイル/関数/API: vps/src/ingest/raw-archive.mjs;config.mjs
- Sites対応: R2保存部品のみ
- 状態: 未実装
- 互換性と境界: 元ファイル参照と復元方式/容量は未取得
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["B-MIGRATE", "U-CAPACITY"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## DATA-03 access SQLite全table/secret境界

- 元ファイル/関数/API: vps/src/access/schema.mjs
- Sites対応: lib/access/d1-sessions.mjs; tests/port-access-sessions.test.mjs
- 状態: 部分実装
- 互換性と境界: 空の元access v2 SQLite schema/合成rowを専用D1に複製してsession操作比較。本番認証DBの複製/秘密移行は未実施
- 証拠: access-schema-final.log; source-inventory.jsonのaccess9表
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["B-AUTH", "U-ACCESS-BINDING"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 秘密を保持しないschema migration/専用binding供給/復元/発行・失効全transactionの検証

## DATA-04 pachinko SQLite全table/membership/history

- 元ファイル/関数/API: vps/src/pachinko/schema.mjs
- Sites対応: 未接続
- 状態: 未実装
- 互換性と境界: canonical/accessとは独立の所有確認を維持
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "未実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["B-PACHI"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## DATA-05 R2不変保存/復旧/不要data保護

- 元ファイル/関数/API: vps/src/relay-store.mjs;ingest/raw-archive.mjs
- Sites対応: lib/storage/recovery.mjs;lib/analysis/canonical-stream.mjs
- 状態: 部分実装
- 互換性と境界: 単一台2MB/巨大day parse/安全GC/全容量未解決
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["R-D1", "R-COST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## OPS-01 resource telemetry/運用ログ/監視

- 元ファイル/関数/API: vps/src/resource-telemetry.mjs;memory.mjs;analysis/task-metrics.mjs
- Sites対応: job_runs/timings subsetのみ
- 状態: 部分実装
- 互換性と境界: RSS/child process監視をhost指標と混同しない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["JOB-02"]
- 障害: ["U-OBSERVE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## OPS-02 backup/整合snapshot/復元/切戻し

- 元ファイル/関数/API: vps/src/deploy-core.mjs;deploy-runner.mjs;vps/scripts/
- Sites対応: evidence ZIP/Git復元のみ
- 状態: 部分実装
- 互換性と境界: source証拠ZIPは本番DB backup/DR試験の代わりでない
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01", "AUTH-01"]
- 障害: ["B-MIGRATE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## OPS-03 配信/build/source保存/非公開/公開境界

- 元ファイル/関数/API: vps/src/web-server.mjs;deploy-core.mjs
- Sites対応: scripts/;worker/index.ts;Sites source/save workflow
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 非公開save/build確認。host公開/実行は未承認
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "対象経路のlocal実装済み", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["UI-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## OPS-04 外部通信/CORS/origin/容量/料金/運用上限

- 元ファイル/関数/API: vps/src/config.mjs;web-main.mjs;api/
- Sites対応: Sites manifest/binding宣言のみ
- 状態: 仕様・対応方法が未確認
- 互換性と境界: 一般Cloudflare機能とSites提供範囲を区別
- 証拠: evidence/v12/command-results.json・model-comparison.json・BROWSER_CHECK.md（既存対象範囲のみ）。今回evidence/v13/へ追記
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "仕様・対応方法が未確認", "originalComparison": "原本の個別証拠以外は未確認", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["JOB-03", "COLL-01"]
- 障害: ["U-EXTERNAL", "U-CAPACITY"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 依存IDとblockerの次検証を解決し、元入出力の統合証拠を追加。ファイル存在だけで昇格しない

## 元DB全表と対応領域（空DBの元migration実行結果）

表存在は全列/全writer/移行の完成証拠ではない。全SQL・column・FKはsource-inventory.json、元writerはGit原本。

| DB | table | 機能ID | Sites対応/残作業 |
|---|---|---|---|
| canonical | active_store_models | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | analysis_receipts | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | analysis_refresh_state | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | analysis_state | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | analysis_task_metrics | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | backtest_predictions | BT-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | backtest_runs | BT-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | client_snapshots | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | feature_refresh_state | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | historical_comparison_days | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | historical_comparison_runs | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | historical_comparison_snapshot_days | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | job_runs | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | jobs | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | machine_day_data | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | memory_profiles | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | research_loops | CYCLE-02 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | research_model_registry | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | resource_samples | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | source_collector_state | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | store_days | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | store_feature_snapshots | FEAT-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| canonical | store_prediction_scores | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | store_prediction_snapshots | DATA-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| canonical | stores | DATA-01 | schema対応あり。全writer/履歴互換は機能IDで個別判定 |
| access | access_audit_events | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | access_challenges | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | access_meta | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | access_rate_limits | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | admin_credentials | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | admin_enrollment_tokens | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | admin_sessions | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | pia_access_invites | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| access | pia_viewer_sessions | DATA-03,AUTH-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_collector_state | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_machine_days | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_meta | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_model_anchors | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_records | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_snapshot_members | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_snapshots | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| pachinko | p_transitions | DATA-04,PACHI-01 | 原schema/writerを保持。Sites全処理は未対応/未確認 |
| relay/oauth/sync | relay_kv(namespace,key,value,revision,updated_at) | SYNC-01,OAUTH-01 | 本番Relay/OAuth全namespace未移植。原schema参照 |

## 元API・実行処理の対応監査

API/guard全抽出と関数索引はsource-inventory.json。MCP9tool、access13action、OAuth discovery/register/authorize/token、pachinko stores/matrix/records/yutime、analytics stores/days/analysis/history/status/research/comparison/resources、relay/sync/backfillを上記IDへ対応。動的routeと本番Nginx下の実配信経路の全semantic照合は未完（B-COVERAGE）。未移植catchallは503 sites_port_not_implementedであり成功応答にしない。公開judge以外のMCP toolは未対応として拒否。

全ファイルごとの分類はevidence/v13/source-coverage.json。推定分類は元pathに基づく監査入口であり、関数単位の意味・到達可能性・UI全分岐確認は未完のまま記録する。
