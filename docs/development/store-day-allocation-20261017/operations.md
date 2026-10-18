# 単日投入分析 API・反映手順

本書は反映のための資料。今回、本番コマンドの実行・merge・デプロイ・DB変更は行っていない。**本番反映の直前にユーザーの明示許可が必要。** 強判定を有効化する許可・校正結果も得ていない。

## 読取API

| 項目 | 契約 |
|---|---|
| 店舗解決 | `GET/HEAD /api/vps/allocation/stores`。認可された店舗のid/nameだけ。queryなし |
| 店舗単日 | `GET/HEAD /api/vps/stores/:id/days/:YYYY-MM-DD/allocation` |
| 指定台数の詳細 | `?machine=my6&band=456&kind=exact&count=6`。`kind=atLeast` に変更可 |
| 機種 | `my,my6,im,go,fk,hp,gg,mr,um`。店舗内の該当群が必要 |
| 設定帯 | `456,56,6`、省略時456 |
| 台数 | exactは0〜設置数、atLeastは1〜設置数、上限120。省略時は設置数。`detail=1/true` も受付 |
| 厳密性 | 実在する暦日、重複query・未知query拒否。設定確率・対数尤度・任意事前をAPIで受け付けない |
| レスポンス | `store,date,snapshot,roster,quality,groups,unsupported,familySize,alpha,strongEnabled,calibration,access` |
| 各群 | 設置・観測数、可否、理由、実測値、通常個別判別、3設定帯の台数分布・区間・イベント、感度、任意条件付き詳細 |
| 差枚参考 | `groups[].differenceReference`。近似・計算経路・利用数を明示。e未登録、modelPass/strong無効 |
| キャッシュ | `no-store`。ブラウザーキャッシュとは別に、サービス内の結果ストアで入力/版/条件hash一致だけを再利用 |

JSONでは非有限数がnullへ直列化されるため、未算出・不可能条件は関連理由と合わせて扱う。数学コア内の対数配列とHTTP表現を混同しない。

| 認証 | 店舗範囲 | 新規計算 | 現入力・現計算版で保存済みの結果 |
|---|---|---|---|
| Receiver | 所有者として許可された店舗 | 可 | 可 |
| PIA管理者cookie | PIA対象店舗 | 可 | 可 |
| PIA閲覧者cookie | PIA対象店舗 | 不可 | 可 |
| assistant-readキー | 当該channelに許可された店舗 | 不可 | 可 |
| OAuth | issuer/resource/期限/scope/channel有効性が確認できた店舗 | 不可 | 可 |
| 無認証・失効 | なし | 不可 | 不可 |

認証・店舗認可を結果返却前に確認する。読み取り経路では既存schema初期化、session last_used更新、期限切れtoken削除、PRE/取得/同期を実行しない。クライアントは専用の店舗解決を使い、既存の副作用を持つ店舗一覧経路を呼ばない。ReceiverとPIA cookie併用時は所有者の計算権限を優先し、許可店舗が異なる場合はPIAの解決へ切り替える。

主なステータスは400（不正query/日付/台数）、401（未認証）、403（店舗不許可）、404（指定店日なし）、409 `allocation_result_not_ready`（所有者/管理者の計算待ち）、422（分析入力不可）、503（混雑/タイムアウト/利用不可）。全保留の品質報告は、計算を起動せず閲覧者へ返せる。HEADはGETと同じ認可・計算経路で本文を返さない。

## 計算と結果の運用

- 同時受付は原本読取前から最大2。worker実行1、待機最大3、待機30秒・計算120秒。画面離脱や条件変更はAbortSignalで中止する。上限を超えた要求は混雑として返す。
- 標準結果ストアは8件、1件最大8MiB（V8保存表現）のメモリーキャッシュ。再起動・追い出しで消える。入力/原本/台帳/モデル/比較範囲/詳細条件が異なれば再利用しない。
- 一部機種の計算失敗は明示的に保留。保存されたpartial結果は閲覧できるが、所有者が再実行すれば失敗キャッシュを迂回し回復できる。原本不備の保留は、原本の更新・訂正が必要。
- `AllocationResultStore({dbPath,canonicalDbPath,...})` は独立SQLiteを注入できる部品。canonicalや無関係な既存DB・同じinodeを拒否する。現行Web起動経路には永続化用の環境変数・自動作成を追加していない。採用する場合は独立の設定変更・バックアップ・権限・保管期限の承認を得て実装する。
- 新機能は保存済みデータだけを読む。原本未取得を補うための収集・再同期・過去埋め戻しは起動しない。

## 本番反映前に確認すること

1. 開発ブランチの最終SHAと、承認対象の差分・検証報告を確定する。最新 `deploy/vps` / 本番currentが基準から動いていれば差分を確認し、競合解消後に再検証する。
2. 参考比較・強判定無効で反映する範囲を判断する。全台系の厳格な検出力不足とSafari未確認を承認判断に含める。永続ストアは今回の既定に含まれない。
3. Node>=22.13、既存canonical・relay・accessのschemaと読み取り権限、native rawRootを確認する。新しいschema migration・設定表・PRE設定は不要。原本の形式によっては保留が多い。
4. ローカルまたは隔離環境でREADMEの両全体テスト、ビルド、実配信パッチ後UIを再実行する。Safari/iPhoneと対象ホストでの同時負荷確認は残項目。
5. **ここで直前の明示許可を得る。** 許可前はdeploy/vps/mainへのpush/merge、本番サービス・環境・DBへの操作を行わない。
6. 許可後に既存の `deploy/vps` 手順へ沿ってレビュー済みSHAを反映する。既存runnerはリリースをcloneし、VPSテスト後にcurrentを原子的に切替え、Webを再起動し、内部・nginx経由のhealthを確認する。専用work branchのpushではこの反映を実行しない。
7. `/api/health` と新しいread-only APIを確認。所有者の1店日計算、閲覧者の保存結果閲覧、他店拒否、実機UI、従来個別・並列・全台系・店舗・MCP機能を確認する。確認のために既存取得や移行を追加起動しない。

既存runnerの参照元は `vps/src/deploy-runner.mjs`、current切替と状態管理は `vps/src/deploy-core.mjs`。本書から本番コマンドを自動実行しない。

## ロールバック

既存のhealth失敗時はrunnerがprevious currentへ戻し、Web再起動・health再確認を行う。新機能固有の不具合なら、承認された運用手順で前リリースへ戻す。今回の基準リリースは `1f8c29fc458f34e11e546fb57944d0fc31db98a5`。本番反映時点のprevious SHAを必ず記録し、同一と推測しない。

今回の既定実装は既存DBのmigrationを追加しないため、DB逆移行は不要。メモリー結果は再起動で消える。将来別途導入した永続結果ストアがあれば、その独立データをcanonicalへ戻したり混ぜたりせず、版不一致を失効させる。
