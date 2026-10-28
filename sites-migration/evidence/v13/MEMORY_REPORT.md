# 全工程メモリ比較 / 保存版13

native workerd/Miniflare Inspector Runtime.getHeapUsage at debugger stages. old-space96MiB, semi-space4MiB. This is not total128MB enforcement; not a strict peak. Node process RSS is not Worker memory. Individual maxima are not additive. External/ArrayBuffer full accounting and host totals not measured. Timings are wall time including inspector pauses and concurrent regression/build workload, not isolated CPU benchmarks.

受付→D1固定→日別R2転送→逐次load→prefix/checkpoint→v4/全体計算→逐次canonical保存→別request照合/確定→stream再取得を含む。同じD/M/対象日(offset1)でsave12のlibをGitからそのままロードするcontrol（計測フックのみ追加）とv13を比較。数学は別途、固定本番HTMLから抽出した元全モデル/8段階と比較。

| 入力 | save12 used MiB | v13 used MiB | 観測削減 | control/v13 wall秒 | D1 statements | R2 get/put | R2 write bytes |
|---|---:|---:|---:|---|---:|---|---:|
| 90日×106台 | 50.68 | 44.80 | 11.6% | 16.33/19.31 | 326 | 439/156 | 17036500 |
| 180日×106台 | 84.36 | 74.38 | 11.8% | 35.06/49.56 | 596 | 787/288 | 29489902 |
| 240日×106台 | 86.21 | 79.92 | 7.3% | 35.58/39.39 | 776 | 907/348 | 30389148 |
| 180日×160台 | 119.55 | 89.52 | 25.1% | 54.53/58.19 | 596 | 995/340 | 44440373 |

全caseで保存payload bytes・入力/output hashがcontrolと同一、各3 advance(入力/prefix、解析/仮保存、検証/確定)。新たなR2/D1アクセス増加なし。MODEL_SEARCH自動子jobは別途native-chainで測定、このmemory表は現行予測1job。

usedSizeはV8使用heap、totalSizeは確保heap、backingStorageSizeはInspectorが返すbacking storage、embedderHeapUsedSizeは同APIのembedder領域。外部総量/全ArrayBuffer/ホストallocator/転送buffer全体の分解は取れていない。各値の独立最大を単純加算しない。実Sites同時リクエスト・総128MB上限・CPU/料金は未証明。samplingの間のpeakも未計測。

180×160 usedはsave12 119.55MiB→v13 89.52MiBだがbackingの独立最大は増える場合もある。heap改善を総量改善の証明にしない。MEMORY_DEPENDENCIES.mdの参照寿命が一因、GC時点や実行負荷の差が値の変動要因。予備値108.38→89.87と最終matrix値は別run。

8段階と全モデルhash一致4/4。元1f8固定HTMLとの比較ログはparity-final-*.log。finalランキング・モデル選択等は全モデル構造のdeep equality/hashに含まれるが全PRE・未実装昇格は対象外。BACKTEST/MODEL_SEARCHの元SQLite比較は回帰試験に含まれる。

全raw sample/phase別最大/時刻/IO/call時間はmemory-results.json及びfull-*.log。R2 bytesはAPI経由logical bytesで実請求帯域ではない。D1 rowsは返却metaの計測で公式host billingを示さない。日数/台数/精度/候補範囲は削減していない。
