# 端末同期の安全な引き継ぎ — 本番移行前の作業台帳

更新日: 2026-10-15（JST）。**本番環境への反映・移行は未実施**。

## 現在確定していること

- 現行本番VPS release は `1f8c29fc458f34e11e546fb57944d0fc31db98a5`。この作業では再起動・更新していない。
- 現行VPSの `/var/lib/jugest/relay.sqlite` の端末同期専用保存領域 `jugest/juggler-device-sync-v1` は **0件**（読み取り専用SQLで確認）。空だから旧共有データも空とは言えない。
- Vercel側にプロジェクト `jugest` が接続する有効なBlobストアはある。**旧共有IDや暗号化保存内容が存在するか／件数／現在のrevisionは未確認**。ストアの存在・更新日時だけでは証明できない。
- VercelのPreviewも同じBlob接続設定を持つため、**Previewの同期APIを叩くと実データ書込みの危険がある。Previewでは同期機能を絶対に実行しないこと。** Vercel同期APIは既存の保護対象であり、ソースの変更は回帰テストが明示的に拒否するため行わない。安全な接続切り離しを別途設計するまではPreviewは画面の閲覧に限定する。
- VPSの新しい同期保存先も、明示的な移行確認が終わるまで503 `sync_migration_required` を返す安全装置を追加。新しい共有領域の作成もできない。許可後の環境設定 `JUGEST_SYNC_CUTOVER_APPROVED=verified-migration-and-approval` を明示しない限り開かない。**現時点では設定していない**。
- これは「移行完了」を保証する自動判定ではない。フラグを有効にする前に以下の確認とヒロの承認が必要。

## 安全な移行の検証済み部品

- 旧形式を読むだけの書き出しプログラム `vps/scripts/sync-export-blob.mjs`。旧Vercelストアの認可済み実行環境でのみ使用する想定。暗号化されたまま保存し、パスや秘密をログに出さない。ファイルを既存ファイルへ上書きしない。所有者しか読めない私有ディレクトリ・0600のファイルへ保存。書き出し前後のキー一覧と共有headの内容が変われば失敗。
- `vps/scripts/sync-import-offline.mjs` はまず読取り検品のみ（実行時にDBを作らない）。`--apply` 指定時も本番保存先 `/var/lib/jugest`, `/opt/jugest` と、それに到達するシンボリックリンクを拒否。**隔離した試験用DBだけに書込み可能**。
- 移行データの項目名・revision連続性・共有ID・認証hash・暗号化payload・headとcommitの一致を検証し、不明・途中欠損・上書きを拒否。単一DBトランザクションでコピーを確定。保存済み暗号化値は復号しない。
- 架空データによる旧APIからの書出し→新SQLite→同じ共有IDと認証tokenでのpull→push→次revisionの確認はPASS。失敗時に既存保存を破壊しないテストとCLI権限テストもPASS。
- **実際のVercel Blobからの書出し・実共有IDでの復元はまだ成功報告ではない**。旧データの数・権限が未確認なため、書き出し実行も行っていない。

## 本番切替までの手順と停止条件

1. **旧データの所在・所有確認**: Vercel管理下の秘匿された接続から、まず保存オブジェクトの有無を安全に確認。共有ID・authToken・暗号化内容をGitHub、ログ、チャット、一般公開領域に掲載しない。アプリから平文や認証tokenを収集しない。
2. **変更を止めて二重確認**: 旧同期先で新しい書込みを発生させない時間帯を確保し、全revision・headを私有領域に二度書き出し、件数とfingerprintが一致することを確かめる。差異が出たら切替を止める。端末に未送信が残る場合はその保護と再送を先に整理。
3. **隔離した復元**: 権限0700の私有フォルダに暗号化保存内容を0600で保管。`node vps/scripts/sync-import-offline.mjs --archive /private/legacy.json --db /private/scratch.sqlite` で事前検品、`--apply` は**隔離先のみに**実行。古い共有コードと同じrevision・暗号化payloadでpullでき、別端末の書込みが409競合保護されることを確認。移行元と移行先のfingerprintの突合。
4. **復旧準備**: 本番SQLite本体+WAL・relay・pachinko・raw原本・必要設定を一貫した時点でバックアップし、隔離先で復元。稼働中の単純なファイルコピーを正しいバックアップと見なさない。バックアップの権限と保管期限を設定。
5. **切替の実施前に必ずヒロ本人の明示許可**: 旧同期先と新同期先の書込み分岐を止めた上で本番への管理されたデータ取込み、`deploy/vps`統合、service更新、同期解放、接続確認を行う。移行先が空なら有効にしない。移行後に旧同期先へ書いたデータの扱いが確定しない場合も解放しない。
6. **初日確認**: iPhone Safari/Shortcut、既存共有コードのpull、2端末からの競合・再読込み、取得→検品→解析→採点→翌予測、権限別の画面、メモリとディスクを確認。サーバーだけでiPhone実機の検証が完了したとは見なさない。

**中止条件**: 移行前後の共有IDまたはrevisionの不一致、元データ途中欠落、孤立commit、書込み中の旧ストア、既存データ上書き、同期401/保存409の異常、破損、バックアップ復元失敗、資源不足、認証情報露出。異常があれば単に旧コードのsymlinkへ戻すのではなく、旧新両側の保存済みrevisionを保全してから復旧計画を立て直す。古いストアと新ストアへ同時に書込み続けない。

## 残る本人・実環境でしか確認できないこと

旧Vercel Blobストアの実共有群を認可された保護環境で検品・二重取得し、実データを隔離DBへ復元する。旧共有コードのうち、変更を伴わない検証が可能なものを確認する。iPhone実機で、通信/ブラウザ保存制約、Safariの復元、ショートカットのバックグラウンド動作を検証する。

この台帳とツールはあくまで本番適用の準備。JUGESTの判別数学、店舗推測、Challenger採用、ランキング、確率表は変更していない。

## 2026-10-15 実旧Blobの読み取り専用監査（追加結果）

- Vercelの接続済み `jugest-blob` を対象に、保護された単発のPreview実行経路から**メタデータ件数のみ**を確認。接続済みの旧同期prefix `jugest/juggler-device-sync-v1/` を最後まで1ページで列挙できた。
- 結果: **共有head 3件、immutable commit 0件、途中アップロード0件、不明キー0件。** 同じprefixの一覧取得で、`complete=true`、読み取り専用の成功応答を確認。
- 別途ビルド環境には旧式のBlobトークンがなく、ビルド段階での一覧取得はできなかった。**SDKのVercel OIDC認証に対応した実行環境では一覧取得に成功**。
- **未確認**: 3件のheadのrevisionが0か正数か、headの暗号化payload・JSONの妥当性、認証情報との一致、共有コードの実接続。件数0と考えたり、3件をすべて安全にインポート可能と判断したりしない。
- `sync-export-blob.mjs` / `sync-import-offline.mjs` の現行安全検証は、revisionが正数でimmutable commitが0のheadのみデータを**拒否**する。今回の旧保存先でcommitが0件と判明したため、3件のrevision/内容を許可された保護環境で確認し、必要なら**古いheadのみを厳格に保護・移送する互換設計**を別途レビューする。欠落履歴を捏造・自動補完しない。
- 一時的な集計用の検証ブランチからAPI入口と診断コードを削除し、元の `package.json` に復旧。手元の一時的な認証情報は削除した。旧プレビューデプロイはプラットフォーム上に履歴として残る可能性があるため、**旧Previewで同期操作をしない**。
- 端末同期に関する擬似iPhoneライフサイクル／再接続等のテスト **22/22**、新VPSの同期耐久テスト **7/7** PASS。これは**実iPhoneのSafari/Shortcuts上の試験ではない**。
- この監査では旧Blob・本番DB・設定・Scheduler・本番リリースには書込みしていない。PRはdraftのままで、本番同期の切替は依然禁止。

## 2026-10-15 履歴0件の旧headのみ移行 — 数学とAPI無変更の追加検証

- **コード調査で確認**: 現行 `api/_sync-web.js` の `getRecord` は共有の `sync/<ID>` headからrevisionを読み、その次の `sync-commit/<ID>/<revision+1>` を順に探索する。現行headがrevision Nで正しく保存されていれば、過去のcommit 1..Nは読取必須条件ではない。次のpushはN+1のcommitを発行する。これは既存同期APIの読み方そのものであり、同期APIは変更しない。
- **修正**: `vps/scripts/sync-import-offline.mjs` で、暗号化payloadとauthHash、createdAt、更新番号が正しい旧headのみのアーカイブを許容する。以前の「正数revisionなのに1..Nのcommitがないと拒否」は誤って過剰に厳しい。**過去commitを捏造しない**。欠けてよいのは「headが既にカバーする過去」。headの後に未連続の未来commitがあるケースや、同じrevisionのheadとcommit不一致、ID/authHash/createdAt不一致は今までどおり拒否。
- **自動検証**: 架空の旧head 3件（revision 0/2/9、commit 0件）をSQLiteへ移した後、旧共有コードと同じ認証tokenでpull、次のpush、古い更新番号の409拒否をすべて成功。headの暗号化JSONはバイト一致。Vercel Blob互換の架空3-headオブジェクトをread-only列挙・各head二重取得→同じraw JSONで隔離SQLiteへ取り込む連携検証にも成功。
- `vps/scripts/sync-export-blob.mjs` はVercel接続環境の **従来型 `BLOB_READ_WRITE_TOKEN` または OIDC `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`** に対応。資格情報を表示・GitHub・ログに保存しない。実Blobへの書出しはまだ実施していない。
- **注意**: 旧Blobの実head 3件について、暗号化payloadやrevisionが正しいことは**まだ確認されていない**。0件だったcommitだけでこれらを検証済みと誤認しない。実headの読み出し・停止期間内での二重export一致・インポート後の確認は依然本番切替の必須条件。
