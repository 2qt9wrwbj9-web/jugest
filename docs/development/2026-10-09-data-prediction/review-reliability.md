# データ取得・保存・同期の実装後独立レビュー

監査日: 2026-10-08 UTC（2026-10-09 JST）。作業ブランチ: `work/data-reliability-prediction-loop-20261009`。基準: `a461a08005d8533107879813db29a57027c139b5`。初回レビュー対象HEAD: `83a85a0`。以下は修正担当へ通知した時点の実装に対する所見であり、その後の修正完了を表すものではない。

`AGENTS.md` と今回のspec/plan、修正前の `sync-audit.md` を読み、実ソース、パッチ適用後UI、実SQLite、隔離HTTPサーバー、別OSプロセスで検証した。本番へ接続・変更・デプロイしていない。判別・研究の数学、暗号化、統合規則、実装ファイルを編集していない。レビュー文書のみ作業ツリーへ追加し、コミットしていない。

**初回判定: 修正が必要。** 旧監査のCAS、VPS同期経路、64段打切り成功、JSON解析失敗の成功偽装は改善している。一方、完全な差枚の消失、PIA欠損後の再試行停止、分割送信の不正応答による成功、端末破損の空データへの置換、配信UIからの破損停止迂回を実際に再現した。既存テストの成功だけでは今回の完了条件を満たさない。

## 修正を要する所見

| ID | 優先度 | 問題 | 主な位置（初回レビュー時） |
| --- | --- | --- | --- |
| R1 | P1 | 完全な差枚を持つ既存日が欠損再送で置換される | `vps/src/ingest/canonical-ingest.mjs:66–70` |
| R2 | P1 | PIAの差枚欠損を当日完了と扱い再試行を止める | `vps/src/collectors/pia-public.mjs:206–210`, `pia-scheduler.mjs:15–16` |
| R3 | P1 | `pushCommit` の不正revisionを成功にする | `sync-core.js:353–355,369–372,409–415` |
| R4 | P1 | IDB外部資料の型破損を0件へ変えて上書きする | `sync-core.js:281,301` |
| R5 | P1 | 配信UIの事前autosaveがSTATE破損検査を迂回する | `index.html:721–726,2827–2834` と配信パッチ適用UI |
| R6 | P2 | Relayが取得元の検品メタデータをcanonical検品へ渡さない | `vps/src/relay-handler.mjs:67–71` とRelay `compactCollectorDay` |

### R1: 既存完全値の保護が検品フラグへ依存する

`inspectDay` は差枚欠損でも必須カウンタが揃っていれば `eligibleForAnalysis:true` を返す。受入保護は `previousCheck.status==='complete'` の場合だけ、現在の `status!=='complete'` を拒否する。

移行前の既存日には `store_day_integrity` 行がない。migrationはテーブルを作るだけで既存日を検品しない。また、実Relayの初回日は取得元の期待台集合がなく、全台の数値が揃っていても `status:unverified / quality_status:valid` となる。どちらも同台集合の差枚欠損再送を拒否しない。

隔離SQLiteへ2台・差枚 `[100,200]` を保存し、移行前状態を再現するため検品行を除去した。同じ2台の差枚 `null` を再送すると、`accepted:true / status:partial / eligibleForAnalysis:true` となり保存値は `[null,null]` へ置換された。検品行が `unverified` の場合も同じ受入条件になる。

最小修正は既存canonical rowsから既存日の検品を求め、完全フラグがなくても識別・必須数値・差枚の欠損増加を検出して拒否すること。取得元が明示した正式な台構成変更は別に判定し、単純な最大台数固定へ変更しない。拒否時は元資料と検品receiptを保持する。

### R2: 欠損のあるPIA日が再試行対象から外れる

新normalizerは `difference:null` を0と分けて保持するが、collectorは `eligibleForAnalysis` だけで成功を決める。差枚欠損日は `partial / eligibleForEvaluation:false` でもbaselineを現在snapshotへ進める。schedulerは `last_snapshot_date===JST今日` だけで `done_today` を返すため、その日内に完全値が公開されても再取得しない。

30行rolling履歴1台のfixtureをseedし、翌日の追加行の差枚だけを `null` とした。実結果は `status:ingested / integrity.status:partial`、`last_snapshot_date:2026-10-09`、`last_ingested_date:2026-10-08`。40分後の判定は `attempt:false / reason:done_today`。差枚欠損を残したまま30分再試行が終了する。

最小修正は完全・評価可能でない取得を当日完了と扱わず、前回の差分baselineを保持すること。途中観測をcanonicalへ保存しても、collector stateは検品待ちとし完全snapshotへの再試行を継続する。無根拠な日付推定やアクセス頻度増加は不要。

### R3: 分割送信だけ保存revisionの検証を欠く

direct `push` の応答は `revision===baseRevision+1` を検証するが、`pushCommit` は安全な非負整数だけを検証する。元のpush baseは `api` 内に残っているがcommit応答との比較に使用されない。

実clientに200万字の稼働メモを持たせると分割経路へ進む。`pushCommit` のみHTTP200 `{ok:true,revision:0}` を返し実commitを実行しないfetchを注入した。clientは `revision:0 / sessions:1` の成功と `lastSyncAt>0` を返したが、cloud headは `revision:0 / payload:null` のままであった。direct経路用の新しい応答検証とテストではこのケースを止められない。

最小修正は分割経路のcommit後に元pushの `baseRevision+1` と応答revisionを照合し、不一致ではapply・同期時刻更新を行わないこと。メタデータ、各chunk ACK、最終ACKを検証する対象テストを追加する。

### R4: local JSON構文検査だけではIDBの型破損を止められない

`const externalDays=arr(await idbGet(EXTERNAL_KEY))` は、存在する非配列値を空配列へ変える。成功後の `idbPut(EXTERNAL_KEY,arr(pkg.externalDays))` が元値を消す。IDB index/snapshotについて追加された厳格検査はexternalDaysへは適用されない。

IDB `externalDays` に `{0:{shop,date,machines:[...]}}` を置いた実serviceは `revision:1 / externalDays:0` で成功し、同keyを `[]` へ上書きした。STATEのコレクション、HANA/clientのJSON型についても、解析可能JSONと期待構造の違いを検査する必要がある。

最小修正はkey不在だけを空として許容し、存在する非配列/非対応構造はthrowすること。既存のmerge規則を変えず、読取り境界で構造を検証してからcloud保存へ進む。

### R5: UIから起動すると破損検査より先に空のRAM状態を保存する

`restoreSavedState` はSTATE破損を復旧必須状態として保持しない。`v510RunDeviceSync` はservice呼出し前に `autoSaveState` を行う。起動時にSTATEを復元できず既定値のままでも、このautosaveで壊れた原文を正常な空状態へ置換するため、新しい `readJSON` の例外を迂回する。

`patchJugestIndexSource` 適用HTMLで共有設定済みstorageを再起動し、STATEを `{broken-existing-state` とした。同じbootの `JUGESTDeviceSync.syncNow()` はrejectし原文を保持したが、`bridge.runDeviceSync()` は `revision:1 / sessions:0 / reloadRequired:true` で成功。STATEは `sessions:[]` となり、push1回・lastSyncAt更新を観測した。元ソースだけではなく実配信パッチ後でも問題が残る。

最小修正は起動時の読取り失敗を保持し、その状態ではautosave・同期前保存を抑止すること。バックアップ確認/明示的復旧が完了するまで元値を維持する。serviceだけでなくUI bridgeを使う再起動テストが必要。

### R6: Relayのsource diagnosticsが検品記録に残らない

Relayはparser結果を `compactCollectorDay` で保存する際、quality全体を落とす。canonical hookは `saved.day` を渡すため、取得元の `duplicateRows / conflictRows / invalidRows / candidateRows / publicationStatus / expectedMachineKeys` が存在しても受け取れない。正規化後の台集合だけを検品するので、parserが既に統合・除外した行を検品履歴では確認できない。

実HTTP `iosCollectorPushV2` へ同一台の2行を含む3行のrawを送った。応答qualityは `duplicateRows:1 / candidateRows:3 / totalMachines:2` と警告を示したが、Relay保存dayはquality無し。canonicalは `quality_status:valid / duplicateKeys:[]`、receiptも `duplicateKeys:[]` でsource重複の記録がなかった。raw原文自体は保存されている。

最小修正はVPS canonical受入hookで `day:{...saved.day,quality:result.quality}` を渡し、`inspectDay` がsource diagnosticsを正規化後の重複と別に保存すること。hookの `result.quality` は今回の実応答に存在するため、保護されたpacked/minified bundleや既存parserの統合規則を直接編集しなくても回復できる。sourceが示していない期待集合を `totalMachines` から生成してはならない。同一台の重複をどう受け入れるかは、既存parser意味と今回の検品要件を区別して評価する。

## 実効性を確認できた保護

| 条件 | 結果・評価 |
| --- | --- |
| SQLiteに対する同baseの2同期push | 新既存テストで200/409。revisionは1 |
| 遅延head write | 実SQLiteの新既存テストで、新しいheadを旧revisionが上書きしない |
| 別々のOSプロセスによるifMatch write | 両processが同じETagを読み、同時writeで200/412。storage CASは実効 |
| 70件の未反映commit | 新既存テストで200/revision70。64段の中間成功は解消 |
| 破損したcommit JSON | 実SQLite経路で500/ok:false。absenceや空成功へ変えない |
| claim保存後にhead write失敗、プロセス終了 | 次の新OSプロセスで200/revision1/元payloadへ回復 |
| canonical raw保存/解析登録失敗 | 対象既存テストで旧rows/jobsを維持し失敗として応答 |
| 既存complete dayへの台欠損再送 | 対象既存テストで拒否。R1の検品未確認日/フィールド欠損は別途未保護 |
| sourceが明示した期待台集合変更 | 対象既存テストで2台→1台の正式変更を受入。歴史最大台数で固定していない |
| PIAのほぼ完全なrolling差分 | 対象既存テストでnot-ready、baselineを進めない。R2の差枚欠損は別 |
| 同時PIA tick | 対象既存テストでSQLite durable claimによりネットワーク1回 |
| VPS分割client同期・HTTP server再起動 | 200万字メモを保存、server作り直し後の別clientで保持。revision1→2、pullChunk4件 |
| VPSの入力上限 | payload上限超過400、5,700,001 byte bodyは413、chunk総容量超過400、head revision0維持 |
| chunk欠落・期限切れ | `409 upload_incomplete` / 410。head revision0とpayload nullを維持 |
| chunk commitとdirect pushの同base競合 | 実VPS HTTP経路で200/409、revision1 |
| 200非JSON、HANA不正JSON、analysis payload欠落 | 新client既存テストで同期時刻を成功更新せず失敗 |

`web-main.mjs:47–54` が本番用web-serverへrelayDbPathを渡し、`web-server.mjs:90,106–109` が同SQLite storeを使う `/api/sync` runtimeへ接続する。隔離実行はこのHTTP handlerと配信パッチを使用した。本番リリースへ変更が反映されたことや本番保存先での稼働を確認した意味ではない。

## reviewed-sync.patchと保護ハッシュの評価

新helperは歴史ハッシュの値そのものを変更せず、patchのafter側とcurrent sourceを各hunkで完全照合してからbefore側へ戻し、従来ハッシュ検査へ渡す。初回対象の `api/_sync-web.js` と `sync-core.js` の両方について、復元後全文が `git show a461a080:<file>` とbyte一致することを確認した。

hunk内へ未承認コメントを入れた文字列はhelperのassertで拒否された。hunk外へ追加した文字列は復元後ハッシュが基準と異なった。`collector-preservation.mjs` は20 protected hashesを成功確認した。したがって、**現時点のpatch/helperは単に期待ハッシュを合わせる偽検証ではない。** 数学・merge関数を含むpatch外のbyteは引き続き保護される。

ただしpatch自体が例外許可の信頼根であり、sourceとpatchを同時に編集すれば許可範囲を広げられる。将来のpatch更新も独立レビュー対象にする必要がある。この保護テストは許可された同期変更の動作正しさを証明しないため、R3/R4/R5のような障害検証が別途必要。

`tests/helpers/sync-server.mjs` および既存chunk/concurrency fake Blobは `ifMatch` を無視する。これらの成功だけをBlob CASの証明としては使えない。今回のVPS新テストと別OSプロセス検証は実SQLiteのETag比較を通している。installed `@vercel/blob` の実装と `_blob-store.js:25–28,56–60` にはorigin読取り/ETag/ifMatchの転送があるが、live Blobとの同時writeは本レビューでは実行していない。

## 実行した検証と証拠

Node `v24.19.0`。既存テストを全件繰り返さず、対象のみ実行した。

```bash
# repo root: 4/4 tests PASS
node --test tests/sync-client-safety.mjs tests/sync-roundtrip.mjs

# vps/: 32/32 tests PASS
JUGEST_ACCESS_ENABLED=0 JUGEST_PIA_ACCESS_MODE=public node --test \
  tests/data-integrity.test.mjs tests/sync-durability.test.mjs \
  tests/pia-public-collector.test.mjs tests/pia-scheduler.test.mjs \
  tests/relay-canonical-ingest.test.mjs

# 20 production protected hashes等 PASS
node tests/collector-preservation.mjs
```

隔離証拠は `/workspace/scratch/2f9e5eaabf52/reliability-review/` に作成した。`reproduce.mjs/.log` はR1–R4、`ui-storage-reproduce.mjs` と `ui-storage.log` はR5、`relay-quality.mjs/.log` はR6。`native-sync.mjs` / `native-sync-child.mjs` / `native-sync.log` はHTTP分割同期・真のOSプロセス再起動・別process CAS、`native-bounds.mjs/.log` は上限・chunk欠落/期限・direct/chunk競合を記録する。`client-tests.log` と `vps-tests.log` は対象既存テストの結果。scratch証拠の再現fixtureは合成データだけで、本番生データ/秘密情報を含まない。

R1–R6の再現scriptは「レビュー時の不具合が存在すること」をassertする診断用scriptであり、成功終了を製品の合格判定と扱ってはならない。修正後は期待値を安全側へ変更した回帰テストで個別に再検証する。

## 残る検証境界

保存先はWAL / `synchronous=NORMAL`。今回確認したのはHTTP server再起動とOSプロセス終了後の回復であり、OSクラッシュ・停電時の最後のwrite耐久性を保証しない。raw archiveのfsync、live private BlobのCAS/read-after-write、実Safari quota/圧縮codec、多regionのタイムアウト、本番共有領域の移行は本レビューの検証範囲外。

APIのbody/payload上限は確認したが、append-only commit保存全体の総容量・保持期限は別の運用課題として残る。body制限だけで長期の総保存容量が制限されるわけではない。修正済みと未確認、本番稼働と隔離fixtureの成功を区別して最終報告する。

初回P1所見は修正担当へ通知済み。修正後にR1–R5を個別再確認し、R6のメタデータ保存を確認するまでこのレビューを完了扱いにしない。

## 2026-10-09 UTC 修正後の最終独立再確認

再確認対象は `d1317d0724859b0a337612cd418f2a16f3e171be` と、その後同じ作業ブランチへ加えられた修正。実装担当とは別に、安全側の期待値を使う隔離fixtureで再実行した。元の不具合の存在をassertする初回scriptの成功を、修正完了の根拠には使っていない。本番・認証・生データ・外部取得へ接続せず、実装ファイルと数学・統合関数は変更せず、buildや全体回帰も実行していない。全体回帰はroot担当が実施する。

### 対応を確認した初回所見と追加所見

| 対象 | 修正後の実証 |
| --- | --- |
| R1: 未移行/未確認日の差枚消失 | 検品行なし、および `unverified` の既存日の欠損再送を拒否。既存差枚 `[100,200]` と元行を維持。既存37件の対象テストで訂正の1回反映・同一再送の重複なし・明示された台集合縮小の受入も確認 |
| R2: PIAの差枚欠損後に再試行停止 | `partial` は `not_ready`。snapshot baselineは `2026-10-08` を維持し、40分後は `attempt:true / due`。完全な資料が来る前に当日完了へ進めない |
| R3: 分割保存の誤ACK | `pushCommit` の古いrevisionを拒否し、cloud revision0/payload null、端末lastSyncAt0を維持。さらに実際のHTTP200応答を改変し、`pushStart` の台数不一致、`pushChunk` のindex不一致、commitの未来revision、`pullChunk` のrevision不一致の全4ケースを拒否 |
| R4: IDB外部資料の型破損 | 非配列の既存値を拒否し、元値を維持。配列内部のshop欠損、date欠損、実在しない日付、machines型破損、null行も、2回連続の同期で各々reject・push0・lastSyncAt0。`postcheck-extra.log` の「2回目に0件へ消失」は修正前証拠であり現状では再現しない |
| R5: 構文破損STATEのUI迂回 | 実配信パッチ後の再起動でdirect serviceとUI bridgeを双方reject。原文 `{broken-existing-state` を維持、push0・lastSyncAt0。後述の解析可能JSON内部の型破損は追加で検出し修正後再確認対象とした |
| R6: Relayのsource検品情報消失 | 実HTTPの3候補行→2台正規化で `sourceDiagnostics.duplicateRows:1 / candidateRows:3` がcanonical検品とreceiptへ残る。正規化後 `duplicateKeys:[]` と区別して記録。compact Relay day自体にqualityが無いことを、canonical hookでの明示的な受渡しにより補う |
| 正規cmpData形式の互換性 | UI autosaveが実際に作る `{my:[],…}` のobject mapを許容し、配列と誤認しない。再起動を挟んで同期revision1→2を確認 |
| 明示backupによる修復路 | 壊れたSTATEを自動保存しないまま検証済みbackupをrestore。`juggler_pre_restore_v1` へ元の破損原文をbyte同等で退避し、再起動後にbackupの稼働メモを維持してrevision1へ同期 |
| 同機種の取得元別名 | canonical機種 `my` のまま `マイジャグラーV` → `マイジャグラー5` と表示名だけ変えた差枚欠損再送を拒否し、既存差枚100を維持 |

R6のsource重複を正規化後の重複と同じ意味に扱ったり、sourceが示していない期待集合をtotalMachinesから生成したりしていない。差枚・設定推定・ランキング・研究の式を変更した結果でもない。

### 保存・同期・再起動と容量不足

実VPS HTTP handlerへ200万字メモを分割保存し、HTTP serverを閉じて新しいserverと新clientから再同期した。revision1→2、upload chunk8回・download chunk4回でメモ全200万字を維持。別OSプロセスでcommit claim保存後のhead失敗を発生させ、プロセスを終了し、新OSプロセスのpullでrevision1/元payloadへ回復した。同じETagを読んだ別々のOSプロセスのSQLite writeは200/412となり、同baseのdirect/chunk commitは200/409でrevision1となった。fake BlobのifMatch無視をCAS成功の根拠にはしていない。

payload上限超過400、body 5,700,001 byteで413、chunk総容量超過400、欠落chunkは409 `upload_incomplete`、期限切れuploadは410。これらの失敗ではhead revision0/payload nullを維持した。

canonical SQLiteの `PRAGMA max_page_count` を現在の80pageへ制限し、200万字を含む訂正を保存しようとした。実際の `database or disk is full` を受け、既存machine rows/store_days/jobs/receiptsが全て完全一致で維持された。host全体のディスクを埋める操作は行っていない。raw保存失敗・解析登録失敗の対象既存テストも旧canonical行とジョブの維持を確認した。

localStorageの復元前退避keyだけにquota失敗を注入すると、restoreは退避失敗を返し、破損STATE原文を維持した。IDB write失敗を注入したrestoreは `reloadRequired:true` の失敗を返し、退避原文と旧外部資料は維持した。STATEが先にbackup内容へstageされるため、**backup復元の複数保存先は一つの原子的取引ではない**。成功に偽装せず、退避とbackupから再試行できる範囲を確認した。

同期でもcloud commit revision1の後にIDB write失敗を注入するとclientはrejectし、旧外部資料とlastSyncAt0を維持した。書込可能へ戻して再試行するとrevision2となり元の稼働メモ・外部資料を保持した。cloud保存と端末の反映は原子的ではなく、cloudだけ成功した失敗から既存merge規則で回復する設計である。

### 追加レビューで検出した不備

1. **R5追加・P1:** STATE全体が解析可能JSONでも、`data:'damaged-original-map'` のように入力マップだけ壊れた場合、当初のUI gateは検査せず事前autosaveで空mapへ置換した。direct serviceはrejectする一方、UI bridgeはrevision1/lastSyncAt更新で成功した。top-level map検査の修正後は双方reject・原文維持・push0を再確認した。さらに `data:{my:'damaged-original-machine-input'}` の既知機種内の破損も同じ消失を再現したため、rowとv/onの構造検査を修正担当へ通知した。
2. **R7・P2:** local STATEにnameのない店舗行 `{id:'orphan-shop',savedCoinBase:2000}` があると、1回目同期はrevision1/lastSyncAt更新で成功するが、2回目は同じpayloadをremote側の識別検査が拒否する。localから作ったpackageへ同じ検査境界を適用しておらず、自端末が読戻せないpackageを成功保存する。元店舗行は端末へ残るものの、その共有領域への同期が以後停止する。安全側probeで実再現し、共通検査の修正担当へ通知した。

この2件の初回失敗証拠は `final-structural-probe.log`、`final-nested-map-probe.log`、`final-local-package-probe.log`。修正後の確認結果と最終の未解決状態は下記へ追記する。

### reviewed-sync.patchの再検査

基準 `a461a080` の `protected-hashes.json` と現在のmanifest全文はbyte一致し、20個の元ハッシュを更新していない。現在の `api/_sync-web.js` と `sync-core.js` にhelperを適用した復元全文は、各々 `git show a461a080:<file>` とbyte一致し、元SHA256 `041366c6…87c9a` / `abc391f2…540d` へ戻った。hunk内の未承認変更はhelperがrejectし、hunk外の追加は復元後SHA256が変わった。reviewed patch全文も、その時点の基準→現在の2file diffと完全一致した。`collector-preservation.mjs` は20 protected hashesと5配信調整ファイルの検査をPASSした。

これらは期待ハッシュを合わせる検査ではなく、許可された同期変更だけを逆適用して残る全byteを保護する検査である。patch自身が許可差分の信頼根である点は初回の記述通りで、今回の追加検査修正によるpatch更新も再確認する。

### 実行証拠と未検証範囲

Node `v24.19.0`。修正前・後の全てのfixtureは合成資料だけを使用した。初回の修正後対象テストはclient 11/11、VPS 37/37成功。全体回帰は重複実行していない。以下のscratch内の専用fixtureとlogが実証内容に対応する。

- `reproduce-postfix.mjs` と `final-reproduce-postfix.log`: R1–R4安全側再確認。
- `ui-storage-postfix.mjs` と `final-ui-storage-postfix.log`: R5構文破損、配信UI bridge経路。
- `relay-quality-postfix.mjs` と `independent-final-relay-quality.log`: R6実HTTP/canonical/receipt。
- `native-sync-postfix.mjs` / `native-sync-child.mjs` と `final-native-sync.log`: 実HTTP分割・新OSプロセス回復・別process CAS。
- `native-bounds.mjs` と `final-native-bounds.log`: サイズ・chunk欠落・期限・direct/chunk競合。
- `final-extra-safe.mjs/.log`: 正規cmpData、backup修復後再起動、外部資料内部識別、同機種別名、local quota/IDB失敗・再試行、実SQLITE_FULL。
- `final-ack-safety.mjs/.log`: 分割の各段階とpullChunkの不正ACK。
- `final-preservation-check.mjs/.log`: 元manifest・2file逆適用のbyte一致、hunk内外への未承認変更の検出。

保存先WAL/`synchronous=NORMAL`、停電・OSクラッシュの最後のwrite耐久性、raw archiveのfsync/実ENOSPC、live private Blobの実CAS/read-after-write、実Safari quota/圧縮codec、多regionのタイムアウト、本番移行・本番稼働は引き続き未検証。追加の端末容量試験はfixtureのwrite失敗注入であり、実Safariのquota測定ではない。append-only commit全体の長期容量/保持期限も別途運用設計が必要。この範囲を「対応済み」に含めない。

### 追加修正の独立再確認

追加のR5入力マップ破損は、top-level dataのscalarと、既知機種rowのscalar・vのscalar・onのarrayについて、direct serviceと配信UI bridgeが全てrejectし、元のSTATE原文を完全保持、push0・lastSyncAt0となった。R7のname欠損店舗も2回連続のdirect serviceでrejectし、店舗行を保持してpush0・lastSyncAt0となった。local packageとmerge後packageがremoteと同じ構造検査を通り、検査終了前にSTATE/client metadataを書かない実装を確認した。判別・統合の式は変更していない。証拠: `independent-final-structural-green.log`、`independent-final-nested-green.log`、`independent-final-local-package-green.log`。

**R8・P2（旧版互換）** も追加検出した。基準 `a461a080` のsync-core全文をVMで実行して実際に暗号化・送信すると、STATEにcmpDataがない場合は旧版のfallbackが `judge.cmpData:[]` を生成する。新しい共通検査はこの空配列まで拒否し、旧clientが保存したrevision1の稼働資料を取り込めなかった。これは不正配列を任意に許可する要件ではなく、旧版自身が生成した正確な空配列の互換境界である。

修正後は空配列だけを読取境界で空object mapとして扱い、旧clientが生成したcloud revision1→最新receiver revision2で旧稼働メモを維持した。さらに旧端末のlocal STATEに残るcmpData空配列を最新配信UIで再起動し、revision3・object mapへ更新して同じメモを保持した。空でない不正配列はdirect/bridgeが共にreject・原文保持・push0・lastSyncAt0。証拠: `final-legacy-package-probe.mjs`、`independent-final-legacy-package-red.log` / `independent-final-legacy-package-green.log`。旧sourceを実行した隔離fixtureであり、本番へ接続していない。

この段階の追加対象clientテストは13/13、VPS対象は37/37成功。`independent-final-extra-safe.log` でbackup/IDB失敗/実SQLITE_FULLを、`independent-final-native-sync.log` で最新clientの実HTTP分割・新OSプロセス回復・別process CASを再確認した。対象外の全体回帰はroot担当が実施する。

ただしR5の一覧要素にも同じ読取り境界の漏れを確認した。解析可能STATE `sessions:['damaged-original-session-row']` はdirect serviceではthrowするが、配信UIのrestoreが文字列行をfilterで落とし、事前autosave後のbridgeは `sessions:0 / revision:1` と成功する。STATE原文は失われ、push1回・lastSyncAt更新となった。`final-local-collection-probe.mjs` と `independent-final-local-collection-red.log` に安全側assert失敗を保存し、一覧rowのobject/null/array型検査をboot前のgateにも揃える必要を修正担当へ通知した。

旧版cmpData互換の2行追加中には、reviewed patchとcurrent sourceのbyte差が厳格検査でFAILした。検査の期待値を緩めず、実装担当によるpatch更新後に完全逆適用と元20ハッシュを再確認する。最終判定はこの一覧要素保護とpatch更新の確認後に記載する。

### 最終判定（2026-10-09 09:16 UTC）

**本レビューで再現したP1/P2は全て修正後の安全側確認を完了。未修正の再現所見は残っていない。** 初回R1–R6、正規cmpData、明示backup修復、同機種別名差枚保護、externalDays内部識別欠損に加え、R5の入力マップ・機種row/v/on・一覧rowのUI迂回、R7のlocal package検査、R8の旧版空cmpData互換を個別確認した。これを本番稼働確認や上記未検証範囲の完了と扱わない。

最後の一覧row試験は、sessions文字列/null、shops配列row/name欠損、tags name欠損、modelForecasts targetDate欠損、v4LayoutOverrides機種欠損、v4MoveHistory文字列の8ケースで、direct serviceと配信UI bridgeが双方reject・原文完全保持・push0・lastSyncAt0。証拠: `independent-final-local-collection-green.log`。その後の対象client回帰は **14/14 PASS**（`tests/sync-client-safety.mjs` と `tests/sync-roundtrip.mjs`、`independent-final-client-tests.log`）。VPSの対象5fileは **37/37 PASS**（`independent-final-vps-tests.log`）。R5/R7/R8の初回red logは不具合が修正前に存在した証拠として保持しており、最終失敗と混同しない。

最終のreviewed patchはcurrent sourceの基準差分全文と一致し、2fileを逆適用した全文は元の基準sourceとbyte一致。hunk内の未承認変更はreject、hunk外の変更は元hash不一致となった。元20ハッシュmanifestも基準とbyte一致し、`collector-preservation.mjs` の20 protected hashes/5配信調整ファイル検査がPASS。許可された追加差分は構造検査・保存前検査の順序・正確な旧版空fallback互換であり、merge/暗号化/判別・研究の式を変えるための例外ではない。証拠: `independent-final-preservation-check.log` と `independent-final-20hash.log`。

独立確認した最終sourceのSHA256（HEAD `d1317d0` 上の作業差分を識別するもの）:

| file | SHA256 |
| --- | --- |
| `sync-core.js` | `1ff2ba585c8ac8b882c7889c87ac22d7d0e65be7ccd68027ef15eb18da42d9f7` |
| `api/_sync-web.js` | `c410e768f3b7f93eb0ee86cfd84d0014fec9ad7bebb648f43c0cecf83fcfaa6a` |
| `vps/src/ui-source-patch.mjs` | `181074bf15be2434457c9c930d86942204443491fca208b593e9842fb13cb885` |
| `reviewed-sync.patch` | `2d39b3a63e98f71dfbc55e5da19414a7f8a37509d50354829333432bc0e3e408` |

全体回帰・資源測定・監視UI/API・予測評価の独立レビューは各担当の結果と合わせて評価する。今回担当の変更はレビュー文書と隔離fixtureのみ。実装・本番・認証・生データ・外部取得・buildには触れず、判別数学も変更していない。
