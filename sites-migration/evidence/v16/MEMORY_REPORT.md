# 保存版16 メモリ・I/O・実行時間

2026-10-30 UTC。固定元1f8c29f。local workerd + Inspector debugger stage sampling、old-space96MiB。厳密peak/Worker総量/host128MBの証明ではない。used/total/backing/embedder各最大は別指標で足し合わせない。親Node RSSはSQLite oracle/検証を含み、WorkerのRSSではない。時間はInspector pauseと同時試験を含むwallでCPU benchmarkではない。

## 現行予測：既存数学を変更しない回帰

|入力|v15 used MiB|v16 used MiB|v15/v16 wall秒|v16 D1 call/SQL|R2 get/put|R2 write bytes|
|---|---:|---:|---|---|---|---:|
|90×106|46.35|47.14|11.53/10.87|306/329|439/156|17036500|
|180×106|78.01|77.72|18.19/18.37|576/599|787/288|29489902|
|240×106|85.88|81.78|19.62/19.87|756/779|907/348|30389148|
|180×160|87.66|92.02|23.82/24.32|576/599|995/340|44440373|

4規模すべて全モデル/8中間値/最終hashが固定元と完全一致、v15/v16の入力/出力hashも一致。安定したメモリ削減を証明しておらず新分割は採用しない。180×160で増加した観測を隠さない。raw全stage/requestと外部backing観測はmemory-results.json、比較実行のexitとコマンドはcomparison-commands.json。

## 新規active/store-read + 正式PRE開始

|raw入力|元が選ぶ日数|used MiB|backing MiB|allocated heap MiB|embedder MiB|wall秒|D1 call/SQL|R2 get/put|write bytes|
|---|---:|---:|---:|---:|---:|---:|---|---|---:|
|90×106|90|18.92|2.52|28.46|1.35|7.65|630/1606|321/192|3151844|
|180×106|180|21.93|3.30|27.33|1.35|13.48|1170/2146|591/372|5862780|
|240×106|180|21.86|3.28|37.47|1.35|16.58|1170/2146|591/372|5862707|
|180×160|180|23.19|3.54|43.74|1.84|14.07|1170/2524|591/372|8759574|

各scaleでactive/client/live/formal trial/モデル2本/予測2本の元保存値全列とhashが一致。ここは独立した合成2モデルのfinalized fixtureからtrial開始する負荷でありMODEL_SEARCHや長期日次全処理を含む時間ではない。240raw daysから180valid daysを選ぶのは元FEATURE_BUILD/日次callsite自体の仕様で、都合による履歴削減ではない。現行予測240日回帰は上の別試験で維持。全raw入力は削除していない。

180×160のfeature最終確定batch1301文、maxbind19。PRE含む最大bind42、最大SQL4970bytes。D1メソッド呼出と内包SQL/読取行/書込行を分離して記録。batchのSQL文数をWorker query回数と同一視しない。totalのioは累積、各callごとの差分でinvocationコストを算出できる。R2 logical read bytesはアプリ計数、D1 local metadataのrowsは課金請求の確定値ではない。公式Sites契約のCPU/課金割当/transaction30秒/同時isolateは未確認。

## 正式holdout回帰

|規模|used MiB|backing MiB|予測行|D1 call/SQL|R2 write bytes|
|---|---:|---:|---:|---|---:|
|90×106|28.23|3.71|3816|705/4566|1971354|
|180×106|41.40|5.11|7632|1317/8994|3937016|
|240×106|55.84|4.24|10176|1713/11934|5247592|
|180×160|63.26|6.87|11520|1659/13224|5920784|

保存版15の正式holdoutを維持し、各scaleの元全run/予測行/registry/loop/hashと一致。数値のrun間差を最適化効果と扱わない。今回の主目的active/PREはlocalで達成したが、総128MBはB-MEMのまま。

## 停止条件と次の測定

bruteSingleGenerate共通scope/候補生成順/全BH補正集合/浮動小数点順序/統合peakの同一性を証明できる仮説に限る。効果のない参照解放は採用しない。今後は正式hostの非公開実行interface確認、合成canaryによる総量/CPU/並列圧力測定を優先。公開が必要なら直前許可を得るまで実施しない。新active snapshot1.5MB超と大規模歴代registryのCAS JSONはsafe refusalで止めるため、R2公開adapterの追加検証が必要。
