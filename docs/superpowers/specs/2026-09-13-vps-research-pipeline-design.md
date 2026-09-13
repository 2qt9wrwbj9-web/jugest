# VPS Self-Improving Store Analysis Pipeline Design

## Goal

JUGESTのVPSを、通常の収集・設定判別・店舗解析を最優先で処理しつつ、空きCPU/RAMを使って店舗読みモデルを継続的に改善する研究基盤へ拡張する。

中核は次の閉ループである。

1. **① 解析**: 現在の研究Championを使って店舗特徴量・評価軸を構築し、店舗読みを実行する。
2. **② バックテスト**: 対象日より未来を完全に遮断したwalk-forward検証で、そのモデルが過去に本当に通用したかを測る。
3. **③ 探索**: 新しい評価軸、複合条件、参照期間、重みを自動生成し、②で候補を競わせる。
4. ③で現Championより強い候補が見つかれば、それを次世代の研究Championとして①へ自動反映する。
5. ①→②→③を繰り返し、循環または改善停止を検知したらその探索cycleを収束させる。
6. cycle中の全世代から、未使用holdoutでも最も優秀だったモデルをcycle winnerとする。

このループは店舗ごとに独立して回せる。十分な履歴がない店舗は共通base modelを使い、データが蓄積してから店舗固有モデルへ移行する。

---

## Non-negotiable constraints

- 既存のJuggler/HANA確率テーブル、`externalJudge`、単一根拠数学、strict Champion、Calibration、store-share constraint、HANA hard constraintsを変更しない。
- 自己改善の対象は**店舗読み・投入傾向予測レイヤー**とし、既存の設定判別数学を探索対象にしない。
- canonical ingest、保存、通常 `DAILY_ANALYSIS` は研究処理より常に優先する。
- バックテストでは対象日より後の情報を特徴量・予測入力へ絶対に混入させない。
- 同じ根拠を別名の特徴量として二重計上しない。
- immutable raw retentionは変更しない。
- iPhoneは取得・送信のみ、VPSが解析・記憶・研究を担当する。
- Production deployは実装完了後もヒロの明示許可を必要とする。
- 研究Championの自動更新は許可するが、protectedな設定判別数学や確率テーブルへの自動書換えは禁止する。

---

# A. 共通実行基盤と負荷計測

## A.1 1店舗1処理単位の計測

①②③すべてで、**1店舗の1回の処理単位**ごとに負荷を永続保存する。

`analysis_task_metrics` を追加し、最低限以下を記録する。

- `id`
- `job_id` nullable
- `store_id`
- `phase` (`1` / `2` / `3`)
- `task_kind`
  - `daily_analysis`
  - `feature_build`
  - `axis_discovery`
  - `backtest`
  - `model_search`
- `task_version`
- `model_fingerprint` nullable
- `store_machine_count`
- `store_size_bucket` (`1-100` / `101-200` / `201-300` / `301-500` / `501+`)
- `day_count`
- `row_count`（台×日レコード数）
- `workload_units`
- `started_at`
- `ended_at`
- `duration_ms`
- `start_rss_mib`
- `end_rss_mib`
- `peak_rss_mib`
- `cpu_ms`
- `status` (`succeeded` / `failed` / `cancelled`)
- `error_class` nullable
- `details_json`

店舗台数は最新有効日のユニーク台数を基本とし、最新日が欠落している場合のみ直近7有効日の中央値を使う。算出方法は `details_json` に残す。

## A.2 Peak RAM

各重処理は子プロセスで実行する。Peak RAMは次の最大値を保存する。

1. `process.resourceUsage().maxRSS`
2. heartbeatで観測したRSSピーク
3. 終了時 `process.memoryUsage().rss`

CPU時間は `process.cpuUsage()` 差分で記録する。

これにより、例えば「241台・180日・model_search・Peak 812 MiB・92.4秒」のように店舗規模と負荷を比較できる。

## A.3 VPSリソース画面

既存「VPSリソース」に「処理実績」を追加し、直近履歴として以下を表示する。

- 処理種類 / ①②③
- 店舗名
- 台数
- 対象日数
- 台×日件数
- Peak RAM
- CPU時間
- 処理時間
- 成否
- 使用モデルfingerprintの短縮表示

既存 `/api/vps/system/resources` にread-onlyのbounded履歴を追加する。書込APIは増やさない。

---

# 1. ① 解析: 通常解析 + 特徴量倉庫 + 現Championによる店舗読み

## 1.1 通常解析

既存 `DAILY_ANALYSIS` の数学・出力契約は変更しない。追加するのは負荷計測と研究パイプラインへの入力連携のみ。

通常解析終了後、研究用特徴量が古い場合にだけ低優先度 `FEATURE_BUILD` をcoalesceして予約する。

## 1.2 特徴量倉庫

`store_feature_snapshots` を追加し、canonical dataから再生成可能な派生特徴量を保存する。

初期の単独特徴群:

- 直近 1 / 3 / 7 / 14 / 30 / 90 / 180日の履歴要約
- 曜日
- 営業日の日付末尾
- 機種
- 台番
- 台番末尾
- 直近の強弱トレンド
- 前回強かったと判定された日からの経過日数
- 同一店舗・同一機種内での相対順位履歴
- 店舗全体の直近配分傾向
- 利用可能な場合のみ近接台・隣接台の履歴

未来データは絶対に使わない。`as_of_date=D` の特徴量は `business_date <= D` のデータだけから作る。

## 1.3 現Champion

各店舗は `research_model_registry` に1つの `research_champion` を持つ。

①の研究用店舗読みは現在の `research_champion` を使う。③でより強い候補が昇格した場合、次回①から自動的に新Championを使う。

ただし既存の設定判別数学は別レイヤーとして固定する。

---

# 2. ② 自動バックテスト

## 2.1 Walk-forward原則

対象日 `D` の予測では **`D` より前だけ**を使う。

- feature `as_of_date <= D-1`
- canonical input `business_date < D`
- `D` のデータは予測確定後の採点にのみ使う
- `D+1` 以降は一切参照しない

prediction phaseとscoring phaseは別関数・別データ取得境界にする。同じ配列を使い回して未来情報を参照できる構造にしない。

## 2.2 答えラベル

実際の設定が公式確定していない日は「真の設定」と呼ばない。

初期は対象日canonical dataと既存JUGESTの日別判定から得られるversioned `observed outcome proxy` を使う。将来確定設定ラベルが得られた場合は別adapterとして追加し、proxyと混同しない。

## 2.3 保存と評価指標

- `backtest_runs`
- `backtest_predictions`
- `backtest_scores`

を追加する。

最低限の評価指標:

- Top 1 / 3 / 5 overlap
- Top 3 / 5 lift
- ranking correlation（対象台数不足時は無効）
- 店舗別
- 曜日別
- 日付末尾別
- 機種別
- 評価対象件数 / 日数

予測ごとにconfig hash、feature version、model fingerprint、input cutoff、input hashを保存し、再現可能にする。

## 2.4 Promotion comparator v1

「より強いモデル」の判定を曖昧にしないため、初期版は次の決定論的比較を使う。

- primary: 4つのValidation時系列foldにおける **Top 3 liftの中央値**
- guardrail 1: Top 5 lift中央値が現Championより `0.02` を超えて悪化しない
- guardrail 2: ranking correlation中央値が現Championより `0.02` を超えて悪化しない
- candidateはprimaryが現Championを上回る場合だけ昇格可能
- primary差が `0.01` 未満ならTop 5 lift中央値が高い方を優先
- Top 5 lift差も `0.01` 未満ならranking correlation中央値が高い方を優先
- それも同等なら、評価軸数→interaction数が少ない方を優先
- それも同等ならmodel fingerprintの辞書順で決め、再現性を保証する

この比較規則自体を `promotion-comparator-v1` としてversion管理する。将来変更する場合は別versionとし、過去結果を上書きしない。

---

# 3. ③ 新評価軸発掘 + モデル探索

## 3.1 新しい評価軸の生成

新評価軸は「強かった台の過去条件」だけを見るのではなく、**強かった台と同条件の外れ台を比較**して生成する。

対象日 `D` について、まず `D` の結果を答えとして隔離する。そのうえで `D-1` 以前だけを使って各台の過去条件を生成する。

例:

- 過去7日で弱い日が何日あったか
- 過去14日の同機種内順位
- 前回強かった日から何日空いたか
- 台番末尾
- 曜日
- 日付末尾
- 同曜日での過去成績
- 同じ日付末尾での過去成績
- 店舗内でその機種が最近どれくらい扱われていたか
- 隣接情報が存在する場合の近接台履歴

### 比較方法

強かった台群と、同じ店舗・同じ対象日の他台を比較する。機種差が大きい特徴では同一機種のmatched controlも併用する。

例えば、

- 強かった台の72%が「過去7日で3日以上弱い」
- controlでは38%

なら、その条件を評価軸候補にする。

単に強い台だけに多い条件ではなく、**controlとの差・support・別期間での再現性**を必須とする。

## 3.2 条件・閾値の生成範囲

閾値を無制限に試して偶然当たりを作らない。

- 時間窓は初期状態で `1 / 3 / 7 / 14 / 30 / 90 / 180日` に限定
- 数値特徴の閾値候補は、Discovery/Trainだけから計算した `10 / 20 / ... / 90` percentileと、意味が固定されたdomain cutoffだけを使用
- Validation / Sealed Holdoutを見て閾値を新規生成してはならない
- categorical特徴はminimum supportを満たすカテゴリだけ候補化
- 条件定義そのものをfeature IDへ含め、後から完全再現できるようにする

## 3.3 複合条件の生成

単独軸から2軸、3軸へ段階的に組み合わせる。

例:

- `土曜日`
- `台番末尾7`
- `直近7日で弱い日が3日以上`

から、

- `土曜日 × 末尾7`
- `末尾7 × 直近7日弱い`
- `土曜日 × 末尾7 × 直近7日弱い`

を生成できる。

完全Cartesian productは禁止する。

探索予算は以下に分ける。

- 90%: 単独または親条件に一定の信号があるhierarchical探索
- 10%: 単独では弱いが組合せで効く条件を拾うための、seed固定・再現可能なexploration枠

最大interaction orderは初期状態で3とする。

## 3.4 過学習対策: candidate gate

新しい軸は、過去データにたまたまハマっただけでは採用しない。

最低条件:

- 該当row-dayが100以上
- 10営業日以上に分散している
- observed-positiveが20件以上
- train内でcontrolとの差が同方向
- 複数testingを考慮し、単独のp値だけで採用しない

候補数が多い探索ではBenjamini-Hochberg法によるFDR 5%をscreening補助として使う。ただし統計的有意だけでは採用せず、必ずout-of-sample性能を要求する。

## 3.5 時系列分離

1つの探索cycleでは履歴を時系列順に3領域へ分離する。

- **Discovery/Train 60%**: 新評価軸発掘と候補生成だけに使用
- **Validation 20%**: 世代ごとの候補選抜・研究Champion更新に使用
- **Sealed Holdout 20%**: 探索中は一切見ない。cycle収束後の最終選抜だけに使用

日数が少なく3領域を安定して作れない店舗では自動探索を開始せず、base modelのままデータ蓄積を待つ。

探索中にSealed Holdoutの結果を候補生成・重み変更へフィードバックしてはならない。

## 3.6 安定性検査

Validationでは単一期間だけでなく時間順の4foldを使う。

候補軸は少なくとも以下を満たす必要がある。

- 4foldのうち3つ以上で効果方向が一致
- 近い条件へ少しずらしても効果が完全崩壊しない
- 特定の1日や少数台を除外しただけで優位性が消えない
- 単純な既存軸で説明できる場合、重複特徴として新規採用しない

「第2土曜 × 末尾7 × 直近14日下位40%」のような奇妙な条件でも、このgateを通れば候補として扱う。意味が人間に直感的かどうかは採否条件にしない。

## 3.7 モデル表現

モデルは評価軸と重みを完全にversioned config化する。

各モデルは最低限以下を持つ。

- feature IDs
- 各featureの条件・期間・変換
- interaction定義
- 方向（positive / negative）
- 重み
- recency decay
- source-group
- parent model fingerprint
- generation

重みは浮動小数点を直接比較せず、**basis point整数**で正規化し合計10000とする。

## 3.8 Model fingerprint

モデルの完全構成をcanonical JSON化しhashする。

fingerprintには以下を含む。

- 評価軸の集合
- 各軸の条件
- 参照期間
- interaction
- 各軸のbasis-point重み
- recency decay
- model/search version

したがって「同じ評価軸＋同じ条件＋同じ重み」の組合せが再登場すれば、同じfingerprintになる。

## 3.9 世代更新

各世代で現在の研究Championを親にして候補を作る。

候補操作:

- 軸追加
- 軸削除
- 軸入替
- interaction追加/削除
- 参照期間変更
- 重み変更
- recency decay変更

②の `promotion-comparator-v1` でValidation成績を比較し、現在の研究Championを上回る候補だけ次世代Championへ自動昇格する。

昇格したChampionは次の①へ自動反映され、その条件下で再び②③を回す。

---

# 4. 自己改善ループと収束

## 4.1 ループ

店舗ごとに以下を繰り返す。

`① 現Championで解析`
→ `② walk-forward評価`
→ `③ 新軸発掘・候補探索`
→ `Validationで新Champion選抜`
→ `①へ自動反映`
→ repeat

## 4.2 循環検知

同一店舗・同一探索cycle内で、**同じmodel fingerprintが2回出現したら循環検知**する。

これは単に同じ軸名ではなく、同じ評価軸・条件・期間・重み・interactionまで一致した場合を指す。

## 4.3 改善停止

循環が起きなくても、5世代連続で研究Championを更新できなければ探索cycleを収束させる。

## 4.4 Cycle winner

収束後、cycle内で記録した歴代Championとcycle開始時base modelをSealed Holdoutで一度だけ評価する。

最後の世代を自動的に勝者にはしない。

`promotion-comparator-v1` と同じ順序でSealed Holdout成績を比較し、base modelを上回った最良の歴代Championを `cycle_winner` とする。改善が確認できなければcurrent active modelを維持する。

## 4.5 Active store model

`cycle_winner` は店舗読みレイヤーの `active_store_model` へ自動昇格する。

ただし昇格対象は新しい店舗読み予測レイヤーだけであり、Juggler/HANAの設定判別数学、確率テーブル、strict Champion等のprotected領域を書き換えない。

新しい実データが蓄積したら次のcycleを開始し、旧Holdoutを学習側へ解放しつつ、より新しい期間を新しいSealed Holdoutとして確保する。

これにより同じ固定holdoutへ永遠に最適化することを防ぐ。

---

# 5. Model registry / audit trail

`research_model_registry` を追加する。

最低限:

- `store_id`
- `model_fingerprint`
- `parent_fingerprint`
- `cycle_id`
- `generation`
- `status`
  - `candidate`
  - `research_champion`
  - `cycle_winner`
  - `active_store_model`
  - `rejected`
- `config_json`
- `discovery_score`
- `validation_score`
- `holdout_score` nullable
- `comparator_version`
- `created_at`
- `promoted_at` nullable

全昇格・棄却を残し、「なぜこのモデルが現行最優秀なのか」を後から追跡できるようにする。

---

# 6. Job priority / Scheduler

優先順位は固定する。

1. canonical ingest / 通常運用
2. `DAILY_ANALYSIS`
3. `FEATURE_BUILD`
4. `AXIS_DISCOVERY`
5. `BACKTEST`
6. `MODEL_SEARCH`

研究ジョブは通常解析がqueued/runningの間は新規開始しない。

研究処理は1店舗・有限チャンク単位にし、通常解析が到着したらチャンク終了後に譲る。DB transaction途中を通常到着だけで強制killしない。既存のメモリ緊急停止規則は研究ジョブにも適用する。

初期は研究系全体で同時実行1。`analysis_task_metrics` が十分蓄積してから、店舗規模・task_kind・実測Peak RAMを使った安全な並列化を別変更で検討する。

---

# 7. Safety against false discoveries

JUGESTが発見した「変な条件」は、以下の理由で即採用しない。

- 過去データを大量探索した結果の偶然一致
- 特定日だけのイベント
- 機種構成の偏り
- 店全体が強い日の影響を台固有の規則と誤認
- 同じ根拠の二重計上
- thresholdを微妙に変えると消える脆い規則

対策として、candidate gate、matched control、Train-only threshold generation、時系列分離、FDR screening、複数fold安定性、Sealed Holdout、feature source-group重複制御を必須にする。

人間に意味が分からない条件でもout-of-sampleで安定して再現するなら残す。一方、人間にもっともらしく見えても再現しない条件は捨てる。

---

# 8. Implementation order

実装は安全のため段階的に行う。

### Phase 1

- 共通 `analysis_task_metrics`
- 既存 `DAILY_ANALYSIS` の詳細計測
- `FEATURE_BUILD`
- `store_feature_snapshots`
- VPSリソース画面の処理実績

### Phase 2

- `BACKTEST`
- walk-forward leakage barrier
- observed outcome proxy adapter
- `backtest_runs / predictions / scores`
- `promotion-comparator-v1`

### Phase 3

- `AXIS_DISCOVERY`
- matched control
- Train-only threshold generation
- candidate gate
- 複合条件生成
- `MODEL_SEARCH`
- model fingerprint / registry
- 研究Champion世代更新

### Phase 4

- ①→②→③→①の自動閉ループ
- 循環検知
- 5世代改善なし停止
- Sealed Holdoutによるcycle winner選出
- `active_store_model` 自動昇格

各PhaseはTDDし、前Phaseの保存形式を明示的なversion契約として使用する。Phase 4が完成するまで、研究結果は既存店舗解析の表示・判定結果を変更しない。

---

# 9. Success criteria

完成条件:

1. iPhone/JUGEST画面を開いていなくてもVPS単独で研究ループが進む。
2. 通常収集・通常解析が研究処理より常に優先される。
3. ①②③それぞれで店舗台数規模とPeak RAM/CPU/時間が残る。
4. 過去日予測へ未来情報を混入できないテストがある。
5. 新評価軸は強い台だけでなくcontrolとの比較から作られる。
6. 数値閾値はTrainだけからboundedに生成される。
7. 複合条件はboundedに探索され、組合せ爆発しない。
8. train/validation/sealed holdoutが時系列分離される。
9. Champion昇格判定がversionedで決定論的である。
10. 同じ重み付き評価軸構成は同じmodel fingerprintになる。
11. 同じfingerprintが2回出たらcycleを収束できる。
12. 5世代改善なしでもcycleを収束できる。
13. 最終winnerは最後の世代ではなく、Sealed Holdoutで歴代Championから選ばれる。
14. winnerが次の店舗読みactive modelへ自動反映される。
15. protectedな設定判別数学は一切変更されない。
16. 全モデル・昇格・棄却・負荷実績を後から再現・監査できる。
