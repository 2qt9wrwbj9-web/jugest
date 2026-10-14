# データ基盤と予測答え合わせの実装計画

> 実装はこのセッションで進め、最後に独立レビューを行う。承認待ちを挟まず本番変更前に停止するという依頼を優先する。

**Goal:** 毎日の取得・保存・事前予測・評価を安全に継続し日本語で状態を確認できるようにする。
**Architecture:** 既存のSQLite保存、Relay、ジョブ管理、live/formal予測保存と評価を拡張する。取得元のアクセス頻度と判別・研究の式は維持する。
**Tech Stack:** Node.js >=22.13、node:sqlite、既存ブラウザJS、既存private Blob。
**Spec:** `docs/superpowers/specs/2026-10-09-data-prediction-design.md`

## Global Constraints

- 基準 `a461a08005d8533107879813db29a57027c139b5`。本番変更・main/deploy/vpsへの反映は禁止。
- 数学・研究方式・採用基準は保持。事前観測と過去再現を分ける。
- 再試行と資源使用を制限し、未確認を正常表示しない。
- 既存の権限を保持。秘密情報・本番生データを成果物へ含めない。

## Review Focus

- 2端末の保存権取得と、最新状態への回復が競合してもrevisionが後退しない。
- 完全な既存日を不完全再送で置換せず、正式訂正は反映できる。
- 深夜の遅延取得による当日予測を事前成績に混ぜない。
- 訂正前の評価を最新の正式成績として表示しない。
- 店舗所有権とPIA限定閲覧が、新規画面/APIでも維持される。

### Task 1: 検品と正式保存

Files: `vps/src/ingest/day-integrity.mjs`, `vps/src/ingest/canonical-ingest.mjs`, `vps/src/ingest/device-backfill.mjs`, `vps/src/schema.mjs`, `vps/src/collectors/pia-public.mjs`, 関連テスト。
Produces: `inspectDay(db,{storeId,date,day,nowIso,expectedMachineKeys})`, `readDayIntegrity(db,{storeId,date})`。検品結果・取得履歴を保存し、完全データ保護と欠損保留を提供。
- [ ] 重複、0/不明、欠損、途中日、訂正、保存/解析登録失敗のテストを先に書いて失敗確認。
- [ ] 元資料保存とcanonical取引に検品・保存後件数検証を接続。
- [ ] PIAのnull変換・差分欠損・未更新・途中失敗再試行を修正。
- [ ] `node --test vps/tests/data-integrity.test.mjs vps/tests/pia-public-collector.test.mjs vps/tests/relay-canonical-ingest.test.mjs` → PASS。コミット。

### Task 2: 複数端末同期

Files: `api/_sync-web.js`, `vps/src/sync-handler.mjs`, `vps/src/web-server.mjs`, 同期テスト。
Consumes: 保存先の `getWithMetadata` / `ifMatch` / `onlyIfNew`。
Produces: `createSyncRuntime({createStore})`。既存プロトコルをVPSへ接続し条件付きhead回復を保証。
- [ ] 遅延head・大量未反映commit・破損JSON・保存失敗・2端末同時送信・VPS分割送信の失敗テスト。
- [ ] 条件付き更新、破損失敗、チェーン検証、VPS同runtime接続。
- [ ] 同期既存テストと新規テスト → PASS。コミット。

### Task 3: 事前予測と自動評価の運用

Files: `vps/src/research/live-comparison.mjs`, `vps/src/research/prediction-policy.mjs`, `vps/src/research/prediction-performance.mjs`, `vps/src/research/store-read-output.mjs`, `vps/src/research/pre-v2/formal-daily-loop.mjs`, `vps/src/analysis/comparison-refresh.mjs`, `vps/src/analysis/daily-analysis.mjs`, `vps/src/jobs/shadow-predict.mjs`, 関連テスト。
Consumes: Task 1の検品、既存予測保存/採点。
Produces: 事前/事後分類・評価保留記録・同一集合比較・成績表示用データ。
- [ ] 不変性、未来遮断、遅延履歴、完全性、同一集合、訂正、空評価、再起動の失敗テスト。
- [ ] 対象日を明示し事前保存用の共通運用規則、既存採点前ゲートと永続的な保留を接続。
- [ ] 訂正を最新集計から除外し正式統計は不変に保つ。7/30/90/全期間の補助成績と正式比較を返す。
- [ ] 関連予測/研究テスト → PASS。コミット。

### Task 4: 監視・安全な再試行・日本語画面

Files: `vps/src/operations.mjs`, `vps/src/analytics-handler.mjs`, `vps/src/queue.mjs`, `operations.html`, `operations.mjs`, `operations.css`, `vps-ui-enhancements.mjs`, `build.mjs`, UI/APIテスト。
Consumes: Task 1検品とTask 3成績、既存Collector/ジョブ管理。
Produces: 所有権付き監視APIと390px画面。既存UIから開く。
- [ ] 未連携、0件、店舗隔離、再試行上限、再起動、モバイル描画の失敗テスト。
- [ ] 収集/解析/評価状態を集約し、既存の安全な再試行へ接続。飾りボタンは作らない。
- [ ] UI/APIテスト → PASS。コミット。

### Task 5: 全体検証と保存

- [ ] 全回帰 `npm test` / `npm --prefix vps test`。基準時エラーと差分エラーを区別。
- [ ] 資源計測、配信パッチ後UI、隔離実行/再起動を検証。
- [ ] 独立レビューと修正、必要な再検証。
- [ ] 日本語開発報告・再開記録をGitHub内へ保存。作業ブランチPushとPR作成。本番変更なしで停止。
