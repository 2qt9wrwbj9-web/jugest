# 店舗別解析最適化の調査・検証

判定: **研究専用。Production相当の既定動作への採用は不可（改善未確認）**。
現行解析・実戦判別・strict Champion・Calibration・store-share constraint・単一根拠エンジンは変更していない。この研究モジュールはアプリからimportされない。

## 現行コードから分かった再利用境界

- `v510RunReplay`（過去の朝を再現）は `v4PredictStore(shop,date,externalDays,{noCache:true,forceHybridOptimize:true})` を呼び、予測と対象日の実測由来P4を比較する入口。研究では全期間を渡さず、対象日未満だけのsourceを渡す隔離アダプターが必要。キャッシュ無効だけでは保存済みhybrid profile等のグローバル状態の無混入は保証できない。
- `v4TargetPrep` は対象日より前の最大180**観測日**を使用。暦日180日と異なる。新harnessのwindowDaysは**暦日**。現行baselineを厳密に再現する本比較時は、この差を解消する専用baseline入力契約が必要。
- `v4ModelTraining` は45観測日以上が必要で、discovery/confirm/scoreを時系列順に分割する。30暦日の候補を現行モデルに直接入れると学習不可。閾値を変更して対応するのは今回の範囲外。欠測の多い60日候補も棄権し得る。
- 既存モデル/ランキング定義や `bruteSingleGenerate` には条件軸があるが、単一/複合条件の切替をstrict Champion/単一根拠の中に導入するには保護ロジックへの接触があり得る。今回maxDimsは研究候補メタデータのみで、実際の式を切り替えるアダプターは実装していない。
- `modelPerformanceForShop` は過去forecastの答え合わせを集計する。保存forecastのtrainingTo/targetDate、lock、作成日時を入力監査に利用可能。ただし全候補方式の同一日の予測があるわけではなく、これだけで方式間比較はできない。
- `storeAnalysisBuildSnapshot` / `storeAnalysisSaveCurrent` / `storeAnalysisAttachForecast` の解析履歴は再現入力の候補。ただし後日再解析したsnapshotは当時の事前予測ではない。過去の朝を再構成する際もデータ更新・訂正時刻を検証する必要がある。

## 今回追加した研究専用の比較基盤

`research/store-optimization.mjs` の `evaluateWalkForward` は予測器を注入する汎用nested walk-forward。現行コアとの比較が完了した製品機能ではない。

1. 各outer評価日の前だけのinner日を固定する。
2. 各inner日より前のwindowだけをimmutableな入力として予測器へ渡す。target outcome、未来データを渡さない。
3. 全inner日が揃った候補だけを同じ日集合で比較。欠測の都合のよい日だけを選ばない。同点はbaseline優先。
4. inner成績だけで候補を選択し、outer日のbaseline/候補予測を生成・hash化した後でouter結果を採点。
5. paired deltaと入力/config/予測hashを返す。データが不足した日は棄権し、0点扱いしない。

`candidateGrid()` は30/60/90/180暦日×maxDims 1/2の候補記述を返すだけ。baselineを先頭に明示して渡す必要がある。適用軸の探索や候補パラメータ選択をouter結果を見て変更することは禁止。

予測器のclosureや外部グローバル参照をJavaScriptの引数凍結だけでは禁止できない。実データ接続にはネットワークなしの隔離worker/VMを各foldで作り、過去データのみ・保存済みprofileなしで現行コアをロードし、候補adapter自体の監査を追加する必要がある。availableDateが営業日と異なるデータは黙って過去へ戻さず拒否する。これはpoint-in-timeデータ訂正対応が未実装であることを明示するため。

## 検証結果

`node tests/store-optimization-research.mjs`:

- RED: モジュール未実装時にERR_MODULE_NOT_FOUNDを確認。
- GREEN: 過去のみの入力、再帰的凍結、inner日<outer日、baseline同点優先、対象日と未来のtruthを変更しても同じ日の選択・予測hashが不変、採点だけ変化、重複日/重複台予測/後日availableDate拒否、優位候補の選択、不足データで棄権を確認。
- 使用データは75日×2台の小さな合成fixture。固定予測器の同点比較では3日とも差0。優位候補fixtureでは3日とも差+0.6。これは評価harnessの動作確認であり、**JUGESTの予測性能・実店舗改善を意味しない**。

実店舗データ、複数店舗のpoint-in-time export、真の設定ラベルは今回repoから確認できなかった。アプリ利用者のブラウザIndexedDBもこのcheckoutからは取得できない。よって現行コア vs 店舗別方式の実証的比較は未実施。P4は実測からの推定値でありtrue setting precisionとは呼ばない。

## 採用前に必要な検証

同一期間・複数店舗の事前固定データと隔離core adapterを用意し、候補を事前登録。十分なinner期間の後に、複数の連続outerブロックでpaired top-K推定P4、店舗平均比lift、coverage、校正指標を比較する。日内の台は独立標本とみなさず、店舗/週ブロックbootstrap等で不確実性を評価。特定店舗の改善が他店の悪化を隠していないか個別確認し、探索に使わない最終holdoutを一度だけ評価する。複数店舗で安定した改善が確認できるまでは既存結果を一切置き換えない。

今回のUI改修のPreview採否とは独立して、店舗別最適化の既定採用はNO-GO。
