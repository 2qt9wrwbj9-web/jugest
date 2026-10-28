# 現行予測の依存・保持寿命

元基準：index.html@1f8c29fc458f34e11e546fb57944d0fc31db98a5。compiled-workerは静的抽出し、数式変更なし。関数別の位置はsource-inventory.json。

| 関数/段階 | 入力・依存 | 分割と保持の制約 |
|---|---|---|
| v5PrepareHistory | 全期間、営業日・台・機種・時系列 | 元順序を維持。日別入力を読み込んでも後段の共通historyが必要 |
| v5Backtest | 過去時点の全体情報・モデル比較 | checkpointで別呼出しに分離済。未来データの混入不可 |
| brutePrepare | 台の全履歴+店舗共通要約 | 台別特徴量だけは元全体入力・row indexを共有して分割済。共通統計を分割店舗で再計算不可 |
| v4ModelTraining | 全台・全日training、モデル候補・評価 | fitはclosureを含む。返却直後は全8監査値の一つ。後続で使用しないvalidationFit/discovery/confirm/val/ensemblePointsを監査後に解放可能 |
| v4SettingDistributionModel | 店舗全体の設定配分・機種・全体fit | 単純な台batchの平均で置換不可。今回は分割せず数学を維持 |
| v4CalendarLongMemory | 日付・曜日・末尾・機種等の共通履歴 | 長期特徴量と有効標本・時系列を維持。今回は元計算 |
| bruteSingleGenerate / bruteSingleScopes | 全histRowsから多様なgroup候補→scope評価→BH補正→store/machine結合→sort | グループ母集団、p値補正、同点順序が全体依存。台別特徴量batchの再結合後に元全体のまま実行するため、台数分割だけではこの段階のピークは下がらない |
| v4PredictStore | training fit・score/ranked/champion、全体配分/calendar/single/全台ランキング | 実際の使用プロパティを元呼出し内で照合。v13は不要参照の寿命だけを短縮。候補・探索・評価・float演算・同点sortは変更なし |
| canonical-stream / jobs | 全出力→chunk/仮保存→別呼出しで照合・確定→stream再取得 | 元canonical bytes/hash維持。現行payload自体が巨大な点とR2/D1/転送external領域は残る |

v13の観測点 single:groups-built / single:evaluated / single:finalized / v4:training-released は値を受け取らない計測フック。元8段階の値は解放前にhash化。元v4ModelTrainingのexport戻り値の意味は変更せず、呼出し側で使い終えた参照のみ削除。

180×160の予備比較（old-space96MiB/semi4、全工程・実workerd）：save12 used max108.38MiB→v13 89.87MiB。single直前の保持が原因の一部と判断できるが、これはsampling+debugger地点最大で厳密peakではない。ヒープ以外やhost全体の適合は示さない。最終4規模値はmemory-results.jsonを優先。

新たなv4学習checkpointは未実装：closure状態の無損失永続化・再構築と浮動小数点順序を証明せず採用しない。次はsingleのgroup候補単位/補正段階分離を、母集団と元挿入順を固定して検証する。全結果を最後に展開する方式は統合ピークも測定する。今回、台数分割を全モデルの安全分割と呼んでいない。
