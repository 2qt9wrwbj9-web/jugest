# 保存版16 ホスト成立性・次の実証

2026-10-31 JST再照合。native Site読み出しで保存版15、live=null、preview=null、automations=[]、access custom/元policy不変。今回もsaveだけ、公開・デプロイ・host DB適用・schedule追加は行わない。ソース元と本番環境は読み取りのみ/未接触。

## 確認した契約

- Installed Sites skill storage.md: hosting.jsonの論理d1/r2をSitesが接続する。現manifestはDB/BUCKET。identity-and-secrets.mdのservice accessはvisitor identityや元JUGEST権限の代用ではない。
- recurring-updates.md: cloud scheduleはpublished Siteと認可済みwriterが前提。nativecreate_schedule/get_site_worker_logsも公開Site向け。保存状態だけをhost Queue/Cron実行の証明にしない。
- 公開公式 https://help.openai.com/ja-jp/articles/20001339-creating-and-using-chatgpt-sites は保存後のdeployを区別しDB10GB/ファイル固定上限なしと案内。2026-10-30確認。
- developer guideリンクは https://learn.chatgpt.com/docs/sites へredirect。TCP非対応、DB/R2容量、今後の計量/料金予定を案内する。将来予定や一般料金表をこのアカウントの割当/費用確定値とみなさない。
- Installed Sites skillはWorkers128MB/isolateとHTTP external接続を明記。local Inspector heapの最大値とは異なる。

## UNKNOWNを維持した項目

|ID|今回確認した境界|次に必要な証拠|
|---|---|---|
|U-QUEUE|native tool/hosting manifestの現契約にQueue producer/consumer、Cron、Workflowsの供給引数を確認できず|非公開実行可能な正式binding interfaceと再配信/lease/CPU条件|
|U-ACCESS-BINDING|単一論理DBは提供、第2の専用DB供給方法は未確認|正式な複数D1提供方法。env名を作るだけではない|
|U-OBSERVE|公開worker logsは提供、未公開hostのログ/厳密総メモリ/通知は未実証|正式計測interface/監視権限/通知/保存期間|
|U-CAPACITY|local stage別D1 call/SQL/行数・R2転送/保存量を実測|実割当/料金単位/CPU・transaction・同時request上限と運用予算|

一般Cloudflare Queues/Cron機能をSitesで利用可能と推定せず、不可能とも断定しない。B-HOST/B-UNATTENDED/B-MEMは未解消。local8job Queue・実OOMからの再起動・タブ閉鎖後の成功は別証拠として保存。

## 公開許可が必要なcanary（未実行）

正式bindingとwriter認可が用意できた後、独立50日×12台合成店舗でfeature→研究→holdout→正式PRE開始/1日採点を対象にする。DEV sessionや本番tokenはホストへ持ち込まない。研究/active/2model/日次固定の整合、再配信、期限切れlease、CAS rollback、CPU/総128MB、2並列request、運用ログを測る。実際の課金単位と上限を先に確認し、許容費用・回数を提示する。費用の金額は現時点未確定。

公開が必須なら最終deployの直前にユーザーへ許可を求める。停止は新規受付/dispatch/scheduleを止め、世代CAS・既存正常結果・private checkpointを保持する。独立DBの整合backupと保存版15/16のsourceから切り戻す。元本番へ戻し書きせず、外部VPSを無断導入しない。

保存前のnative再確認でもlatest15/live=null/preview=null/automations=[]/access custom不変。保存後の版数/完全SHAとdeploymentなしは外部receiptで再照合する。
