# 保存版14 実装・停止条件

元固定1f8c29f、再開Site13 00c5edc/GitHub d2f6513。既存55機能/12gate/4正本を維持。

1. opt-in研究cycleをjobごとに固定。元採用/棄却/重複/世代/round/shouldConvergeを純粋plannerで再現し、元SQLite関数とloop/registry/次logical jobを比較。成功transaction中に検証済みdecision latch→元SQLの条件付き更新→後続job/outboxを確定。入力/実装/feature/generation/round/fp/registry集合をfence。既存未昇格単独探索を変更しない。
2. FEATURE_BUILD→BACKTEST→MODEL_SEARCH→次BT/search/収束を同じsnapshotで連携。研究championのみ変更。正式holdout解禁/評価とactive-model/PREは独立gate。安全なholdout保存まで実装できなければconverged_holdout_pendingで明示停止し、holdoutを探索に使わない。
3. bruteSingleGenerateの評価後に不要になったgroup索引/機種group参照を解放。全BH対象集合と順序を維持。4規模元8値/全結果で不一致なら不採用。1回の改善幅だけでhost128MBを断定しない。
4. 専用access DBのsession/失効/one-use challengeをD1へ移植し合成SQLite比較。公開routeや既存DEV権限へ接続せず、canonical DB共用を拒否。秘密を表示しない。
5. 回帰/実画面/4原本更新、GitHub安全prefixのみcommit、Sites save-only、全source/history/log ZIPと復元、v13/v14の永続保存・共有状態を個別確認。

停止条件：数学/採用基準/権限境界変更が必要なら実装採用せず相談。host検証に公開が必要なら未確認で停止し、独立local移植を続ける。外部恒久基盤は追加しない。
