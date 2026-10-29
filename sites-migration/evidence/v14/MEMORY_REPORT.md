# 保存版14 全工程メモリ検証

native workerd Inspector debugger stage sampling; old-space96MiB/semi4; not strict peak or total128MB enforcement. Node RSS not Worker isolate memory. Independent maxima not additive. Wall time includes debugger pauses and concurrent test workload, not CPU benchmark.

受付→D1固定→日別R2保存→load/prefix→解析→canonical仮保存→照合/確定→stream再取得を含む。controlはGit保存版13のlib。v14は研究用option行の記録等のinfra差も含むので、差すべてをsingle参照解放の因果効果としない。

| 規模 | v13使用heap観測最大MiB | v14 MiB | v13/v14 wall秒 | v14 D1 SQL | R2 get/put | R2 written bytes |
|---|---:|---:|---|---:|---|---:|
| 90×106 | 44.31 | 48.72 | 8.53/9.00 | 329 | 439/156 | 17036500 |
| 180×106 | 77.74 | 84.14 | 15.00/14.19 | 599 | 787/288 | 29489902 |
| 240×106 | 80.47 | 83.00 | 17.53/16.51 | 779 | 907/348 | 30389148 |
| 180×160 | 88.21 | 90.92 | 23.41/23.90 | 599 | 995/340 | 44440373 |

180×160は同条件で追加2回ずつ計測。

| run | mode | used MiB | backing MiB |
|---|---|---:|---:|
| repeat-2-180-160-optimized.log | optimized | 89.51 | 42.01 |
| repeat-2-180-160-v13.log | v13 | 90.41 | 41.41 |
| repeat-3-180-160-optimized.log | optimized | 89.01 | 41.69 |
| repeat-3-180-160-v13.log | v13 | 89.57 | 41.54 |

結論：v13比の全工程ピーク低下は証明できなかった。最終runの各規模観測値は上表、同条件の追加runは次表を正本とする。GC/観測時点のばらつきを含み、参照寿命の短縮を128MB対応やピーク解消と呼ばない。

実装は、全候補評価後に使わなくなったg.machineGroupsとstoreGroups索引だけを解放。BHの全対象配列store/machine、p値/補正対象/順序/同点/最終sortは完全に維持。新しい候補分割・checkpoint・再計算は採用していない。全モデル/8中間値/最終payload hashは4/4一致。実装前後でR2 bytes/get/put/結果サイズは同一。v14の通常job option記録にD1 SQLが3文、API2呼出し、読取り2行/書込み1行増える。これは研究cycle option固定のためで、新memory checkpointの増加ではない。

single部分の母集団やBHを台分割で別集合にできない。実測上、単純な評価後解放だけではgroup構築時やv4 trainingの観測量を下げられない。追加の候補checkpointは効果/統合peakを証明するまで導入しない。次の検証は、共通scope/元候補順固定→各候補の評価→同じ全BH対象への補正→最終化の契約をpure kernelとして比較すること。1版をこの課題だけで費やさず、正式holdout/認証等へ進む停止条件を満たした。

usedSize/totalSize/backingStorageSize/embedderHeapUsedSizeをraw JSONへ別記。各requestのstage samplesも保存。ArrayBuffer全量、platform allocator、実Sites総量/CPU/同時request/課金は未測定。独立最大を足して総量にしない。旧13の89.52MiBは別runであり今回controlの88.27等と区別する。入力規模・履歴・数式・モデル探索範囲は削らない。正式PRE/holdoutの完全一致をこの現行予測試験から推測しない。
