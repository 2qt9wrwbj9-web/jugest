# 次の開発依存順

1. safe保存receiptのSites15完全SHAとGitHub開発commitを照合→4管理正本→REPRODUCE.md。旧版へ戻さない。
2. PRE_DEPENDENCIES.md：FEATURE_BUILD副作用（条件付きactive初期化/store_read/live prediction）とformal PRE trial storeを元SQLite比較から移植。holdout研究winnerをactiveへ自動採用しない。
3. 正式ACCESS：d1-sessionsのpure互換を足場に正式第2binding提供・WebAuthn/Origin/RPID/招待/CSRF/復旧。第2DB名をenvに置くだけで対応済みにしない。
4. HOST_VALIDATION_PLAN.md：非公開で確認可能なbinding契約/監視を先に確認。公開が必要なら具体的canaryの直前承認。総128MB/CPU/transaction/並列/Queue再配信と定期運用を測る。
5. 現行予測の共通scope/候補順/全BHを保てる境界をpure kernelで証明してから分割。未証明なら採用しない。日数/台数/精度は不変。
6. Sync/Relay/Collector/自動収集→パチンコ→全MCP/OAuth→許可された全データ独立移行。55機能/12gateを減らさない。
