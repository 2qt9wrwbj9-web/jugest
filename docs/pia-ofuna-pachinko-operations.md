# PIA大船-P：反映準備とrollback

この文書の本番操作は、今回の作業では一切実行していない。ユーザーの別途明示許可後だけ使用する。作業ブランチへのpushは本番反映ではない。`deploy/vps` は自動反映の対象であるため、レビューのために更新しない。

## 保護する既存データ

- 本番基点：`c48790725ca5da6ebe060f042b37f40015ba58ff`。
- 本番配信：`/opt/jugest/current` からreleaseへのsymlink。
- 既存スロットDB：`/var/lib/jugest/jugest.sqlite`。
- 既存認証/端末連携DBとPIA所有者情報は変更しない。
- パチンコ領域は独立SQLite、専用API、専用Collector。スロットschema・判別数学・分析queueへデータを挿入しない。

## 営業日と推定値の運用条件

初回履歴は全件日付未確定。連続するPIAサーバー日・同一設置・対象機種の比較可能台95%以上という条件を満たし、かつ履歴数不変の1追加/1消失（ローリング窓）が成立した場合だけ前営業日を推定する。履歴が30件未満の新設置台も、同一設置・連日snapshotで「既存の全履歴を保持したまま1件だけ増加（1追加・0消失）」した場合は、その新しい1件だけ前営業日として確定する。複数件増加・既存履歴の置換・設置ID変更・取得ギャップでは確定しない。履歴が30件そろっているbootstrap期間だけ、同じ比較で消えた1件も「前snapshot日から30日前」の古い端として復元する。`derived` は公式の営業日保証ではない。取得停止・複数差分・入替・台移動・同値ゼロの判別不能は欠損を選ぶ。

bootstrapは機種ごとに管理し、全台分がそろった連続30日を一度確保できたら完了とする。完了後は古い端を追加せず、毎日の新規1日だけを積み増す。raw snapshot自体は差分判定のため従来どおり保持する。

2026-10-08時点の保存済み一次rawでは、大海は2026-09-05〜09-07の古い端3日と、未反映だった2026-10-07を安全に追加できることをproduction DBのSQLite snapshotコピーでdry-run検証済み。既存の2026-10-05/10-06と合わせて6営業日になる。喰種399旧配置と現行配置は異なる設置IDであり結合しない。10/07→10/08取得の現行399（12台×2履歴→3履歴）では、全12台で1追加・0消失が成立しており、機種別reconcileの本番DBコピー検証で10/07の12件を安全に復元、差玉計+27,030玉、conflict0件、正式Kは引き続きnullと確認した。

大海のKはAPI内の運用検証済み（verified）。喰種399/999は追加検証中（provisional）、正式なestimated_kはnull。A/B/C/Dは通常回転数の観測量であり、正しさの確率や設定判別confidenceではない。等価ボーダー・期待値・翌日予測はこの機能に含めない。

## 日付reconcile CLI

既存snapshotの再照合は `pachinko.mjs reconcile-dates` を使う。既定はdry-runでDB変更をrollbackする。実書き込みには `--apply` が必要で、本番DBではさらに `--allow-production` が必要。既存の日付と異なるrecordを上書きせず conflict として停止側に倒す。

## 本番反映前の確認

1. 作業ブランチと最新`origin/deploy/vps`をfetchし、監査済み差分とproduction更新の競合を確認する。
2. 本番反映をユーザーが明示許可したことを確認する。
3. 独立DBの保存場所・raw archive保存場所が、既存DBと別であり、static配信rootの外であることを確認する。symlink先も対象とする。
4. 現在のrelease SHA、サービス状態、スロット・共有閲覧機能が正常なことを記録する。
5. 専用DBの既存ファイルがある場合は書き込み停止後にSQLite backupを取る。稼働中のWAL DBを本体ファイルだけcopyしてはいけない。

今回のmigrationはパチンコ独立DBだけに適用する。既存`npm --prefix vps run migrate`や既存schemaの逆migrationは、この機能の反映には不要。

## rollbackの原則

本番反映後に戻す場合も別途許可を確認する。まずP Collectorを停止し、旧releaseを配信する。独立パチンコDBとraw archiveを保持しておけば、修正版で再処理できる。スロットDBをrollbackしたりPテーブルをスロットDBから削除したりする操作は不要。

`jugest-deploy.timer`が有効なら、production branchの新SHAを監視している。旧releaseへsymlinkを戻すだけでは再反映され得るため、復旧作業中はdeploy timerを止めるか、承認済みのrevertをproduction branchへ反映する。現在のdeployer stateを無視してforce updateしない。

旧releaseへの切替は同じfilesystemで一時symlinkを作り、renameによってatomicに行う。旧webを再起動し、内部health・nginx経由health・既存PIA大船-S/店舗解析・招待閲覧を確認してから監視を戻す。

P DBの破棄は通常のrollbackでは行わない。開発用DBでmigrationの再適用と読み取りを検証済みでも、本番の権限・容量・バックアップ・監視は反映直前に確認する。
