# 投入数学コア実装記録

作業branch: `work/store-day-allocation-20261017`。基準: `1f8c29fc458f34e11e546fb57944d0fc31db98a5`。

所有ファイルは `store-day-allocation.js`、`tests/store-day-allocation.mjs` とこの報告書のみ。既存数学・確率表・個別q・既存group・原本/API/UIは編集しない。本番操作、git checkout/commit/pushは行わない。

## RED

専用テストを実装前に作成。全設定配置の小n列挙、固定台数の組合せ平均、共有混合事前、条件付け、通常配分、帰無最大化、固定検出混合、無情報、極値、入力保護、n120を検証する。

`node tests/store-day-allocation.mjs` は実装欠如を示す `AssertionError: allocation engine is not implemented`、actual `undefined` / expected `function`、終了コード1を確認した。Node v24.19.0。

追加の19台無情報回帰では、等確率の累積境界の丸めにより、90%区間が期待 `{lo:0,hi:18}` に対し `{lo:1,hi:19}`、中央値も9に対し10となるREDを確認した。CDF境界の数値誤差1e-12以内を同率とし、下側分位点に統一した。

## 実装

- classic IIFE の `globalThis.JUGESTStoreDayAllocation.analyzeMachine({rows,familySize=9,alpha=.05,detail=null,includeSensitivity=true})` を追加。最大120台。`bonusLogs` があれば優先し、欠如時だけ `logs` を利用する。
- 全組合せ平均を対数DPで計算し、必ず二項係数で割る。4成分共有配置事前の観測質量を混合してから条件付けする。456/56/6は同じ配置事前の周辺分布。
- 9個の固定感度、90%区間、感度包絡、全台/半分以上/1/3以上、直接集計した補集合、固定3通常配分と最も説明力のある通常配分を返す。
- 検出分子は帯ごとに固定した正規化混合、分母は `K_A<t` における最有利配置。ゼロ支持では強制高設定行を別扱いし、`-Infinity + Infinity` を避ける。`familySize` は店舗全体の宣言数Mであり、閾値は `log(M)-log(alpha)`。
- 条件付き詳細は2変数係数の前向き・後ろ向きメッセージで計算。`conditionalQ` と通常の `individual` を分け、観測の影響では台を削除せず、同じn・同じ閾値のまま尤度だけ中立に戻す。
- 任意のexact詳細と主要イベント外のatLeast詳細は `eRegistered:false`、`logEValue:null`、`logThreshold:null`、`modelPass:false`。すべての `strongEnabled` は常にfalse。
- 入力尤度ごとの最大logを引いて桁落ちを抑える。`logObservedMass` / `logLikelihood` はこの共通スケールの診断値であり、BF・e値・事後分布に共通定数の影響はない。極小確率は `logDistribution`、`logPriorDistribution`、イベントのlog確率で保持する。

内部検証用 `__test` は `countLogLikelihoods(logs,highWeights6,lowWeights6)`、`maximumNullLogLikelihood(logs,band,count)`、`detectionLogLikelihood(logs,band,count)`、`logChooseRow(n)`、`countPrior(n,id)`、`logAdd(a,b)`。これらは入力logをそのまま使う純粋関数であり、公開APIから任意のpriorを注入する経路ではない。

## GREEN

初回実装完了時: `node tests/store-day-allocation.mjs`、終了コード0、**22/22成功**。Node v24.19.0。2026-10-18の診断追加後の最新結果は末尾に記録する。

実設定6^nの小規模全列挙で、主3帯、各イベント、9感度の各事前、各帯の条件付きexact境界、atLeastの各台分布、観測の影響、通常配分、固定混合検出分子と最有利帰無を照合した。さらに二項係数、無情報、58台全6事前、0G相当中立行、包含、順序・台番号・行別共通logの不変性、入力不変、bonusLogs優先、ゼロ支持、極端な有限log、未登録宣言、120台を検証。

```
ok 1 - two-row count likelihood averages both placements
ok 2 - neutral observations preserve shared prior and give unit Bayes factors
ok 3 - neutral equal-tail boundaries use lower quantiles consistently at exact CDF ties
ok 4 - all6 prior uses shared components rather than exponential independence alone
ok 5 - three inclusive bands and events match all six-setting configurations
ok 6 - detail conditions mixed masses first and keeps ordinary q unchanged
ok 7 - at-least detail returns conditional marginals and neutralized-row influence
ok 8 - normal baseline ratios use declared complete fixed distributions
ok 9 - maximum null handles forced support, negative gains and ties
ok 10 - fixed detection mixtures average normalized alternatives
ok 11 - one neutral row keeps every all-event e-value at most one
ok 12 - nine fixed sensitivities preserve their shared-prior marginals and envelope
ok 13 - each sensitivity under informative observations matches its declared full prior
ok 14 - conditional detail across every band and exact boundary matches enumeration
ok 15 - unregistered arbitrary count detail cannot reuse principal declaration threshold
ok 16 - zero support of the null produces infinite evidence without enabling strong output
ok 17 - per-row common shifts, row order and table labels do not change conclusions
ok 18 - bonus logs override combined logs and remain immutable
ok 19 - impossible exact event is held with explicit zero support and no NaN
ok 20 - strong evidence keeps complementary log masses instead of subtracting rounded one
ok 21 - malformed and unsupported inputs fail with reasons rather than throwing or coercing
n120 sensitivity+detail 3227ms
ok 22 - n=120 remains normalized and supports exact conditional detail
store-day-allocation: 22/22 passed
```

`node --check store-day-allocation.js`、`node --check tests/store-day-allocation.mjs` も終了コード0。`git status --short -- <所有3ファイル>` は意図した新規3ファイルのみ。統合前に全suiteを重複実行しないよう親担当から指定されているため、この担当では `npm test` / `npm --prefix vps test` を実行せず、親担当が統合後に実行する。

## 性能

同一の固定120台以下のlog尤度を使い、Nodeの直接ESM importで4回計測。すべて9感度を含む。詳細は56帯のexact `floor(n*.47)`。数値はこの作業環境の計測であり、規定2vCPU・2GB環境での受入済みという主張ではない。

| n | 詳細 | 4回のms | 観測RSS差 MiB |
|---:|---|---|---:|
| 58 | なし | 40.60 / 23.35 / 21.34 / 20.02 | 11.54 |
| 58 | 条件付き各台 | 64.15 / 42.36 / 40.15 / 40.37 | 8.29 |
| 60 | なし | 24.33 / 21.61 / 22.90 / 24.78 | 0.56 |
| 60 | 条件付き各台 | 49.64 / 46.62 / 49.49 / 42.51 | 1.65 |
| 120 | なし | 134.98 / 142.32 / 164.18 / 133.14 | 9.88 |
| 120 | 条件付き各台 | 295.84 / 295.94 / 300.74 / 333.19 | 19.89 |

RSS差はGC等を含む各4回ブロック前後の差で、ピークメモリではない。テスト用VMコンテキストではn120・9感度・条件付き詳細が約2.9〜3.3秒となる。実運用runtimeの呼出し方を含む性能判定は親担当の統合ベンチへ引き継ぐ。

## 残る検証・注意点

- 独立Python・大量シミュレーション・既存数学との数値回帰は親担当。ここでは同じ言語の小n全設定列挙による数学照合までを実施した。
- `±Infinity` は厳密なゼロ支持で正当なlog診断として返る。JSONはこれをnullへ変換するため、API層ではsupportの理由・比較可能性を併せて扱う必要がある。`NaN` は返さないことを極値/ゼロ支持テストで確認した。
- 実店舗的中率・モデル外の停止/欠測・校正合格を示す結果ではなく、強判定は無効のまま。
- 原本の0G立証、完全台帳、Mの固定、権限、キャッシュは数学コアの呼出し側の責任。既存確率表や個別qを取り込んで事前を二重計上する処理はない。
- 本番環境を変更していない。git checkout/commit/push、デプロイ、DB・サービス操作は行っていない。

## 2026-10-18 感度イベント診断追加（最新結果）

親担当が最終仕様9.3の不足として、主に使う事前の間でBFが1をまたぐ場合を明示するための診断値を追加依頼した。数学・確率表・9事前・主要宣言Mは変更せず、既存 `makeEvent(..., false)` の計算を再利用した。

- `sensitivity[].bands[].events` は各帯の主要3イベント（全台、半分以上、1/3以上）を含む。
- `detail.sensitivityComparisons` は選択中のexact/atLeastイベントについて9事前の比較を含み、`id` は事前モデルID。`includeSensitivity:false` では空配列。
- 診断は `{id,kind,count,priorProbability,posteriorProbability,logBF,eRegistered,logEValue,logThreshold,modelPass,strongEnabled}` の11フィールドに限定。通常配分、設定重み、内部log質量を重複させない。
- 全診断で `eRegistered:false`、`logEValue:null`、`logThreshold:null`、`modelPass:false`、`strongEnabled:false`。既存の主bandsのイベントは `includeSensitivity:false` の結果と完全一致することを検証した。宣言Mも変わらない。

**RED:** テストを先に追加し、`node tests/store-day-allocation.mjs` で既存13テスト後、`AssertionError: sensitivity bands must expose event comparisons`（actual false / expected true、終了コード1）を確認。

**GREEN:** 同コマンドの最新結果は **27/27成功、終了コード0**。n120・9感度・条件付き詳細はテスト用VMで2976ms。`node --check store-day-allocation.js` と `node --check tests/store-day-allocation.mjs` も成功。

追加検証は、主モデルのBF・事前/事後確率との一致、全9事前の小n全配置列挙とのイベントBF一致、無情報でBF=1、n=1/2/5の主要閾値、exact/任意atLeastの詳細比較、11フィールドのコンパクト契約、追加e宣言がないこと。親担当が既に加えた最小M検査も同じ27件の実行に含む。

固定3行の相対尤度 `[1,1,1,2.5,.2,.1]` の全456イベントでは、共有4成分のlogBFが `1.19709817699163`、独立混在のlogBFが `-0.13957178612953758`。同じ観測でBFが1をまたぐ事前依存を診断から確認できることをテストした。

数学ソースは以下で最終固定し、独立Python照合・大量シミュレーションの再実行を親担当へ引き継いだ。

```
SHA256 store-day-allocation.js
d69631c56ed0334eef8685c0298a0f4ec05d78c8622e7971475c6b2bf1067ce6
```

今回も編集は数学コア、専用数学テスト、この報告書のみ。本番操作・git操作・追加サブエージェントは行っていない。
