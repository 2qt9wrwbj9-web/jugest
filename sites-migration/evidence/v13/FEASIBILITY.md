# 技術的成立性：保存版13 / 2026-10-28

証拠区分は「元コード」「公式仕様」「ローカル実験」「ホスト未確認」。一般Workersの提供機能からSitesのbinding提供を推論しない。本番には接続せず、実データ・秘密値・容量は未取得。

| 項目 | 確認済み根拠 | 現在の判定と次の検証 |
|---|---|---|
| メモリ | Sites skillは128MB/isolateを明記。Workers limitsもisolate単位で複数requestが共有すると説明。native workerd Inspectorで各段階のused/total/backing/embedderを記録 | 総128MB/厳密ピーク/同時request時の余裕は未証明。MEMORY_REPORT参照。ヒープと独立最大値を足さない |
| 背景処理 | worker/index.tsにqueue/scheduled handler、ローカルMiniflareの実Queueで子ジョブまで完走 | Sites manifestにDB/R2/MCPはあるが、Queue/Cron/Workflowsのホストbinding供給契約は未確認。公開して確認しない |
| スケジュール | Sites公式plugin references/recurring-updates.mdはpublished・user-owned Siteとwriter/cloud access/readbackを要求 | save-onlyの本Siteでは設定・ホスト試験未実施。Automationを作成していない。ローカルQueueとは別 |
| 終了と再試行 | 永続lease/outbox/checkpoint/固定入力。ローカル実V8 OOM後にruntime再作成して復旧 | ホスト1102/更新終了/Queue再配信での自動回復は未検証。待機ブラウザーのwaitUntilだけを保証としない |
| D1 | 元schema43表域、現移植schemaはsubset。D1公式は行/string/BLOB最大2,000,000bytes、query/SQL/bind上限を定義 | 日単位→台単位snapshotは既存試験済。単一台>2MBや一日parseピーク、全本番容量は未解決。安全GCは自動有効化しない |
| SQLite→D1/R2 | 空の元SQLiteとD1への合成データを比較。snapshot/hash/version/CAS/参照保護 | 本番全表・fileの整合snapshot/アクセス分離/容量/復元は未試験。ZIPはsource復元の証拠でありDB移行ではない |
| WebAuthn | 元access/config.mjsはrpID===origin.hostnameを必須。identity-feasibility.logで別origin+旧rpIDを拒否、新origin+新rpIDはconfig受理 | 新RPで旧credentialが使える証明ではない。独立originで再登録・招待・失効の移行手順が必要。W3C related-origin方式の支援可否も未確認。旧origin設定を変更しない |
| 端末local data | 元browser IndexedDB/localStorageとRelay revisionはoriginに依存 | 端末export/import、版競合、受信権限の結合試験が必要。本番cookie/tokenはコピーしない |
| Collector/外部取得 | pia/ios/collector/backfillの実ソースとURL設定をinventoryへ記録 | Sitesの宛先別egress/アクセス制御/規約/頻度と端末origin連携は未検証。元サイトを恒久backendにしない |
| MCP/OAuth | 元9tools。移植はjudgeのみ。元OAuth issuer/resourceはjugest.net固定、relay namespace保存 | 独立issuer/resource/全scope・token失効/refresh/接続先許可を移植・試験する。既存token流用なし |
| 監視・費用 | ローカルIO counts/phase時間、元resource_samples/task metricsをinventory化 | Sites CPU/実行上限・Queue上限・費用契約・運用ログ閲覧権限は未確認。Cloudflare一般料金をSites料金と呼ばない |

公式原典（今回閲覧）：
- https://developers.cloudflare.com/workers/platform/limits/ （Memory節、Duration節）
- https://developers.cloudflare.com/d1/platform/limits/ （行2MB、SQL100KB、bind100、invocation query数はプラン依存）
- https://www.w3.org/TR/webauthn-3/ （RP ID節・related origin requests）
- Sites plugin `skills/sites/SKILL.md`、`references/recurring-updates.md`、`references/storage.md`。参照提供元の説明とホスト契約の実証を区別。

これらは今の要件をSites単独で不可能と断定する根拠ではない。無人実行binding/定期運用はUNKNOWN、未移植機能と検証不足は完成判定を阻むBLOCKER。外部恒久基盤は追加していない。候補は(1)Sites内の対応binding/公開後cloud writer、(2)数学不変の分割、(3)明示判断後の別実行基盤。3は運用費・秘密管理・独立性・監視対象が増えるため未採用。
