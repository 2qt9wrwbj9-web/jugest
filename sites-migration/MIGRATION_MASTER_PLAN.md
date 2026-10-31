# 保存版17・中断後の継続（2026-10-31）

GitHub実リモート `work/sites-migration-20261027@f6e3a510a354fca983cafb226ac362ec46c64d40` と同じtreeを保持するローカル原本、Sites保存版16 `5440af1d06bac874f33523843ef84a70e37cc5e0`、Sites未保存変更120件と旧GitHub作業領域57件を照合・保全した。旧GitHub作業領域は35b3fa3で止まっていたため採用せず、f6e3a51を正本として続行。元本番固定ソースの差分は0。本節が今回の優先記録、以下は歴史を含む。

- **移植済みの単位:** 前回v17の正式PRE長期保存値比較、専用認証DBのcredential lookup、既定無効の日次受付を保持。今回、日次の親処理と受付記録を同一DB確定にし、新しい営業日が届いた後の古い親/子受付、送信待ち記録、最新処理参照の変更をDB内で拒否する。処理済み/失敗/置換済み状態を古い続行が再開状態へ戻す競合も抑止。店舗全体の最新参照に合わせ、異なる受付経路（channel）でも新営業日を優先する。旧日・旧子の履歴は削除しない。
- **追加修正:** 正式PREが待機/開始対象なしなど保存値を変えない場合、元のexecuteSourcePlanと同じく業務DBの確定・世代更新を行わない。不要な世代照合で特徴量作成と衝突する不具合を再現し、SQLiteとの結果比較試験を追加。
- **未完成:** 元DAILY_ANALYSISの更新世代・解析状態・summary/最新状態・後続要求/捕捉エラー境界は未移植。同日データ改訂後の再解析、手動の非日次要求との全競合、既に受付済みの古い子の全公開経路は未解消。日次bridgeは既定無効のままで定期起動は登録しない。PRE終了とactiveモデル変更を同義にしない。
- **未検証:** 元モデル生成→多日日次→試験終了の単一統合、終了時の全故障位置、1.5MB超PRE計画、実Sites総128MB・CPU・無人継続、正式認証全体、同期/収集/パチンコ/全MCP/OAuth/実データ移行は残る。55機能/12gateと全hostVerified=falseを維持。
- **証拠の扱い:** 前回groupログの一部は末尾集計がなく、全件成功とは扱わない。今回の全コマンドと結果は `evidence/v17/recovery-20261031/`、前回原本は既存 `evidence/v17/` に保持。Sites保存の成立は外部の保存receiptでのみ確定する。公開・deployは行わない。

# JUGEST 完全移植マスター計画（authoritative / 保存版16）

固定本番deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5。再開Site15 15ab06a6145755106e4611c3559bd543d92d5fa3 / GitHub work/sites-migration-20261027@35b3fa305aca758ca092ed59924cf7c2612bbe59。保存receipt/ZIP CRC/SHAを照合して継続。保存後SHAはsafe receipt参照。公開許可ではない。

55機能IDと12gateを維持。局所実装、元比較、既存画面/API、障害復旧、local無人、実host、全体完成を分離。CYCLE-04は正式holdoutのlocal比較を完了し「実装済み・実ホスト未検証」へ。B-HOLDOUTの保存/復旧未実装という局所原因は解消したが、PRE/active model・host無人/総128MBは未完。根拠のない完成率は出さない。

## 次の依存順

1. 正式PRE v2：v16でFEATURE_BUILD副作用・正式trial開始/モデル固定/2予測/実績待機/日次採点と次日予測のlocal比較・Queue接続まで実装。次はdaily-analysis/scheduler、長期terminal trial/active採用後続の元フローと安全性を比較。研究winner→active自動同期は追加しない。
2. 正式認証：専用ACCESS D1 session/失効/challenge/rateの互換を足場に、正式binding供給、WebAuthn/Origin/RPID/登録/招待/発行/CSRF/復旧を移植。DB混在・DEV認証での代用は禁止。
3. B-HOST/U-QUEUE/B-UNATTENDED：公式interface/非公開実行契約→必要な場合のみ公開を伴うcanaryの直前承認。一般Cloudflareの制限とSites割当を分離。local batch成功をhost transaction成功としない。
4. B-MEM：現行予測のscope/候補順/全BHを維持したkernel境界を先に証明。効果のない参照解放反復は止める。holdoutは評価後の不要featureをcheckpointに重複保存せず、元の必要全列/数学を維持して削減した。
5. Sync/Relay・Collector・日次収集→正式権限/監視→パチンコ→全MCP/OAuth→承認後の実データ独立移行。未移植行を削除しない。

機械的再開：保存receipt→4正本→evidence/v16/REPRODUCE.mdとDEPENDENCIES.md。管理表の機械可読原本はmigration-matrix.json。UNKNOWNを不可能または完成とみなさない。

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
- Sites対応: lib/generated-store-read.mjs;lib/store-read-api.mjs
- 状態: 部分実装
- 互換性と境界: 正式active store-readを元APIと一致比較し接続。legacy auditも元再利用。comparison/resource全体は未実装
- 証拠: evidence/v16/logs/store-read-active.log・RESEARCH_COMPARISON.md
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
- 互換性と境界: 現行予測の数学/全BHは変更なし。4規模の全model/8中間値/hashを維持。新しい候補分割は採用せず、総128MBは未証明。holdoutのcheckpoint投影によるメモリ削減は別工程
- 証拠: evidence/v15/model-comparison.json; MEMORY_REPORT.md; 現行予測full-jobログ4規模とholdout-load比較を分離
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "技術的障害あり", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "開発用の対象画面/APIへ接続済み", "localUnattended": "対象local Queue/DEV driverを検証済み", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["AN-01"]
- 障害: ["B-MEM"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 共通scope/候補順/全BHの契約を維持できるpure候補kernelに限定して分割仮説を検証。効果未証明なら採用しない


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
- Sites対応: lib/analysis/feature-build.mjs;active-store-read.mjs;pre-atomic.mjs;jobs.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 元FEATURE_BUILD子プロセス全体と、特徴量・refresh・registry/loop・active・client/live全保存値を比較。既存activeは据置、初回のみ初期研究championで初期化。新frontier待機は旧のactive公開を抑止。物理queueと研究opt-in差はDEPENDENCIES.md参照。
- 証拠: evidence/v16/RESEARCH_COMPARISON.md・formal-comparisons/・feature-child-*.json・logs/・BROWSER_CHECK.md・FAULT_REPORT.md
- 画面/API: DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし
- 開発環境: 記載範囲のローカル実装・比較済み。未網羅境界は本文を参照
- 実Sites検証: false
- 段階別判定: {"localImplementation": "実装済み・実ホスト未検証", "originalComparison": "記載された元SQLite計算/保存値比較合格。全機能保証ではない", "screenApi": "DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし", "localUnattended": "PRE/featureは実local Queue検証。ACCESSは部品比較のみ", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["API-01", "JOB-01"]
- 障害: ["B-HOST"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 元schedulerと受付coalescing全体、hostでの大容量確定を検証する


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
- 互換性と境界: 既存の未昇格BACKTEST→探索を維持。opt-in cycleはroot単位にidentityを固定し、同じsnapshot/modelから後続を自動受付。保存版15では正式holdout確定後まで元SQLiteの全registry/loopと全BT run/予測行を比較。holdout子jobは同じ固定入力を使用
- 証拠: evidence/v15/logs/cycle-full-state.log; tests/port-research-cycle.test.mjs; native-cycle.log; holdout-comparison.json; port-final.log
- 画面/API: 元解析画面の過去検証から自動探索、nextJobIdと保存履歴で再取得
- 開発環境: nativeローカルQueue・画面とも完走。配信失敗/重複/古世代/最終rollbackを検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "正式holdout確定までの対象経路実装済み", "originalComparison": "全BT/holdout行、registry/loop、4規模holdout・現行予測の対象範囲が一致", "screenApi": "開発用既存パネル/認証付きAPIに接続", "localUnattended": "実local Queueで正式holdoutまで検証", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["BT-01", "SEARCH-01", "JOB-02"]
- 障害: ["B-PIPELINE"]
- 完成条件: 元logical identity/入力/モデル/round/holdout分離の一致、再試行/重複/権限/画面の試験を維持しhost無人実行を検証
- 次作業: ホストQueue/運用制約と正式PREを検証。activeモデル採用を研究championと分離


## CYCLE-02 研究loop/frontier/generation/再試行履歴

- 元ファイル/関数/API: vps/src/analysis/research-cycle.mjs:getResearchLoop,ensureResearchCycle
- Sites対応: db/schema.ts:researchLoops/sitesResearchContext; drizzle/0011*,0012*; lib/analysis/research-transition.mjs
- 状態: 部分実装
- 互換性と境界: frontier/gen/round/noImprove/repeated/stateを元と比較。決定latchと原子的publication、入力・実装・世代・registry snapshotをfence。正式holdout後状態は未移植。保存版15では正式holdout確定後まで元SQLiteの全registry/loopと全BT run/予測行を比較。holdout子jobは同じ固定入力を使用
- 証拠: evidence/v15/logs/cycle-full-state.log; tests/port-research-cycle.test.mjs; native-cycle.log; holdout-comparison.json; port-final.log
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "正式holdout確定までの対象経路実装済み", "originalComparison": "全BT/holdout行、registry/loop、4規模holdout・現行予測の対象範囲が一致", "screenApi": "開発用既存パネル/認証付きAPIに接続", "localUnattended": "実local Queueで正式holdoutまで検証", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-01"]
- 障害: ["B-PIPELINE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: ホストQueue/運用制約と正式PREを検証。activeモデル採用を研究championと分離


## CYCLE-03 champion昇格・候補棄却/履歴

- 元ファイル/関数/API: vps/src/analysis/research-cycle.mjs:recordModelSearchCompletion,upsertCandidate
- Sites対応: lib/analysis/research-cycle.mjs; jobs.mjs; drizzle/0013*,0014*; client/analysis-job-panel.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 研究championの採用/棄却/歴史化を元recordModelSearchCompletionと比較。candidate/世代/score/createdAt更新規則を維持。active modelは変更しない。保存版15では正式holdout確定後まで元SQLiteの全registry/loopと全BT run/予測行を比較。holdout子jobは同じ固定入力を使用
- 証拠: evidence/v15/logs/cycle-full-state.log; tests/port-research-cycle.test.mjs; native-cycle.log; holdout-comparison.json; port-final.log
- 画面/API: 既存解析panelの研究cycle checkboxから開始、採否/履歴/個別結果を表示。開発用権限のみ
- 開発環境: 6分岐と実データ合成cycle、故障・競合・実OOM復旧が合格
- 実Sites検証: false
- 段階別判定: {"localImplementation": "正式holdout確定までの対象経路実装済み", "originalComparison": "全BT/holdout行、registry/loop、4規模holdout・現行予測の対象範囲が一致", "screenApi": "開発用既存パネル/認証付きAPIに接続", "localUnattended": "実local Queueで正式holdoutまで検証", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-02"]
- 障害: ["B-PIPELINE"]
- 完成条件: 対象採否/履歴/次logical job/権限/競合の比較を維持し、実hostで同じ決定・復旧を確認。正式採用と混同しない
- 次作業: ホストQueue/運用制約と正式PREを検証。activeモデル採用を研究championと分離


## CYCLE-04 反復/無改善収束/holdout解禁

- 元ファイル/関数/API: vps/src/research/model-search.mjs:shouldConverge;research/holdout.mjs:finalizeSealedHoldout
- Sites対応: lib/analysis/research-holdout.mjs; generated-holdout-kernel.mjs; research-cycle.mjs; jobs.mjs; drizzle/0015*,0016*; client/analysis-job-panel.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 元finalizeSealedHoldoutの解禁/frontier/モデル選択/全順位/スコア/better/fingerprint tieを保持。元rankRows/betterを機械抽出。historical/research_championだけ評価。全run/予測行/registry/loop/返値hashが一致。active model不変。研究cycle opt-inの新子jobとして段階実行し、最終D1 batchでのみ公開
- 証拠: tests/port-holdout.test.mjs 17件; port-holdout-client.test.mjs; holdout-comparison.json（2model218行/hash9d52664d…）; holdout-load-*.json（4規模全行/全状態）; holdout-oom-results.json; native-cycle.log; browser-holdout-final.txt
- 画面/API: 既存パネルの研究継続から自動実行。研究収束/holdout状態/確定スコア/勝者/履歴とhashを開発認証下で表示。未確定は取得不可
- 開発環境: モデル単位R2 checkpoint、100行private D1 parts、lease/CAS/fence、世代/frontier/head競合、破損、DB rollback、lost response、重複、旧正常holdout保持、実V8 OOM後復旧を検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "正式holdout確定までの対象経路実装済み", "originalComparison": "全BT/holdout行、registry/loop、4規模holdout・現行予測の対象範囲が一致", "screenApi": "開発用既存パネル/認証付きAPIに接続", "localUnattended": "実local Queueで正式holdoutまで検証", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-03"]
- 障害: ["B-HOST", "B-UNATTENDED", "U-QUEUE", "R-D1", "R-COST"]
- 完成条件: ローカルの正式holdout計算/保存/統合/障害/画面は比較完了。実Sitesホストでメモリ/CPU/query/transaction/再配信/監視と大規模歴代モデル集合を検証し全体gateを満たす
- 次作業: PRE v2正式trialの保存/逐次評価・モデル固定へ進む。source FEATURE_BUILDのactive初期化とrefreshは別の残機能として確認し、holdout勝者を自動反映しない


## PRE-01 active model/store-read生成・説明

- 元ファイル/関数/API: vps/src/research/store-read-output.mjs;store-read-explain.mjs
- Sites対応: lib/analysis/active-store-read.mjs;lib/active-model-view.mjs;lib/store-read-api.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 元buildStoreReadPayload/説明/normalize/hash再利用。active・snapshot・live保存値とAPI/権限が一致。研究winnerへ自動同期しない。1.5MB超snapshotは安全に拒否し大容量adapterが残る。
- 証拠: evidence/v16/RESEARCH_COMPARISON.md・formal-comparisons/・feature-child-*.json・logs/・BROWSER_CHECK.md・FAULT_REPORT.md
- 画面/API: DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし
- 開発環境: 記載範囲のローカル実装・比較済み。未網羅境界は本文を参照
- 実Sites検証: false
- 段階別判定: {"localImplementation": "実装済み・実ホスト未検証", "originalComparison": "記載された元SQLite計算/保存値比較合格。全機能保証ではない", "screenApi": "DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし", "localUnattended": "PRE/featureは実local Queue検証。ACCESSは部品比較のみ", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["CYCLE-04"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 大容量snapshot/R2公開adapterと正式権限・実hostを検証する


## PRE-02 PRE-v2正式trial/champion/challenger

- 元ファイル/関数/API: vps/src/research/pre-v2/trial.mjs;trial-store.mjs;formal-start.mjs
- Sites対応: lib/analysis/pre-v2.mjs;formal-pre-job.mjs;generated-pre-trial-kernel.mjs
- 状態: 実装済み・実ホスト未検証
- 互換性と境界: 正式trial開始、元の開始条件・再利用/拒否・固定モデル・champion/challengerの2予測を元SQLite全列比較。active切替は含めない。
- 証拠: evidence/v16/RESEARCH_COMPARISON.md・formal-comparisons/・feature-child-*.json・logs/・BROWSER_CHECK.md・FAULT_REPORT.md
- 画面/API: DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし
- 開発環境: 記載範囲のローカル実装・比較済み。未網羅境界は本文を参照
- 実Sites検証: false
- 段階別判定: {"localImplementation": "実装済み・実ホスト未検証", "originalComparison": "記載された元SQLite計算/保存値比較合格。全機能保証ではない", "screenApi": "DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし", "localUnattended": "PRE/featureは実local Queue検証。ACCESSは部品比較のみ", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-01", "AUTH-01"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 逐次評価でpromoted/blockedへ至る長期統合、active採用後続と監視を移植する


## PRE-03 PRE-v2 relevance/outcome/NDCG/sequential

- 元ファイル/関数/API: vps/src/research/pre-v2/relevance.mjs;outcome.mjs;ndcg.mjs;sequential.mjs
- Sites対応: lib/analysis/pre-v2.mjs;compiled-worker.mjs;元pre-v2純粋計算
- 状態: 部分実装
- 互換性と境界: 元target dayの全q/expectedSetting、outcome hash、NDCG、逐次状態/evidence、次日予測の保存を比較。実到着日のjob統合一致。全停止境界/全terminal trialの統合は未網羅。
- 証拠: evidence/v16/RESEARCH_COMPARISON.md・formal-comparisons/・feature-child-*.json・logs/・BROWSER_CHECK.md・FAULT_REPORT.md
- 画面/API: DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし
- 開発環境: 記載範囲のローカル実装・比較済み。未網羅境界は本文を参照
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "記載された元SQLite計算/保存値比較合格。全機能保証ではない", "screenApi": "DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし", "localUnattended": "PRE/featureは実local Queue検証。ACCESSは部品比較のみ", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-02"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 正式昇格/棄却に至る長期逐次経路と全回復分岐を検証する


## PRE-04 正式model/prediction store・日次loop・auto start

- 元ファイル/関数/API: vps/src/research/pre-v2/formal-model-store.mjs;formal-prediction-store.mjs;formal-daily-loop.mjs;formal-auto-start.mjs
- Sites対応: lib/analysis/pre-v2.mjs;formal-pre-job.mjs;pre-atomic.mjs
- 状態: 部分実装
- 互換性と境界: 正式model/prediction/outcome/trial day不変保存、CAS・世代/lease・private checkpoint・Queue・実OOM復旧。DEV formal-pre経路で日次実行、元daily-analysisの定期呼出は未接続。
- 証拠: evidence/v16/RESEARCH_COMPARISON.md・formal-comparisons/・feature-child-*.json・logs/・BROWSER_CHECK.md・FAULT_REPORT.md
- 画面/API: DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし
- 開発環境: 記載範囲のローカル実装・比較済み。未網羅境界は本文を参照
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "記載された元SQLite計算/保存値比較合格。全機能保証ではない", "screenApi": "DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし", "localUnattended": "PRE/featureは実local Queue検証。ACCESSは部品比較のみ", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["PRE-02", "JOB-03"]
- 障害: ["B-PRE"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 元daily-analysis/schedulerの依存・active採用・同日自動再開の全境界を統合する


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
- 互換性と境界: 元session認証/期限/失効/one-use challengeのD1互換を合成SQLite比較。v2 nullable expiryと専用DB境界を維持。WebAuthn ceremony/register/login routeは未移植。保存版15はviewer単独失効/audit、厳密expiry、consumeRateのreset/保持と並列上限も元専用SQLiteと比較
- 証拠: tests/port-access-sessions.test.mjs（4件）; evidence/v15/AUTH_SCOPE.md; logs/access-expanded.log（初期失敗と修正）; port-final.log/github-final.log
- 画面/API: 正式authへの接続なし。既存DEV authは別のまま
- 開発環境: 独立ACCESS bindingの合成試験のみ。canonical DB・v1型schemaを拒否
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-03"]
- 障害: ["B-AUTH", "U-ACCESS-BINDING", "U-RPID"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 独立ACCESS bindingの正式提供interface確認。WebAuthn ceremony/Origin/RPID/招待・発行・CSRF/再登録と回復の統合。正式API未接続


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
- Sites対応: lib/access/d1-sessions.mjs;lib/access/generated-primitives.mjs
- 状態: 部分実装
- 互換性と境界: 専用ACCESSのみ。既存session/challenge/rate/失効にenrollment lookupのissuer/expiry/used/revokedとchallenge作成の元validationを追加比較。発行/登録/invite公開routeは未有効。
- 証拠: evidence/v16/RESEARCH_COMPARISON.md・formal-comparisons/・feature-child-*.json・logs/・BROWSER_CHECK.md・FAULT_REPORT.md
- 画面/API: DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし
- 開発環境: 記載範囲のローカル実装・比較済み。未網羅境界は本文を参照
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "記載された元SQLite計算/保存値比較合格。全機能保証ではない", "screenApi": "DEV認証の既存画面/analysis job APIに接続。ACCESS部品は公開routeなし", "localUnattended": "PRE/featureは実local Queue検証。ACCESSは部品比較のみ", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["AUTH-01"]
- 障害: ["B-AUTH", "U-ACCESS-BINDING", "U-RPID"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 専用D1正式供給、invite/enrollment発行・WebAuthn/CSRF/Originを順次移植する


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
- 互換性と境界: read/解析に必要なsubset。全table移行未完。v16でactive/store-read/PREの元保存表を追加。全DB変換・本番移行ではない
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
- 互換性と境界: 空の元access v2 SQLite schema/合成rowを専用D1に複製してsession操作比較。本番認証DBの複製/秘密移行は未実施。保存版15はviewer単独失効/audit、厳密expiry、consumeRateのreset/保持と並列上限も元専用SQLiteと比較
- 証拠: tests/port-access-sessions.test.mjs（4件）; evidence/v15/AUTH_SCOPE.md; logs/access-expanded.log（初期失敗と修正）; port-final.log/github-final.log
- 画面/API: 実装済み経路のみ。詳細original API/guard一覧はsource-inventory.json
- 開発環境: 実装済み対象のみ検証済み。未実装/未確認部分は未検証
- 実Sites検証: false
- 段階別判定: {"localImplementation": "部分実装", "originalComparison": "対象範囲のみ合格（互換性欄の境界を参照）", "screenApi": "全体接続は未確認/未実装", "localUnattended": "未検証または対象外", "sitesHost": "未検証", "fullAcceptance": "未達"}
- 依存: ["DATA-01"]
- 障害: ["B-AUTH", "U-ACCESS-BINDING", "U-RPID"]
- 完成条件: AC-01〜AC-12の該当全条件と、この機能の元API/数学/データ/権限/障害/画面の比較に合格。host証拠がない間は完全完成にしない
- 次作業: 独立ACCESS bindingの正式提供interface確認。WebAuthn ceremony/Origin/RPID/招待・発行・CSRF/再登録と回復の統合。正式API未接続


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

## 保存版16の判定

55機能IDを削除せず保持。FEAT-01/PRE-01/PRE-02をlocal実装・実host未検証へ、PRE-03/PRE-04を部分実装へ進めた。API-03とAUTH-03の範囲を拡張。正式PRE全体、active採用、正式認証/全MCP/Sync/Collector/パチンコ/実データ移行は未完。12完成ゲートは全体として未達。全hostVerified=falseを維持。

## 保存版16・中断後の最終再確認（2026-10-31 JST）

元55機能の構成を維持。local実装済み・実host未検証14、部分実装22、未実装14、仕様未確認4、技術的障害あり1（完成率ではない）。全hostVerified=false。FEATURE_BUILD全子プロセス/正式PRE開始・1日採点・次日予測の元保存値比較、実OOM9条件と画面の結果をevidence/v16の再生成原本へ接続。最終件数はcommand-results.json、数学4規模はmodel-comparison.json、全尺度のmemoryはMEMORY_REPORT.md。PRE長期terminal/active正式採用・日次自動受付・正式認証・全Sync/Collector/パチンコ/MCP/OAuth・実データ移行は残る。


## 保存版17：PRE長期比較・日次受付橋渡し

保存版16の正式保存receiptを基準に継続。55機能/12gateは維持し、実host未検証を合格にしない。PRE元計算の複数日全保存値比較、active書込全経路調査、専用ACCESS credential lookupを追加。日次受付橋渡しは既定無効・部分実装で、元DAILY_ANALYSIS全副作用/新frontier競合CAS/定期起動は未完成。証拠と正確な最終試験件数はevidence/v17を参照。R-SCHEMA/R-PRE-LARGE/B-HOST/B-MEM/B-UNATTENDED/U-QUEUE/U-ACCESS-BINDINGは未解消。元にないactive自動採用は追加せず、正式trial判定とactive維持が元の挙動。次はdaily本体の分析状態/summary/後続要求/エラー境界と全CASの元SQLite比較を優先する。
