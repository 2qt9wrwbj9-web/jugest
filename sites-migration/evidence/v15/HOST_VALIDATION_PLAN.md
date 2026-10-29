# 保存版15 ホスト成立性の確認（2026-10-30 JST）

v14の未確認事項を維持。native get_site/versionを再照合し、保存版14/SHA b464c7b19f96098cffb6af4ed9c325f25c2fdece、live/preview URLなし、deploymentなしを確認。今回も実ホスト試験・公開・外部恒久基盤は行わない。

確認済み提供契約：installed Sites skill storage.mdはhosting.jsonのd1/r2論理bindingを接続する。現manifestはd1="DB"/r2="BUCKET"。公開されたtool一覧には追加Queue/Cron/Workflow/第2D1の作成引数を確認できず、read_database_overview/rowsはdeployed siteのlive DB読み取り。envを追加してbindingへ置換しない。二つ目のDBが原理的に不可能という判定ではなく、正式供給interfaceがUNKNOWN。ACCESSをcanonical DBへ同居させない。

公式OpenAI Creating and using ChatGPT Sites（https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites 、2026-10-30確認）は、URL発行はdeploy操作、cloud scheduleはpublished Siteに対する機能と説明する。saveのみをschedule実行の証拠にしない。DB容量10GB、ファイル容量にはSite単位の固定上限なし、Plus/Pro hostingは現状含まれると案内。ただし本件アカウントの実割当/CPU/料金・運用上限の確認とは別。

Cloudflare公式D1 limits（https://developers.cloudflare.com/d1/platform/limits/ 、2026-10-30確認）では、bound parameters 100、statement100KB、row2MB、query30秒。Worker invocationのquery上限はPaid1000/Free50だが、db.batchは内包SQL文数にかかわらず1queryとして数える。このため本試験のD1 SQL総文数をinvocation query数と同一視しない。binding method呼出し/statement数を分け、ローカル各phaseの上限・wall時間を記録する。Workers一般のPaid/Free設定をSitesの実割当とみなさない。最大数を独立に足してhostメモリや料金を推定しない。

次の実host試験計画（まだ実行許可なし）：
- 対象は独立合成50日×12台のfeature→研究→holdout。DEV bearer/本番秘密を使わず、正式なwriter認可が完成してから限定canary。
- 事前に必要なbinding（Queue producer/consumer、独立ACCESS D1、スケジューラー）と非公開実行契約を提供側interfaceで確認。公開が必須なら、最終deployだけユーザーへ明示確認。
- CPU/128MB総量/同時request/再配信/lease満了/最終CAS rollback/通知/ログを測る。local Inspectorや例外/OOMをhost証拠へ代用しない。
- 費用は実課金単位と上限を確認してから予算を提示（現在は額未確定）。入力・モデル数・run回数をcanaryへ固定し、収集先への大量通信をしない。
- 停止は新規受付/dispatch/scheduleを無効にし、世代CASと未公開stageを保持。元正常結果を削除せず、保存版14/15のsourceと独立DB backupへ復旧する。機能削除・外部VPS追加で障害を隠さない。

結論：U-QUEUE/U-ACCESS-BINDING/U-OBSERVE/ホストCPUは未確認。B-HOST/B-UNATTENDEDは未解消。ローカル正式holdoutの原子的確定を追加しても、この区別を維持する。
