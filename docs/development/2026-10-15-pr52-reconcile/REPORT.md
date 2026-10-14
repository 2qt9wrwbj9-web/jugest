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

## 2026-10-15 本番DBの読み取り専用・隔離コピー検証

- 実本番 release symlink: `1f8c29fc458f34e11e546fb57944d0fc31db98a5`。本番動作中のサーバーのメモリ available 約1,285MiB / swap 使用54MiB / ディスク空き約151GiB (観測時点)。
- 本番 SQLite は約961MB + WAL。読み取り専用で確認した既存件数は `store_days=2424`、`machine_day_data=298196`、`jobs=17652`、`store_prediction_snapshots=152`、`store_prediction_scores=123`。
- 今回の追加管理表5件は**本番には存在しない**ことを確認。
- 本番DBに書込みをせず、SQLite online backupでアクセス制限付き隔離コピー(約961MB)を作成し、`PRAGMA quick_check=ok`、主要5テーブルの件数一致を確認。
- 隔離コピーに新リリースのschema migrationを**2回**実行して成功。追加管理表5件を確認、既存5テーブルの件数はすべて不変、再度`quick_check=ok`。
- この隔離コピーに、現在の本番旧リリースのmigrationを実行して成功。既存5テーブルの件数は不変、追加表は消えないことを確認。これは**スキーマ後方互換の限定試験**であり、未知ジョブや同期revを含む運用ロールバックの保証ではない。
- 古いバックアップ配置もメタデータだけ確認。実際の本番適用前には**最新時点の一貫したSQLite/WAL・relay・raw・同期保存先のバックアップを作り、復元手順を確認する必要がある**。
- ヒロの明示許可がないため本番DBへのmigration、deploy、サービス再起動、設定変更は未実施。旧同期保存先(Blob等)の所有者・暗号化payload・共有ID/revision移行とiPhone実機は未検証のまま。
