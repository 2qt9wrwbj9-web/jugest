# Sitesホストの未確認事項と次の判定手順（2026-10-29）

保存版13で閲覧済みの一般Workers資料を再説明するだけで利用可能としない。今回の証拠はローカルinstalled Sites skill/workflow/manifest、native get_siteの未公開状態、native Queueの実験。Queue/Cron/Workflowをホストへ作成・bindした操作はない。

- `.openai/hosting.json`は既存DB/BUCKET/MCPのみ。worker/index.tsのqueue/scheduledは未接続のhandler。native source/save toolの契約はsource/archive/saveを提供し、Queue provisioningの引数を提供しない。これだけでSitesが不可能とは断定しない。
- Sites skillのrecurring-updatesはpublished・user-owned Siteとcloud writer認証/readbackを前提とする。未公開保存版のpreviewはその証拠にならない。今回は新規schedule/automationも作らない。
- 新たに実装した認証session adapterは**専用ACCESS DBだけ**を受け付ける。一方、現manifestのd1は単一binding名。第2の専用D1を安全に供給できるかは未確認（U-ACCESS-BINDING）。canonical DBへ認証表を同居させて境界を迂回しない。元RP IDの再登録/失効/移行は別gate。

次に必要な確認：
1. Sites側がQueue producer/consumer、Cron/Workflows、第2D1、CPU/実行上限、ログ/通知を正式に設定する対応インターフェイスを確認する。未提供・不明をUNKNOWNのまま記録。env名を置くだけでbindingができるとは扱わない。
2. 非公開saveのみでイベント実行・persistent writerを使えるか、対応契約を確認する。不可と明示された場合だけ確定制限として記録する。
3. 公開が必須なら、**明示許可を得る直前の試験計画**を作成する：独立合成50×12のcanary、host128MB/CPU/1102/Queue再配信/重複/lease満了/配信失敗/日次writerの実測、ログ/失敗通知/費用上限、アクセスscope、停止・復旧手順。許可前にdeploy URLを発行しない。
4. 必要なbindingがSites単独で提供されないと確定した場合、Sites内cloud task writer方式と外部実行基盤の候補を、費用・監視・秘密管理・独立性・復旧の差で提示する。外部基盤は承認前に導入しない。

現判定：U-QUEUE/U-ACCESS-BINDING/U-OBSERVE/U-CAPACITYはUNKNOWN、ホスト統合証拠の欠落はB-HOST/B-UNATTENDEDとして未解消。ローカル研究cycle完走/実OOM復旧はこの判定を置き換えない。
