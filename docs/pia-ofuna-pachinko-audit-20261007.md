# PIA大船 4円P 実raw独立監査・統計検証

追加API取得・production変更なし。指定の保存rawと10月6日保存CSV内の一次rawフィールドだけを使用。①付き1円機種は除外。

## 結論

候補式は normal_net=(out-special_out)-(safe-special_safe)、K=25*start/normal_net（回/250玉）。境界値へ合わせた係数調整は行っていない。大海は運用上の内部検証済み verified、現行399と999は provisional を推奨する。これは独立の実測回転率や公式の項目仕様を検証した意味ではない。

| 機種 | exact code | 履歴/台 | start/special | pooled K | 特殊状態ゼロ 正稼働n | 推奨 |
|---|---|---:|---:|---:|---:|---|
| Ｐ大海物語５スペシャルＡＬＴＡ | 00021 | 1440/48 | 315.5192 | 20.4773 | 168 | verified |
| ｅ東京喰種Ｗ | 00022 | 24/12 | 208.4211 | 15.6881 | 0 | provisional |
| ｅ東京喰種ＭＷ | 00406 | 1440/48 | 348.5269 | 32.3986 | 10 | provisional |

式の算術検証と物理的意味の検証を分離する。回転率の分母は10玉単位からの換算であり、差玉は全機種で difference=10*(safe-out)。start>0、normal_net>0、partitionの整合性を計算条件とし、ゼロ稼働・分母非正はnull。

## 一次入力とハッシュ

| snapshot | API応答時刻 | raw件数 | SHA-256 |
|---|---|---:|---|
| latest | {'date': '2026-10-07', 'time': '23:43:44'} | 6188 | f3e463dde895a4999f7b532fc1d1a5a3ceb85293aca0b07966342ce2fce30149 |
| old | {'date': '2026-10-05', 'time': '02:06:09'} | 8755 | 2293ab3a0fb436c18a5875ce5941cd93adc54f5843405ac8332686d40c8c9086 |
| same_day_earlier | {'date': '2026-10-07', 'time': '22:51:52'} | 6188 | 4cde179e4a5a54981f5d8d669cb75c21b126dc7982664bf85d2b040c657d83ab |
| oct6_ooumi | {'date': '2026-10-06', 'time': '20:44:24'} | 1440 | f16f124e445e7afd75cf1d2581b2ac2737f61b5ed8f4a8e09de8bcc54757b96d |

Oct6の入力は既存CSVの16個のAPI行項目を抽出したもの。元CSV SHA-256は c8e7f30dd2c4324249ce775fe5434dd9791e7acae5b037a6a9e8ef707cea9a6f。CSVはbusiness_dateが全行空白。元API SHA-256 94585de2e4b60cb4a14f9c24357a495404f5aa520343fcf35882eb3634300af2 は保存報告書の記載であり、そのAPIファイル本体を再取得・再ハッシュしたものではない。

## 恒等式・特殊状態・final_start

| 機種 | 差玉恒等式 | special_1=special+special_2d | final_start>start | hit0 | hit0だが特殊状態あり | special_out>out / special_safe>safe |
|---|---:|---:|---:|---:|---:|---:|
| ooumi | 1440/1440 | 1440/1440 | 66 | 227 | 4 | 0/0 |
| ghoul399 | 24/24 | 24/24 | 0 | 0 | 0 | 0/0 |
| ghoul999 | 1440/1440 | 1440/1440 | 1 | 10 | 0 | 0/0 |

specialは初当りの図柄だけでなくチャージを含むイベント数と整合的。通常確率の比較対象は大海319.6、399は図柄399.9とチャージ399.9の合算199.95、999は図柄999.9とチャージ538.3の合算349.9195。specialを999.9や399.9だけの初当り数として扱うと誤る。

final_startは大海66行、999 1行でstartを上回る。よって正常時のstart総数をfinal_startで置換できない。大海hit0の4行にもspecial_2/special_out/special_safeがあるため、hit0と「特殊状態なし」は同義ではない。

最新保存rawの大海でspecial=0かつfinal_start>startの4行は、台番1120/1134/1140/1142、差分350/351/351/351回。いずれもspecial_2=1、special_out/special_safe>0。遊タイム350回との整合が、startと表示上のfinal_startを区別する追加証拠になる。1回のずれのカウンタ配線上の理由は未確定であり、固定350回を全履歴から引く式にはしない。

| 機種 | final_start-start p05 / p50 / p95 / max | special_out/out | special_safe/safe | special_safe×10/special_1 総量比 | 特殊状態のnet×10/special_1 |
|---|---|---:|---:|---:|---:|
| ooumi | -2163.75 / -754.50 / 0.00 / 434 | 0.2739 | 0.8478 | 1957.49 | 1359.48 |
| ghoul399 | -1647.15 / -1202.00 / -381.00 / -29 | 0.0913 | 0.8960 | 1870.64 | 1658.76 |
| ghoul999 | -5733.85 / -2802.00 / -693.60 / 3 | 0.0708 | 0.8665 | 1299.63 | 1198.32 |

special_safeの総量/回数は状態中出玉と回数定義の混合比で、固定の大当り出玉単価とは断定できない。399・999とも継続系カウンタ0の行で300玉相当から大きな払出しまで混在する。special_2をLT/RUSH突入回数、special_2dをそのまま初当り除外のイベント型とする公式根拠は未確認。単一平均出玉を加算・控除するモデルはunusable。

## 回帰の定義と主結果

目的変数はnormal_net（10玉単位）、説明変数はstart。切片あり・原点通過・台内demeanを比較。K=25/slope。SEは通常OLS、HC1、台store_machine_idでclusterした値をJSONに保存。以下はOLS SEとcentered R²。cluster CIは漸近正規近似であり小標本や項目意味の不確実性を含まない。台内demeanは台差を吸収するが日付固定効果ではない。

| 機種/群 | n | 切片 | slope | slope SE | R² | 切片あり K | 原点 K | 台内 K |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ooumi/all | 1385 | 19.8552 | 1.2031 | 0.0021 | 0.995608 | 20.7804 | 20.5707 | 20.7582 |
| ooumi/hit0 | 172 | 7.5173 | 1.2286 | 0.0076 | 0.993492 | 20.3476 | 19.9795 | 20.7523 |
| ooumi/strict_no_state | 168 | 8.0891 | 1.2226 | 0.0131 | 0.981272 | 20.4479 | 19.7298 | 20.6781 |
| ooumi/hit_positive | 1213 | 25.3883 | 1.1997 | 0.0026 | 0.994150 | 20.8384 | 20.5723 | 20.7909 |
| ghoul399/all | 24 | 124.7847 | 1.4990 | 0.0381 | 0.985959 | 16.6775 | 15.7813 | 16.9583 |
| ghoul399/hit0 | 0 | null | null | null | null | null | null | null |
| ghoul399/strict_no_state | 0 | null | null | null | null | null | null | null |
| ghoul399/hit_positive | 24 | 124.7847 | 1.4990 | 0.0381 | 0.985959 | 16.6775 | 15.7813 | 16.9583 |
| ghoul999/all | 1440 | 43.0803 | 0.7584 | 0.0012 | 0.996291 | 32.9635 | 32.5015 | 32.8678 |
| ghoul999/hit0 | 10 | 5.5928 | 0.7773 | 0.0108 | 0.998469 | 32.1616 | 31.9412 | 32.7602 |
| ghoul999/strict_no_state | 10 | 5.5928 | 0.7773 | 0.0108 | 0.998469 | 32.1616 | 31.9412 | 32.7602 |
| ghoul999/hit_positive | 1430 | 43.9903 | 0.7582 | 0.0012 | 0.996213 | 32.9732 | 32.5017 | 32.8775 |

999の特殊状態ゼロは10行・7台だが、複数の稼働行があるのは2022番台だけ。台内K=32.7602は実質1台の比較でありcluster SEは定義不能（null）。このFEを独立の強い検証としない。

大海の特殊状態ゼロ168行は合計16396start、pooled K19.1497。切片ありの80.9玉相当（8.089×10）を含めるとK20.4479、台内20.6781へ寄る。全行pooled20.4773、切片あり20.7804と同じ範囲を支持する。ただし短遊技・無当り選択の影響があり、真のKを完全同定したわけではない。

大海のstart/special/special_2d/special_2の探索的回帰では、台内K20.4790で未補正pooled20.4773と一致。999は32.8269。これは診断であり、当りカウンタの係数を運用式へ採用することは推奨しない。

## start閾値と選択バイアス

各セルはn / pooled K / 切片ありK。原点・FE・SEもJSONに保存。

| 機種/群 | >=50 | >=100 | >=200 | >=500 | >=1000 | >=1500 |
|---|---|---|---|---|---|---|
| ooumi/all | 1325 / 20.482 / 20.802 | 1266 / 20.485 / 20.829 | 1190 / 20.494 / 20.862 | 1028 / 20.506 / 20.970 | 729 / 20.553 / 21.174 | 427 / 20.637 / 21.391 |
| ooumi/strict_no_state | 113 / 19.458 / 20.516 | 62 / 19.588 / 20.917 | 18 / 20.053 / 20.847 | 1 / 21.777 / null | 0 / null / null | 0 / null / null |
| ghoul399/all | 24 / 15.688 / 16.677 | 24 / 15.688 / 16.677 | 24 / 15.688 / 16.677 | 23 / 15.706 / 16.858 | 19 / 15.728 / 17.988 | 9 / 15.970 / 19.180 |
| ghoul399/strict_no_state | 0 / null / null | 0 / null / null | 0 / null / null | 0 / null / null | 0 / null / null | 0 / null / null |
| ghoul999/all | 1439 / 32.399 / 32.965 | 1437 / 32.399 / 32.968 | 1434 / 32.399 / 32.973 | 1425 / 32.399 / 32.983 | 1363 / 32.403 / 33.049 | 1244 / 32.410 / 33.190 |
| ghoul999/strict_no_state | 9 / 31.802 / 32.187 | 8 / 31.809 / 32.246 | 5 / 31.928 / 32.942 | 5 / 31.928 / 32.942 | 3 / 31.993 / 34.672 | 0 / null / null |

長遊技ほどpooled Kが少し上がり、切片ありの傾きはさらに変化する。良い回転の遊技が長く続く等の選択、台差、日差を排除できないため、単一回帰の高R²だけで無誤差としない。大海no-stateは>=200で18行、>=500は1行しかなく、長時間無当りcontrolを欠く。399現行は0行。999>=1000は3行、>=1500は0行。

## 旧399コホートを分離

旧399は2049–2072番の24台×30=720行。現行1025–1036番は新ID494020–494031の12台×2=24行。共有store_machine_idは0。旧pooled K17.4015、特殊状態ゼロ28行はpooled17.0104/切片17.0344/台内17.1432。旧の観測は方式の補助証拠だが、現行15.6881を17台や既知ボーダーへ補正する根拠にはならない。

## fingerprint多重集合差分

全16raw項目をキー順固定JSONにして比較。同値のゼロ行も重複数を保持する。行順・差玉ランキング順から日付を推定しない。

| 比較/対象 | old | new | 共通 | 追加 | 消失 | 共有ID |
|---|---:|---:|---:|---:|---:|---:|
| old_to_latest/all_models | 8755 | 6188 | 5516 | 672 | 3239 | 216 |
| old_to_latest/ooumi | 1440 | 1440 | 1344 | 96 | 96 | 48 |
| old_to_latest/ghoul399 | 720 | 24 | 0 | 24 | 720 | 0 |
| old_to_latest/ghoul999 | 1440 | 1440 | 1344 | 96 | 96 | 48 |
| same_day_earlier_to_latest/all_models | 6188 | 6188 | 6188 | 0 | 0 | 336 |
| old_to_oct6_ooumi/ooumi | 1440 | 1440 | 1392 | 48 | 48 | 48 |
| oct6_ooumi_to_latest/ooumi | 1440 | 1440 | 1392 | 48 | 48 | 48 |

当日22:51:52と23:43:44は全6188行multisetが同一。大海/999のOct5→Oct7は各+96/-96。999にはOct6一次rawが本監査範囲にないため、96行をOct5/6へ分割できず日別値はnull。399はコホート交換で日別復元対象にしない。

## 大海10月5日・6日の派生日別候補

ユーザー指定の復元規則に従い、snapshotのカレンダー日が連続し、48台のIDが不変、全台各+1/-1のとき追加値を前日候補へ付ける。date_status=derived、date_assignment_method=consecutive_snapshot_multiset_previous_day。公式business_dateのverifiedではない。

| 派生日候補 | raw行 | start総数 | normal_net総数(10玉) | pooled K | K=null台 |
|---|---:|---:|---:|---:|---|
| 2026-10-05 | 48 | 53625 | 65042 | 20.61168168 | なし |
| 2026-10-06 | 48 | 48951 | 60300 | 20.29477612 | 1101,1116 |

Oct5→Oct6、Oct6→Oct7の両方で全48台が明確に各+1/-1。差分ゼロで追加値不明の台は今回なし。Oct6候補の1101・1116は追加値が全カウンタ0なのでKはnull（0にしない）。multisetは追加ゼロの重複数を識別できるが、同値の履歴occurrence自体の時系列IDはない。

APIに営業日項目がなく、公式更新規則も未確認。Oct5 02:06→Oct6 20:44は約42.6時間、Oct6 20:44→Oct7 23:43は約27時間で、24時間等間隔ではない。現在営業日の混入や訂正をsnapshot差分だけで完全除外できない。この条件付き派生であることを表示・保存する。

## 運用判定

- **ooumi: verified** — 1440/1440 algebraic identities; start/special=315.52 consistent with 319.6; strict no-state intercept K20.45 and within K20.68 converge with all-row K20.48/20.78. Short no-state pooled K19.15 is strongly affected by an approximately 80.9-ball intercept and selected short exposures. Counter-adjusted within slope K20.479 agrees with raw pooled20.477, without tuning parameters.
- **ghoul399: provisional** — New IDs/positions have24 records and zero no-hit controls. Current pooled15.688 vs all-intercept16.677 and within16.958. Historical28 no-state controls support the same formula mechanism (K17.01/17.03), but old720/new24 share no machine IDs; that calibration cannot be silently transferred.
- **ghoul999: provisional** — All1440 identities hold; start/special348.527 matches combined349.919 expectation. Pooled32.399 remains32.410 atstart>=1500. No-state10 records yield pooled31.779/intercept32.162, supporting rates in30s without forced border calibration.

すべて独立実測との照合はunverified。算術的に求まる値を保存しても、回帰補正・固定大当り出玉・推定LT回数・既知ボーダーへの強制は使わない。特殊状態の公式フィールド仕様が得られたらsemanticsの検証を別段階で更新する。

## 成果物

- raw-statistical-audit.py: 純Pythonの再現スクリプト（numpy/scipyなし）。
- raw-statistical-audit.json: 全分布、threshold別OLS/HC1/cluster/FE、raw差分、日付派生候補、推奨。
- raw-statistical-summary.json: 主指標と推奨の小さいJSON。
- raw-statistical-derived-ooumi-dates.json: Oct5/6候補のraw・fingerprint・K・date_status。


## 今回の実装へ反映した判断

大海は実データで運用上の式を検証済み（verified）。喰種399と999は追加検証が必要（provisional）で、運用DBのestimated_kはnullとする。監査中の候補値15.6881/32.3986は研究上の算術値であり、UIの確定値には使わない。差玉を回転率の式へ足さず、既知ボーダーへの合わせ込みも行わない。独立実測との照合は3機種すべて未完了。

交換条件は依頼により4円・1,000円250玉貸し・等価。換金ギャップ補正、ボーダー、期待値は今回の実装に含めない。対象機種の定義は上記3機種だけ。1円やその他の機種はnormalized domainへ入れず、取得した店舗全体の公開raw bytesはsnapshotに残す。

## 正確な設置情報

| 機種 | 10/7の台番 | 10/7の設置ID | 10/5の旧配置 |
|---|---|---|---|
| 大海5SP / ALTA / 00021 | 1097–1144（48台） | 476103–476150 | 同一配置 |
| 喰種399 / W / 00022 | 1025–1036（12台） | 494020–494031 | 2049–2072、478418–478441（24台） |
| 喰種999 / MW / 00406 | 2001–2048（48台） | 2001–2024:476151–476174、2025–2036:476613–476624、2037–2048:478406–478417 | 同一配置 |

台番の範囲は監査時点の情報であり、コードで対象を選ぶ条件にはしない。店舗ID・機種コード・正確な名称でモデルを識別し、設置IDと台番で実体を分ける。

## 機種仕様と一次資料

| 機種 | 通常抽選と右打ち | 払い出しと賞球 | 一次資料 |
|---|---|---|---|
| P大海物語5スペシャル ALTA | 通常319.6、確変31.9。950低確率回転後の遊タイム350回、時短100/200 | 全1500払い出し。確変54% | [三洋公式製品](https://www.sanyobussan.co.jp/products/pk_bigsea5_special/)、[公式ガイドPDF](https://www.sanyobussan.co.jp/products/pk_bigsea5_special/p_bigsea5_special_guidebook.pdf) |
| e東京喰種W | 図柄399.9＋チャージ399.9、合算199.9。右95.3、普図時短130、約75%継続 | 初回1500、チャージ300、右3000/6000＋α。賞球1&1&5&1&15、10C | [機種公式](https://www.pachi-e-tokyoghoul.jp/)、[ビスティ型式一覧](https://www.sankyo-fever.co.jp/bisty/)、[公式発売PDF](https://www.tsuburaya-fields.co.jp/ir/j/files/press/2025/press_20250217b.pdf) |
| e東京喰種MW（超デカ 超一撃ver.） | 図柄999.9＋チャージ538.3、合算349.9。右7.7、普図時短5、約50%継続 | 初回3000/7500、チャージ300、右3000＋上乗せ。賞球1&1&3&1&15、10C | [機種公式](https://www.pachi-e-tokyoghoul.jp/chodeka.html)、[ビスティ型式一覧](https://www.sankyo-fever.co.jp/bisty/)、[周辺機器メーカー配線PDF](https://www.nikkei-mfg.co.jp/support/p-connection/images/ZSP-DD4-D.pdf) |

MW公式ページの画像altには旧399の130回等が残るため、999のゲームフローと振分は実画像で照合した。RUSHの見た目の当選と1500個単位の内部当りを同一視しない。残保留の詳細やPIA信号の配線は未確定であり、通常startから固定130/5回を差し引く処理はしない。普図の内部構造の一部は解析補助資料による確認で、メーカー内部仕様書による確定ではない。

## 候補Kの分布

以下は日付未確定の全履歴に候補式を適用した検証値。喰種の本番用estimated_kとは区別する。

| 機種 | 有効算術行 | 5%点 | 中央値 | 95%点 | 最小 / 最大 |
|---|---:|---:|---:|---:|---|
| 大海 | 1385 | 17.5790 | 20.3348 | 22.0114 | 7.6923 / 32.1429 |
| 399現行 | 24 | 14.3953 | 15.5851 | 16.6157 | 13.4085 / 16.8858 |
| 999 | 1440 | 30.9171 | 32.2741 | 33.8261 | 22.9167 / 35.7270 |

短い遊技では観測誤差や切片の影響が大きい。大海の観測量の段階A/B/C/Dは通常startが2,000/1,000/500回以上/未満という区分であり、95%区間や「正しさの確率」を表すものではない。モデルの推定方法の検証状態とは別に表示する。

## 再現可能な入力と再計算

全3snapshotと同日比較用の公開API bytesは `vps/tests/fixtures/pachinko/` にgzipで保存し、ハッシュ・出典を `provenance.json` に記録した。10/6だけは大海に限定したraw CSV抽出であり、他機種の撤去判定や営業日導出のanchor更新には使わない。過去データのobserved_atが不明ならnull、取込時刻はimported_atとして分ける。

詳細統計の圧縮JSONは `docs/pia-ofuna-pachinko-statistics-20261007.json.gz`。`vps/scripts/pachinko-audit.py --output /tmp/pia-pachinko-audit-reproduced` により、保存済みrawだけから回帰・閾値・分布・差分を再計算できる。ネットワーク通信も本番DB接続も行わない。

圧縮JSONを展開した監査v2本体は2,650,393 bytes、SHA-256は `0506b0b2917b249a404bc86365c444e719a613925fb67b861ffdb52bf13d90a1`。再現スクリプトのmodels/comparisons/date_backfill/recommendations/formulasは保存監査と完全一致することを確認した。生成時刻とファイル場所のmetadataは再実行環境に応じて変わる。

日別値は大海の48台×2日（96件）だけ。10/6は全ゼロの2台を除き有効K46台、10/5は48台。旧30履歴pooled20.4846958873と最新20.4772727152の差は履歴窓の入替による。運用の有効行に限定した最新合算値20.4772835773との差は、start=0でnormal_net=1の1行を除いたことによる微差で、数値を合わせる補正はしない。
