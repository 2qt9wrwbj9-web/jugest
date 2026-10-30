# 保存版16 メモリ・I/O・実行時間（2026-10-31 JST 再測定）

固定元1f8c29fc458f34e11e546fb57944d0fc31db98a5。native local workerd Inspector段階サンプリング、old-space96MiB/semi-space4MiB。入力固定から結果保存・照合・再取得まで。used heap/allocated heap/backing/embedderは独立した観測値で加算しない。親Node RSSはSQLite oracleと検証を含みWorker RSSではない。厳密peak/Worker総量/Sitesホスト128MB適合は未証明。wallはInspector停止と同時回帰の競合を含むためCPU benchmarkではない。

## 現行予測 v15対v16

|入力|v15 used MiB|v16 used MiB|v16 backing MiB|v15/v16 wall秒|v16 D1 call/SQL|R2 get/put|R2書込byte|
|---|---:|---:|---:|---|---|---|---:|
|90×106|46.52|45.68|13.42|34.13/22.75|306/329|439/156|17036500|
|180×106|78.30|79.94|20.90|40.53/45.69|576/599|787/288|29489902|
|240×106|85.65|80.83|23.69|43.96/42.52|756/779|907/348|30389148|
|180×160|92.13|88.26|29.89|50.03/54.48|576/599|995/340|44440373|

4規模すべて全モデル・8中間値・最終hashが元と一致。v15/v16入力・出力hashも一致。安定した新規削減効果を証明しておらず、新たな候補/BH分割は採用しない。各request/stageのraw値はmemory-results.json。

## 新規active/store-readと正式PRE開始

|raw入力|元選択日数|used MiB|backing MiB|allocated MiB|embedder MiB|wall秒|D1 call/SQL|R2 get/put|書込byte|
|---|---:|---:|---:|---:|---:|---:|---|---|---:|
|90×106|90|19.93|2.52|28.26|1.35|19.80|630/1606|321/192|3151844|
|180×106|180|21.71|3.30|36.59|1.35|39.26|1170/2146|591/372|5862780|
|240×106|180|19.34|3.30|29.05|1.48|45.01|1170/2146|591/372|5862707|
|180×160|180|23.26|3.49|43.49|1.60|41.70|1170/2524|591/372|8759574|

全active/client/live/formal trial/2モデル/2予測の保存値・hashを元SQLiteと比較。独立した合成finalized2モデルfixtureからの開始負荷であり、長期trial/研究探索全体の時間ではない。240raw日から180日を選ぶのは元FEATURE_BUILD/daily callsiteの規則で、入力を都合で削除していない。現行予測の240日試験は別に維持。180×160 feature確定batch1301SQL、PRE含む最大bind42/SQL4970bytes。D1メソッド呼出と内包SQL・read/write行は別に計測し、課金やhost制限への適合値とみなさない。R2 logical転送量/保存容量もraw JSONに記録。

## 正式holdout回帰

|入力|used MiB|backing MiB|予測行|D1 call/SQL|R2書込byte|
|---|---:|---:|---:|---|---:|
|90×106|27.66|3.70|3816|705/4566|1971354|
|180×106|50.47|5.89|7632|1317/8994|3937016|
|240×106|56.38|4.24|10176|1713/11934|5247592|
|180×160|62.13|4.41|11520|1659/13224|5920784|

全run/全予測行/registry/loop/hashが元と一致。このholdout4規模は復元後overlay照合前の補助run（正式holdoutモジュールは保存版15から不変）。最終正しいコードで全回帰/全holdout比較/実OOM復旧を別途実施。

## 停止条件と残障害

元共通scope・候補順・全BH補正集合・演算順・統合peakの同一性を証明できる仮説のみ検討。無効な参照解放を繰り返さずPRE/認証移植を優先した。R-PRE-LARGEの1.5MB超CAS/active payloadは安全拒否でR2公開adapter未実装。総128MB/CPU/同時isolate/料金/host Queue/定期受付は未確認、公開による試験は行っていない。
