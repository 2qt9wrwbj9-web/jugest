# JUGEST PR #52 / 2026-10-15 本番前統合確認

## 基準・作業場所

- 現行 VPS 本番 release: `1f8c29fc458f34e11e546fb57944d0fc31db98a5` (2026-10-14)
- 取り込んだ未本番の開発ブランチ: `work/data-reliability-prediction-loop-20261009` / `a48a8888e18a42963f3c7a025356342a6d0b61cf` (PR #52)
- 作業ディレクトリ: `/home/ubuntu/jugest-pr52-preflight-20261015` (本番 release・サービス・本番 DB と分離)
- 本番 `deploy/vps` branch, production symlink, databases, jobs, schedules は**一切変更していない**。

## 変更内容

1. `tests/commands.json`: 現行本番の判別・マイジャグⅥ・全台系テストとPRの運用画面テストを両方維持。
2. `vps/src/collectors/pia-public.mjs`: PIA新台導入時の確認済み初日/短い履歴を許容しつつ、既存台の当日差分が全台分一意に取れている場合だけbaselineを進める。確認済み新規台番号を当日の対象台一覧に追加し、欠損を取りこぼさない。
3. `vps/tests/pia-public-collector.test.mjs`: 新規台一覧検証と、26台中1台更新なし(96%以上の見かけの取得率)を未完了と判定する回帰を追加。
4. `vps/scripts/pachinko.mjs`: 保護対象フォルダ/保護対象へのシンボリックリンクを、ファイル権限に触れる前に拒否。一般ユーザーのテストでもEACCESで診断がブレない。本番フォルダ内での書込み許可条件は変えない。

## 検証

- PIA固有試験: 11/11 PASS
- パチンコCLI安全試験: 8/8 PASS
- `npm --prefix vps test`: **634/634 PASS**, fail0, skip0, exit0
- `npm test`: **85/85工程 PASS**, exit0
- 統合に伴う設定判別確率表、数学、strict Champion、モデル採用基準の意図的変更なし。
- `reviewed-sync.patch` は旧作業の証拠パッチで、末尾空白2行を含むが内容を変えていない。

## 未完了・本番適用前の必須事項

- 旧Vercel Blob等の同期データ、共有ID、revision、暗号化payloadの所在と**安全な復旧可能な引継ぎ**。
- SQLiteとWALの整合するバックアップ/リストア試験、追加表migrationの再実行と旧版rollback互換。
- 本番ユーザーの認証、専用権限、iPhone Safari/Shortcut、live private Blobでの確認。
- 実データ・研究負荷と継続稼働での監視、初日の日次取得→検品→解析→評価→翌予測の確認。
- 個別の実施手順・中止条件・復旧手順を明示し、ヒロの許可後にのみ`deploy/vps`への統合／本番デプロイ／本番DB移行／再起動。

## 2026-10-15 安全同期の後続工程

- 現行VPS relay.sqliteの端末同期領域には0件（本番へ書込みなし）。ただしVercel接続Blobの旧共有は未検品。0件と断定しない。
- VPSの同期経路は初期状態503として、旧共有が空のSQLiteへ分岐することを防止。Vercel Previewも旧Blobへ接続するため同期操作はしない（保護対象の `api/sync.js` は変更しない）。
- 旧Blobから読取りのみで暗号化recordを書き出し、隔離SQLiteに移す小さなスクリプトと失敗閉鎖テストを実装。実Blobでの検証は未実施。
- 本番の`jugest.sqlite`, `relay.sqlite`, `pachinko.sqlite`を読み取り専用のオンラインスナップショットとしてそれぞれ複製・復元し、検査と主要テーブル件数一致に成功。各隔離コピーを直ちに破棄。raw archive 2468個のファイル存在も確認。
- 同期移行の停止条件、旧新保存先の二重書込み防止、iPhone実機の確認は [SYNC-CUTOVER.md](SYNC-CUTOVER.md)。**本番migration/反映は未実施**。

## 最終の保護検査と実バックアップ復元の追加記録

- `npm --prefix vps test`: **641/641テスト成功、失敗0、skip0**。架空の旧共有書出し→SQLite取込み→同一IDで再接続・更新、欠損時の拒否、保存先上書き拒否、VPSの未移行状態503を含む。
- `npm test`: **85/85コマンド工程成功**。既存の `api/sync.js`、判別数学、保存ハッシュ検査を変更せず維持。
- 保護対象 `api/sync.js` の変更案は検査で拒否されたため撤回。元の完全一致を維持。Vercel Previewは旧Blobへ接続し得るので同期操作を絶対に行わない運用制限を残す。
- 復元試験: 実本番の3DB `jugest.sqlite` / `relay.sqlite` / `pachinko.sqlite` を読み取り専用オンラインバックアップ→隔離復元→`PRAGMA quick_check=ok`・元との主要テーブル件数一致を確認。アクセス管理DBの隔離コピーも`quick_check=ok`。
- 原本raw archive 2,468ファイルを隔離コピーし、コピー前・コピー後・原本のファイルごとのSHA256完全一致を確認。いずれも一時コピーを削除。
- **未検証**: 旧Vercel Blobの実共有データ・実revisionの二重読み取りと移行、iPhone実機Safari/Shortcut、本番停止・再開とデータ切替後の観測。したがって本番同期を解放する許可や適用はまだ求めない。


## 2026-10-15 旧head-only互換移行設計の修正と回帰検証

旧Vercelの実オブジェクト調査でhead 3件、immutable commit 0件が分かった。現行の同期エンジン `getRecord` がheadを正本としてその次のcommitのみを探索することを確認し、隔離importの旧版過剰拒否条件を修正。revisionが正数のheadだけの旧形式を暗号化データ・ID・authHashをそのまま取り込む。未来に欠けたcommitがあると拒否し、移行時に履歴を捏造しない。古いtokenを使ったpull/push・409競合の実API経路の模擬テストを追加。Blobの架空head 3件の二重読込→隔離DBへの復元も成功。旧Blobの実payload/revisionは未確認、本番同期の切替はNO-GO。詳しくは [SYNC-CUTOVER.md](SYNC-CUTOVER.md)。

### 現行ブランチ変更後の最終回帰テスト

- `node --test vps/tests/sync-export-blob.test.mjs vps/tests/sync-import-offline.test.mjs`: **10/10 PASS**
- `npm --prefix vps test`: **645/645 PASS、0 fail、0 skip**
- `npm test`: **85/85 コマンドPASS**（既存の判別数学・保護APIを含む）
- 現行本番release `1f8c29fc458f34e11e546fb57944d0fc31db98a5` とweb serviceは一切変更していない。


## 2026-10-15 08:27 以降の切替直前安全工程

- 読取専用の旧Blob二重export照合CLIを追加。ID・暗号化データを表示せず、2つの私有保存ファイルの内容と件数・fingerprintが一致しないと拒否。
- 未完了チャンクがあればexport拒否。インポート先は私有0700ディレクトリのみ。暗号化payloadの上限4.9MBを適用。
- 元のVPS relay.sqliteの読み取り専用オンラインバックアップを隔離し、架空のhead3件を投入→同期APIでpull、既存2,427件の全行ハッシュ一致とSQLiteのquick_check=okを確認。隔離コピーは削除済み、本番未変更。
- 実Blobのhead3件の中身検品・二重export、iPhone実機は未実施。本番の切替は引き続き保留。

### 二重export検証後の最終テスト結果

- `node --test vps/tests/sync-verify-two-exports.test.mjs vps/tests/sync-export-blob.test.mjs vps/tests/sync-import-offline.test.mjs`: **16/16 PASS**。
- `npm --prefix vps test`: **651/651 PASS**。
- `npm test`: **85/85 コマンドPASS**。
- 保護対象のVercel端末同期API・判別数学・本番配信設定は未変更。現行本番の `/opt/jugest/current` のリリースも従来の `1f8c29f`。
