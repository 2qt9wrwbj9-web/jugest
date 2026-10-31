# 保存版17・中断後の継続（2026-10-31）

GitHub実リモート `work/sites-migration-20261027@f6e3a510a354fca983cafb226ac362ec46c64d40` と同じtreeを保持するローカル原本、Sites保存版16 `5440af1d06bac874f33523843ef84a70e37cc5e0`、Sites未保存変更120件と旧GitHub作業領域57件を照合・保全した。旧GitHub作業領域は35b3fa3で止まっていたため採用せず、f6e3a51を正本として続行。元本番固定ソースの差分は0。本節が今回の優先記録、以下は歴史を含む。

- **移植済みの単位:** 前回v17の正式PRE長期保存値比較、専用認証DBのcredential lookup、既定無効の日次受付を保持。今回、日次の親処理と受付記録を同一DB確定にし、新しい営業日が届いた後の古い親/子受付、送信待ち記録、最新処理参照の変更をDB内で拒否する。処理済み/失敗/置換済み状態を古い続行が再開状態へ戻す競合も抑止。店舗全体の最新参照に合わせ、異なる受付経路（channel）でも新営業日を優先する。旧日・旧子の履歴は削除しない。
- **追加修正:** 正式PREが待機/開始対象なしなど保存値を変えない場合、元のexecuteSourcePlanと同じく業務DBの確定・世代更新を行わない。不要な世代照合で特徴量作成と衝突する不具合を再現し、SQLiteとの結果比較試験を追加。
- **未完成:** 元DAILY_ANALYSISの更新世代・解析状態・summary/最新状態・後続要求/捕捉エラー境界は未移植。同日データ改訂後の再解析、手動の非日次要求との全競合、既に受付済みの古い子の全公開経路は未解消。日次bridgeは既定無効のままで定期起動は登録しない。PRE終了とactiveモデル変更を同義にしない。
- **未検証:** 元モデル生成→多日日次→試験終了の単一統合、終了時の全故障位置、1.5MB超PRE計画、実Sites総128MB・CPU・無人継続、正式認証全体、同期/収集/パチンコ/全MCP/OAuth/実データ移行は残る。55機能/12gateと全hostVerified=falseを維持。
- **証拠の扱い:** 前回groupログの一部は末尾集計がなく、全件成功とは扱わない。今回の全コマンドと結果は `evidence/v17/recovery-20261031/`、前回原本は既存 `evidence/v17/` に保持。Sites保存の成立は外部の保存receiptでのみ確定する。公開・deployは行わない。

# 完全移植の完成判定（保存版16 / authoritative）

全gateの証拠が揃うまで完全移植を名乗らない。非公開保存/テスト件数/画面assetの存在は完成判定ではない。元基準1f8c29fc458f34e11e546fb57944d0fc31db98a5。仕様・数学・データ意味・権限の重要変更は事前にユーザー判断を得る。現時点ですべて未達または部分達成で、根拠のない完成率を出さない。

|Gate|完成条件と必須証拠|保存版12からの状態/残り|
|---|---|---|
|AC-01 全機能対応|全画面/route guard/9 MCP tool/job/DB table/外部依存を安定feature IDに対応し、未対応・未確認のruntime項目0。無効/非配信とする場合も元配信/呼出し根拠を示す|マスター/構文inventory作成中。semantic網羅は未完|
|AC-02 数学的一致|全対応機種・判別/全解析モデル/8値/順位・同点・float順・入力/出力hash・研究採否・正式PREを固定元と比較。許容誤差を広げず失敗原因を解決|既存judge/現行/feature/BT/search単位で一致。昇格/PRE/他機能は未達|
|AC-03 本番相当規模|4規模90×106/180×106/240×106/180×160を維持し、実規模/疎データ/台入替/大量出力/長期履歴も、対象を削らず完走|合成4規模と大規模BT/search local成功。実データ規模未確認|
|AC-04 host制限|実Sites hostの総128MB/CPU/サブリクエスト/DB/R2制限に適合。複数request共有isolate、同時読取/異常終了も検証。heap/RSS/backingを混同しない|未証明。local old-space成功は代用不可|
|AC-05 無人運用|ブラウザー/端末を閉じて日次収集→固定入力→解析→研究cycle→正式予測/比較まで自律継続。再配信・timer・host再起動・監視も確認|local Queue/有限DEV driverのみ。正式collector/cycle/host未達|
|AC-06 障害整合|実OOM・強制終了・期限切れ・queue送信失敗・DB/R2途中失敗・競合・古い世代・二重配信から回復。正常な元結果/履歴を保持し成功のみ公開|local実OOM/故障の対象単位で達成。全機能/hostは未達|
|AC-07 正式認証|WebAuthn登録/login/再認証/失効/回復、招待/閲覧/管理/PIA/assistant scope、CSRF/origin/rate制御が元意味で動く。DEV authは完成証拠から除外|正式auth未移植|
|AC-08 端末移行・同期|既存browser local dataの安全export/import、端末pair、Relay/Sync revision/CAS、offline/再接続/競合/履歴を複数端末で試験|保存CAS部品のみ。実端末未達|
|AC-09 MCP/OAuth/API|全tool schema/入力/出力/権限/errorとOAuth discovery/PKCE/client/token/refresh/失効、新issuer/resourceとの接続が一致。全HTTP API contractも比較|judge/read subsetのみ。全MCP/OAuth未達|
|AC-10 パチンコ他全機能|収集/snapshot/record/rotation/model/ranking/yutime/全画面を元保存値/時点/順位/権限と照合。Jugglerだけで完成にしない|server未移植|
|AC-11 全データ移行/復旧|明示許可のread-only snapshot、全DB domain/ファイル/参照/FK/履歴/件数/hash/タイムゾーンを独立先へ復元。秘密は安全再発行/移行、バックアップ/DR/切戻しを検証。本番は変更しない|本番data未取得/未移行。source ZIPとは別gate|
|AC-12 統合・運用|実画面→API→DB/R2→job→無人処理→結果→履歴の全フロー、回帰/監視/エラー/復旧に合格。master/blockers/status/全ログ/再現source/commit/ZIP/Git復元を独立検証可能にする|対象localフローとsource証拠配布のみ。全host統合未達|

## 判定手続き
- 各featureは必要なgate IDと、実行環境・入力・command・出力hash・全ログ・source commitを紐付ける。未実行/失敗/環境依存を区別する。
- 解消証拠が不足するUNKNOWNを消さない。local完了は「実装済み・実ホスト未検証」までとする。
- GitHub/Site sourceを保存し、原本/全ログ/ZIP CRC/個別SHA/Git復元を検査する。取得済みshallow歴史を全GitHub履歴と称さない。
- 公開・本番デプロイはこれらの検証条件から分離する。host試験に必要なら、対象・データ・権限・費用・失敗回復・公開範囲を具体化して直前の明示許可を求める。それまで公開しない。

## 次回の機械的再開
最新保存receipt/SHA照合→masterの未達feature→blockerの次検証→該当gate→原本command実行→実装→同じgateの証拠更新。毎版、完成した単位/解消障害/新制約/残作業の4項目をSTATUSへ記録し、本3資料も更新する。

## 保存版13の証拠更新

- AC-01：55機能IDと155source/全fixed Git tree・全43DB領域の索引を作成。動的分岐/全実行経路のsemantic監査未完のため全体合格ではない。
- AC-02/03：4規模（90×106、180×106、240×106、180×160）で元8段階/全モデル構造/最終hash一致。v13参照寿命変更後も対象日・台・候補・順位規則不変。未移植PRE/昇格まで一致と拡張しない。
- AC-04：使用heap観測改善。総128MB/厳密peak/host統合/同時request/実請求CPUは未証明。
- AC-05/06：BACKTEST成功と子探索受付/固定モデル/manifest/outboxを原子的に確定。実ローカルQueueとUIで完走、rollback/重複/送信失敗/古世代/入力・実装照合を試験。ローカル実V8 OOMからの復旧を再実行。ホスト無人運用・自動収集・全研究cycleの合格を意味しない。
- AC-07〜11：正式認証/端末同期/全MCP/OAuth/pachinko/本番データ移行は未完のまま。開発用cookieと合成data以外を用いない。
- AC-12：元UI上のfeature→backtest→自動探索・保存/履歴、台/日付切替、現行予測と再取得を検証。全未移植機能の統合・実ホスト試験は未完。

今回合格したlocal単位はSTATUS/command-results.jsonの対象範囲でのみ有効。最終12gate全体の完成判定はまだ不合格（未達項目あり）。公開許可ではない。

## 保存版14のgate差分

|Gate|今回満たしたlocal範囲|依然必要な条件|
|---|---|---|
|AC-01|55ID維持、段階別判定と依存/次作業を更新|全動的画面/API/運用経路のsemantic網羅|
|AC-02|6採否分岐、実合成cycleの全registry/loop/次logical jobを元SQLite比較。4規模現行予測8値/全model/hash一致|正式holdout後の元状態/全PRE/未移植数学|
|AC-03|4規模全工程と180×160追加2回ずつを維持|実データ本番規模/長期/全機能の容量試験|
|AC-04|heap/total/backing/embedderとI/Oを別記|host総128MB/CPU/並列/peak適合。現状未証明|
|AC-05|opt-in feature→BT→search→研究champion採否→収束を実local Queueで完走|正式holdout/正式PRE/collector/host定期運用|
|AC-06|研究publication rollback/世代競合、採否直前の実V8 OOMでregistry保持・一度だけ昇格。既存5OOMも維持|ホストOOM/全未移植機能/holdout保存復旧|
|AC-07|専用access v2 D1のsession/失効/audit/one-useと隔離拒否を元比較|正式WebAuthn/招待/登録/発行/rate/全scope/host専用binding|
|AC-08|今回新しい端末同期の完成なし|全端末引継ぎ/競合/再接続|
|AC-09|既存judge/read subset回帰を維持|全MCP/OAuth/外部接続|
|AC-10|今回新しいパチンコserver完成なし|全収集/保存/分析/API/画面|
|AC-11|source ZIPの復元と前版/今版の保存・共有状態を分離|許可された本番全data snapshot/独立移行/DR|
|AC-12|元画面で研究cycle/採否/収束/過去個別結果、既存店舗機能を確認|全host/認証/定期運用/未移植機能の統合|

全体gateはすべて未達または部分達成のまま。CYCLE-03等のlocal実装完了をゼロと扱わず、masterのchecksに明記する。一方でhost未検証を理由なく合格にしない。保存版14も公開許可ではない。

## 保存版15の12gate判定（全体完成は未達）

|gate|今回進んだ証拠|残る完成条件|
|---|---|---|
|AC-01|55ID維持、CYCLE-04 local完了、FEAT-01副作用未移植を部分実装へ明確化|全55機能と保存/運用の対応|
|AC-02|正式holdout全行/全state/hash・4負荷規模・元8中間値一致|PRE/active/全数学の比較|
|AC-03|最大11,520holdout予測行をlocal保存/照合/公開|許可された本番全規模/歴代モデル/host|
|AC-04|全工程再計測、holdout保持量削減|実Sites総128MB/CPU/同時実行|
|AC-05|実local Queue7job正式holdout完走|host無人・定期収集/研究/監視|
|AC-06|holdout中断/破損/世代/DB失敗/実OOM復旧/旧正常保持|host強制終了/長期運用/全機能DR|
|AC-07|独立ACCESS viewer失効/rate並列上限SQLite比較|正式発行/WebAuthn/CSRF/招待/全権限/第2binding|
|AC-08|既存端末同期の新しい完成なし|全Sync/Relay/移行/再接続|
|AC-09|既存判別/read subset回帰維持|全MCP/OAuth/外部API|
|AC-10|新しいパチンコserver完成なし|全収集/保存/分析/ランキング|
|AC-11|Git/原本/ログ/ZIP整合性と永続共有を別状態で確認|本番snapshot許可/独立複製/復旧/切戻し|
|AC-12|元画面で研究収束/holdout確定と個別履歴、店舗/日付/予測を検証|正式認証/host/PRE/全機能統合|

local正式holdout合格はAC-02/05/06/12の対象範囲を前進させるが、全体gateを完成にしない。公開/デプロイ許可ではない。receipt/検証ログを最終根拠とする。

## 保存版16の12gate更新（全体の合格項目数は増やさない）

|gate|今回満たした局所条件|残る条件|
|---|---|---|
|AC-01|55機能を保持しPRE/active/認証の対応を更新|未移植全領域の実装と統合|
|AC-02|元FEATURE_BUILD子プロセス全保存値、正式trial/全予測/日次outcome/evidence/hash、従来4規模全model8段階一致|active正式採用・長期PRE・未移植数学|
|AC-03|4規模active/PRE開始・holdout負荷|本番相当履歴/全機能の実host負荷|
|AC-04|workerd old-space96の全工程観測|Sites総128MB/CPU/同時request実測|
|AC-05|local Queue研究7job→PRE開始、タブclose後研究完走|host無人収集/日次PRE/正式採用の定期運用|
|AC-06|active/PRE private checkpoint後の実V8 OOM復旧、DB rollback、stale generation、応答消失・重複|全terminal境界とhost異常終了|
|AC-07|ACCESS部品のenrollment/challenge互換追加|正式認証全route/ceremony/専用binding|
|AC-08|既存Relay CASを維持|既存端末Sync/データ引継ぎ|
|AC-09|既存公開判別を維持|全MCP/OAuth/外部API|
|AC-10|元パチンコテストを維持|移植版パチンコ全経路|
|AC-11|成果物Git/ZIP復元手順を維持|本番の許可済み整合snapshot移行・切戻し|
|AC-12|既存画面からactive、研究holdout、正式PRE開始/待機/採点/次日保存を区別|正式認証/host/全機能の統合|

保存版16は非公開開発の進展であり、完全移植完了または公開許可ではない。


## 保存版17：PRE長期比較・日次受付橋渡し

保存版16の正式保存receiptを基準に継続。55機能/12gateは維持し、実host未検証を合格にしない。PRE元計算の複数日全保存値比較、active書込全経路調査、専用ACCESS credential lookupを追加。日次受付橋渡しは既定無効・部分実装で、元DAILY_ANALYSIS全副作用/新frontier競合CAS/定期起動は未完成。証拠と正確な最終試験件数はevidence/v17を参照。R-SCHEMA/R-PRE-LARGE/B-HOST/B-MEM/B-UNATTENDED/U-QUEUE/U-ACCESS-BINDINGは未解消。元にないactive自動採用は追加せず、正式trial判定とactive維持が元の挙動。次はdaily本体の分析状態/summary/後続要求/エラー境界と全CASの元SQLite比較を優先する。
