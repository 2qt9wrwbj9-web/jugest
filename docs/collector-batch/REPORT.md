# JUGEST v5.1.2 Collector batch / clean jitter Preview

最初の再開時：`preview/v512-collector-batch` / `2ca6df37d4b71b4a37095c0b031692c874088597`。
baseは同じProduction commit。clean jitterの出典は
`ebfd684f5aaf697df52c2a9cc0967e901c850b4f`。

再開時はclean jitterの5ファイルだけが未コミットで、Collectorは調査まででした。
旧UIタスクのcheckpointを今回の完了証拠として流用していません。
今回、状態統合・batch API・条件付き更新・復旧・操作数計測・日本語手順を新規に
完成させました。既存のjitter修正は5ファイルとも出典commitとバイト一致です。

## 新フローと状態管理

`iosCollectorNextBatchV3` が最大5件を一括発行します。15分間隔、ページ間2秒、
leaseは20分です。`iosCollectorPushBatchV3` は成功・失敗混在の最大5結果を受けます。
成功した日の本文を既存parserで解析・検証し、compactな日別データを1つの
immutable packに保存します。その後、管理状態を1回の条件付き書き込みで確定します。

`collector-state-v3/<channel>` にconfig、index、coverage、force、job、lease、
failure、処理済みreceipt、認証情報を統合しました。ETag付きの非キャッシュ読込と
`ifMatch` を使用し、競合時は最新状態から再実行します。ETag欠落・JSON破損は
安全側で停止し、無条件上書きへ降格しません。SDK 2.8.0の実ソースで対応と
例外型を確認し、数値statusを持たないSDK例外も回帰テストに含めています。

## 互換性・安全性

- 旧config/index/job/lease/failure/coverageを初回に読み込み、旧Blobは削除せず移行。
  旧形式の日別データはfallbackで読みます。旧V2 APIも同じtransactionを通ります。
- 店舗・日付のleaseをNext時に一括確定。並行Nextは1つだけRUN、他はWAIT。
  並行PushはETagで競合を検知し、成功済みreceiptを参照して重複保存を防ぎます。
- 保存データ・index・receipt・lease解放が一緒に公開されます。保存応答が失われても
  同じbatchId/jobTokenの再送で回復。未送信jobだけがlease期限後に再発行されます。
- 失敗1件だけを既存backoff規則で再試行。成功済み日を再取得しません。
  手動requeueはforceを立て、古いtokenを無効化します。
- 店舗削除は関連状態とデータを削除。他店舗と共通のpackは残存分を再packして保持。
  未公開packも削除対象に含めます。削除失敗はjournalに残して再試行できます。
  解除後はrevocation tombstoneを保持し、旧形式の認証・データが復活しません。
- parser、店舗/date identity、台数sanity、JST、priority、複数店舗、calendar-yearは
  既存実装を使用。Device Sync API・クライアントは変更していません。
- PreviewのRelayだけ `jugest-preview-collector-v3` 名前空間を使用します。
  ProductionのCollector名前空間やBlob設定を変更せず、既存キーをPreviewで流用しません。

## 操作数（SDK境界のinstrumented store実測）

同じ1店舗・5日・各日10台の本文で比較。Advanced相当はput + list。
実Blob請求額そのものの測定ではありません。

| 5日成功 | get | put/setJSON | list | delete | Advanced相当 |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline V2 | 95 | 45 | 5 | 10 | 50 |
| V3・移行済み | 2 | 3 | 0 | 0 | **3** |
| V3・旧configからの初回移行込み | 6 | 3 | 4 | 0 | 7 |

**94%削減、満杯batch時は1日あたり0.6回相当**です。
baselineのgetが17×5より多いのは、Nextが前のjobもlist/getするためです。
上記3回はNextの状態確定、データpack保存、Pushの状態確定です。
全件失敗ならpackを作りません。重複再送・変化のないWAIT/coverage確認はputをしません。

| 365日バックフィル | 取得日数 | 満杯batch換算 | Advanced概算 |
| --- | ---: | ---: | ---: |
| 1店舗 | 365 | 73 | **219** |
| 2店舗 | 730 | 146 | **438** |
| 3店舗 | 1,095 | 219 | **657** |

初期設定・初回移行、競合/SDK再送、失敗再試行、手動再取得、cleanup、追加coverage、
Dashboard操作は別です。初回移行は旧job等の件数に応じてreadが増えます。
バックフィル後に毎日1〜3日だけ新規取得する運用は、満杯batch換算とは違い、
1日1batch×3回×365日＝**年1,095回相当**です（1〜3店舗を同じbatchで取得する前提）。
実際の「昨日〜前年同日を両端含む」範囲は366/367日になるため、365日概算と区別します。

## テスト・差分監査

- TDD：初回18件RED→GREEN、lifecycle・cleanup・SDK例外の追加RED→GREENを保存。
- 最終Collector：33件。最大5、部分/全失敗、重複、並行、lease競合、期限切れ、
  応答消失、保存失敗、force、認証更新、旧形式、旧V2、JST/閏年、priority、
  parser/identity/sanity、Launcher、削除中断、未公開データ、cleanup競合を検証。
- 既存61コマンドを維持し、Collector・操作数・差分監査の3コマンドを追加。
  合計64コマンドのfresh結果は `final-tests.log`。
- `protected-hashes.json` のProductionファイル20件を完全一致確認。
  判別数学・ranking・研究・Device Sync・現行ホーム・アイコン・FOUC・構成を維持。
  既存production-preservationも実行し、inline protected sectionsを確認。
- clean jitterの5ファイルは出典commitと完全一致。UI home/jobs 10件と
  Store Analysis evidenceの回帰を実行。診断endpoint・token転送は含めていません。

## Shortcut

具体的な日本語アクション手順、JSON、RUN/WAIT/DONE、部分Push、送信サイズ、
途中終了時の未送信ファイル案、15分時刻設定は `SHORTCUT-JA.md`。
実機を直接変更していません。

## 未検証・残存リスク

1. **実Blobは未検証**。suspensionの解除、token差し替え、public化、Production設定変更を
   行っていません。復旧後、Preview専用データでconditional-write競合、応答消失、
   移行・cleanup・実操作数を確認する必要があります。
2. **標準Shortcutsの通信例外を捕捉して、同じ起動内で残りGETを必ず続行する保証は未達**。
   APIの部分失敗は検証済みですが、実iPhoneの取得・ファイル復旧・15分Automationは
   未検証です。追加アプリ/foreground callback方式を独断で採用していません。
3. 送信JSONは最大4MB。大きいページは部分Pushが必要で、put数が増えます。
4. データpack保存直後にプロセスが消失した場合、未公開packが残ることがあります。
   indexには公開されず、再送で整合性を回復します。店舗削除/解除で回収します。
   頻繁な障害時の定期GCは今回未追加です。
5. 移行後に古いdeploymentが旧形式へ書き続ける混在運用は対応しません。
   将来のProduction切替時には旧取得を止め、旧server処理の終了を確認してから
   移行する手順が必要です。旧クライアントが新deploymentのV2 APIを使う互換性は検証済み。
6. iOS実機のスクロール・OS停止は未検証。clean fixの進捗更新・画面遷移・DOM保持は
   fresh回帰テスト、Previewでは公開UIと配信成果物を確認します。

**Production反映は未承認・未実施。上記の実Blob/実iPhone検証が残るため、
Productionへ進める判定はNO-GOです。Preview評価までで停止します。**

## 再現

```sh
npm install
npm test
node tests/collector-operations.mjs docs/collector-batch/operations.json
```

SDK依存は既存の `@vercel/blob@2.8.0` のままです。fixture時刻は
`2026-09-07T00:00:00Z`、閏年テストは `2024-03-01T00:00:00Z`。
Production baseline、commit/Preview情報はcheckpointと最終回答を参照してください。

## Preview検証の完了記録

直近の再開時HEAD：`fe719e8efbd91dc9c30080f98568434bd6363ac4`、未コミット差分なし。
最終branch：`preview/v512-collector-batch`。最終HEADはこの確認記録を保存する
文書commitです。実装commitは`4086d6a4c508cef4b1dc1cb78ebe77241c64db95`、
監査の整形対応commitは`fe719e8efbd91dc9c30080f98568434bd6363ac4`です。

Preview：https://jugest-git-preview-v512-collector-batch-cwwvc45jk6-2652.vercel.app/

検証済みimmutable Preview：https://jugest-otbeimydl-cwwvc45jk6-2652.vercel.app/

- Vercel上でも64/64コマンドPASS、READY、targetはPreview。
- 公開ホームで5.1.2／次アクション／最近の解析・実戦／小型データ状況を確認。
- app-v510.js / CSSはローカルのfresh buildとSHA-256一致。HTMLはその完全な内容の
  末尾にVercel公式Previewツールバーが1つ追加されるだけと確認。
- 無効キーによるV3 Nextの401 unauthorizedを確認。Blobにアクセスする前の経路です。
- 機密キーや実データを送信しておらず、実Blobの保存経路は未検証のままです。
- 初回Previewは63/64で停止。Vercel CLIによるvercel.jsonのcompact整形をhashで
  特定しました。設定が同じ既知の整形だけを許容し、maxDuration変更がFAILになることも
  別の一時ディレクトリで確認。リポジトリのvercel.jsonは一切変更していません。
- 最終確認時のProductionは`dpl_5tUiJP4qm5h5NoHpDSw4UKR32mLH`／指定baseline。
  main、Production alias、環境設定、Blob設定は未変更です。

変更ファイルの全一覧：`changed-files.txt`。差分はCollector、clean jitter、テスト、
この作業の文書・証跡だけです。一時展開したrelayソースは削除し、診断コードは
配信対象に含めていません。
