# 保存版17・中断後の継続（2026-10-31）

GitHub実リモート `work/sites-migration-20261027@f6e3a510a354fca983cafb226ac362ec46c64d40` と同じtreeを保持するローカル原本、Sites保存版16 `5440af1d06bac874f33523843ef84a70e37cc5e0`、Sites未保存変更120件と旧GitHub作業領域57件を照合・保全した。旧GitHub作業領域は35b3fa3で止まっていたため採用せず、f6e3a51を正本として続行。元本番固定ソースの差分は0。本節が今回の優先記録、以下は歴史を含む。

- **移植済みの単位:** 前回v17の正式PRE長期保存値比較、専用認証DBのcredential lookup、既定無効の日次受付を保持。今回、日次の親処理と受付記録を同一DB確定にし、新しい営業日が届いた後の古い親/子受付、送信待ち記録、最新処理参照の変更をDB内で拒否する。処理済み/失敗/置換済み状態を古い続行が再開状態へ戻す競合も抑止。店舗全体の最新参照に合わせ、異なる受付経路（channel）でも新営業日を優先する。旧日・旧子の履歴は削除しない。
- **追加修正:** 正式PREが待機/開始対象なしなど保存値を変えない場合、元のexecuteSourcePlanと同じく業務DBの確定・世代更新を行わない。不要な世代照合で特徴量作成と衝突する不具合を再現し、SQLiteとの結果比較試験を追加。
- **未完成:** 元DAILY_ANALYSISの更新世代・解析状態・summary/最新状態・後続要求/捕捉エラー境界は未移植。同日データ改訂後の再解析、手動の非日次要求との全競合、既に受付済みの古い子の全公開経路は未解消。日次bridgeは既定無効のままで定期起動は登録しない。PRE終了とactiveモデル変更を同義にしない。
- **未検証:** 元モデル生成→多日日次→試験終了の単一統合、終了時の全故障位置、1.5MB超PRE計画、実Sites総128MB・CPU・無人継続、正式認証全体、同期/収集/パチンコ/全MCP/OAuth/実データ移行は残る。55機能/12gateと全hostVerified=falseを維持。
- **証拠の扱い:** 前回groupログの一部は末尾集計がなく、全件成功とは扱わない。今回の全コマンドと結果は `evidence/v17/recovery-20261031/`、前回原本は既存 `evidence/v17/` に保持。Sites保存の成立は外部の保存receiptでのみ確定する。公開・deployは行わない。

# 技術的障害台帳（保存版16 / authoritative）

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

## 保存版14の最新判定（以前の記録より本節を優先）

- **B-PIPELINE：局所障害を解消、全体は未解消。** opt-in研究cycleでFEATURE_BUILD→BACKTEST→MODEL_SEARCH→採用/棄却→次BT/search→repeat/no_improvement収束を接続。元6分岐と実合成cycleのregistry/loop/次logical job列がSQLiteと一致。途中DB失敗/古世代/重複/Queue/実OOMで正常stateを保持。旧単独探索は未昇格のまま維持。研究championの更新はactive model変更ではない。
- **B-HOLDOUT・BLOCKER（追加）：** 対象CYCLE-04/AC-02/05/06。発生条件は研究収束後。元本番MODEL_SEARCHはdaysを渡しfinalizeSealedHoldoutへ進むが、v14はconverged_holdout_pendingで止まる。原因は全モデルholdoutの予測行/scoreを大容量で段階保存し、入力/モデル集合を固定して原子的に確定する移植が未実装なこと。元のみのholdout-boundary.jsonでは収束前拒否、歴代2モデル・218予測行と勝者確定、active model不変を実測。暫定対応はsealed維持・未完表示。恒久候補は元pure評価/rankRows/betterとmodel集合固定→モデル/行ごとの不変stage→一括最終確定。次検証は元全行/hash/全registry/loop/失敗復旧を比較すること。解消条件は4規模を含む安全な同値の正式holdout保存・再開・最終状態の一致。PRE v2は別に残る。
- **B-MEM：未解消。** 評価後に不要なgroup索引/機種group参照だけを解放。4規模全モデル/8値/出力hash一致だが、全工程used観測最大はGC/採取時点で変動し、ピーク低下の一律効果を証明できない。180×160を各3回測定。新規の候補checkpoint/分割は効果・補正/統合peakを証明するまで不採用。総128MB/CPU/同時requestは未証明。
- **B-AUTH：部分前進、未解消。** 専用access v2 schemaでadmin/viewer session、期限/失効/audit、一度限りchallengeのD1互換を実装・合成SQLite比較。canonical DBとv1型nullable契約を拒否。WebAuthn ceremony/発行/登録/招待発行/単独viewer失効/rate/全API/画面は未移植。公開authへ接続しない。
- **U-ACCESS-BINDING・UNKNOWN（追加）：** 対象AUTH/DATA-03。独立ACCESS DBが必要だが現在のSites manifestは単一D1 binding名を持つ。第2D1の正式供給interfaceは未確認（不可能とは未確定）。影響は専用auth adapterをホストへ接続できないこと。暫定は合成専用D1試験のみ、既存DEV authを維持。候補はSitesの正式な追加binding提供、または承認後に別境界を設計する方法。次は対応tool/manifest/APIの契約確認。解消条件は独立DBと権限/失効/復旧を実hostで検証し、canonical dataと混在しないこと。
- **U-QUEUE/B-UNATTENDED/B-HOST/U-OBSERVE：未解消。** 実local Queueが6jobを自動処理し昇格/収束。研究採否直前の実V8 OOMから再開し決定1回・旧正常結果保持を確認。ホストbinding/再配信/128MB/定期実行/監視は未確認。HOST_VALIDATION_PLAN.mdの次試験へ進む。公開・外部基盤は未実施。

今回追加の2障害は、既存機能を削除する判断ではない。全55機能と元データの意味を維持する。source-only holdout試験を移植完成の証拠に転用しない。

最終runのメモリ値はMIGRATION_STATUS.md保存版14節/evidence/v14/MEMORY_REPORT.mdを優先する。初期計測はpre-finalログに保持。全工程peak改善なし、host未証明。

## 保存版15（2026-10-30 JST）

- **B-HOLDOUT：localの計算/保存/再試行/履歴未実装という原因を解消。** 元2model218行、4負荷規模全行/registry/loop/hash一致、7job実Queue、実OOM・CAS/DB rollback/破損/旧正常保持を検証。CYCLE-04を実装済み・実host未検証へ。ホスト側のtransaction/再配信/総128MBはB-HOST/U-QUEUE/R-D1に残す。PRE全体を解消済みにしない。
- **B-PIPELINE：部分改善。** 研究収束→正式holdout確定までlocal自動接続。研究championとactiveは分離。正式PREとFEATURE_BUILDのactive初期化/store-read snapshot/live prediction副作用は残る。FEAT-01を部分実装へ精密化（機能削除・計算退行ではない）。PRE_DEPENDENCIES.md。
- **B-MEM：未解消。** 現行予測の新分割を採用せず4規模全model/8中間値一致。holdoutの計算後不要feature重複保持を除き180×160の観測heap87.37→59.08MiB、R2書込27,838,502→5,920,784byte。実Site総128MBや厳密peakは未証明。MEMORY_REPORT.mdの停止条件で無効な調査反復を止める。
- **B-AUTH：部分改善。** 専用ACCESS session単独失効/auditとrateの並列上限を元SQLite比較。正式route/RPID/Origin/CSRF/招待/復旧・第2D1は未完。U-ACCESS-BINDINGはUNKNOWNのまま。
- **R-D1/R-COST：残存。** 最大11,520行をprivate分割、最終INSERT SELECT公開をlocal成功。maxbind34、SQL2013byte、batch101文。公式のper invocation batch=1 queryの意味をbinding呼出とSQL文数から区別。host query30秒/CPU/transaction、全歴代registry規模、料金は未検証。自動GCは引き続き無効。
- **B-HOST/B-UNATTENDED/U-QUEUE/U-OBSERVE：未解消。** native公開状態を変更せず、Sites公式scheduleは公開が前提と確認。Queue/Cron/Workflow/第2D1供給interface未確認。一般Workers機能をSites提供としない。HOST_VALIDATION_PLAN.mdにcanary対象・データ・停止方法を記録し公開前の許可は未取得/未実行。
- **開発preview接続：復旧。** source復元後のignored execution profile/古いlockを公式helperで修復し元画面確認。transport切断で完了しなかった全回帰ログは保存し、最終全回帰を再起動。これをアプリtest成功として数えない。

解消条件は各元台帳を維持する。UNKNOWNを不可能/解消済みに変えず、正式holdoutのlocal達成と全体完成を分離する。

## 保存版16の最新判定（以前の未実装記録より本節を優先）

|ID/区分|今回の実証と影響|次の検証・解消条件|
|---|---|---|
|B-PIPELINE / BLOCKER 部分改善|FEATURE_BUILDのactive初回初期化、既存据置、store-read/live predictionを元子プロセス全体と全列比較。研究7jobから正式PREの8jobを実local Queue完走。|元daily-analysis定期呼出、全physical queue coalescing、PRE terminal/active採用、host運用まで整合。|
|B-PRE / BLOCKER 部分改善|正式モデル固定・trial開始・予測pair・実績待機・元qによる日次採点/outcome/次日予測保存、CAS・重複・stale・実OOM復旧をlocal比較。|正式なactive採用後続、全trial停止境界・長期逐次判定・全比較API/画面・日次自動運用は残る。|
|B-AUTH / BLOCKER 部分改善|専用ACCESSのenrollment lookupとchallenge作成validationを追加比較。認証情報を使わず、公開route無効。|invite/発行/再認証/WebAuthn/RPID/Origin/CSRF/復旧・正式binding。|
|R-PRE-LARGE / RISK 新規|active client snapshot/CAS期待行が1.5MB超なら安全に拒否。R2 private planはあるが元snapshot APIの大容量公開adapter未実装。正常旧値は保持。|全行を失わないR2 pointer adapter、API完全一致、競合/読者/破損の試験。単にD1へ巨大JSONを入れない。|
|R-D1 / RISK 残存|180×160 feature確定のlocal batchは最大1301SQL、bind最大19。PRE含むmaxbind42、SQL最大4970byte。local成功をhost transaction/query30秒/CPUの保証にしない。|正式host割当・phaseごとのbinding call/SQL/行数/時間上限をcanaryで測る。|
|B-MEM / BLOCKER 残存|現行予測数学を変更せず4規模8中間値/全model/hash一致。新active/PRE全工程の観測heap19.34〜23.26MiB。現行予測の安定削減は証明せず新最適化不採用。|総128MB/isolate・複数request・CPU・host OOM復旧を正式許可試験で検証。|
|B-HOST/B-UNATTENDED / BLOCKER 残存|保存のみ、公開なし。ローカルでタブclose後とQueueの進行は確認。ホストの同等運用は未証明。|HOST_VALIDATION_PLANの非公開binding供給を確認し、必要な公開canaryのみ別途直前許可。|
|U-QUEUE/U-ACCESS-BINDING/U-OBSERVE/U-CAPACITY / UNKNOWN 残存|公式skillのDB/BUCKETとpublished Site scheduleは確認。Queue/Cron/Workflow/第2D1の提供interface・host計測/割当/実料金は確認できない。|一般Cloudflareの機能をSites利用可と推定しない。正式提供interface/アカウント割当を取得。|

B-HOLDOUTのlocal達成は維持。Sync/Relay全体・収集・パチンコ・MCP/OAuth・実データ移行の既存障害は未解消。UNKNOWNを不可能/解消済みへ変えていない。実OOMはlocal V8を実枯渇させたもの、host強制終了の証明ではない。

### R-SCHEMA / RISK（v16）

発生条件：元SQLiteへ省略列INSERTやnullable TEXT PRIMARY KEYを直接使用する場合。原因：Drizzle生成DDLがPKをnot-nullにし、live model_fingerprintのDEFAULT空文字を現schemaで保持していない。schema-comparison.json/strict logが証拠。active/store-read/PREの実writerは必須キーと全値を明示し、今回の元全保存値は一致。任意SQLや全SQLite schema互換の証明ではない。暫定対応は公開任意SQLなし、元writerの明示列を使用。次は必要な元呼出の省略列/default/null依存を棚卸し、既存データを壊さないschema adapterを比較する。解消条件は元有効入力/履歴の保持と、必要なSQL意味の完全一致。安全側制約を弱める変更を無断で採用しない。


## 保存版17：PRE長期比較・日次受付橋渡し

保存版16の正式保存receiptを基準に継続。55機能/12gateは維持し、実host未検証を合格にしない。PRE元計算の複数日全保存値比較、active書込全経路調査、専用ACCESS credential lookupを追加。日次受付橋渡しは既定無効・部分実装で、元DAILY_ANALYSIS全副作用/新frontier競合CAS/定期起動は未完成。証拠と正確な最終試験件数はevidence/v17を参照。R-SCHEMA/R-PRE-LARGE/B-HOST/B-MEM/B-UNATTENDED/U-QUEUE/U-ACCESS-BINDINGは未解消。元にないactive自動採用は追加せず、正式trial判定とactive維持が元の挙動。次はdaily本体の分析状態/summary/後続要求/エラー境界と全CASの元SQLite比較を優先する。
