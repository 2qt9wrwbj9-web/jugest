# ローカル実画面検証

terminal.local:4173のsites-preview（公開URL発行なし）。独立dev-sessionと合成第一店舗50日×12台。migration0013/0014適用後、元店舗画面の解析パネルで研究継続を選択。

FEATURE_BUILD #32 → BACKTEST #33 → MODEL_SEARCH #34(promoted) → BACKTEST #35 → search #36(continue) → search #37(repeat/収束holdout未確定)。状態・履歴・検証用スコア・入力/出力hashを表示。#34を履歴から選び個別昇格結果を再取得でき、後続へ自動転送しない。#37は正式holdout未確定、active-model変更なしを明示。既存保存済み店舗分析50日/600台日/406根拠を維持。

営業日02/19→02/18を切替、12台データとG/BB/RB/期待設定を表示（browser-day.txt）。通常店舗分析#38保存、同snapshot hash e1f175f2ece3/出力fc43a0da21bc。現行予測#39受付後にタブを閉じて再取得を別途記録。

ブラウザーの観測DOM原本はlogs/browser-*.txt。スクリーンショットはチャットで表示し、認証/本番データを含まない。native Queueのブラウザー非依存性はnative-cycle.logで別途検証。実Sitesホスト/ホストQueueは未確認。401/403等は回帰試験が担当し、この画面確認を全端末/全ブラウザー検証とは扱わない。

受付#39の解析待機を観測してタブを閉じ、別タブで#39保存完了と全12台順位を取得した。入力4c116a5b16dc/出力46df403b617a。閉じた瞬間の実行phaseは未観測であり、サーバー完了時刻の因果証明とは区別。実Queue browserless chainは別試験で担保。
