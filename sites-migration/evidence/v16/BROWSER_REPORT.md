# 保存版16 実画面検証（2026-10-31 JST）

公式managed previewのhttp://terminal.local:4173/をCUAで操作。独立DEV sessionを使い、本番token/credentialは未使用。公開なし。50日×12台の合成データ。

1. 元店舗画面から第一店舗を選択、営業日2/19→2/18、台データ/欠損/ヒートマップ表示。
2. 店舗解析の保存完了、現行予測12台順位・入力/出力hashを履歴で再取得。
3. FEATURE_BUILDの研究継続を開始してタブ閉鎖。別の読み取り専用DB確認でfeature/backtest/search/holdoutの7jobすべてsucceeded。新タブから9番holdoutの2モデル/封印日/研究championを取得。
4. active baselineと研究winnerが異なることを表示、正式PREのtrial1を開始。再実行は0日・実績待ちで対象2/20。未採用モデルをactiveへ変更しない。
5. 別の開発用SQLで2/20の合成実績12台をローカルだけに投入。新しいformal-preジョブを実行し、採点2/20・評価1日・次予測2/21・実施中を表示。旧active/holdout/分析履歴を保持。

8操作地点のDOM原本はbrowser-final.json、タブ閉鎖後の状態はbrowser-closed-jobs.json、投入SQL/logも収録。初期UIの非同期描画でselectorが置き換わる場合は最新DOMを読み直し、元コードを変更せず操作した。最後のスクリーンショットは共有画面用の別資料でありZIPには含めない。

権限拒否・Origin/CSRFは自動API回帰で検証。正式WebAuthn/host無人運用/実ホスト総128MBの証明ではない。PRE全長期terminal採用や全画面を完成扱いにしない。
