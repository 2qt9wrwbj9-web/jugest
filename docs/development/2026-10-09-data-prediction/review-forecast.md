# 予測保存・自動評価の独立実装後レビュー

- 対象ブランチ: `work/data-reliability-prediction-loop-20261009`
- 基準: `a461a08005d8533107879813db29a57027c139b5`
- 対象実装: `83a85a0`。レビュー中に親担当がAPI/UIとperformanceの表示を編集している。以下の行番号・所見は、別記がなければ対象実装時点。
- 指示確認: `AGENTS.md`、`prediction-audit.md`、`docs/superpowers/specs/2026-10-09-data-prediction-design.md`、対応するplanを読了。
- 範囲: 事前予測の固定・不変保存、既存LIVE/formalの運用ゲート、訂正保留、永続評価ジョブ、Coordinator初期補完、集計。実装ファイルは編集していない。本番接続・変更・デプロイ・外部取得・commitは行っていない。

## 判定

**83a85a0のままでは修正が必要。** 既存数学と採用基準は保持されている一方、正式証拠の入力版・生成完了時刻・旧trialの事前性にP1の漏れがある。さらに、訂正・検品根拠の変化後に永続評価が停滞する経路と、元資料だけが変わる訂正を見落とすキャッシュがある。

親担当へ重大所見を先に共有済み。修正後の再レビュー結果は、本書末尾へ追記する。

## 再現済み所見

### F1 / P1 — 古いcanonical入力から得た正式結果を最新資料の版で確定できる

根拠: `vps/src/research/pre-v2/formal-daily-loop.mjs:149-169`、`vps/src/analysis/daily-analysis.mjs:77,136`、`vps/src/analysis/prediction-evaluation.mjs:13,20`。

`loadEvaluationDay`は現在のDBの対象日・検品・hashを読む。しかし判定関数へ渡す`truthDays`は、呼出し元がそれ以前にロードした`days`から作る。判定後の照合は対象日hashが「ゲート開始時の最新hash」と同じか、台番号・機種が同じかを見るだけで、判定へ渡した数値の版を確認しない。Collectorが解析中、またはLIVE集計中に訂正を確定してからformalを開始すると、古いBB/RB/差枚のqに最新資料のhashを付ける。

隔離再現では、固定pairのtarget=`2026-09-11`に対し、呼出し元の古いdaysの101番はBB20/RB18/差枚100、DBはBB45/RB40/差枚3000へ更新済みとした。既存の実際の`runExistingStoreDayJudgement`を使用した結果:

- `reason='advanced'`、正式証拠件数1。
- `prediction_evaluation_state.state='complete'`、`normalized_hash='fresh-target'`。
- 保存qの先頭/末尾は約0.03960 / 0.15051、訂正後入力で独立計算したqは約0.56834 / 0.00094。結果は一致しない。

最小修正: 判定へ渡す入力をゲート開始時のDBから読み直し、同じ版の数値と検品を使う。判定中の訂正も引き続き拒否する。呼出し元のdaysを使うなら、判定開始前にDBとその入力hashを一致検査し、相違は保留する。数学や既存正式outcomeの再計算は不要。

### F2 / P1 — JST境界を跨ぐ正式生成を事前予測として記録できる

根拠: `daily-analysis.mjs:71,136`、`prediction-evaluation.mjs:8,19-20`、`formal-daily-loop.mjs:158,182-183`、`formal-start.mjs:95,110-115,154-155`、`store-read-output.mjs:60-65,71`。

`nowIso`は解析または評価の呼出し開始時に固定される。正式判定の`await`後に新pairを作る経路も、その時刻で対象日と`created_at`を決める。通常PREも生成前の時刻で事前性を確認する。SHADOWは計算後に時計を読むので、今回の同じ漏れはない。

偽時計で開始=`2026-09-12T14:59:59Z`、既存対象の判定完了=`2026-09-12T15:00:01Z`を再現。JSTでは翌9/13が開始済みなのに、新pairのtarget=`9/13`、`created_at=14:59:59Z`となり`isProspectivePrediction=true`だった。

最小修正: 運用経路では実生成完了の時計を読み直し、対象日が開始済みなら翌対象日として生成し直すか保留する。保存直前にも締切を再確認する。テスト用時計は明示注入し、開始時刻と生成完了時刻を同じ引数で代用しない。

### F3 / P1 — 旧trialの既採点日に事後作成予測があっても、新しい正式証拠を追加する

根拠: `formal-daily-loop.mjs:124-140,150-153`、`prediction-performance.mjs:62-63`。

運用ゲートは現在のpending pairだけの事前性を調べる。既処理日の旧pairと正式証拠は調べず、新しい`prediction_evaluation_state`の訂正マーカーだけを見る。したがって旧trialの累積逐次証拠に事後作成予測が含まれていても、後続日の正常pairを採点して累積証拠を進める。

再現では旧target=`9/11`のpairを`9/11T01:00Z`に作成済み（対象開始後）とし、既存互換経路で採点済み状態を作った。次の`9/12` pairは事前固定済み。新しいoperational loopは`9/12`を採点し、`daysProcessed=2`へ進んだ。永続状態は`9/12 complete`しかなく、旧日の遅延理由は保存されなかった。

最小修正: trial全体の既処理日も事前性・検品版の根拠を確認する。既存の事後生成・根拠不足があれば、旧証拠・累積統計を保持したままtrialを運用上保留し、prospective統計へ混ぜない。正式trialの式・閾値・statusを改変して解消しない。終了済みtrialの表示にも同じ分類が必要。

### F4 / P2 — 固定PREの正常な競合が、正式評価を含む永続評価ジョブを失敗させる

根拠: `prediction-evaluation.mjs:19-20`、`store-read-output.mjs:69-73`。

履歴の訂正後、同じ明日の対象日にPREを保存し直すと、不変保存のため`prediction_snapshot_conflict`になる。これは保持すべき挙動だが、評価ジョブはこの例外でformalRunnerの前に終了する。再試行でも同じ不変予測に競合し、既存3回上限で停止する。

実際の`loadStoreDays`形式でPREを生成し評価ジョブを完了した後、同日中に履歴の差枚を訂正して再評価を依頼した。2回目は`prediction_snapshot_conflict`、正式runnerの呼出し回数は1回のまま、`generation=2/completed_generation=1/active_job_id=2`だった。

最小修正: 新しいPREの公開を、既存固定予測の採点・正式進行の前提にしない。競合は永続的な理由として残して固定予測を保持し、評価部分は継続させる。競合を黙って成功・上書きに変換しない。

### F5 / P2 — source_hashだけの訂正をキャッシュと最新集計が検出しない

根拠: `comparison-refresh.mjs:10-19`、`prediction-performance.mjs:43,47`、`live-comparison.mjs:198-201`、`formal-daily-loop.mjs:129-137,161-169`。

既存の評価入力hashには`source_hash`が入る（`evaluation-state.mjs:33`）。新しいキャッシュ・現在版の確認は`normalized_payload_hash`のみで、同じnormalized資料に異なる元資料識別が付いたとき、以前の採点を最新として残す。canonical ingestもdirtyをnormalized hashの変化だけで決めるため、再評価ジョブが出ない場合がある。

LIVEの両方式を採点後、targetの`source_hash`だけを`raw-first`から`raw-corrected`へ変えた。再実行は`cached=true`の`scored`、旧comparisonと新performanceの評価日数はともに1だった。

最小修正: キャッシュ、表示時の現在版確認、正式判定前後のrace確認、中断からのcomplete回復を、同じ評価版識別へ統一する。normalized hashに加えsource hashを含める。旧の不変score/outcomeは保存し、異なる資料識別を正式逐次証拠の新たな独立日として消費しない。

### F6 / P2 — 検品根拠だけが改善した同一データを再取り込んでも評価が再開しない

根拠: `canonical-ingest.mjs:66-76,98-106`、`prediction-refresh-state.mjs:9-11`。

同じnormalized dayの初回が台集合未確認で、その後ソースの期待台集合を確認できても、`changed=false`により解析・評価ともdirtyにならない。取得値が変わらなくても、評価可否は変わる。

隔離再現では実archive・ingest・executeDailyAnalysis・executePredictionEvaluationを使った。初回は`integrity=unverified`、評価は`data_insufficient/integrity_unverified`。正常完了して`generation=completed_generation=2`。同じday/rawを`input.expectedMachineKeys=['101','102','103']`付きで再取り込むと`integrity=complete`になったが、`changed=false/analysisJobId=null/active_job_id=null`で、旧保留は残った。

最小修正: 評価可否・公開状態・期待台集合など、意味のある検品根拠の変化をdirty条件に含める。取得時刻や`checkedAt`が変わっただけの同一再送はdirtyにしない。保留を0点や新しい独立正式日に変えない。

## 評価版識別・キー漏れの確認事項

F5/F6の修正では次を別々の場当たり的比較へ分散させず、同じ運用版識別として使う。

| 根拠 | 83a85a0の状態 | 修正後に照合が必要な場所 |
| --- | --- | --- |
| normalized payload hash | あり | dirty、cache、判定前後、表示、中断回復 |
| source hash | 既存score入力にはあるが運用cache等にない | 同上。資料識別だけの訂正を見逃さない |
| quality_status | 初回gateにはあるがcomplete cache/表示にない | validから非validへの遷移をキャッシュ成功にしない |
| 検品のstatus/公開状態/評価可否 | 初回gateにはあるがdirty/cache識別にない | 根拠の改善で再開、根拠の変化で再確認 |
| 期待台集合・台数・根拠区分 | gateにはあるが外側のinput変更はnormalized hashに入らない | 同じ数値でも対象集合の確認根拠が変わった場合 |
| 最後の予測ID/固定payload | LIVEのcacheにlastPredictionIdあり | 後着の片方式に同じ対象・集合で追随する。任意の有利な版選択はしない |
| 時計・対象JST営業日 | 開始時刻を代用する経路あり | 生成完了締切、現在日と対象日の関係 |

検品識別へ`checkedAt`、再観測時刻だけを含めると同一再送が無限にdirtyになるので除く。式や描画版が今後変わる場合は、補助performanceのキャッシュにもその版の互換性を明示する。

## 集計期間に関する確認

83a85a0では期間を予測行の`slice(0,n)`で作るため、予測がない保存営業日が母集団から抜けた。再現では1年前に1件だけある予測・実績が7期間へ入った。

親担当から期間の意図は「直近7/30/90**営業日**」と確認された。したがって古い日を最後の保存営業日として含めること自体は欠陥として扱わない。母集団へ保存された店舗営業日を含め、期間の実際の始終日・最終営業日からの経過を表示する方針を確認した。カレンダー日数や予測取得率と誤認させないことを再確認対象とする。

## 確認できた保護と既存テスト

- `persistLivePrediction`は重複machineKey/rankを拒否し、同一identityの異なるpayload/input/frontierをconflictとして返す。保存と評価登録はsavepointで原子的。
- 既存の入力日フィルターはtarget/frontier以前に限定されている。新PREは明示targetを使っても入力frontierを越えない。通常更新のActiveモデルfrontier検査が加わっている。
- 運用gateは欠損差枚、未確認台集合、台集合の相違、機種変更を保留する。0を未知に置換せず、未知を0点にもしていない。
- 新評価ジョブは既存queueへ登録され、同一店舗の依頼は世代を増やして1ジョブへ合流する。savepointによる登録原子性・2書込元のrace・再起動回復・3回上限の関連テストは成功した。
- 正式証拠は既存のatomic transactionとstate hash検査を使用する。同じ結果の再試行、中断後の二重消費防止、判定中のnormalized訂正保留の既存追加テストは成功した。ただしF1/F2/F3/F5はそのテストの外にある。
- `formal-evaluation.mjs`、`trial.mjs`、`trial-store.mjs`、`outcome.mjs`、`ndcg.mjs`、`model-search.mjs`、`backtest.mjs`は基準から83a85a0まで差分ゼロ。Championを新評価ジョブや正式promoted状態で自動置換する追加呼出しはない。
- 通常予測は既存`store_prediction_snapshots/scores`、正式pairは既存`pre_v2_formal_*`を使う。重複の新予測テーブルは作られていない。

独立実行した関連10ファイルは43/43成功:

```text
prediction-operations, prediction-job, pre-v2-formal-daily-loop,
pre-v2-formal-start, pre-v2-formal-auto-start,
pre-v2-formal-prediction-store, live-comparison,
comparison-refresh, shadow-predict, store-read-live
```

Node `v24.19.0`、`JUGEST_ACCESS_ENABLED=0 JUGEST_PIA_ACCESS_MODE=public`。全571/571・root73/73という実装担当の結果を、今回の境界条件が安全という根拠としては採用していない。レビュー担当は実装を変更していないため、ルートbuild/full suiteはこのレビューでは重ねて実行していない。

独立再現スクリプト: `/workspace/scratch/2f9e5eaabf52/forecast-review/repro.mjs`。上記F1–F6と期間観測の計7シナリオを、合成データ・メモリSQLite・一時raw保存先で実行し再現した。対象コードの正常性をassertする通常テストではなく、観測された欠陥をassertする監査用再現である。

```bash
JUGEST_ACCESS_ENABLED=0 JUGEST_PIA_ACCESS_MODE=public node /workspace/scratch/2f9e5eaabf52/forecast-review/repro.mjs
```

## 修正後の再レビュー

### e6a47cfの独立再確認

対象: `e6a47cff4962753de1c5d8e960ffa7ebdcdf9171`。隔離再現scriptの期待値を安全側へ更新し、F1–F6を再実行した。実装ファイルは変更していない。API/UIは実装担当の継続作業中で、この回の完了判定に含めない。

**F1/F3/F4/F5/F6は元の再現条件で対応済み。F2の元の判定await境界も対応済みだが、保存ロック待ちに未解決条件が残る。**

| 項目 | 再確認結果 | 独立再現の証拠 |
| --- | --- | --- |
| F1 入力版 | 対応済み | 古い呼出しdaysを渡しても保存qが現在DBから独立計算したqと完全一致。現在hashでcomplete、証拠1日 |
| F2 判定awaitの時計 | 対応済み | 14:59:59Z開始→15:00:01Z判定完了後、次targetは9/14へ移り、created_atは15:00:01Z。9/13へ後付けしない |
| F3 旧trialの事後予測 | 対応済み | 旧9/11をhistorical_predictionで永続保留、daysProcessedは1のまま、9/12を追加しない |
| F3 旧版記録不足 | 対応済み | 旧pair自体が事前でも版マーカーがなければlegacy_evaluation_unverifiedで停止し、旧証拠を保持 |
| F4 固定PRE競合 | 対応済み | forecast:pre_researchにconflictを保存し、正式runnerが2回目も実行、generation=completed_generation=2へ正常完了 |
| F5 source訂正cache | 対応済み | 同じnormalized資料のsource変更はcache成功にせずoutcome_hash_conflict。LIVE/performanceとも評価日数0 |
| F5 判定中のsource訂正 | 対応済み | outcome_changed_during_evaluationで保留、正式証拠0 |
| F5 中断後のsource訂正 | 対応済み | 証拠保存後のcomplete公開をfixture triggerで失敗させ、source変更後に回復。corrected/formal_outcome_correctedで停止し、元の証拠1件を完全保持 |
| F6 検品根拠の改善 | 対応済み | 同じnormalized資料でもverificationChanged=true、世代3/completed2で新評価登録。その実行でcompleteへ再開 |
| F6 同じ再送の時刻差 | 対応済み | 同じ検品根拠のcheckedAtだけを変更してもverificationChanged=false、世代を増やさない |
| 世代race | 成功 | 正式処理中に追加依頼した世代2を、completed1のまま別follow-up jobへ引き継ぎ、依頼を失わない |
| 営業日期間 | データ側対応済み | fromDate/throughDateが実際の保存対象日を返す。旧期間説明と最終営業日経過はUIの再確認待ち |

`evaluationInputVersion`はnormalized hash、source hash、quality_status、`integrityFingerprint`を統合する。`integrityFingerprint`は検品全体からcheckedAt/normalizedHashを除き、公開状態・評価可否・期待台集合・台数・根拠区分を含む。LIVE cache、表示時の現在版確認、正式処理の前後・中断回復は同じ識別を使う。今回の意味のある検品・source識別のキー漏れは、上記再現条件では解消している。

### F2残件 / P1 — 新pairの生成後、書込権取得の待ちがJST締切を跨ぐ

`formal-daily-loop.mjs:96`は生成後のcreatedAtを読むが、保存の`BEGIN IMMEDIATE`は106行でその後に取得する。SQLiteの書込ロック待ちで対象日が開始しても、106–110行の保存中に時計・締切を再確認しない。`formal-start.mjs`やPREのsavepointによる最初のINSERTも、保存前に時刻を固定する同じ構造を持つ。

隔離再現では、正式既存日の証拠保存を正常に通した後、新pair保存用の2回目の`BEGIN IMMEDIATE`でのみロック待ちを模し、時計を14:59:59Zから15:00:01Zへ進めた。その結果:

```text
実保存時刻        2026-09-12T15:00:01.000Z
保存target        2026-09-13
保存created_at    2026-09-12T14:59:59.000Z
prospective       true
```

「事前予測は対象開始前に保存済み」という安全側assertは失敗した。実装担当へ即通知済み。最小修正は、書込権取得後に実clockで締切を再確認し、対象開始後なら取引をrollbackして保留または次対象日へ再生成すること。保存途中に時計を跨ぐ経路も、片方のpairだけを残さず取引全体で拒否する。保存済み予測の時刻を書換えて修復しない。

### 再実行した検証

- 既存関連15ファイルを独立実行し、**84/84成功**。前回の10ファイルにdata-integrity、formal-evaluation、trial-store-guard、outcome、relevance-ndcgを追加。
- 隔離scriptは、元のF1–F6・営業日期間と追加4条件が安全側期待値で成功。末尾に追加した保存ロック待ち条件のみ安全側assertが失敗する（11シナリオ成功、残件1）。scriptは現在、欠陥の観測をassertする初回版から、安全な結果をassertする修正確認版へ更新済み。
- 保護対象formal-evaluation/trial/trial-store/outcome/ndcg/model-search/backtestは、基準からe6a47cfまで再び差分ゼロを確認。
- Node v24.19.0、外部取得を禁止した隔離実行。本番接続・変更・デプロイは行っていない。
