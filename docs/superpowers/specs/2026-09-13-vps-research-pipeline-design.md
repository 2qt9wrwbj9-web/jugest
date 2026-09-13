# VPS Research Pipeline Design

## Goal

JUGESTのVPSを、通常の店舗解析を最優先で処理しつつ、空きCPU/RAMを使って店舗ビッグデータの事前集計、自動バックテスト、候補モデル比較を継続実行する研究基盤へ拡張する。

実装順は固定する。

1. 既存店舗解析の計測強化 + 拡張解析（事前集計）
2. 未来情報を遮断した自動バックテスト
3. 候補モデルの大量比較

各段階は単独で完成・検証可能にし、次段階は前段階の保存データと共通実行基盤を利用する。

## Non-negotiable constraints

- 既存のJuggler/HANA確率テーブル、`externalJudge`、単一根拠数学、strict Champion、Calibration、store-share constraint、HANA hard constraints、既存ランキング/判定結果を変更しない。
- 研究結果は本番ロジックへ自動昇格させない。候補の採用はヒロの明示判断を必要とする。
- 通常の収集・保存・`DAILY_ANALYSIS`を研究処理より常に優先する。
- バックテストでは対象日より後の情報を特徴量・予測入力へ絶対に混入させない。
- 同じ根拠を異なる特徴量名で二重計上しない。
- immutable raw retentionは変更しない。
- iPhoneは取得・送信のみ、VPSが解析・記憶・研究を担当する。
- Production deployは実装完了後もヒロの明示許可直前確認を必要とする。

## Current baseline

現行VPSはcanonical SQLiteから最大180日の店舗データを読み、既存JUGEST店舗分析をheadless runtimeで実行し、`analysis_state`、`analysis_receipts`、`client_snapshots`へ結果を保存する。

Schedulerはメモリ圧を監視し、子プロセス単位で解析を実行する。`job_runs`にはピークRSS等の基礎実績があり、`resource_samples`にはSchedulerの時系列状態がある。

本設計はこの基盤を置き換えず、低優先度の研究ジョブと詳細な1店舗単位メトリクスを追加する。

---

# 1. 通常解析の計測強化 + 拡張解析

## 1.1 Common per-store task metrics

通常解析・拡張解析・バックテスト・候補モデル比較のすべてで、**1店舗の1回の処理単位**ごとに共通形式の実績を保存する。

新しい永続テーブル `analysis_task_metrics` を設ける。

必須フィールド:

- `id`
- `job_id` nullable（手動/内部処理も記録可能）
- `store_id`
- `task_kind`
  - `daily_analysis`
  - `feature_build`
  - `backtest`
  - `model_search`
- `task_version`
- `store_machine_count`
- `store_size_bucket`
  - `1-100`
  - `101-200`
  - `201-300`
  - `301-500`
  - `501+`
- `day_count`
- `row_count`（台×日レコード数）
- `workload_units`（処理種類固有の比較用整数）
- `started_at`
- `ended_at`
- `duration_ms`
- `start_rss_mib`
- `end_rss_mib`
- `peak_rss_mib`
- `cpu_ms`
- `status` (`succeeded` / `failed` / `cancelled`)
- `error_class` nullable
- `details_json`（種類固有の補助情報）

店舗台数は対象期間内の最大同時台数ではなく、処理対象データから算出した**最新有効日のユニーク台数**を基本値とする。最新日に台データが欠落している場合のみ、直近7有効日の中央値へフォールバックし、その算出方式を `details_json` に残す。

## 1.2 Memory measurement

各重処理は子プロセスで実行する。

ピークRAMはLinux上のプロセス最大RSSを主値とし、以下の最大値を保存する。

1. 子プロセス自身が終了時に報告する `process.resourceUsage().maxRSS`
2. 既存heartbeatで観測したRSSピーク
3. 終了時 `process.memoryUsage().rss`

開始RSS・終了RSSも保存する。CPU時間は `process.cpuUsage()` 差分から算出する。

これにより「241台・180日・feature_build・Peak 380 MiB・14.2秒」のように店舗規模と負荷を直接比較できる。

## 1.3 Existing daily analysis instrumentation

既存 `DAILY_ANALYSIS` の数学・出力契約は変更しない。

追加するのは計測のみで、1店舗処理終了時に `analysis_task_metrics` へ `daily_analysis` として記録する。既存 `job_runs.peak_rss_mib` も維持し、互換性を壊さない。

## 1.4 Feature build job

新しい低優先度ジョブ `FEATURE_BUILD` を追加する。

目的は店舗ごとの研究用「特徴量倉庫」を作ること。canonical dataから再生成可能な派生集計だけを保存し、raw/canonicalを真実の源泉として維持する。

初期特徴量:

- 期間窓: 30日 / 90日 / 180日
- 曜日
- 営業日の日付末尾
- 機種
- 台番
- 台番末尾
- 上記のうち研究価値が高い限定的な組み合わせ
  - 期間窓 × 曜日
  - 期間窓 × 日付末尾
  - 期間窓 × 機種
  - 期間窓 × 台番
  - 期間窓 × 台番末尾
  - 曜日 × 機種
  - 日付末尾 × 機種

全次元の完全Cartesian productは作らない。組合せ爆発と重複根拠を避ける。

保存先は専用テーブル `store_feature_snapshots` とする。

キー:

- `store_id`
- `feature_version`
- `as_of_date`
- `dimension_key`
- `dimension_value`
- `window_days`

値:

- 対象日数
- 対象台数
- 対象レコード数
- 既存JUGEST判定から安全に派生できる集計値
- 入力hash
- 更新時刻

特徴量生成は既存判別式を変更せず、既存出力/canonical dataの統計的要約だけを行う。

## 1.5 Incremental refresh

canonical data更新後、通常 `DAILY_ANALYSIS` を先に実行する。

その店舗のfeature frontierが古い場合のみ `FEATURE_BUILD` を1件coalesceして予約する。同一店舗・同一feature versionで複数の重複ジョブを作らない。

可能な集計は前回frontierから増分更新し、履歴修正で入力hashが変わった場合だけ必要範囲を再生成する。

## 1.6 Priority and admission

優先順位は以下の順序を保証する。

1. canonical ingest / 通常運用
2. `DAILY_ANALYSIS`
3. `FEATURE_BUILD`
4. `BACKTEST`
5. `MODEL_SEARCH`

研究ジョブは通常解析がqueued/runningの間は新規開始しない。

実行中の研究ジョブは1店舗/1チャンクを短く区切り、通常解析が到着したら次チャンクを開始せず譲る。通常到着だけを理由にDB transaction途中の研究子プロセスを強制killしない。既存のメモリ緊急停止規則は研究ジョブにも適用する。

初期状態では研究系全体の同時実行数を1に固定する。実測メトリクスが十分蓄積した後、Schedulerが安全な並列数を学習する拡張は別変更とする。

## 1.7 Resource UI

既存「VPSリソース」画面に「処理実績」を追加する。

直近の `analysis_task_metrics` を表示し、少なくとも以下を見せる。

- 処理種類
- 店舗名
- 台数
- 日数
- Peak RAM
- 処理時間
- 成否

既存 `/api/vps/system/resources` のread-only authenticated responseへ bounded な直近履歴を追加し、新しい書込APIは作らない。

---

# 2. 自動バックテスト

## 2.1 Purpose

現在または将来の「店読み予測」が過去データでどの程度通用したかを、未来情報混入なしで自動採点する。

## 2.2 Walk-forward rule

対象日 `D` を評価するとき、予測入力には **`D` より前の日付だけ**を使う。

- feature `as_of_date <= D-1`
- canonical input `business_date < D`
- 対象日 `D` のデータは予測生成完了後の採点にのみ使う
- `D+1` 以降は一切参照しない

コード上でprediction phaseとscoring phaseを別関数・別データ取得境界に分離し、同じ配列を使い回して未来情報を誤参照できない構造にする。

## 2.3 Ground-truth / scoring adapter

実際の設定が公式確定していない日が多いため、「真の設定」とは呼ばない。

初期スコアリングは `observed outcome` として、対象日canonical dataと既存JUGESTの日別判定から得られるversioned proxyを使う。既存判別数学は変更しない。

将来、確定設定ラベルを取得できた場合は別adapterとして追加し、proxyと確定ラベルを混同しない。

## 2.4 Stored outputs

専用テーブルを追加する。

`backtest_runs`
- run/version/store/range/config hash/status/start/end

`backtest_predictions`
- run/store/target_date/machine_key/predicted_score/predicted_rank/input_cutoff/input_hash

`backtest_scores`
- run/store/target_date/metric/value/denominator/details

初期指標:

- Top 1 / 3 / 5 overlap
- ranking correlation（対象台数不足時は記録しない）
- 上位分位のlift
- 店舗別
- 曜日別
- 日付末尾別
- 機種別

バックテスト結果はprediction config hashとfeature versionを必ず保持し、後から再現可能にする。

## 2.5 Job shape

`BACKTEST` は1店舗の有限期間チャンク単位で実行する。

1チャンクは対象日を順番にwalk-forward評価し、通常解析が待っている場合はチャンク終了後に停止して残りを再queueする。

`analysis_task_metrics.task_kind='backtest'` として、台数規模・対象日数・評価日数・Peak RAM・CPU・時間を記録する。

---

# 3. 候補モデル大量比較

## 3.1 Purpose

②のバックテストを試験装置として、店読み予測の候補設定を大量に比較する。

対象は新しい研究用予測レイヤーのみ。既存の設定判別式そのものを探索対象にしない。

## 3.2 Candidate space

初期候補はversioned configで表現する。

探索可能項目:

- 参照期間 30 / 90 / 180日
- 曜日特徴の重み
- 日付末尾特徴の重み
- 機種特徴の重み
- 台番特徴の重み
- 台番末尾特徴の重み
- 直近性の減衰強度

同一根拠由来の特徴量はグループ化し、重み合計の上限を設定して二重計上を抑える。

最初は決定論的なbounded grid searchを使う。候補数に上限を設け、config hash順で再現可能にする。ランダム探索を追加する場合はseedを保存する。

## 3.3 Evaluation protocol

候補比較は時系列順に train / validation / final test を分離する。

- train: 候補生成・粗い絞り込み
- validation: 上位候補の順位決定
- final test: 最終比較専用。候補調整には使わない

店舗数が少ない初期段階では、利用可能日数に応じてwalk-forward foldsを使い、分割条件をrun metadataへ保存する。

1店舗だけで勝った候補を全体Champion扱いしない。店舗横断・期間横断の安定性を別指標で表示する。

## 3.4 No automatic promotion

`MODEL_SEARCH` はランキングを生成するだけで、本番設定を変更しない。

出力例:

- candidate A: validation +12.4%, final test +8.1%
- candidate B: validation +14.0%, final test +1.2%
- current research baseline: 0%

採用操作は本設計の範囲外とし、ヒロの明示判断を必要とする。

## 3.5 Stored outputs

`model_search_runs`
- search version / feature version / backtest version / split spec / status

`model_candidates`
- run / candidate hash / config JSON / stage / aggregate metrics / rank

必要に応じて候補別の日別詳細は既存backtest tablesを参照し、巨大な重複保存を避ける。

`analysis_task_metrics.task_kind='model_search'` として、店舗、台数、候補数、評価回数、Peak RAM、CPU、時間を記録する。

---

# Shared scheduling and failure semantics

- すべての研究ジョブはidempotency keyを持つ。
- 同一入力hash・versionの成功済み結果は再計算しない。
- failure retryは既存queueのfailure budgetを使う。
- メモリ都合のdefer/cancelは研究結果の失敗評価に含めない。
- 子プロセス異常終了時も部分保存を「成功」と扱わない。
- 永続化はtransactionで完了してからjob successfulとする。
- retry時は完成済みチャンクを再利用し、最初から全期間をやり直さない。

# Versioning and reproducibility

以下を独立versionとして結果へ刻む。

- canonical parser version
- existing analysis version
- feature version
- backtest version
- scoring adapter version
- model-search version
- candidate config hash

同じversion/hash/inputから同じ研究結果を再現できることをテストする。

# API and UI scope

初期UIは診断・研究状況の可視化に限定する。

表示対象:

- 通常解析/研究ジョブのqueue状態
- 直近処理実績
- 店舗台数規模
- Peak RAM / CPU / duration
- feature frontier
- backtest進捗と概要スコア
- model search進捗と候補上位

研究設定をブラウザから自由編集する高度なUIは初期実装に含めない。初期configはversioned code/configで管理し、再現性を優先する。

# Testing strategy

各段階をTDDで実装する。

## Phase 1 acceptance

- existing `DAILY_ANALYSIS` output hash/判定結果が変更されない
- daily analysis 1店舗処理で詳細メトリクスが1件保存される
- machine count/bucket/day count/row count/Peak RSS/durationが記録される
- feature buildが30/90/180日と指定次元を生成する
- 同一入力のfeature buildがidempotent
- daily analysis待機中はfeature buildを新規開始しない
- resource UI/APIで直近処理実績を読める

## Phase 2 acceptance

- target date以降をprediction inputへ渡せないテストがある
- 同一as-of/input/configでprediction hashが安定する
- scoringはprediction保存後のtarget-day dataだけを読む
- backtest中に新しいdaily analysisが来ても次チャンクでdailyへ譲る
- 1店舗単位のresource metricsが保存される

## Phase 3 acceptance

- candidate config生成が決定論的
- train/validation/final test境界が固定・記録される
- final testをcandidate tuningへ利用しない構造テストがある
- model search結果だけではproduction configが変更されない
- candidate count/evaluation count/resource metricsが保存される

# Delivery sequence

1. Phase 1をfeature branchで実装・全テスト
2. ヒロ確認
3. 明示許可後に`deploy/vps`へfast-forward deploy
4. 実測メトリクスを確認
5. Phase 2を別feature branchで実装・全テスト
6. ヒロ確認・明示許可後deploy
7. 実測バックテスト結果と負荷を確認
8. Phase 3を別feature branchで実装・全テスト
9. ヒロ確認・明示許可後deploy
10. 研究結果を見て本番予測ロジックへの採用可否を別途判断

この分割により、①で基盤障害があれば②③へ波及させず、②の未来情報遮断が検証できるまで③を開始しない。