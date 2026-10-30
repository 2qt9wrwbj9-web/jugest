# 保存版16 障害・復旧・未網羅境界

本番データ/認証情報なし。すべて合成SQLiteまたはlocal D1/R2。公開/host実OOMではない。

## 実際のlocal V8 OOM

`active-pre-oom-recovery.mjs feature-build`はstore-read:checkpoint、`... formal-pre`はformal-pre:checkpointで大配列を実確保し、old-space96MiBのworkerdを実際に枯渇させる。単に例外を投げる模擬ではない。子のfatal raw logを保存し、同じ永続local D1/R2を開き直す。期限切れleaseを回復し、固定private planを再利用し、active/client/liveまたはtrial1件/予測2件を一度だけ確定。停止前のactive/正常な分析結果は保持。`feature-build-oom-results.json`, `formal-pre-oom-results.json`, logs/real-feature-build-oom.log, real-formal-pre-oom.log。

従来の7条件も再実行：analysis:begin、payload:checkpoint、model-prefix:checkpoint、machine-batch:checkpoint、machine-batch:unit-complete、research-cycle:planned、holdout:stage-checkpoint。各実OOM→再起動→hash同一・旧正常保持・二重確定防止。raw stderrと結果JSONを無省略収録。実際のSites総メモリ強制終了やhost再配信を証明したものではない。

## 新PRE/active異常系

- private R2 plan後の停止、結果確定batchへの不正SQL注入によるDB rollback、再試行、確定後応答消失・duplicate配信。
- active model/研究generation/frontierの変更が計算後に発生した場合のCAS拒否。新状態と旧正常結果を変更しない。
- 同時に同じtrialを開始した場合の元SQLite直列reuse、異pair/feature/fingerprint/予測hash/開始machine roster/time方向の拒否。
- 正式モデルと予測は不変hash。破損private planはinput/implementation/body hashで拒否する構造（この新planの全破損境界網羅は未完）。既存input/holdout/checkpoint破損の回帰は維持。
- 研究7job→正式PRE開始をnative local Queueで検証。ブラウザーのfeature受付後にタブを閉じ、ローカルDBで7job完了を観測し、開き直して正式結果/履歴を表示。

未網羅：新PRE日次trialが長期間走りterminal採否へ至る統合、全save I/O停止位置、単独model/prediction primitiveの同時初回保存での元reuse完全一致、host異常終了/強制停止/通知。これらを完成扱いにしない。

## 中断前の実装履歴と失敗分類（旧rawログの一部は喪失）

- feature初期実装のplan分離でfp未定義：scopeを修正し、元子プロセス全比較と回帰を再実行。当時の文章記録を維持。旧rawログは中断で喪失、今回の全比較を再生成。
- native Worker probeのmodule closureがmultiline importを漏らした：test infrastructure import収集を修正。実runtimeの未検証を成功にせず、native再実行で確認。
- formal prediction viewのexport誤認：元rowToPredictionを機械抽出して修正。期待値は元のまま。
- OOM driverのclient snapshot総件数/列名/種別constant、元active列名の誤指定：対象表をsource通りに修正。当時の失敗記録は維持、旧rawログ喪失分と今回再生成分を区別。runtime計算/保存の期待値変更ではない。
- 公開mirrorテストでSite専用Wrangler resolverを誤コピー：既存public packageの直接Miniflare importへ戻し全回帰をやり直す。今回の不完全overlay/dependencyログを別名保持。
- 全回帰で旧research-transition fixtureがFEATURE_BUILD後に研究loopを新規INSERTし重複：復元した元副作用はloopを既に作るため、fixtureの世代4/round2を既存行へUPDATEする。元oracle/期待logical identity/値は一切変更せず、5対象試験と最終全回帰を再実行。中断前の全回帰はSites143成功1失敗/GitHub134成功1失敗と記録されていたが、旧rawは喪失。今回の最終全回帰は別に実行・集計する。
- 画面合成実績投入CLIは明示BEGIN/COMMITをD1が拒否：fixture SQLからCLI非対応transaction wrapperを除去。失敗時は未到着のまま待機したことを確認。再投入成功後の新jobで採点/翌日予測が成立。business writerの原子的D1 batchとは別のテスト準備。
- schema監査で物理差：active TEXT PKとlive INTEGER PKのDrizzle not-null、live model_fingerprint DEFAULT空文字の省略差を発見。厳密全SQL schema同値試験は失敗のまま保持する。全writerは元値を明示しており今回の保存値比較は一致。無効ID/省略SQLの完全互換は未証明、R-SCHEMAとして残す。`schema-comparison.mjs --audit`は差の列挙でありstrict成功の代用ではない。
- 元VPSのsymlink検査1件は従来の環境依存。上の新失敗と区別し、元コードは変更しない。

## 再開後に実際に記録した準備失敗

- overlay不完全のprobe/全回帰は`*-incomplete-overlay.log`に分離。57ファイル全件復元後を最終runとする。
- public packageのnpm ciはlockfileなしで失敗。既存packageのnpm install --package-lock=falseで依存を復元し全回帰を再実行。依存仕様の変更なし。
- browser実績投入の初回CLIは設定未指定、次はpersist先未指定で失敗。`--config dist/server/wrangler.json --local --persist-to <checkout>/.wrangler/state`の合成データのみで成功。最終ログとSQLを収録。
- 比較未完時にmemory集計を先に呼んだStopIterationは解析失敗ではなく集計順序の失敗。全12比較完了後に正常再集計。
- 初回開発previewは依存最適化warmupでtimeout、同じ公式preview helperの再実行で成功。認証や実装の緩和なし。

今回の失敗ログと最終結果はcommand-results.json/全logsを参照。再開前の旧rawを復元済みとは記載しない。

FEATURE_BUILDの全子プロセス比較は初回/既存active/研究champion変更/古いfrontier追従を対象とした。データ不足の全IPC分岐、原queueの物理ID/常駐coalescing全体までの一致は未検証で、局所保存値一致から拡張解釈しない。
