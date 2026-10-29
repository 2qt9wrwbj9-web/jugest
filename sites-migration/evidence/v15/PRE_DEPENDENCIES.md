# 正式holdoutからPRE/active modelへの依存関係（固定本番SHA）

- `research/holdout.mjs: finalizeSealedHoldout()` はactiveを読むが更新しない。封印評価後のresearch registry/loop/winnerだけを更新。移植も同じ。研究championとactiveを統合しない。
- `jobs/feature-build.mjs` は特徴量更新の成功後、最新frontierに対して `ensureResearchCycle()` を実行する。既存activeがあれば `refreshActiveStoreReadSnapshot()`、なければ初期研究championを `activateStoreModel()` に渡す。現Sitesは特徴量計算・保存・研究chainを実装したが、このactive初期化/store-read/live predictionの副作用は未移植。FEAT-01は部分実装へ明確化した。
- `research/store-read-output.mjs: activateStoreModel()` はactive_store_models更新と `persistStoreReadSnapshot` / `persistLivePrediction` を伴う。holdout勝者を無条件にここへ渡す元の経路は、今回確認したcall graphにはない。新しい自動採用を発明しない。
- `pre-v2/formal-auto-start.mjs` の finalizedCandidateはloop version/収束/finalized/winnerを要求。既存activeと同じversionで、候補が異なり、同一lineage pairが未試験である条件を確認して `startFormalLiveTrial()`。
- PRE v2のformal model/prediction/trial/outcome、ndcg/sequential評価、champion/challenger/採否・履歴・正式API/画面は未移植。現行予測は正式PREではない。

次の安全な単位：元store-read-outputのsnapshot/live predictionの純粋生成とSQLite保存値を合成データで比較→D1の同等公開transactionを設計→FEATURE_BUILD最新frontierの条件付きactive初期化/refresh→formal trialの固定モデル・予測時点・outcome分離を移植。登録・採用権限と世代CASを維持し、正式holdoutの失敗からactiveを変更しない。
