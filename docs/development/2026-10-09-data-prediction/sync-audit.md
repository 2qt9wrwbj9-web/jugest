# 端末同期の独立監査

監査対象は `a461a08005d8533107879813db29a57027c139b5`。実行日時は 2026-10-08 UTC（日本時間の作業日 2026-10-09）、作業ブランチは `work/data-reliability-prediction-loop-20261009`。`AGENTS.md` を確認し、本番への接続・保存データの変更・コード編集を行わず、実ソース、履歴、既存テスト、メモリ内の障害注入で調べた。本書は修正前の基準コミットの監査結果であり、以後の実装完了を意味しない。

旧問題「同じ revision を基準にした2端末の push が両方200になり、一方の payload が消える」は、append-only の revision claim で修正済み。ただし、VPSには `/api/sync` の実行経路がなく、配信UIは端末同期を表示し続ける。無条件の head 更新、64段回復後の古い読取り成功、破損を absence と扱う読取り、HTTP 200 の不正応答による成功表示は残る。

## 対象と根拠

- `api/_sync-web.js`、`api/_blob-store.js`、`api/sync.js`、`sync-core.js`
- `vps/src/relay-store.mjs`、`vps/src/web-server.mjs`、`vps/src/ui-source-patch.mjs`
- 配信挙動を確認するための `index.html`、`app-v510.js`、`vps-ui-enhancements.mjs`
- `docs/audit/sync-concurrency-known-risk.json`、`probes/sync-concurrency.mjs`
- `tests/vercel-sync-concurrency.mjs`、`tests/sync-roundtrip.mjs`、chunk transport/server tests、Blob store test、同期ライフサイクル/VPS関連テスト

下記の行番号は基準コミットのもの。編集後に位置が変わる可能性がある。

## 修正済みの問題

| 項目 | 実コードと検証結果 | 限界 |
| --- | --- | --- |
| 同一 revision への並列 push | `_sync-web.js:34–39` が `sync-commit/<id>/<revision>` を `onlyIfNew:true` で作成。`48–51` と `67–69` が claim 敗者に409を返す。既存テストで200/409を確認 | Blob側の create-if-absent 契約に依存。本番Blobへの同時書込みは行っていない |
| claim後、head更新前の中断 | `getRecord` が次の immutable commit を探す。既存テストで head を revision 0 に戻して revision 1 を回復 | 64段で打ち切る。回復した head の保存自体も無条件 |
| 保存APIのキャッシュ読取り | syncの `get` は `useCache:false`。installed `@vercel/blob@2.8.0` は private GET に `cache=0` を付ける | キャッシュ回避は無条件の head 書込みの競合を解消しない |
| 古い端末の再接続 | 実 `sync-core` 2端末を同時に revision 0 から開始すると、push基準 `[0,0,1]` で競合を統合して両方が成功（revision 1/2）。古い側を再起動して再同期すると A/B両方の稼働記録を保持 | 成功した先行端末は、次の明示的同期までは後続端末の更新を持たない。既存の明示的同期仕様どおり |
| クラウド保存後の端末IDB失敗 | 実 IDB 障害注入でエラー、`reloadRequired:true`、`lastSyncAt:0`。cloud revision 1 は保存済み。`pagehide` が旧メモリ状態で上書きしない | localStorage/IDBをまたぐ原子的反映はなく、再読込み・再同期による回復が必要 |
| localStorage容量失敗 | 実storageに `QuotaExceededError` を注入。事前保存失敗ならcloud revision 0のまま、反映時の失敗ならcloud revision 1/`reloadRequired:true`。両方ともlastSyncAtは0。`sync-core.js:183` は書込み例外を握りつぶさない | 読取りの JSON 破損は別問題として残る |

履歴は `ca2ade8`（失敗する競合テスト）、`b48cdff`（privateの一貫した読取り）、`c4ab335`（immutable revision claim）、`8b52b82`（中断後のhead回復テスト）を確認した。`docs/audit/sync-concurrency-known-risk.json` と `probes/sync-concurrency.mjs` は旧「P0-UNFIXED / 両200」のままなので、現在のコードに対する未修正判定には使えない。probeは基準コードの200/409を期待しないため、現行の安全性テストとしては失敗する。

## 残る不具合

### 1. VPSの同期経路がない（P1、VPSで機能不能）

`vps/src/web-server.mjs:102–180` に `/api/relay` 等の経路はあるが `/api/sync` はない。POSTは `182–185` の405へ落ちる。`api/sync.js` はVercel用アダプターであり、VPSのHTTP handlerから呼ばれない。`relay-store.mjs` のCAS対応も、現在のDevice Syncへは接続されていない。

配信時パッチ適用後でも `index.html:3046` の `sync-core.js`、`3009–3015` のSync bridge、`app-v510.js:461/516` の同期ナビ/共有作成/同期ボタンは残る。`vps-ui-enhancements.mjs:258–260` が隠す `.sync-setup` は heading が「自動取得」の画面だけで、端末同期画面の無効化ではない。

隔離した実VPS web handlerとパッチ適用UIで、`POST /api/sync = 405`、Sync script読込み、同期ナビ、共有作成ボタンを確認。親作業でも本番nginx設定は全 `/` をVPSへ転送し、Sync専用の別経路がないことを確認済み。この独立監査自身は本番へ接続していない。

### 2. 遅れた head 更新が最新値を後退させる（P1）

`commitRecord` の `38` と `getRecord` の `30` は、どちらも無条件で `sync/<id>` を上書きする。

再現順序:

1. Aが revision 1 の immutable claim に成功。Aのhead保存だけ保留する。
2. Bの読取りが claim 1 を回復し、revision 2以降を保存する。
3. headが70まで進んだ後、Aの保留を解除する。
4. Aも200を返すが、headは70から1へ戻る。

メモリ内の実APIで `before=70 / regressed=1` を再現した。commit 1..70 が無傷なら、古い base の新規保存は既存 claim に阻まれるため、この後退だけで新しい immutable payload が消えるわけではない。しかし読取り/メタデータが後退し、回復の負荷や失敗を増やす。回復側の古いhead保存も同じ競合を起こす。

### 3. 64段回復後に「最新を読めた」成功を返す（P1）

`getRecord:23–31` は64件だけ進め、65件目の存在を確認せずその時点のrecordを返す。上の再現では immutable最新70にもかかわらず、最初のpullが `200 / ok:true / revision:65 / ct:R65`、次のpullが70になった。

正常な連続commitが残る限り、push時の再読取りとclaimで stale overwrite は止まる。ただし、pull/metaOnly/pullChunkは古いpayloadやrevisionを成功として提供し得る。多数の未反映commitがあると `syncNow` の3回上限を使い切る。無制限の履歴走査も、1 commitにつき暗号化payload全量を読むため、容量・処理時間の解決にはならない。

### 4. 保存JSON破損を absence と扱う（P1）

`api/_blob-store.js:45–50` と `vps/src/relay-store.mjs:93–97` の `get(type:'json')` は、空文字/JSON解析失敗を `null` にする。syncは厳格な `getWithMetadata` を使わない。

実API/fake Blobでの結果:

| 注入条件 | 基準コードの応答 | 必要な扱い |
| --- | --- | --- |
| head revision 0、次commit 1を `{broken-json` にする | 200、revision 0、payload null | 破損として失敗。履歴終端と扱わない |
| head自体を不正JSONにする | 401 unauthorized | 保存領域の破損として失敗。共有コード無効と誤診しない |
| authHashは正しくrevision 1、payload nullのhead | 200、revision 1、payload null | revision > 0 のpayload欠落を不正recordとする |

claimが壊れていても同名keyが残る場合、`onlyIfNew` は上書きを止める。ただしユーザーには過去データなし/共有コード無効と見える。構文上JSONであってもrecordの型・revision・authHash・payloadを検証しない経路では、破損の種類によってローカルのみのpackageを次revisionとして正常保存できる危険がある。

`getWithMetadata` はBlob側で JSON.parse/非200/ETag欠落を例外にし、VPS側でも JSON.parse を例外にする。新しいSync実装はこの厳格経路を使い、単なる解析可能JSONではなくSync recordとして検証する必要がある。

### 5. HTTP 200の不正応答を成功扱いする（P1、成功偽装）

`sync-core.js:341–345` の `apiRaw` はJSON解析失敗を `{}` に置き換え、HTTP statusが2xxなら返す。`ok:true` や必須フィールドの検証がない。`200 / {ok:false}` も同様。

実 `sync-core` とUI bridgeに、pull/pushとも `200 / <html>proxy error</html>` を返すと、同期が revision 0で成功し、`lastSyncAt` が更新され `reloadRequired:true` になった。fake cloudは revision 0 / payload nullのままで一度も保存されていない。HTTP成功だけで「同期完了」を表示できる。

### 6. 端末内の破損/読取りエラーを同期データなしへ変える（P1）

`sync-core.js:180–182` の `readJSON` は不正JSONやlocalStorage読取り例外をfallbackにする。`readAnalysisSnapshots:242–247` はdecode/個別IDB読取りエラーを握りつぶし、存在するindex項目を黙って除外する。未対応のcodecも `decodeAnalysis:221–229` でnullになり得る。

実Sync serviceの隔離再現で、STATEを不正JSON、analysis indexに1件、該当snapshotを不正JSONにすると、同期は `revision 1 / sessions 0 / analysis 0` で成功し、STATEが正常だが空の内容へ、analysis indexが `[]` へ書き換わった。この再現はUI事前保存を迂回して実serviceを呼んだものであり、UI起動時の既存state読込み/復旧仕様全体を検証したものではない。少なくとも同期serviceが破損を安全に停止できないことは確定する。

「keyが存在しない」と「存在するが読めない/壊れている」を分け、後者はcloud pushやlocal applyの前に失敗させる。indexが存在するのにpayloadが読めない場合も、成功した0件同期にしない。

## chunk・再送・途中失敗の結果

暗号化、merge、バックアップの意味は変えず、保存/転送境界を確認した。

| 条件 | 実行結果 | 判定 |
| --- | --- | --- |
| claim成功後のhead保存例外 | HTTP500。commitは残り、headは0。次の同push再送は409、pullは1へ回復 | 現在は成功を装わず保存済みpayloadを保持 |
| 実IDB書込み失敗、cloud保存後 | エラーとreloadRequired。最終同期時刻未更新、pagehide上書き抑止 | 現在の保存ゲートは機能 |
| chunk不足のcommit | 409 `upload_incomplete`、revision未進行 | 正常 |
| 同じchunkの再送 | 200/200、最終payload一つ | 正常。ただし同indexへの異なるchunkも上書き可能な現行仕様 |
| chunk commitとdirect pushの同base競合 | 200/409、最終revision 1、一つのpayload | 両成功片方消失を防ぐ |
| cleanup済みuploadへの同commit再送 | 410 `upload_expired` | 保存結果のreceiptはない。応答消失時はpullして再同期する必要がある |
| pullChunkで指定したrevisionが古い | 409、途中の別revisionとの混合を防止 | 正常。clientのpull段階は競合を自動再試行せずエラーになる |
| 2.8M文字payloadのchunk roundtrip | server testで全量一致 | 実ネットワーク/プラットフォームの上限は未検証 |

upload TTLは20分だが、期限切れuploadの削除はそのuploadを再利用したときに限る。途中放棄したuploadの定期清掃は見当たらない。immutable commitは毎revisionにpayload全量を保存し、headにも全量を保存する。履歴数/容量を制限する清掃も見当たらない。これらは容量運用上の残課題であり、この監査で履歴削除やバックアップ仕様の変更は提案しない。

## 最小修正案

1. **既存プロトコルのままVPSに接続する。** storeを注入できる `createSyncRuntime` を `_sync-web.js` に設け、Vercelの既定exportはBlob storeを使う。VPS `/api/sync` は同じruntimeに `createRelayStore('juggler-device-sync-v1',...)` を注入する。auth、暗号化payload、action、revision、chunk方式、merge仕様は共通のままにする。既存BlobデータをVPSへ移す作業は別の必要な移行検討であり、routing追加だけで旧共有領域がVPSへ現れるわけではない。
2. **append-only claimを維持し、headだけ単調にCAS更新する。** headを `getWithMetadata` で読み、同じ/より新しいrevisionなら書き戻さない。低いrevisionならそのETagを `ifMatch` として保存。412は最新headを再読取りして限定回数だけ再評価し、無条件上書きへfallbackしない。commit保存処理と回復処理の両方から同じ単調更新helperを使う。recordのJSON破損/不正metadataも失敗させる。
3. **回復上限に達したら古いpayloadを200で返さない。** 64段後に次commitの存在を厳格に確認する。続きがある場合は回復済みheadをCASで保存して進捗を残し、`503 / recovery_limit` 等の明確な再試行応答を返す。上限をただ増やしたり無制限にしたりしない。headを単調化すれば、通常の成功した更新が大幅な回復を要する状況も防げる。
4. **成功応答を検証する。** `apiRaw` は不正JSON、`ok!==true`、actionごとの必須ID/安全な整数revision/必要なpayload・chunk項目の欠落で例外にする。失敗時はlastRevision/lastSyncAtを書かず、UIも完了表示をしない。413/容量失敗/永続化例外は失敗として維持する。
5. **同期のローカル読取りを厳格化する。** key不在だけを正常な空データにし、存在するSTATE/HANA/client JSONの破損、analysis indexの不正型、snapshotの読取り/展開/解析失敗はthrowする。個別snapshotをcatchして0件へ落とさない。同期に必要なローカル内容をすべて読めた後にcloud保存へ進む。
6. **古い監査fixtureを更新する。** known-risk JSONは修正前の証跡であることを明記するか現状へ更新し、probeは正しい200/409期待値と残る障害シナリオに合わせる。

CASを導入する前に `tests/helpers/sync-server.mjs:6` のfake Blobも `ifMatch` を正しく検証する必要がある。現行harnessはETagを返すがifMatchを無視する。`tests/vercel-blob-store.mjs:9` のfakeには検証コードがあるものの、現行テストはCAS branchの実行をassertしていない。VPS storeは `BEGIN IMMEDIATE` と同一トランザクション内のETag比較があり、既存stale ETagテストは412を確認した。

## 再現テストとして追加するべき条件

| テスト | 最低限のassert |
| --- | --- |
| direct/direct・chunk/chunk・direct/chunk同時push | 同一baseから200は一つ、敗者409。実clientのretry後はcloudに両端末の記録が残る |
| 遅延head write | claim 1後にhead更新を保留→revision 2を完了→保留解除。headのrevisionが一度も下がらない |
| 遅延した回復head write | pullの回復保存を保留→新push完了→回復保存を再開。新しいheadを上書きしない |
| 65/70件の未反映commit | pullは最新まで回復するか明確な再試行エラー。中間revisionの200を返さない |
| head/commit JSON破損、型破損、payload欠落、ETag欠落 | 401やpayload nullの成功に化けず、保存も進めない |
| claim保存前/保存後/head保存/cleanupの各障害点 | 失敗応答を区別。保存済みclaimを消さない。再送/再接続で復旧し、別端末データを失わない |
| HTTP200の非JSON・ok:false・revision欠落 | clientは例外、最後の同期時刻/完了表示を更新しない |
| STATE/HANA/client JSON・analysis index/snapshotの破損/読取り失敗 | cloud pushしない、indexを空へ書き換えない |
| real localStorage quota/IDB failure | 事前保存失敗ならpushしない。反映途中なら失敗とreloadRequired、旧RAM autosaveを抑止 |
| chunk不足/size不一致/JSON破損/期限切れ/重複/途中revision変化 | 失敗でrevision未進行、保存済みpayloadを保持、異なるrevisionのchunkを混ぜない |
| VPSで実POST `/api/sync`、パッチ適用後のUIから実Sync | SQLite storeに保存され、reload/再接続で両端末データ保持。Vercel実装も同じプロトコルで通る |

監査時の64段問題の再現手順は、`__test.pushSync/pullSync` にメモリstoreを注入し、`setJSON('sync/<id>', revision 1)` の最初の一回だけPromiseで停止する。Aのclaim後、BでbaseRevision 1..69のpushを順に成功させ、停止を解除してpullを2回行う。基準コードの観測値は `[head更新前70, 停止解除後1, pull1=65, pull2=70]`。障害のsleep待ちは不要。

HTTP200成功偽装は `tests/helpers/runtime.mjs` の `boot` と `syncHarness` で共有を作り、以後のfetchを `new Response('<html>proxy error</html>',{status:200})` に差し替えて `bridge.runDeviceSync()` を実行する。基準コードは成功するが、fake cloudのheadは0/payload nullのまま。

破損commitは `syncHarness().db` にrevision 1を正常保存したあとheadを初期recordへ戻し、`sync-commit/<id>/000000000001` の `.text` を不正JSONへ置き換える。pullが200/revision 0/payload nullになることを確認した。

ローカル破損は、共有作成後 `storage.setItem('juggler_tool_state_v33','{broken-json')`、IDB indexに `{id:'bad-snapshot'}`、payloadに `{codec:'json',text:'{broken-json'}` を入れ、実 `JUGESTDeviceSync.syncNow()` を呼ぶ。基準コードは0件同期を成功し、analysis indexを空にする。

## 実行した既存テスト

Node `v24.19.0`（AGENTSの22.13以上を満たす）で次を実行した。4つのstandaloneコマンド、22 client/lifecycleテスト、14 VPSテストがすべて成功。

```bash
# リポジトリroot
node tests/vercel-sync-concurrency.mjs
node tests/vercel-sync-chunk-server.mjs
node tests/vercel-sync-chunk-transport.mjs
node tests/vercel-blob-store.mjs
node --test tests/sync-roundtrip.mjs tests/user-flow-regressions.mjs tests/resume-flow-regressions.mjs

# vps/ から
JUGEST_ACCESS_ENABLED=0 JUGEST_PIA_ACCESS_MODE=public node --test tests/relay-store.test.mjs tests/web-server.test.mjs tests/ui-source-patch.test.mjs
```

既存のconcurrency testは「同一revisionの一方敗北」「headのrevision 0→1回復」「次revisionへの保存」を確認する。roundtrip testは2実clientの暗号化・merge・persist・reloadを順番に確認し、同時のpull/push、CAS head、64段、破損、HTTP200不正応答は確認しない。chunk transport testはsplit/joinとソースtoken、chunk server testは正常なlarge roundtripと古いbaseのpushStart拒否が中心。

監査はコードを変更しないため、`npm test`（buildでpublicを書き換える）およびVPS全suiteは実行していない。実装後はAGENTSどおり両方を実行する必要がある。

## 外部一次資料と未検証

- [Vercel Blob — Conditional writes](https://vercel.com/docs/vercel-blob)：`get/head/put` のETagと `ifMatch` で条件付き書込みでき、競合時は `BlobPreconditionFailedError`。したがって「Vercel BlobにはCASがない」は現時点の公式仕様と一致しない。
- [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)：同一pathnameの上書き禁止、allowOverwrite、conditional writeとエラー契約。
- [Vercel Blob now supports consistent reads on private storage](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage)：2026-07-14。private `get(useCache:false)` がCDNを迂回し最新writeを反映する保証。fresh pathnameもread-after-write consistent。

installed SDK 2.8.0の `dist/index.js` と型定義で、`ifMatch` とprivate `useCache:false` を実際にwireへ送ることも確認した。基準SyncコードはETag条件を使わないため、そのCAS保証は基準のhead更新には適用されない。

実Blobでの原子的create-if-absent/CAS競合・多region・タイムアウト後の実保存成否、VPS複数process間のSQLite競合/電源断耐久性、本番Safariのquota/圧縮codec/長時間同期、実プラットフォームのbody/response上限、旧Vercel Blob共有領域からVPSへのデータ移行は未検証。本番環境・暗号化/merge/バックアップ仕様は変更していない。
