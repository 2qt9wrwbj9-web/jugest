# 既存予測・評価基盤の独立監査

- 基準SHA: `a461a08005d8533107879813db29a57027c139b5`
- 調査日: 2026-10-09 JST。`AGENTS.md`を確認済み。
- 範囲: コード・関連テストの読み取り、メモリDBでの再現。この文書以外の編集、本番操作、外部取得は実施していない。
- 制約: 既存の判別数学、関連度、NDCG、逐次検定、採用基準を変更しない。新方式を自動採用しない。

## 結論

保存・自動採点・日本語比較画面は既に存在する。新しい予測・評価テーブルを作る必要はない。次の開発は、既存テーブルに事前性・完全性・訂正状態の根拠を補い、既存の計算関数の前後で運用ゲートと集計を完成させるのが最小範囲となる。

現行の「LIVE」は保存済みという意味で、対象日の前に保存したことまでは保証しない。旧遅延生成を新しい事前成績へ混ぜてはいけない。また、`quality_status='valid'`はデータが100%揃ったという意味ではない。

親エージェントからの読み取り専用本番確認では、配信SHAと基準SHAは一致し、予測snapshot146件・score117件、SHADOW_PREDICT成功65件、DAILY_ANALYSIS成功1657件が報告された。正式trialについても予測22件・結果8件との報告がある一方、進行時刻が9月24日で止まっている可能性がある。コードの接続は確認できるため「未実装」「未稼働」とは断定せず、実際のtrial状態、保留対象日、最後のエラーを追加調査する。

## 既に完成している機能と呼出し経路

| 機能 | 根拠と既存経路 |
| --- | --- |
| 現行方式の翌日予測保存 | `analysis/daily-analysis.mjs:126` → `requestShadowPrediction` → `jobs/shadow-predict.mjs:44-64` → `persistLivePrediction`。既存の`runExistingStorePlan`を使用する。 |
| Active PREの予測保存 | `jobs/feature-build.mjs:53-69` → `refreshActiveStoreReadSnapshot` / 初回`activateStoreModel` → `research/store-read-output.mjs:54-68` → 同じ`store_prediction_snapshots`。 |
| 正式候補試験の自動開始 | `daily-analysis.mjs:26-37,132-134` → `advanceFormalLiveTrialDay`。試験なしの場合に`maybeStartFinalizedFormalTrial` → `startFormalLiveTrial`。convergedかつsealed holdout確定済みの異なる候補だけを開始する。同じ組合せでtrial番号を重複消費しない。 |
| モデル・順位の固定 | `formal-start.mjs`がChampion/Challengerのモデルと予測をトランザクション保存。`formal-model-store.mjs:60-76`、`formal-prediction-store.mjs:90-111`は同一再試行を許し、異なる内容への上書きを拒否する。 |
| 未来の実績行を入力から除外 | `shadow-predict.mjs:45`は`days<=frontier`、`runtime-adapter.mjs:122`と`backtest.mjs:108`は`days<target`。正式開始・日次ループもfrontier以前に絞る。両予測保存関数は`sourceFrontierDate<targetDate`を検証する。 |
| 実績到着後の自動採点 | 日次解析の`daily-analysis.mjs:132-145`が正式評価とLIVE比較を実行。正式側は一つの既保存対象を採点して次を固定し、既に取得した中間日の予測を遡って追加しない。 |
| 正式評価の厳格な台集合・事後分布検証 | `outcome.mjs:52-75`は台番号の重複、欠落、追加、不正な6枠q、未対応機種を拒否。`ndcg.mjs:81-95`はChampion/Challenger/truthの集合を完全一致させる。関連度・NDCG・逐次状態は既存関数を使用する。 |
| 正式証拠の重複・競合防止 | `trial-store.mjs:304-395`はoutcome/day/stateを一括保存し、厳密な次状態を再計算、楽観的state hashで競合を拒否する。訂正を同じ日として追加消費しない。 |
| 実績比較と過去再現の分離 | LIVEは`store_prediction_snapshots/scores`、過去再現は`historical_comparison_*`。`analytics-handler.mjs:144-148`と`mcp-handler.mjs:221`は別のsummaryとして返す。 |
| 日本語の既存成績画面 | `vps-ui-historical-comparison.mjs`にはLIVE/過去検証のタブ、勝敗、Top1/3/5的中率、lift、順位相関、Coverage、日別表示がある。`ui-source-patch.mjs:111-114`が配信HTMLへこのモジュールを追加する。 |
| 自動採用をしない状態 | sealed holdout確定はActiveを置換しない。正式trialの`status='promoted'`は証拠上の状態記録で、Activeを置換する呼出しはない。`feature-build.mjs`は既存Activeを更新せず、Activeなしの初回だけ初期モデルを設定する。 |

## 主要な欠陥・不足

### 1. 保存日時と事前性を検証していない

- `live-comparison.mjs:48-59`、`formal-prediction-store.mjs:90-111`は有効な日時文字列を保存するだけ。対象日の開始・公開・生成完了時刻との関係を調べない。
- 再現: target=`2026-09-14`、frontier=`2026-09-13`、createdAt=`2026-10-08T12:00:00Z`の2方式をメモリDBへ保存できた。LIVE summaryへ通常の採点日として入る。
- 正式側の`daily-analysis.mjs:69,133`は解析開始時の`at`を保存時刻として渡す。長い解析がcutoffをまたぐ場合、実際の予測生成完了時刻とは異なる。shadow workerは計算後の時刻を使用している。
- `formal-auto-start.test.mjs`はfrontier=`8/30`、target=`8/31`、nowIso=`9/17`での試験開始を期待する。全保存関数で後日生成を単純拒否すると既存契約を壊す。
- 最小修正: 保存日時は実際の生成完了時刻として記録し、既存データは事前性不明／対象日当日／後日生成を明示分類する。公式prospective成績には検証済み事前予測だけを入れ、旧生成を昇格しない。

### 2. 完全データが揃わなくても旧LIVE採点が確定する

- `comparison-refresh.mjs:9-27`はvalidな日から差枚欠損・不正JSONを除き、1台でも残れば採点する。`live-comparison.mjs:95-103`は予測を実績との交差集合へ絞って順位を詰める。
- 再現: 予測1位101の差枚を欠損にして、予測2位102が残りの実績1位だと、`top1.overlap=1`、`coverage=1`になる。旧Top1は「元の推奨1位」の成否をそのまま表さない。
- `canonical-ingest.mjs:67-76`は`quality_status='valid'`を無条件に設定する。PIAの`pia-public.mjs:132`のready閾値は差分取得95%、正規化90%であり、100%完全ではない。day.qualityの警告・grade等は`loadStoreDays`で復元されない。
- 最小修正: 既存scorerの数式・欠損除外契約は維持する。公式評価の前に、日付・公開状態・完了根拠、予測台集合、必要な実績値、重複を確認して保留する。完全性メタデータは既存`store_days`へ残す。単なるvalidフラグだけを完了判定に使わない。

### 3. 訂正を検出しても旧成績が正常なLIVE結果として残る

- `live-comparison.mjs:137-138`は訂正hashで`outcome_hash_conflict`を返すが、その状態を保存しない。`comparisonRows:166-184`は予測と旧scoreの存在だけで採点済みと判断し、現在canonical hashを検査しない。
- 再現: first hashで採点後、corrected hashを渡すとconflictになるが、summaryは`days=1`、`excludedReason=null`、outcome hash=`first`のまま。
- 正式側は`scoreFormalTargetDay:88-99`へ直接再入力すると`formal outcome conflict`。通常日次ループは`lastTargetDate`以前の結果を再訪せず、終了trialも読み直さないため訂正検出自体が行われない。
- 最小修正: 訂正・保留状態と現在の入力hashを既存評価レコードへ残してsummaryに反映する。保存済み予測は不変のまま再評価し、旧結果・新結果・版・時刻を保持する。訂正を新たな独立した正式日として逐次証拠へ追加してはいけない。既存正式証拠や採用判定を無断で書換えず、訂正表示と逐次証拠の扱いを明示する。

### 4. 台番号は一致しても機種の一致は保証されない

- LIVE実績は`comparison-refresh.mjs:18-23`で機種情報を捨てる。正式予測は`machineName`を保存するが、`formal-evaluation.mjs:107-109`と`outcome.mjs:67`は台番号集合だけを比較する。
- 再現: 保存予測が「マイジャグラーV」、同じ101/102番の実績が`machine='king'`でも、正式評価は成功し`daysProcessed=1`になった。実績側の機種に応じた別の関連度尺度が使われる。
- DBのstore_idで店舗は分離され、通常呼出し元も正しいstore_idを渡している。一方、店名・台番号だけで機種変更を同一評価対象と見なす問題は残る。
- 最小修正: 既存ranking payloadへ元の正規化機種キーを保持し、評価前に店舗ID＋台番号＋機種を照合する。機種変更は保留・明示理由とし、別尺度へ暗黙に切替えない。

### 5. 重複と不変性の保証範囲が異なる

- LIVEは同じ保存identityの異なる内容を黙って無視する(`live-comparison.mjs:55-59`)。正式側は異なる内容をconflictとして拒否する。
- LIVEの`normalizeRankings:23-26`は重複machineKey/rankを拒否しない。実績DBのmachine_keyは台番号ではなく連番(`canonical-ingest.mjs:81`)なので、同一台番号が二行あっても保存できる。
- 再現: 3台分の予測をすべて101番にするとLIVE scorerはcoverage=1、Top3 overlap=3を返す。重複を完全性確認で止める必要がある。
- 新しいmodelFingerprint/engineVersionで同じ対象日の予測が複数保存できる。summaryの`firstPredictionsForDay:106-110`は作成日時順の最初だけを使い、検証済み事前性で選ばない。更新されたclient snapshotと評価する最初の予測が異なる場合がある。
- 最小修正: 保存・公式評価入口で重複を拒否し、同一identityの異なる内容を監査可能な競合として返す。公式集計の予測選択条件は固定し、後から有利な版を選ばない。現状の不変性はAPIによる保証であり、DB UPDATE/DELETE禁止トリガーによる保証ではない。

### 6. 正式評価の欠損は安全に止まるが、保留状態と進行回復が不足する

- `formal-daily-loop.mjs:30-42`は未評価対象を一つだけ許す。対象日欠落は128行で例外、台集合欠落・追加は正式scorerで例外になる。
- `daily-analysis.mjs:135-138`は例外をログへ出し`reason='error'`にまとめる。詳細な保留理由は永続化・API公開されない。未評価対象が残るため後続予測も固定されず、試験が停滞する。
- 最小修正: 未公開、未取得、台不足、機種不一致、訂正待ちを構造化して保存・表示し、再取り込みで同じ固定予測を再試行する。保留を0点や新しい証拠日に変換しない。継続予測を許す設計では既保存対象の順序と重複防止を保ち、既存の逐次計算を変更しない。

### 7. 正式成績・日時・保留理由がAPI/UIへ出ていない

- 既存`research/comparison` APIはLIVEとhistoricalだけを返し、`pre_v2_formal_trials/days/outcomes`は読み出さない。正式Top10/Top5 NDCGは旧LIVEの差枚Top1/3/5とは別の評価で、置換してはいけない。
- 配信UIの`liveDayHtml:50-53`には保存時刻、事前性、完全性、訂正状態がない。除外理由も英語コードをそのまま表示する。
- 最小修正: 既存認証・店舗scope付きAPIへ既存正式レコードの成績と状態を追加する。画面では事前成績、旧記録、過去再現を区別し、作成日時・対象日・履歴時点・保留理由・訂正履歴を日本語で示す。採用操作は自動実行しない。

## 事前保存を通常運用へ接続する注意点

PIAは翌日00:30 JST頃に前日分を取り込むため、現行`target=next(frontier)`は対象日の当日生成になる。前日保存を厳守する運用では、`target=max(next(frontier),next(JST today))`を共通の生成方針として使う案が整合的である。この場合、00:30に翌日の予測を保存し、公開済み履歴は一日遅れになるため画面に明示する。

ただしshadowだけの変更では不十分。`store-read-output.mjs:44`はtargetをnext(frontier)へ固定し、`formal-daily-loop.mjs:145-147`もnext(through)をassertする。両方式・正式pairのtargetを一致させ、入力は必ず`days<=sourceFrontierDate`に制限する必要がある。

候補モデル自体の利用可能時刻も確認する。`formal-auto-start.finalizedCandidate`は研究loopのfrontierを選択・検証せず、`formal-start`もActiveのsourceFrontierと要求frontierを比較しない。予測入力行だけが古くても、後日の履歴で選択したモデルを昔の事前予測扱いにすることはできない。旧データには不足する時刻根拠を推測で補わない。

## テストとの整合性

関連11ファイル・45テストを実行し、45/45成功した。対象はlive-comparison、comparison-refresh、formal prediction/evaluation/daily-loop/start/auto-start、trial-store/guard、outcome、relevance-ndcg。Node v24.19.0で、環境変数はVPS既存test scriptと同じ設定にした。

維持すべき既存契約:

- `live-comparison.test.mjs:112-123`と`comparison-refresh.test.mjs:65-76`: 差枚欠損を0とせず除外する旧計算。公式運用ゲートで完全性を追加する。
- `live-comparison.test.mjs:97-108`: 訂正hash conflictの後でも旧summaryが1日と数える現行契約。旧summary互換を残す場合も、新しい公式成績では現在の訂正状態を別途反映する。
- `formal-evaluation.test.mjs:59-78`: outcomeの相違はconflictで証拠を二重消費しない。訂正再評価を新しい独立日として追加しない。
- `formal-prediction-store.test.mjs:57-69`: 後日の台集合変更は許可する。当初trialのmachineSetHashを全日へ強制すると既存契約を壊す。各対象日のpairと実績を厳密に照合する。
- `formal-auto-start.test.mjs`: 昔のfixtureを後日時刻で保存する契約。保存は可能でも新しいprospective成績へ混ぜない。
- `formal-daily-loop.test.mjs:82-93`: 途中の取得済み日へ予測を後付けしない。
- `pre-v2-relevance-ndcg.test.mjs`: IDCG=0の非情報日はdelta=0という正式契約を維持する。欠損日の保留とは区別する。

追加すべき検証は、JST日境界と生成完了時刻、遅延生成の分類、future入力の遮断、完全性保留→到着後の同じ予測の評価、機種変更・重複台番号、訂正後の再評価と旧結果保全、同一targetの再試行、日本語表示、Active不変の保証に絞る。
