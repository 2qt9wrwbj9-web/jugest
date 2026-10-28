# 技術的障害台帳（保存版13 / authoritative）

BLOCKERは現時点で完成条件を阻む既知の問題、RISKは実装可能性と本番相当検証が残る問題、UNKNOWNは仕様/許可/実装の未確認。UNKNOWNを不可能と断定しない。解消は再現条件と試験の証拠が揃ってから記録する。

|ID・分類|対象/発生条件|原因・証拠|影響/暫定対応|恒久候補/次検証|解消条件|
|---|---|---|---|---|---|
|B-MEM・BLOCKER|AN-02/03、大規模現行予測|v12 180×160観測heap120.97MiB、統合で全feature再保持。v13 baselineはv4学習の後も大きな参照を保持しsingle群を追加。raw memory logs参照|総128MB適合は未証明。既定実行disabled、localのみ|不要参照の寿命短縮/compact条件集計/条件または候補段階の永続分割。元8値/全結果で比較|全規模の結果一致とhost総量/CPU/同時isolateの安全余裕・OOM復旧が実証される|
|B-UNATTENDED・BLOCKER|JOB-02/03、browserなしの恒久運用|local Queue/OOM復旧は実証、host worker lifecycle/dispatch/回収未接続|日次収集/研究を完成扱いにしない。local finite driver/outbox維持|Sitesが提供する非公開実行経路の有無を確認し、許可されたhost試験を設計|端末を閉じた日次実行/期限回収/再配信/監視のhost統合試験|
|B-PIPELINE・BLOCKER|CYCLE-01〜04/PRE|v12は手動BACKTEST/未昇格探索。research_loops全遷移とregistry履歴が未移植|採用モデルを勝手に変更しない|今回自動search enqueueを原子的に実装。元loop/frontier/round比較、次に昇格/棄却/収束/holdout|元の全サイクル・履歴・採用・stale/再試行比較が一致|
|B-COVERAGE・BLOCKER|全機能/AC-01|source-inventoryは構文抽出。全導線/動的API/配信パッチ/全外部依存のsemantic対応は未完|元source全文と未確認行を保持、未分類を削らない|table/handler guard/tool/job/UI参照を機能IDへ人手照合し、全API contractsを列挙|全inventory項目が移植/非実行根拠へ対応、未対応0|
|B-AUTH・BLOCKER|AUTH/正式管理・閲覧・招待|独立DEV sessionは正式WebAuthn/失効/招待/PIA permissionの代用でない|host実行はdisabled。authを緩和しない|元access専用schema/ceremony/session/rateをD1へ移す。RP IDを検証|正式認証/再認証/失効/招待/全scope/CSRFの統合合格|
|B-SYNC・BLOCKER|SYNC/COLL-03|保存CAS部品のみ。端末protocol/collector state/Sync handler未移植|原連携URLをprodbackendへ恒久依存しない|元Relay/Syncを原則そのままasync storeへ接続し端末pair/import/revision試験|独立siteと複数端末の競合/再接続/履歴整合が一致|
|B-PRE・BLOCKER|PRE/COMP|正式PRE-v2/challenger/日次trial/active採用/過去比較未接続|現行予測をPRE全体と呼ばない|元pure評価→model/prediction store→状態遷移→統合の順|元の全trial/比較/正式結果/将来除外/履歴が一致|
|B-PACHI・BLOCKER|PACHI/DATA-04|パチンコserver collector・独立DB・API writer未接続|asset配信だけで完成としない|原schema所有境界/全snapshot/推定/保存/APIを移植|元値/順位/時刻/権限/収集エラー/画面比較合格|
|B-MCP・BLOCKER|MCP/OAUTH|judge subsetのみ。9 tool全体/OAuth未実装|prod token/issuerを流用しない|tool単位contracts/新resource issuer・PKCE/refresh失効を検証|全tool入出力と全認証/失効/エラー互換、実接続合格|
|B-MIGRATE・BLOCKER|DATA/端末引継ぎ|本番DB/ファイルsize・row・個人情報・整合snapshotは未取得。取得許可と安全な手順が必要|無断コピーなし。source ZIPはDB backupではない|read-only snapshot設計→容量/秘匿→空の独立先へ検証復元→整合/切戻し|許可された全実データ/参照/履歴/秘密の独立移行・復旧/切戻し合格|
|U-QUEUE・UNKNOWN|Sites Queue/Cron/Workflows/background|一般Workersの機能がSiteに供給されるか不明。source handler存在はbindingの証拠でない|local nativeだけ検証。公開禁止を維持|Sites tool/公式skill/manifest対応を確認、非公開host試験の可否を別記|対応する公式構成とhostの成功/中断再開を実証|
|U-RPID・UNKNOWN|既存passkey/新domain|元access configにorigin/RP ID境界。新originへの既存credential互換は未実験|秘密値/鍵をコピーしない|WebAuthn公式RP規則と新originでの安全な再登録/回復を確認|承認されたドメイン/認証移行経路と実機試験|
|U-EXTERNAL・UNKNOWN|外部収集/MCP/OAuth/CORS|外部取得許可・接続・origin条件は未確認|無許可通信/恒久prod backend利用なし|元通信origin一覧・client/service権限・rate/規約・通信実験を区別|全外部依存に独立運用可能な契約/権限/通信証拠|
|U-CAPACITY・UNKNOWN|実DB/storage/運用料金|DB実size/保持量/契約quota/課金は未測定|費用額や10GB以内を推測しない|許可されたsize-only計測/台規模保持量とSites割当/料金を確認|必要全履歴の容量/費用/上限が検証される|
|U-PWA・UNKNOWN|offline/更新・端末local data|異origin/キャッシュscope/ブラウザーstorageの互換未検証|source assetを動作証明としない|実deviceでPWA install/offline/update/export/importを検査|操作/保存/更新/復元の実機統合合格|
|U-OBSERVE・UNKNOWN|host logs/CPU/memory/alert|local inspectorとjob timingsはhost総量/監視ではない|観測値をhost peakへ置換しない|Site logs/メトリクス提供条件・失敗通知とアクセス境界を確認|失敗を検出/追跡/回復できるhost監視証拠|
|R-D1・RISK|大容量/並列保存・行size|単一台JSON2MB/巨大day parse残存。local batch成功はhost耐性ではない|日分割/台分割/不変R2/原子確定を維持|単一row chunk化/保持中読取/lock/transaction/30秒等を境界試験|全代表実データと同時更新・障害で破損なし|
|R-COST・RISK|分割/再試行/保持|batchごとの再正規化/R2読込み/SQL stage/未参照objectが増加。v12 I/O原本あり|自動GC無効、旧結果/参照保護優先|共通state永続化/安全GC/課金計数を実測して最小化|対象規模で時間/転送/保持/料金が運用可能と確認|
|B-HOST・BLOCKER（完成判定上）|AC-04/12|Siteはsaveのみでhost統合の証拠なし。不可能と断定する分類ではない|公開/デプロイを行わず、local完成とhost未検証を区別|必要なhost試験を列挙し、公開が必要な最終操作だけ別承認へ分離|許可された実host試験で全完了gateが成立|

## 今回の更新履歴
初版は保存版12の既知実測と今回source/retained-reference調査から作成。実装後に解消/部分改善を追記する。BLOCKERの一部local改善だけで全障害を閉じない。

### 保存版13での実証・状態更新

- **B-MEM：部分改善、未解消。** v4ModelTraining監査後の不要参照解放で4規模のused観測最大が低下。180×160は119.55→89.52MiB（同じold-space96/semi4の別run）。元8中間値/全モデル/最終hashは4/4完全一致。backingの独立最大は低下しないcaseもあり、総128MB/厳密peak/同時requestを証明しない。MEMORY_REPORT.mdと全raw logs参照。台batchの効果が限定的なのは、共通履歴・v4全体候補・BH補正・rankingの再結合依存が残るため。次は母集団・候補順を固定したsingle候補単位分離を検証。
- **B-PIPELINE：BACKTEST→未昇格MODEL_SEARCHの手動接続欠落はローカルで解消。全体障害は継続。** 元logical generation/roundを比較し、成功transaction内の子job/outbox/context、固定入力・モデル・実装照合を実装。実Queue、画面、rollback、重複、配信失敗、古い完了、insufficient dataを試験。FEATURE_BUILD→BACKTEST、候補採用/棄却、昇格・収束・正式holdout解禁は未実装。
- **B-UNATTENDED/U-QUEUE：未解消/未確認。** ローカル実Queueでブラウザー呼出しゼロの後続完走を証明。terminal再配信がoutbox送信を回復。Sitesホストのbinding供給と実OOM自動復旧は試験していない。公開を要するschedule/writer試験は許可前に行わない。
- **B-AUTH/U-RPID：境界を具体化。** 元validateAccessConfigの別origin+旧RPIDは拒否、新origin+新RPIDはconfig受理。credential移植の証明ではない。related-originを含め実装/クライアント対応はUNKNOWN。正式authは未移植のまま。
- **B-COVERAGE：部分棚卸し済、未解消。** 55安定機能ID、元155実行/設定sourceの関数/guard索引、全固定tree blob、42SQL表+relay_kvを対応。動的UI分岐/到達性/運用配信のsemantic完全照合は未完。元に存在しないsw.jsの動作を推定せず、PWA manifest検証とoffline未確認を分離。
- **新たな制約（R-COST/B-PIPELINE）：** 子探索を明示的に未昇格で停止するため、原research_loopsのrunningだけでは研究全体の完了を意味しない。sites_research_contextのsearch_complete_unpromotedで識別。旧保存版のcontextなしbacktestへは推定自動接続しない。新規captureを必要とする。SQL成功と配信の間はoutboxで回復し、send failureを計算失敗回数に算入しない。

全BLOCKER/UNKNOWNの完成条件は継続。今回「Sites単独では不可能」と確定した機能はない。ホスト契約・データ容量・正式権限を未確認のまま解消扱いにしない。
