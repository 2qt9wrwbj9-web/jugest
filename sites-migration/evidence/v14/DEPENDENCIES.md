# 継続開発の依存順序

1. B-HOLDOUT: 収束後の元finalizeSealedHoldoutをimmutable feature/model generationへ固定。原SQLite結果と全model別予測行・metrics・参照キーを比較し、D1のSQL/transaction上限に対する分割仮保存と原子的可視化/中断復旧を実装。研究championとactive modelを引き続き分離。
2. U-ACCESS-BINDING: Sites公式の複数独立D1 provisioning可否を確認。ACCESS DBに元v2 schemaを読み込む。セッション保存層をceremony/権限境界へ繋ぐ前に元WebAuthn RP-ID/移行再登録/失効互換を検証。canonical同居は禁止。
3. B-MEMORY: 現行予測singleのscope/候補順を固定したpure評価kernelと全BH最終化の契約を自動一致試験化。候補checkpointは統合peakとコストが改善する場合のみ採用。今回は参照寿命改善以上のpeak低下を実証できなかったため、同調査の無限反復を止める。
4. B-HOST/B-UNATTENDED/U-QUEUE: HOST_VALIDATION_PLAN.mdの利用可能binding確認→非公開試験可能性→必要な場合だけ公開を要する試験の明示許可。一般WorkersのQueue等をSites提供済みと推測しない。
5. 上記と独立してSYNC/Relayのschema/競合rev、Collectorの取得契約、PRE正式試験、過去比較、パチンコ、全MCP/OAuth、承認後の実データ安全移行を55行の各完了条件に沿って進める。

収束までの研究サイクルはlocal比較/API/画面/Queueを完了、正式holdout以降は未完成。完成12ゲートはいずれも完全移植達成に到達していない。
