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
