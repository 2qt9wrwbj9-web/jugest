# 開発画面検証（保存版15）

元JUGEST画面をhttp://terminal.local:4173/で操作。独立DEV認証と合成50営業日12台。公式managed profile復旧後、空のlocal D1に未適用migration0000..0016を一度だけ適用。prod/VPS/hostDBは変更していない。DEV有効化はgitignored .dev.varsのみで配布物には含めない。

店舗選択、営業日2/18への切替、12台表示、保存済み分析50日600台日/平均2.86/根拠406、FEATURE_BUILDから研究継続を実行。#1 feature→#2 BT→#3 SEARCH採用→#4 BT→#5 SEARCH継続→#6 SEARCH収束→#7正式holdout。確定後に2modelの全10日、Top1/3/5lift・順位相関・研究champion・hash9d52664dを表示。未確定表示と確定表示を分離し、元のactiveは変更しない。historyから#7再取得と#6親研究状態が正式holdout確定へ更新されることを確認。

追加で#8店舗分析を新規実行し出力fc43a0da21bc、#9現行予測を受付後にタブを閉じ、開き直して保存完了/12台全順位と出力46df403b617aを取得。ブラウザーを閉じた区間の進行はlocal dev waitUntil経路。研究全chainのブラウザーなし無人処理は別のnative Miniflare Queue統合試験で証明。hostの無人/再配信は未検証。

新holdout表の長いfingerprintで横はみ出しを発見し、table表示12字/全値title、winner折返し/横scrollを修正。親jobの旧converged表示が確定後もpendingになる表示優先順位も修正。最後のUI修正後に全回帰を再実行。async営業日ラベル切替の一時selector失敗とpreview接続失敗は実装test成功として数えていない。

DOM原本：logs/browser-holdout-final.txt、browser-closed-tab-prediction.txt、browser-day.txt。画像は内部QA/最終表示用でZIPへ収録せず。実認証/host/OAuth/collector/正式PRE等の未移植画面を今回合格扱いしない。
