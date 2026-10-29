# 保存版15 メモリ検証

native workerd Inspector debugger stage sampling; old-space96MiB/semi4; not strict peak or total128MB enforcement. Node RSS not Worker isolate memory. Independent maxima not additive. Wall time includes debugger pauses and concurrent test workload, not CPU benchmark.

入力固定→R2→計算→保存→照合→D1確定→再取得の全工程。controlは保存版14、現行予測の数学コードは変更なし。非数学的job管理変更も含む。

|規模|v14 used MiB|v15 used MiB|v14/v15 wall秒|v15 D1 SQL|R2 get/put|R2 written bytes|
|---|---:|---:|---|---:|---|---:|
|90×106|42.79|46.09|10.17/8.82|329|439/156|17036500|
|180×106|75.30|74.22|16.67/17.91|599|787/288|29489902|
|240×106|81.43|75.11|18.46/20.65|779|907/348|30389148|
|180×160|90.49|89.82|27.14/34.44|599|995/340|44440373|

全モデル/8中間値/最終hashは4/4一致。現行予測の新しいscope/候補/BH分割は採用しない。過去の89〜91MiBと今回の観測を混同しない。GC/同時試験/Inspector停止を含み、厳密peak/CPUや削減の因果効果を証明しない。各raw sampleとrequest単位最大はmemory-results.json。used/total/backing/embedderの独立最大を足して総メモリとしない。RSSは親NodeでありWorker総量ではない。

## 正式holdout：計算後checkpointの重複feature保持を削減

元evaluateModel/rankRowsを全feature・全dayで実行した後、元persistHoldoutRunが使う全列だけをimmutable checkpointへ保存する。数学・入力・順位・精度は一切変更せず、評価dataset参照をserialization前に外す。

|規模|変更前 used MiB|変更後 used MiB|変更前/後 R2書込byte|
|---|---:|---:|---|
|90×106|43.21|26.10|9493522/1971354|
|180×106|82.66|42.83|18885406/3937016|
|240×106|79.08|55.66|25040916/5247592|
|180×160|87.37|59.08|27838502/5920784|

4規模すべて元SQLiteの全予測行/全run/全registry/loop/結果hashが一致。180×160は11,520行。別run budget-holdout-load-180-160.jsonも約59.41MiBで、ばらつきをrawで保持。max bind34、SQL2013byte、batch101文（100行+part receipt）。最終確定はINSERT SELECTで大容量行をコピーし、全モデル/registry/loop/job/historyを同じbatch内で公開。R2 private checkpointとstagingは外部利用不可。

D1 binding呼出回数とSQL文数を分離する。batchはper-invocation query limitで1呼出しと数える公式仕様（https://developers.cloudflare.com/d1/platform/limits/）に従い、13,222 SQLを13,222 invocationと解釈しない。budget rawは各呼出区間を含む。料金の読取行数はfirstメソッド等の計数が不完全であり見積確定不可。実host query30秒/transaction/CPU/同時requestと総128MB・大規模歴代registryは未検証。一般Workersの128MB仕様はSitesの実測ではない。

停止条件：共通scope/元候補順/全BH補正集合/演算順と統合peakの契約を証明できる仮説に限定する。現版は正式holdout/認証を優先し効果未証明の分割は導入しない。hostと並列isolate圧力のcanaryは公開許可なしに実施しない。
