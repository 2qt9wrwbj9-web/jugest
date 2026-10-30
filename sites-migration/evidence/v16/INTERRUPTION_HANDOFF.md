# 保存版16作業の中断記録（2026-10-30）

このコミットは進捗・復旧情報のみ。保存版16の実装コードをGitHubへ反映したコミットではない。Sites保存版16・最終成果物ZIPは作成できていない。完全移植完了ではない。

## 最後に確実に永続保存されている実装基準

- 元本番：deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5
- Sites保存版15：15ab06a6145755106e4611c3559bd543d92d5fa3
- GitHub実装基準：work/sites-migration-20261027@35b3fa305aca758ca092ed59924cf7c2612bbe59
- 保存版15の証拠ZIP：35,115,967 bytes、SHA-256 72b4fe0e285d5becaf7a0985c03a1ea789b062d29e31b99c5470ba933136f4cc
- ZIPのCRC、1581個別hash、remote Siteの1540 source filesとのbyte一致を確認してから継続した。

## 今回実装・個別検証できたこと（コードは未反映・回収が必要）

1. FEATURE_BUILDのactive初回条件付き初期化、既存active据置、store-read説明/score/rank/payload/hashと翌日のlive prediction保存。元FEATURE_BUILD子プロセス全体を合成SQLiteでforkし、特徴量、refresh、registry/loop、active、client/liveの全保存値を比較した。
2. 正式PRE v2のtrial開始条件、モデル2本の不変固定、champion/challenger予測2本、重複再利用・競合拒否をD1へ適合。元SQLite全列・hash比較。
3. 日次の実績待機、元target-day judgementの全q/期待設定、outcome/NDCG/sequential evidence/trial CAS、次日予測を実装。実到着日のjobから元daily-loopとの保存値比較も成功。
4. 既存の固定入力/private R2 plan/実装hash/lease/outbox/Queue/原子的確定へformal-pre DEV jobを接続。研究champion・holdout winner・active・正式試験2モデルを分離。activeの正式採用後続は未実装。
5. 専用ACCESS部品へenrollment lookupとchallenge作成validationを追加比較。公開認証routeや第2D1は有効化していない。
6. 元画面で店舗/営業日/台データ/店舗分析/現行予測、研究/正式holdout、PRE開始/待機/実績採点/翌日予測/履歴を操作。研究受付後にタブを閉じ、local7job完了を読み出して再表示。2月20日採点後に2月21日予測確定、評価1日・trial実施中、active据置を実画面で確認。

## 確認できた検証結果

- 新正式PREの初期12件、job8件の比較：20成功0失敗。その後の実target-day judgementによる日次job統合1件も成功。
- FEATURE_BUILD全子プロセス比較5件成功、ACCESS拡張5件成功、active store-read API比較7件成功。
- 研究/holdout/native Worker対象回帰27件成功。
- native local Queue：研究7job→正式PRE開始の8番目まで完走、予測pair固定・active維持。
- 既存7条件に加え、store-read:checkpointとformal-pre:checkpointで実際のlocal V8 OOMを発生させ、永続D1/R2を開き直し、lease回復・一度だけ確定・旧正常結果保持を確認。
- 4規模（90×106、180×106、240×106、180×160）の全model・8中間値・入力/結果hash一致。正式holdoutの2モデル218行fixtureと4規模全行/状態/hashも一致。
- 新active/PRE開始の4規模の観測used heapは18.92 / 21.93 / 21.86 / 23.19 MiB。240raw入力で180valid日を使うのは元FEATURE_BUILDの仕様。現行予測240日の独立回帰は維持。
- 現行予測180×160の今回観測used heapは約92.02 MiB。安定した改善を証明していない。いずれもlocal Inspectorの観測値で、厳密peakやSites総128MB適合ではない。
- 元front：83コマンド成功、元VPS：569成功・既知の環境依存symlink検査1件失敗。元コード変更なし。
- 最初の全回帰：Sites143成功1失敗、GitHub134成功1失敗。復元したFEATURE_BUILDが既にresearch loopを作るため、旧fixtureの重複INSERTが失敗した。期待generation4/round2や元oracleを変えず、fixture初期化を既存行UPDATEへ修正し、対象5件を再実行して成功。
- その後、全コード/UI修正後の全回帰をSites/GitHubそれぞれ再実行したが、環境利用不可となり最終完了/件数/exitを取得できていない。全回帰成功とは報告しない。
- 最終build成功。生成runtime/public assetsの再生成確認も起動したが、その最終ログの回収完了は未確認。
- 取得済みGitのreachable blobを走査。固定元access-configの不正Origin拒否試験にcredential形式URLが1候補あり、固定blobを合成negative testとして確認。実credentialの混入を示すものではない。

## 新たに記録した残課題

- R-SCHEMA：Drizzle側PK not-null（active store_id/live id）とlive model_fingerprintのDEFAULT空文字に物理差。元writerは全値を明示し保存値は一致するが、厳密SQL schema同値監査は失敗のまま。成功へ読み替えない。
- R-PRE-LARGE：active snapshot/CAS期待行1.5MB超は安全に拒否。R2公開adapterは未実装。
- 180×160 feature確定のlocal最大batch1301文。host transaction/query/CPUの成立性は未証明。
- B-HOST/B-UNATTENDED/B-MEM/U-QUEUE/U-ACCESS-BINDING/U-OBSERVE/U-CAPACITYを維持。一般Cloudflare機能をSites提供とみなさない。
- PREの長期terminal採否→active採用、元daily-analysis/schedulerの定期受付、正式認証、Sync/Collector/パチンコ/全MCP/OAuth/実データ移行は残る。

## 環境中断と保存状況

Sites作業ディレクトリ /workspace/sites/jugest-port-20261027 が途中で存在しなくなった。その後、実行環境がunavailableとなり、コマンド実行とファイルの直接アップロードも「no primary turn environment」で失敗した。原因は確定できていない。

最後に存在を確認できたコードのコピー：
/workspace/scratch/8fb0797f01de/jugest-source/sites-migration

このローカル作業ブランチは上記35b3fa3をHEADに未コミット変更を持っていた。新runtime/lib、schema/migrations/generators、tests、client、4管理正本と一部v16説明資料をコピー済み。raw比較ログ/全私有evidenceは主に消失したSitesディレクトリ側にあったため、回収できなければ再実行が必要。

緊急回収先として /workspace/scratch/8fb0797f01de/v16-emergency-recovery を作り、open file descriptorからログとpublic-componentsのコピーを試みたが、完了応答を得る前に環境が利用不可となった。回収成功を主張しない。ブラウザー検証記録は /workspace/scratch/jugest-v16-browser.json、スクリーンショットは /workspace/scratch/jugest-v16-formal-daily.jpg に存在を確認した。環境停止後の再取得・共有は未確認。

保存版15の元ZIPは /workspace/scratch/8fb0797f01de/v16-source-download/JUGEST_Sites_v15_evidence.zip にCRC/hash検証済みのものがあった。これらのパスは環境復旧後に存在・内容を改めて検証する。

## 正確な再開手順

1. この中断記録とnative Sites receiptを照合。Sitesの最新確認済み実装は保存版15。存在しない保存版16へ進んだと扱わない。
2. 復旧した環境で上記public-components/作業ブランチの未コミット変更を最初に保全・検査。元1f8c29f以外のソースへ差し戻さず、保存版15の正式holdoutを作り直さない。
3. 回収コードの lib/analysis/pre-v2.mjs、pre-atomic.mjs、active-store-read.mjs、formal-pre-job.mjs、active-model-view.mjs、generated PRE/ACCESS kernels、jobs/research-cycle、schema/0017〜0019、tests/port-formal-pre/port-pre-jobs/port-feature-side-effects を確認。
4. 4管理正本とevidence/v16の残存を調べ、rawログが回収できた範囲と再実行対象を区別。元SQLite比較/実OOM/4scale/画面記録を再取得する。
5. 最終コードに対してSite全回帰、public package全回帰、元front/VPS回帰を完了。元symlink1件以外の失敗を区別。
6. 機密を除く実装コードを専用GitHub開発ブランチへ反映し、公式Sites source helperでsource/buildをpackageしてsave_site_versionのみを実行。新version番号/完全SHA/deploymentなしをreadback。
7. 全source/取得済みGit履歴/全ログ/4正本/再現手順のZIPを作成しCRC/個別SHA/Git復元を検証。永続保存先から再取得後、実際に共有できたリンクだけを報告する。

本番jugest.net/VPS/DB/domain、GitHub main/deploy-vpsは変更していない。公開・本番deploy・外部恒久基盤・本番データ/認証情報の利用は行っていない。通常開発は許可済みだが、公開は直前の明示許可まで禁止。
