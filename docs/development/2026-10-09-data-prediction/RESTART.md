# 再開用記録 — 最終検証済み地点

更新日: 2026-10-09 JST。詳細は [REPORT.md](REPORT.md)、履歴は [progress.md](progress.md)。

## まず読む情報

- 本番基準: `a461a08005d8533107879813db29a57027c139b5`。最終読み取りでGitHub deploy/vpsとVPS実releaseは同値。本番は未変更。
- 作業ブランチ: `work/data-reliability-prediction-loop-20261009`。
- 最終テスト対象コードcommit（ローカル）: `112841b0f8bf40a56f2d461198e1e3107483139e`。
- 同コードtree: `b91d208341e4594f6edca29de323c85eba976306`。後続は報告・台帳・証拠の保存のみ。
- 直前GitHub checkpoint: `ca19c4b094d154839f7249862272410281fd8e53`、tree `511f46488d8b096466493602d977c13e6d8ead4e`。これより新しい最終保存とPRを末尾に記録する。
- 通常Git送信用認証がない。接続済みGitHub Git object APIで同一treeを保存し、CASによる非force ref更新を使った。local/remote commit IDの相違は内容差を意味しない。旧local履歴も保持している。

## 完了済み

既存調査、canonical検品と不完全再送保護、PIA部分取得再試行、Sync CASと破損保護、事前固定予測、永続評価・保留・訂正除外・再起動、期間別集計、認証付き監視API／日本語画面、3担当の独立レビューと修正、最終全体回帰、Chromium／WebKit 390px操作、隔離worker資源測定。

`npm test`: **74/74コマンド工程成功**。`npm --prefix vps test`: **595/595件成功、失敗0、skip0**。最終ログ完了はそれぞれ2026-10-09 18:29:52 JST／18:29:42 JST。WebKit操作証拠は18:32:34 JST。全20元保護manifestを維持、同期2ファイルの許可差分逆適用、主要17ファイル直接byte一致。

ログのSHA256・コマンド・結果・資源・ブラウザ・数学証拠は [evidence/test-results.json](evidence/test-results.json)。変更ファイルと状態は [evidence/changed-files.json](evidence/changed-files.json)。秘密情報・本番生データは保存していない。

## 既存の再開地点との関係

`96dabd9`、`9df7449`、当時の未コミット32ファイルを起点にした後続成果が既に保持されていた。今回の実際の引継ぎ地点は remote `c8b5ee50f5c5cf2b065e106ed697a2fb1b1b04fd` とlocal merge `bd73982`、その後の14ファイル。保全後、画面の未完成部分・独立所見・締切／ロックの残りを完成させた。再clone、reset、branch作り直し、旧成果削除は行っていない。

前回7失敗・最終一回前2失敗は修正済みで、上記最終全体成功が新しい判定。red logは再現証拠として残す。40/40の古い部分成功だけを根拠に完成と判断しない。

## 次の作業と禁止事項

**コード実装から再開する未完了工程はない。本番反映前確認が次工程。** 別セッションではまず実際のbranch head、作業差分、PR、REPORT/本台帳を読み、後続変更の有無だけを照合する。内容が同じなら全体テストを無意味に繰り返さない。

1. REPORT第12節の旧同期保存先移行、backup／復元、追加schema、新jobの旧版互換、資源、実iPhoneと初日日次経路を具体化する。必要な本番コピー／移行操作は実施範囲と権限を確認する。
2. 本番同期の旧revisionや共有データを空のSQLiteで上書きしない。端末の共有作り直し・lastRevision初期化で問題を隠さない。
3. 旧／訂正済み正式trialは保留。推測で事前予測を復元したり、旧証拠を消したり、採用基準を変更したりしない。
4. 手順・リスク・復旧方法を提示したうえで、ヒロ本人の明示許可を得るまでdeploy/vps merge・deploy・本番DB変更・再起動・スケジュール変更を実施しない。

未検証: 本番稼働、旧Blob→native同期移行、live private Blob CAS、実iPhone Safari／Shortcut／quota、停電／OSクラッシュ／実ENOSPC、raw archive fsync、本番全データ・研究最大負荷、長期履歴保持期限。日単位取得しかない経路では欠損1台だけの再取得はできない。localStorage/IDBの跨ぎ保存は単一原子処理ではない。

## 保存確認

この台帳自身のcommit SHAを自己参照で埋め込むことはできない。最終コードの識別は上記commit/tree、報告を含む最新保存は作業ブランチとPRの実際のheadを正とする。保存後にGitHub ref/tree一致と作業差分なしを確認する。

### 2026-10-09 18:51 JST GitHub最終実装保存とPR

- 実装・最終検証・報告を含むGitHub commit: `f36e554ba7d1cf66175dce6d8c01f6af7375f1cd`。
- tree: `0b913c2ca59d86d011e56a90059bd14302a46d91`。local報告commit `d0de279166999e7d51062fc02b6bea7cfdb385b7` と完全一致を確認。非force・現在head一致条件で作業ブランチを更新した。
- draft PR: [#52](https://github.com/2qt9wrwbj9-web/jugest/pull/52)。base `deploy/vps`、未merge、auto_mergeなし。作成後の読取りでmergeable=true／cleanを確認。許可前にmergeしない。
- 既存Vercel連携がPR用Previewを自動生成したことをbotコメントで確認。本番VPSは従来release。PreviewでのUI/API操作・同期データ書込みは行っていない。
- この追記の後続commitは文書のみ。最新保存SHAはPR／branch headを読み取る。実装・最終テスト対象は上記112841bから変更なし。
