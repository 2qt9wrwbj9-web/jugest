# JUGEST v5.1.2 不具合探索・修正報告

調査・検証日: 2026-09-06 UTC。Productionにはデプロイしていません。

## 1. Executive Summary

Collectorの初回連携導線が欠落していることを、現行Productionの画面と実コードの両方で確認しました。新UIから既存のRelayプロトコルへ接続し、Launcherの初回設定、コード発行・待機・成功・再読込・解除・再連携・エラー復帰を実装しました。iPhone Shortcutキーの発行・更新も、既存の別APIとして接続しています。

横断調査では、Launcher受信キューの取りこぼし、空状態での店舗追加不能、Device Syncとバックアップ復元の保存ライフサイクル、エラー後の操作不能、Undoの未接続、状態表示と説明の不一致、Production依存ビルドを修正しました。判別数学・研究ロジック・現行API・CSS・アイコンは保持しています。

**Production反映可能とは判定していません。** 同時Device Syncの上書き競合をP0として再現し、未修正で報告しています。ブラウザによるローカル画面の目視確認も、環境の接続制限により未実施です。

### Source of Truth

| 比較対象 | 確認結果・採用方針 |
|---|---|
| GitHub main | `de2460d6c3a965e18d07d90fe404ff17980eab00`。終了前にも同じSHAを確認。40ファイルをGit blob SHA・サイズで検証 |
| 現行Production | `dpl_7We6HJY7A742C72zUXwBQ9d2eKYT`。mainの上記SHA。`jugest-nv4nl3ud1-cwwvc45jk6-2652.vercel.app` |
| 基準artifact | `JUGEST_v5.1.2_VERCEL_BLOB_PREVIEW_READY.zip`。旧UIから機能が孤立した経緯、既存テスト、プロトコルの参照として使用 |
| 実行コード | mainの旧buildはProductionから実行ファイルをfetchしており、repo内のpayloadが実行元ではなかった。Productionで配信されている完全なファイルを採用し、rootに固定 |
| 差異 | artifactのappには現行FOUC gateがなく、indexのアイコンURL・ブランド画像も異なる。現行Productionを保持。CSS/core/HANA/missing-inference/Launcher/single-day/relay-bridge/manifestはartifactとProductionで一致 |
| 再開時 | rootのindex.htmlが55,296 bytesで切れていた。直前の成功buildの469,177 bytesの**完全一致する先頭部分**だったため、その完全版から復元。ほかの差分は維持 |

バイト比較は `source-comparison.json`、`baseline-hashes.json`、`resume-recovery.json` に記録しています。

## 2. 発見した不具合一覧（P0〜P3）

| ID | 重要度 | 実際の問題 | Root cause | 対応 |
|---|---|---|---|---|
| F01 | P0 | 同期後の再読込時にリモートから保存した稼働記録が旧メモリ状態で上書きされる。直前の入力も同期対象から漏れる | sync-coreはlocalStorageを読み書きするが、UI/coreの遅延保存・pagehide/beforeunloadと連動していない | 同期前flush、反映中保存gate、再読込まで編集を停止。失敗前/反映中を区別 |
| F02 | P0 | 復元の退避に失敗しても上書きを続行。途中のIDB失敗後は保存gateだけ残り、編集が保存されなくなる | PRE_RESTORE_KEY保存の成否を無視。部分反映エラーにreloadRequiredがない | 退避失敗時は中止。途中失敗は全画面で再読込導線を表示し編集を停止 |
| F03 | P0 | 2端末同時同期で両方が成功したのに、クラウドには片方の更新しか残らない | pushSyncのrevision確認とBlob書込が非原子的。読み出した同じrevisionから両方が無条件上書き | **未修正。実コード+メモリBlobで再現** |
| F04 | P1 | 初回Collector/Launcher連携に到達できない | 新UI/bridgeにcreatePairがない。旧relayCreatePairは削除済みrenderRelayPanel/relaySetStatus等に依存 | 既存APIを新UI/bridgeから接続 |
| F05 | P1 | iPhone Shortcutキーの新規発行・更新に到達できない | createIosCollector/rotateIosCollectorKeyが旧UIに孤立 | 同一channelの既存キー更新を再利用 |
| F06 | P1 | Launcherが送ったデータを新UIの「新着取込」で取り込めない | 新handlerはcollectorPullだけ。sendが作るreceive/ackキューを読まず、pending判定にも含まれない | Collector日数とLauncher件数を分離。両経路を取り込む |
| F07 | P1 | 店舗が0件だと最初の取得URLを登録できない | 既存行の編集しかなく、新規店舗名の入力がない | 店舗追加editorを既存upsertへ接続。初期OFFを保持 |
| F08 | P1 | ローカル修正をbuildしても古いProductionファイルが出力され得る | build.mjsが毎回Productionへfetch | 現行runtimeをrootに固定し、ローカルからbuild |
| F09 | P2 | エラー後の画面がエラー表示だけになり、再試行できない。店舗保存/復元のbusy表示も残る | renderWorkspaceの早期return、finally後の再render不足 | 現画面にエラーバナーを重ね、busy解除後に描画 |
| F10 | P2 | 「復元前に戻す」が無反応。説明は全データが戻るように読める | onClickはundoを渡すがrunBackupはsaveだけ。既存Undoは通常データのみ | bridge.undoRestoreへ接続。店舗データ/解析履歴は戻らないと明示 |
| F11 | P2 | 未確認・未連携でも「正常」「取得エラーなし」、ON設定だけで「稼働中」と表示。復帰後に古い通信エラーが残る | ローカル設定とサーバーの確認済み状態を区別していない | checkedAt/error/pairState、起動・pageshow・visibilitychangeで確認、pendingだけpolling。成功時に一時エラーを消去 |
| F12 | P2 | Launcherを初めて使う人が登録方法に到達できない。旧配布bookmarkletにはNetlify固定URLがある | 旧setup導線の削除。配布テキストが古い | 現画面originから同じ既存loaderを生成し、Safari登録手順を表示。Launcher本体は変更なし |
| F13 | P2 | 同期の部分反映エラー後、履歴の「戻る」で復旧ボタンが隠れる | popstateが同期中/再読込必須状態を無視 | 履歴操作にもgate。再読込ボタンを共通領域へ配置 |
| F14 | P3 | clipboard APIがない環境でも「コピーした」と出る | optional chainingのundefinedをawaitして成功扱い | 成功を実確認。不可なら表示コードの長押し案内 |
| Q01 | 検証欠落 | 旧server-parityが両側nullでもPASSし、packed relay本体を比較していなかった | 関数抽出ロジックと比較対象の誤り | payloadを展開し、実関数20 Relay+8 Syncを比較。未検出は必ず失敗 |

## 3. Collector連携問題のroot cause

旧 `relayCreatePair` は存在しますが、UI刷新で削除された描画・通知関数に依存しています。旧関数をそのまま呼び戻すと実行時エラーになります。新UIは `refreshCollector` / `receiveCollector` しか提供せず、bridgeも初回ペアリングの操作を公開していませんでした。

実際の既存フローは以下です。

| 段階 | 新UI/handler → bridge/core | 既存API → 保存先 |
|---|---|---|
| 発行 | runCollectorAction('pair') → createCollectorPair → v510CreateCollectorPair | createPair → private Blobのchannel/pair code。receiver情報は既存 `jugglerRelayReceiver:v1` |
| Collectorで入力 | ana-launcher.jsの「設定判別ツール連携」→ relayPair | claimPair → senderToken。アナスロoriginの既存 `jugglerRelayLink:v1` |
| 待機・復帰 | refreshCollectorStatus / 3秒pending polling / pageshow / visibilitychange | pairStatus。成功したlinked状態を同じreceiverレコードへ保存 |
| Shortcut方式 | createIosCollector / 同じchannelのキー更新 | createIosCollector / rotateIosCollectorKey。6桁方式とは別の既存設計 |
| 新着確認 | refreshCollector → v510RefreshCollector | collectorStatus + peek。日数とメッセージ件数は別表示 |
| 取り込み | receiveCollector → v510ReceiveCollectorSources | collectorPullとreceive。既存normalizer/importer → IndexedDB・通常状態保存 → ack |
| 解除 | unlinkCollector → v510UnlinkCollector | 既存unlink。サーバー未取込データ・取得設定が消える既存仕様を確認表示。取込済み端末データ/Device Syncは維持 |

pending codeは再読込後も維持し、期限内は同じcodeを使います。期限切れ再発行前はpairStatusを再確認し、Safari停止中にclaim済みになったchannelを置き換えません。401は無効な連携、通信失敗は再試行可能な状態として扱います。解除後は新規発行へ戻ります。API/protocol、保存キー、DBバージョンは変更していません。

## 4. 実装した修正

- 初回連携・待機・解除・再連携、Shortcutキー、Launcher登録手順を追加。現在のoriginだけを使います。
- Launcherのreceive/ackを接続。既存保存処理の成功前にackしません。collectorPullの既存処理は保持しました。
- 空状態の店舗追加、常時再試行可能なエラー表示、Undo接続、正確な状態文言とコピー失敗案内を追加しました。
- Device Sync開始前に現在の入力を保存し、クラウド反映後の古いメモリによる自動保存を抑止。反映前の失敗では通常操作へ戻し、部分反映後は再読込を要求します。
- バックアップ復元も、現在の入力と退避保存を確認してから進め、部分失敗後の編集を止めて再読込へ誘導します。複数ストレージの原子的復元は実装していません。
- buildをオフラインで再現可能にしました。現行アイコン生成とFOUCコードは維持しました。
- 歴史的Netlifyファイルは `tests/fixtures/legacy-netlify/` のみに配置。rootにNetlify設定・実行関数を置いていません。Vercel APIの現行実装は変更していません。

## 5. あえて修正しなかった事項

**F03 同時同期のP0:** 実際の `_sync-web.js` と `_blob-store.js` に対し、同じbaseRevision=0の2要求を同時に実行すると、両方200/revision=1で成功し、最終payloadは片方だけになりました。これは成功条件のテストではなく、未修正リスクの再現記録です。`probes/sync-concurrency.mjs` と `sync-concurrency-known-risk.json` に残しています。

クライアントのbusyや1プロセス内のlockでは、別端末・別Vercel Function間の競合を防げません。次の修正では、現行SDKとPrivate Blobが提供する条件付き更新の保証を調査し、競合時の再mergeを含めたサーバー側の直列化を設計する必要があります。今回、独自のlockレコード、ストレージ移行、schema変更は追加していません。schema変更が必要と判明した場合は、その理由・migration・riskを別途提示する方針です。

また、localStorage/IndexedDBを跨ぐSync/完全復元の途中失敗を全体rollbackする仕組み、既存Undoを完全バックアップUndoへ拡張する変更は行っていません。部分反映を隠さず、復旧導線と保護gateを追加する範囲に留めました。

旧UIの孤立関数や歴史的コメントの一括削除、判別数学、strict Champion、Calibration、store-share constraint、Juggler/HANA式、HANA hard constraints、単一根拠エンジン、Ranking/Store Strength/Regime/Evidence Trustの実験には手を加えていません。

## 6. 変更ファイル

動作変更は `app-v510.js`、`index.html`、`sync-core.js`、`build.mjs`、`package.json` の5ファイルです。

GitHub mainにはruntimeソースが無かったため、修正対象を含む12ファイルを現行Productionから固定しています。そのうち `app-v510.css`、`core-v510.js`、`hanahana-judge.js`、`missing-inference.js`、`ana-launcher.js`、`ana-single-day.js`、`relay-bridge.html`、`site.webmanifest`、`assets/jugest-mark.png` はProductionと同一です。

追加・更新テスト、歴史的fixtureの移動、調査probes、証拠は `CHANGED_FILES.txt` を参照してください。実際に調査した主要ファイルと18観点の横断確認は `REVIEWED_FILES.md` に記載しました。純粋な修正差分は `runtime-fixes.diff` です。mainとの差分ではProductionソース固定分も新規ファイルとして見えます。

## 7. 新規/更新テスト

- `user-flow-regressions.mjs`: 実際のindex/bridge/appと実Relay payload、メモリBlobで14件。
- `home-collector-status.mjs`: 未確認/失敗/Launcher新着の表示1件。
- `resume-flow-regressions.mjs`: 初回loader、履歴、エラー回復、Undo説明、FOUC3経路、復元途中失敗、退避保存失敗の7件。
- `sync-roundtrip.mjs`: 実sync-coreと現行APIを使った2端末の暗号化・merge・保存・再読込1件。
- `production-preservation.mjs`: アイコン/数学/APIのハッシュ、4区間のinline不変性、build出力一致の3件。
- `vercel-server-parity.mjs`: 展開した実コードから関数を取得。比較不能時にFAIL。
- `run-regressions.mjs` / `commands.json`: artifactの既存52コマンドと今回の動作テストをまとめて実行。Netlifyの旧テストはfixture参照に限定。

新規動作テストは計26件。追加修正の前に再現テストのFAILを確認し、修正後にPASSを確認しています。FOUCは既存成功動作を保護するテストのため、修正前FAILを要求していません。未修正競合のprobeは回帰PASS数に含めていません。

## 8. 実行したテストと結果

| 実行 | 結果 |
|---|---|
| `npm test` | **53/53コマンドPASS**。既存52 + 新規動作テスト26件のグループ |
| `node --test tests/production-preservation.mjs` | 3/3 PASS。fresh buildを照合 |
| `node probes/sync-concurrency.mjs` | 未修正P0を再現。2成功・同一revision・片方だけ保存 |
| `git diff --check` | PASS |
| appで名前指定しているbridge呼出しの横断検査 | 89メソッドが実bridgeに存在。これは存在確認であり、全メソッドの動作保証ではありません |

`final-tests.log`、`final-preservation.log`、`verification.json` が最終結果です。旧artifactのnpm test定義全体を実行しました。そこに含まれない過去版の手動ブラウザ/探索用スクリプトまで全件実行した、という意味ではありません。

## 9. build結果

`npm run build` 成功。さらにfetchを禁止する事前読込で `node build.mjs` が成功し、Productionへの依存がないことを確認しました。出力runtimeとrootソースのバイト一致、アイコンのProductionハッシュ一致も確認しています。

証拠: `final-build.log` / `final-offline-build.log`。Node v24.19.0。依存追加なし。実クラウドBlobへテスト書込みなし。

## 10. 残存リスク

- **未修正P0: Device Syncの同時書込競合。** クラウドで欠けた更新が次の同期で再統合される可能性はありますが、成功応答時の完全性は保証されません。
- Sync/復元の複数ストレージに跨る原子的反映は未実装。今回のgateは途中状態の隠蔽・旧メモリ上書きを防ぐためのものです。
- この環境のブラウザは `http://localhost:4173` を `net::ERR_BLOCKED_BY_CLIENT` で拒否。ローカルUIの目視・Safari実機操作は未実施です。操作テストはVM上の実コードと最小DOM/保存fixtureです。
- Private Blob SDKの実ネットワーク動作・Vercel Previewの認証/CORS・実iPhone Shortcutの自動実行は今回実行していません。現行APIのバイトを維持しています。
- 旧Netlify bookmarkletはユーザーのSafari内に残る場合があります。アプリ側の新setupで登録し直す必要があります。Netlify fallbackはありません。
- 既存ユーザーのIndexedDB/localStorage/Blobデータは触っていません。schema/DB version/storage key変更なし。

## 11. Production反映前に人間が確認すべきポイント

1. F03のサーバー同時書込対策を別途レビューし、2端末同時同期で片方が失われないことを確認する。
2. 独立したPreview用Blob/テスト端末データで、初回連携→Launcherの6桁入力→新着取込→再読込→解除→再連携を通す。解除時は未取込サーバーデータが消える既存仕様を確認する。
3. iPhone Safari/PWAでタブ切替・画面ロック・復帰・戻る・再読込、狭い画面でのcode表示とコピー、FOUC、現行ホームアイコンを確認する。
4. Shortcut方式でキー発行/更新と既存RUN/WAIT/DONEオートメーションを検証する。画面のON設定だけではiPhone上の定期実行は開始されない。
5. バックアップを取ったテストデータで、Sync/復元の成功・通信失敗・保存容量不足を確認する。完全復元前のバックアップを保持する。
6. 採用する差分とProductionの最新SHAを再比較する。今回の変更はmainへmergeせず、Production deploy/promotionを実行しない。反映はユーザーの明示許可後に別作業で行う。
