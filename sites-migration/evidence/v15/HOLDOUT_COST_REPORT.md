# 正式holdout 実行時間・I/O・容量（local）

全工程にsetup入力固定、モデル2回、small result作成、照合/確定、stream再取得を含む。Observer停止と他の試験の同時実行がwall時間に含まれる。CPU/料金ではない。

|規模|holdout行|全工程wall秒 前/後|D1 binding calls後|D1 SQL後|R2 GET/PUT後|R2 read/write bytes後|
|---|---:|---|---:|---:|---|---|
|90×106|3816|8.265/8.966|703|4564|257/99|9496855/1971354|
|180×106|7632|17.715/17.662|1315|8992|459/191|18947861/3937016|
|240×106|10176|26.811/23.879|1711|11932|601/253|25250013/5247592|
|180×160|11520|31.471/35.568|1657|13222|481/193|28538957/5920784|

## 追加budget runのWorker実行単位

|実行順/phase|wall ms|D1 binding calls差分|R2 GET/PUT差分|
|---|---:|---:|---|
|0 setup |5784|549|0/181|
|1 advance queued|7933|186|196/5|
|2 advance queued|8416|186|196/5|
|3 advance queued|571|250|23/2|
|4 advance succeeded|929|485|64/0|
|5 read |7|1|2/0|

maxSQL2013byte/bind34/batch101文。D1公式ではbatchはper invocation query上限で1queryと数えるため文数とmethod呼出を分離。本local観測には1実行549呼出/最終検証485呼出がある。一般D1 Free50なら適合しないがPaid1000内である。Sitesに適用される実割当は未確認なので、Free/Paidどちらとも断定せずhostでbinding/CPU/transactionを測る。大量過去registryモデル数では総処理回数/容量が増えるため2modelの結果を無制限規模へ一般化しない。

全private予測行に加え正式行を保持し安全性を優先。GC削除は無効。DB rows countersはfirst()由来metadata計数が不完全であり、厳密課金推定には使えない。R2 logical bytesはcheckpoint/chunk読取りを含む。全statement/phase rawはbudget-holdout-load-180-160.json、サンプルheapは各load JSON。実host総量/厳密peak/料金/並列requestは未測定。
