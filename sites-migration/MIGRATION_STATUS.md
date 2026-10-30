# 現在の再開正本：保存版16（2026-10-31 JST / 非公開開発）

保存版15のSite 15ab06a6145755106e4611c3559bd543d92d5fa3、GitHub開発35b3fa305aca758ca092ed59924cf7c2612bbe59を、永続成果物ZIP/1581個別hash/CRCとremote1540source一致で復元して継続した。以前の保存版へ戻していない。新しい保存後の完全SHAは外部SITES_SAVED_VERSION.json、GitHubはevidence/v16/GITHUB_COMMIT.jsonを参照する（sourceへ自己SHAを埋め込まない）。本書後半は過去保存版の無省略記録で、現在判定はこの先頭と4管理正本のv16節を優先する。

## 復元・最終検証の来歴（2026-10-31 JST）

前回の実行環境中断で未保存v16のrawログ一部と旧checkoutが失われた。GitHub保全差分57ファイルを保存版15の正式source checkoutへ全件照合して回収し、0378d6b44babad926f29b2128e46b076bad138bcへ安全な開発ブランチ保全を行った。元の移植を作り直していない。最初のoverlay不完全状態のnative probe/全回帰は最終結果に数えない。修正後の全回帰・元子プロセス26件比較・native Queue8job・実V8 OOM9条件・4規模数学/active-PRE負荷・実画面試験を再生成した。失われた前回rawログを今回収録済みとは主張しない。前回の文章記録は歴史として残し、今回の完全ログとcommand-results.jsonを最終証拠にする。

今回の画面試験原本はbrowser-final.json（8操作地点）、タブ閉鎖後のDB確認はbrowser-closed-jobs.json。店舗/営業日/12台、店舗分析と現行予測、研究7jobから正式holdout再取得、正式PRE開始→実績待ち→合成2/20到着→採点→2/21予測確定を確認。activeは初期fingerprintを保持した。スクリーンショットは別の表示用資料でZIP保存の対象外。

GitHub通常fetchは現在の経路でTLS接続エラーのため、正式GitHub連携でtree/commit/refを作り、返却されたcommitを元のauthor/date/tree/message/parentsからバイト単位で再構成してSHAを検証しローカルにも保存した。token/TLS設定の回避はしていない。取得済みshallow履歴のみを配布し、全GitHub履歴とは呼ばない。最終SHAとsave16 receiptは外部配布原本を参照する。

## ① 今回localで完成した境界

- FEATURE_BUILDの元子プロセス全体と比較し、最新特徴量/refresh確定、古いfrontier公開抑止、初回のみactive初期化、既存active据置、store-read説明/台score/rank/payload/hash、次営業日live predictionを復元。初期/更新/別研究champion/後続待機の全business保存値が一致。
- 正式PRE v2のモデル固定・trial開始・holdout確定後の元開始条件・champion/challenger予測pair不変保存・再利用/競合拒否を移植。元SQLiteのtrial/model/予測全行/hashを比較。
- 正式PREの日次実績待機、元day judgement全q/期待設定、outcome/NDCG/sequential evidence/trial CAS、次日予測pairまで元保存値と一致。新formal-pre DEV job/既存outbox・Queue・固定入力・private checkpoint・最終CASへ接続。
- 元店舗画面から店舗/日付/台データ/店舗分析/現行予測、研究/正式holdout/PRE開始/待機/実績採点/翌日予測/履歴を確認。研究受付後タブを閉じてもlocal研究7jobが完走。active・研究winner・正式試験2モデルを区別して表示。
- ACCESS専用部品のenrollment lookupとchallenge作成validationを元SQLite比較で追加。公開認証route/新bindingは有効化していない。

## ② 解消・部分改善した障害

FEATURE_BUILD副作用とPRE開始/日次保存の未実装という局所原因を改善した。新active/PRE private plan後の実local V8 OOM、DB確定失敗、lease回復、古い世代、重複、応答消失で正常旧値を保持し、一度だけ正式公開することを確認。以前の7OOM条件と正式holdout比較も回帰。B-PRE/B-PIPELINE/B-AUTHは部分改善で、全体解消ではない。

## ③ 未解消・新しく判明した制約

- B-HOST/B-UNATTENDED/B-MEM：実Sitesの総128MB/CPU/Queue再配信/無人運用は未実証。U-QUEUE/U-ACCESS-BINDING/U-OBSERVE/U-CAPACITYはUNKNOWNのまま。公開・deploy/schedule追加・外部恒久基盤導入は行わない。
- 新active/PRE開始4規模の観測used heap19.34〜23.26MiB。現行予測/正式holdoutの別工程と混同しない。MEMORY_REPORT.mdに全工程のraw指標、I/O、wall、前版比較。安定しない現行予測最適化は採用せず、元全model/8中間値/最終hash一致を維持。
- R-PRE-LARGE：active snapshot/CAS期待行の大容量1.5MB超は安全に拒否。R2公開adapterは未実装。R-D1：local feature batch1301SQLのhost確定/CPU/query制限は未検証。
- R-SCHEMA：PK nullability/DEFAULTの物理差。strict schema同値監査は未達のまま保存、元writerの全保存値一致とは別。詳細schema-comparison.json/FAULT_REPORT.md。
- 正式PREの長期terminal採否/active採用後続・元daily-analysisの定期自動受付、全compare APIは未完。研究championとactiveの無条件同期はしていない。
- 正式認証の全route/WebAuthn/Origin/CSRF/invite/復旧、第2ACCESS D1供給は未完。

## ④ 完全移植までに残る作業と次回

55機能と12gateを削除せず維持。全hostVerified=false、完成ゲート全体は未達。PRE/activeの進捗をlocal/元一致/画面API/無人/host/全体で分けて記録した。次はevidence/v16/REPRODUCE.mdの順に、元PRE terminal→active採用/日次呼出・大容量公開adapter・正式認証を比較して進める。Sync/Relay全体、Collector/自動収集、iOS移行、パチンコ、全MCP/OAuth、予測比較、許可済み実データ独立移行・backup/切戻しも残る。

検証の全コマンド/exit/件数はevidence/v16/command-results.json、全ログはlogs/、元全列比較はfeature-child-*.json/formal-comparisons/。最終回帰結果とreceiptは保存時の外部delivery indexも参照。初期失敗を消さず修正前と最終を区別する。成果物作成・保存・再取得・共有は外部delivery receiptで別管理し、実際に確認前の共有完了を主張しない。

本番jugest.net/VPS/DB/domain、GitHub deploy/vps/mainへ書き込みなし。本番データ・秘密・利用者情報を取得/移行せず、独立合成fixtureのみ。Sitesは保存のみで公開/本番デプロイしない。完全移植完了とは呼ばない。

---

# 以下は保存版15までの原本記録（省略なし）

# JUGEST → Sites 移植の作業記録

更新日：2026-10-28（日本時間）

**状態：移植途中。完全移植ではない。公開・デプロイ禁止。**

## 対象と境界

- 元：`2qt9wrwbj9-web/jugest` の `deploy/vps`、固定コミット `1f8c29fc458f34e11e546fb57944d0fc31db98a5`。
- 新規 Sites：`JUGEST 移植・開発版`。本番の GitHub ブランチ・VPS・ドメインを変更せずに作業する。
- 2026-10-27 の読み取り時、GitHub の `deploy/vps` 先頭と VPS の `/opt/jugest/current` の参照先は、いずれも上記 SHA。サービスは active。
- 本番トップページは、元の `index.html` に `vps/src/ui-source-patch.mjs` の加工を適用した結果と、バイト単位で一致した。
- 新規 Sites は未公開。サーバーの実データ、認証情報、秘密情報は移植していない。

## 移植・検証済みの範囲

| 対象 | 現状 |
|---|---|
| 画面 | 本番と同じ加工後の HTML と画面資産を使用。プレビューで単品判別と、2台の並列・全台系判別の表示を確認。全画面・全端末は未検証。 |
| ジャグラー判別 | 固定元コードから判別に必要な元の式・確率表を生成時にそのまま抜き出して実行。9機種×128入力で、元のサーバー判別結果の全項目が一致。差枚なし・0・正負、不正行も比較。 |
| 公開判別 API | `/api/public/judge` を開発環境で実装し、元実装と出力比較。実ホストの公開状態では未検証。 |
| MCP の台判別 | `/mcp` の `judge_machines` のみ開発環境で実装。元の入力定義と判別結果を比較。Sites が公開時に作るプラグインとの接続・認証は未検証。 |
| 未移植の API | `/api/*` の未対応部分は、成功したふりをせず 503 `sites_port_not_implemented` を返す。 |
| 元コード | `upstream/` に固定コミットの実行コードと主なテストコードを保持。機密や実データの混入を避けるため、文書・テスト用データ一式・Git 履歴は含めていない。完全な元は上記コミットから取得する。 |

判別の一致試験は指定した入力の一致を示すもので、移植全体やすべての入力の正しさを保証しない。画面内のハナハナや実戦記録などは元コードを含むが、この移植版としての動作は未検証。

## 未移植・未検証

1. 店舗分析、店舗横断分析、過去データ、予測、答え合わせ、パチンコのサーバー側処理と保存データ。
2. 元の収集処理、収集待ち行列、再試行、排他制御、取得済み履歴、スケジューラー、解析ワーカー。
3. 端末間同期・収集端末の連携・管理操作。ブラウザー内保存は元コードを含むが、移植版としての保存・復元を検証していない。
4. パスキー、招待、閲覧期限、元の OAuth と連携先の権限。元の認証情報をそのまま公開・埋め込み・無断再利用しない。
5. 判別以外の MCP ツールと、`/api/vps/*`、`/api/access/*`、`/api/pachinko/*`、`/api/relay` 等の入出力・権限互換。元の画面が示す機能は、画面が存在するだけでは動作済みではない。
6. 元データの安全なスナップショット、個人情報・利用者情報の分類、容量・料金・復元・件数照合、継続更新。データ移行は未実施。
7. 本番 VPS が使っている外部サービス・接続許可・旧端末の接続先・ショートカットの確認。移植版から本番データを参照・更新させない。

## 元の機能・処理の台帳

- 画面：ホーム、設定判別、並列判別、全台系、実戦、店舗、記録、データ、店舗・パチンコ詳細、閲覧招待と管理画面。
- HTTP：公開判別、MCP、OAuth のメタデータと登録・認可・トークン、アクセス管理、収集端末の連携、過去データ取り込み、店舗分析、店舗日別情報、予測・比較、パチンコ情報、状態確認、静的ファイル。
- 解析キュー：日別分析、特徴量生成、検証、モデル探索、予測、過去比較など。元コードはメモリ状況を見て子プロセスを起動し、失敗時の待機・再試行と排他を行う。
- PIA 公開データ取得：スロットとパチンコの別処理。元コードの既定値では5分ごとに実行可否を確認し、失敗後は30分以上待つ。実際の本番設定値は未確認。
- 取得元：`piagroupapp.com` の公開ランキング、ブラウザー側取得の `ana-slo.com`、端末連携用の既存接続先。アクセス条件や利用規約の確認は未完了。
- 保存形式：メイン、連携、パチンコ、認証の各 SQLite と、取得元の保存ファイル。複数のトランザクション、条件付き更新、更新順序、時刻の扱い、権限を保つ必要がある。

### HTTP・MCP の実装箇所

移植元の `vps/src/web-server.mjs` と各ハンドラーで確認した範囲。`{...}` は動的な値を表す。Sites 側で動作を確認できたのは最初の2行に記載した部分のみ。

| 入り口 | 元の役割 | 移植状況 |
|---|---|---|
| `/api/public/judge` | 台データを指定した公開判別 | 開発環境で実装・比較済み |
| `/mcp` | 台判別と、認証が必要な店舗データの各ツール | 台判別のみ開発環境で実装。残りと認証は未移植 |
| `/api/health` | サービス状態 | 未移植 |
| `/api/relay` | 取得端末の登録・送受信・データ取得連携 | 未移植 |
| `/api/vps/backfill`, `/api/vps/judge/machines`, `/api/vps/assistant-key`, `/api/vps/system/resources` | 過去分取り込み、台判別、読み取り鍵、リソース | 未移植 |
| `/api/vps/stores`, `/api/vps/stores/{store}/days`, `/api/vps/stores/{store}/days/{date}`, `/api/vps/stores/{store}/legacy-plan` | 店舗一覧、営業日、台データ、予測 | 未移植 |
| `/api/vps/stores/{store}/analysis/default`, `/analysis/history`, `/research/store-read`, `/research/comparison`, `/status` | 解析・履歴・店舗読み・比較・状態 | 未移植。後半の短いパスは同じ `/api/vps/stores/{store}` 配下 |
| `/api/pachinko/stores`, `/api/pachinko/stores/{store}/yutime`, `/matrix`, `/records/{id}` | パチンコの店舗、宵越し、日別表、詳細 | 未移植。後半の短いパスは同じ `/api/pachinko/stores/{store}` 配下 |
| `/api/access/admin/state`, `/viewer/status`, `/register/options`, `/register/verify`, `/login/options`, `/login/verify`, `/reauth/options`, `/reauth/verify`, `/viewer/redeem`, `/viewer/logout`, `/admin/logout`, `/admin/invites`, `/admin/enrollment` | 管理者・閲覧者の本人確認、招待、ログアウト | 未移植。短いパスはすべて `/api/access` 配下 |
| `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize`, `/oauth/token` | MCP 接続用の認可とトークン | 未移植 |
| `/admin/login`, `/admin/register`, `/admin`, `/pia/access`, `/pia` | 本人確認・管理・閲覧用ページ | 未移植 |

元の MCP には `judge_machines` のほか、`list_stores`, `get_store_days`, `get_store_day`, `get_store_analysis`, `get_store_status`, `get_store_analysis_history`, `get_store_prediction`, `get_store_comparison` がある。開発版では、未実装のツールを一覧に出さない。元の `/api/sync` コードも存在するが、固定コミットの VPS ハンドラーには直接の分岐が見当たらず、Nginx を含む実際の経路は未確認。

## 本番データの読み取り専用調査

以下は 2026-10-27 の各表・ファイルを順に調べた概数で、同一時点の整合スナップショットではない。表の内容、認証情報、利用者データの値は取得していない。

| 保存場所 | ファイルサイズ | 主な件数・用途 |
|---|---:|---|
| `jugest.sqlite` | 971,792,384 bytes | 店舗10、営業日2,436、台日データ299,468、過去検証の予測1,772,905、特徴量96,421など |
| `relay.sqlite` | 64,126,976 bytes | 連携用のキー・値 2,427件。認証・連携情報を含み得るため選別が必要 |
| `pachinko.sqlite` | 23,027,712 bytes | 記録5,883、台日3,720、スナップショット42、所属104,748 |
| `access.sqlite` | 143,360 bytes | パスキー、招待、閲覧・管理セッション等。値を取得・移植していない |
| `raw/` | 58,075,794 bytes | 2,492ファイル |
| `pachinko-raw/` | 9,466,164 bytes | 78ファイル |

主データベースには調査時点で約4.7MBの WAL が別にあった。稼働中の SQLite 本体だけをコピーすると、最新の変更を欠落させる恐れがある。安全なスナップショットの実施方法と復元後の照合は未検証。上記の合計は Sites の案内するデータベース上限10GBより小さいが、データ構造変換後の容量・伸び・料金は未確認。

### 主なデータ表

- メイン：`stores`, `store_days`, `machine_day_data`, `source_collector_state`, `analysis_state`, `analysis_receipts`, `client_snapshots`, `jobs`, `job_runs`, `analysis_refresh_state`, `feature_refresh_state`, `store_feature_snapshots`, `backtest_runs`, `backtest_predictions`, `research_model_registry`, `research_loops`, `active_store_models`, `store_prediction_snapshots`, `store_prediction_scores`, `historical_comparison_runs`, `historical_comparison_snapshot_days`, `historical_comparison_days`, `analysis_task_metrics`, `memory_profiles`, `resource_samples`, `shadow_refresh_state`, `pre_v2_formal_models`, `pre_v2_formal_trials`, `pre_v2_formal_predictions`, `pre_v2_formal_outcomes`, `pre_v2_formal_trial_days`。
- 連携：`relay_kv`。
- パチンコ：`p_meta`, `p_snapshots`, `p_records`, `p_snapshot_members`, `p_machine_days`, `p_transitions`, `p_model_anchors`, `p_collector_state`。
- 認証：`access_meta`, `admin_credentials`, `admin_sessions`, `admin_enrollment_tokens`, `access_challenges`, `pia_access_invites`, `pia_viewer_sessions`, `access_audit_events`, `access_rate_limits`。

## Sites との重要な差

- Sites のサーバー処理は Cloudflare Workers 上で動き、1実行環境のメモリ枠は128MB。元の常駐 Node.js、子プロセス、ローカルファイル、同期 SQLite をそのまま動かす構造ではない。
- 本番の成功済み解析記録の集計では、過去比較・日別分析・モデル探索などに128MiBを超える記録が多数あり、最大記録はモデル探索の791.8MiB、最長記録は過去比較の137.2秒。RSS と Workers のメモリ計測は同一ではないため単純比較はできないが、元の処理を無変更で載せることは検証されておらず、分割・最適化や別の実行基盤が必要になり得る。
- Sites のデータベースは D1、ファイルは R2 が候補。元の `DatabaseSync` の同期呼び出し、`BEGIN IMMEDIATE`、WAL、競合とロックを、そのままコピーして互換とみなせない。移行先の独立性・トランザクション・権限の検証が必要。
- Cloudflare の D1 は1行または文字列・バイナリ値を最大2,000,000バイトに制限する（[公式の上限](https://developers.cloudflare.com/d1/platform/limits/)）。元の同期コードは約4.9MBの暗号化データを許容するため、全体の容量が10GB未満でも、単純な1行へのコピーでは維持できない場合がある。分割保存・別のファイル保存先を含め、意味と競合動作の検証が必要。
- 本番にある選定7列の値のサイズだけを読み取り専用で集計したところ、最大は連携用の値の1,207,441バイトで、対象列に2,000,000バイト超の値はなかった。これは全列・行全体・将来追加される値を調べた結果ではない。
- Sites の定期更新は公開済みサイトと連携した仕組みであり、この未公開段階では本番相当の定期実行を確認できない。公開を先に行う許可はない。

## 検証と既知の注意

- 移植版の `tests/port-*.test.mjs`：8件成功。うち判別の値比較は9機種×128入力、入力不備や差枚0の確認を含む。
- 元コードの VPS テスト：570件中569件成功。失敗した1件は、ローカル検証環境に `/var/lib/jugest` が存在しない場合の、存在しないリンク先を指すシンボリックリンクの検査。元コードの `existsSync` により、その経路が保護対象として検出されないことを再現。本番で同じ不具合が起きているとは未確認で、元コードは変更していない。
- 対象の過去コミットを取得後、元のフロント側テストは 83/83 コマンド成功。履歴が必要だった並列判別の22件と旧判別との比較も成功。
- 本番の公開判別 API に架空の台データを読み取り専用で送り、9機種それぞれ1入力ずつ、移植版の出力と一致。
- 移植版のビルドと非公開プレビューで画面、単品判別、並列・全台系の表示、公開判別 API、未移植 API のエラー応答を確認。

## 次に必要な作業

1. 各データの権限と保存先を設計し、D1/R2 で競合・復旧・時刻・件数の比較試験を用意する。
2. 収集・同期・解析・認証を段階的に適合し、各機能の正常系・異常系・再試行・排他を元と比較する。長時間・大メモリ処理の代替実行方法を検証する。
3. 読み取り専用の整合スナップショットを作成し、機密を分けて独立した移植先へ復元する。元のデータは変更しない。
4. 全画面・モバイル・全 API・MCP と全データの比較を終え、残課題を明示する。
5. デプロイ URL の発行は、作業が整った後にユーザーへ直前確認し、明示的な許可が出るまで実行しない。

# 保存版3からの継続作業（2026-10-27）

## 復元と保存先

保存版3のソース `decefcd867d2d861c3b6f9eca4e9c92bd3e18477` と作業フォルダーが一致し、開始時に未コミット変更はなかった。Sitesは未公開（live URL・preview URL・deployment IDなし）。元リポジトリの作業ブランチは開始時点ではローカルのみだった。

今回、機密・利用者情報・本番データを含まない新規5ファイルだけを専用ブランチへ追加した。
- GitHubブランチ：`work/sites-migration-20261027`
- コミット：`19032324fb14158eef2ccf4b0ed6a9ab2b108a72`
- 参照：https://github.com/2qt9wrwbj9-web/jugest/tree/work/sites-migration-20261027/sites-migration
- 通常のgit pushは認証情報がないため失敗。GitHub接続経由で新規ブランチを作成・更新し、fetchしたコミットとローカルの内容が同一であることを確認した。ローカルの元コミット `a7b721f` は `archive/sites-migration-local-a7b721f` に保持した。
- GitHubへ送ったのは保存部品、候補スキーマ、テスト、依存定義、説明文のみ。前回の本番集計、今回のログ、Sites全ソースはこの新規公開差分に含めていない。

## 新しい保存部品：部分完成

`lib/storage/relay-store.mjs` は元の `createRelayStore` と同じ set/setJSON/get/getWithMetadata/list/delete のインターフェースを持つ。値はR2の一意なオブジェクトとして先に保存し、D1には参照と版番号だけを単一SQLで確定する。新規作成限定と版番号一致の条件付き更新を実装。5,100,011バイト級のJSONもD1の1行に入れず扱える。

ローカルMiniflare（実際のD1/R2開発用模擬環境）で、元SQLite部品との基本動作比較、8件同時作成・更新で各1件だけ成功、R2失敗・D1公開前失敗後の旧値保持、旧参照を持つ読者の継続、削除・再作成、名前空間の分離を検証した。

**本番のD1/R2、認証、収集取り込み、端末同期の全処理には未接続。候補SQLをホストに適用していない。サイトのDB/R2設定は未使用のまま。** 旧オブジェクトや失敗時の未参照オブジェクトは、読者の安全を優先して削除しない。安全な回収・保持期限・容量管理・応答消失時の再送・悪意ある大容量送信は未検証。同期全体の完成ではない。

## メモリ制約の再現試験

`evidence/memory-probe.mjs` は架空の店舗データだけを生成し、元の `runExistingStorePlan` を呼ぶ。数学は変更していない。

| コマンド | 結果 |
|---|---|
| `timeout 45s node evidence/memory-probe.mjs 180` | 180日×106台、45秒でタイムアウト（終了124）。結果・ピークメモリは取得できなかった |
| `timeout 45s node --max-old-space-size=96 evidence/memory-probe.mjs 180` | 約42秒付近のGC記録に続きJavaScriptメモリ不足で停止（終了134） |
| `timeout 30s node evidence/memory-probe.mjs 8` | 元処理が予測結果を返さず終了1 |
| `timeout 30s node --max-old-space-size=96 evidence/memory-probe.mjs 8` | 同じく予測結果なし、終了1 |

96MBはNodeのJavaScriptヒープだけの制限で、Sitesの128MB全体メモリ枠とは異なる。上記はSitesでの実測ではなく、メモリ削減後の同等性成功例も得られていない。過去比較のコードは既に対象日単位のジョブに分かれている一方、各ジョブ内で履歴全体を正規化し、旧予測処理が別の実行環境に履歴を再取り込みする。単に履歴を切り捨てると学習対象が変わるため採用しない。

解決候補は、同じ履歴範囲を保ったまま日別読込み・集約・中間結果の保存を行うこと、重複配列と実行環境の再生成を削減すること。学習・探索・検証順序を含む出力一致試験が必要。現状は移植困難のまま。

## 今回の変更ファイル

新規：
- `lib/storage/relay-store.mjs`：D1参照・R2本体を用いる保存部品。
- `lib/storage/schema.sql`：ローカル検証用候補スキーマ。未適用のホスト移行。
- `tests/port-storage.test.mjs`：実ローカルD1/R2、元SQLiteとの比較、競合・失敗試験。
- `evidence/PLAN.md`：実装方針と境界。
- `evidence/memory-probe.mjs`：元予測処理のメモリ制限再現用。
- `evidence/README.md`：追試と再開手順、証拠の読み方。
- `evidence/logs/*`：省略していない実行出力。テスト失敗・メモリ不足の記録を含む。
変更：`MIGRATION_STATUS.md`（この追記）。削除：なし。既存の判別・UI・元コードは変更なし。

## 今回の試験

- `node --test tests/port-*.test.mjs`：12件成功、0失敗。原本 `evidence/logs/port-all.log`。
- `node --test tests/port-storage.test.mjs`：実装前0/4成功、実装後4/4成功。red/green両方の原本あり。
- GitHub掲載用の同じ部品の `node --test sites-migration/tests/storage.test.mjs`：4件成功、0失敗。ローカルの同一Miniflareパッケージを一時リンクして実行。公開READMEの新規npm installからの追試は未実施。
- 元固定ソースの `npm test`：83/83コマンド成功、0失敗。
- 元固定ソースの `npm --prefix vps test`：570件中569成功、1失敗。前回と同じ `safe DB path resolves symlinked parent directories before production-path checks`。期待値・実装は変更していない。
- Sitesビルド：結果は `evidence/logs/site-build.log` を参照。
- 今回未実行：ブラウザー全画面・モバイル比較、Sites上のD1/R2、実データ移行、実端末同期、収集スケジュール、元店舗解析との出力同等性、公開後MCP認証。前回のプレビュー成功を今回の試験と混同しない。

## 機能別の判定

| 機能 | 判定 |
|---|---|
| 個別判別の計算部品・公開判別APIのローカル互換 | 部品として完成、ホスト確認未実施 |
| UI・並列・全台系 | 部分完成（前回確認の範囲、全画面未検証） |
| D1/R2連携保存部品 | 部分完成（今回追加、ホスト・権限・回収未検証） |
| MCP | 部分完成（judge_machinesのみ、接続認証未検証） |
| 大規模店舗分析・予測・過去比較 | 移植困難（制限下の成功例なし） |
| 自動収集・同期・認証・パチンコのサーバー機能 | 機能全体は未着手、元コードのみ保持 |
| サーバー実データ複製 | 未着手 |

## 再開

今回保存した最新版の番号・ソースコミットは、配布ZIPの `DELIVERY_INDEX.json` とSitesの保存版照合結果で確定する。ZIPにはこの文書の全文、実装・テスト・省略していないログ、SitesソースのGit bundle、公開差分を含める。認証情報、node_modules、環境ファイル、本番DBは含めない。

1. DELIVERY_INDEXの保存版とコミットを照合してGit bundleから復元する。
2. `npm run test:port` またはREADMEのコマンドを実行する。
3. 保存部品に安全な回収・大容量制限・障害復旧試験を追加し、認証・取得取り込みと接続する前に独立性を検証する。
4. 解析は同じ履歴を使い、段階読み込みと重複確保削減を原本と比較する。96MB制限で成功してもSites対応の証明とはしない。
5. 原本・ログ・機能表を更新して保存する。デプロイはユーザーの直前許可まで禁止。

# 保存版4からの継続作業：保存版5（2026-10-27）

**この節が最新の状態。前半の節は各保存版時点の記録として全文を保持している。** Sitesの確定版番号・独立ソースコミット・アーカイブは配布ZIPの `DELIVERY_INDEX.json` およびSites返却値で照合する。本番は変更せず、公開・デプロイせずに保存する。

## 再開とGit

- 開始時の保存版4: `appgprj_6adfb3bed3bc81919a24843a8fbaf71a~appgver_13e10349c218819196ff985b5bade890`、ソース `c04b0f683b8c832dea1ed51d3b436f4245b56d75`。ローカルと一致、未コミット変更なし。Sitesのlive/preview URLとdeployment IDはnull。
- 独立Sitesプロジェクト: `appgprj_6adfb3bed3bc81919a24843a8fbaf71a`。既存を再利用し、新しい重複サイトは作成していない。
- 元リポジトリの作業ブランチ: `work/sites-migration-20261027`。
- 今回のGitHub反映済みコミット: `8f2fac6c67380ecb3c74029a140e28b0ae725ada`。
- URL: https://github.com/2qt9wrwbj9-web/jugest/tree/work/sites-migration-20261027/sites-migration
- 元本番の固定基準: `1f8c29fc458f34e11e546fb57944d0fc31db98a5`。差分は `sites-migration/` の21ファイルだけ。deploy/vps・main・本番の実行ファイルには変更なし。
- GitHub接続で専用ブランチを更新し、git fetchのツリーとローカルのツリーが同一であることを確認。ローカルの仮コミットは `archive/sites-migration-local-e61c8c9` に保持し、作業ブランチはGitHubのコミットへ揃えた。ローカルはクリーン。
- 独立Sites側のブランチ名 `main` はSites専用の非公開リポジトリのもの。禁止対象の元GitHub mainとは異なる。最終SHAは自己参照を避けてDELIVERY_INDEXに記録する。

## 今回動作を実装した範囲

### 店舗の読み取りAPI（ローカル比較済み・ホスト未検証）

元 `analytics-handler.mjs` のSQL・出力マッピング・順序・日数制限・入力検証を抽出した。変更はSQLite同期呼び出しからD1非同期呼び出しへの変換、保存先と権限設定の注入、未移植枝の除外。生成元と変換手順は `scripts/generate-store-read.mjs`、生成結果は `lib/generated-store-*.mjs`。判別数学や分析原則は変更していない。

元画面が使用するcatch-all routeから以下へ接続した。

| API | 実装内容 |
|---|---|
| `/api/vps/stores` | 認証チャネルから読める店舗、最新日、有効日数、取得元、公開区分 |
| `/api/vps/stores/{id}/days` | valid営業日、元のlimit処理、昇順の出力、台数 |
| `/api/vps/stores/{id}/days/{date}` | 元の台番号順、元のJSONペイロード、日付・存在・権限エラー |
| `/api/vps/stores/{id}/analysis/default` | 保存済み分析JSONと日付・ハッシュ・更新時刻 |
| `/api/vps/stores/{id}/analysis/history` | 元の解析受領履歴100件と順序 |
| `/api/vps/stores/{id}/status` | 保存済み状態または世代・完了世代からのpending状態 |

**保存済み分析の読み取りは、分析エンジンの移植完了ではない。実データ・実資格情報を入れていないので、現時点の開発版で元店舗のデータを表示できるという意味でもない。ダミーデータを製品へ投入して代用していない。** テスト専用の観測・認証文字列はテスト関数内だけで使用し、Site DBへ投入していない。

元receiverとassistant-readのハッシュ照合・レコード参照・現行鍵チェック・チャネル失効を保存先だけ注入して再利用。読み取り鍵がanalysis/statusを読めない元の制限も保持。PIAのowner方針は `JUGEST_PIA_ACCESS_MODE` と `JUGEST_PIA_OWNER_CHANNEL_IDS` を明示注入し、未設定ならowner/空許可リストで閉じる。秘密値は保存していない。パスキー・招待・管理者/閲覧セッション・Sitesユーザーとチャネルの対応は未実装であり、CookieやSitesヘッダーだけで勝手に権限を与えない。

D1は `withSession('first-primary')` がある場合はセッションを使用する。ただし複数SQL全体の時点固定トランザクションではなく、稼働中の取り込みとの一貫性検証は未完了。元の複数SELECTも明示的な読み取りトランザクションではない。

### D1スキーマとR2復旧（部分完成）

`.openai/hosting.json` は論理binding `DB` / `BUCKET` を宣言するよう変更。schema-onlyの8テーブルと生成SQL・Drizzleスナップショットを追加した。`jobs` は元の `analysis_refresh_state.active_job_id` の外部キー先として定義しただけで、キュー実行や自動収集を起動しない。

SQLは新規ローカルMiniflareへ適用して読み取り比較を実施し、プレビュー用ローカルDBにも0000・0001の順で適用した。**ホスト側には適用せず、実データ移行・認証データ移行は未実施。** これは全本番スキーマではなく読み取り用の部分集合。D1の行上限を超えるcanonical snapshotのR2分離は未実装。

新規relay書き込みではD1参照とSHA-256を同じSQLで確定し、取得時にR2本体を検証する。欠損復旧は、D1に保存済みのハッシュと版番号に一致する正確なバックアップ文字列のみ受け付ける。R2の条件付き作成により既存オブジェクトは上書きしない。D1参照・版番号・更新時刻も変更しない。ハッシュのない旧参照は自動復旧できない。実データのバックアップ自体はまだ作成していない。

整合性検査はページ単位でmissing/hash_mismatch/verified/hash_unavailableを識別する。未参照オブジェクトの一覧もページ単位で取得できるが、書き込み前のアップロードや旧参照を持つ読者と競合するため、検出を安全な削除許可とはみなさない。検査は時点固定の台帳ではない。**自動回収・物理削除・GC用HTTP入口は実装していない。** 応答消失後の書き込み再送、無期限オブジェクト増加、読者leaseとwriter状態の永続化を含む安全な回収は残課題。

### 1日ずつの履歴読み込み（部品・解析未接続）

`lib/store-history.mjs` は元 `loadStoreDays` と同じvalid条件、limit（既定180、最大3660）、日付順、台順、全フィールドを保持し、台ペイロードだけを日別に取得する。元ローダーと全内容が一致し、後続日のペイロードが次の反復まで読まれないことを検証した。呼び出し側が全日を配列に貯めればメモリは減らない。元解析はまだこの反復APIに接続しておらず、解析メモリの削減成功とは扱わない。

## メモリ試験の更新

`evidence/v5/memory-plan-probe.mjs` は元 `analysis-runtime.test.mjs` の成功例と同じ形のテスト専用観測から、変更していない `runExistingStorePlan` を実行する。対象日は入力最終日で、元処理が対象日前だけを履歴として使う。通常/96MB比較で対象データ・順序・精度を変えていない。

| 入力・コマンド | 結果 |
|---|---|
| `timeout 50s node evidence/v5/memory-plan-probe.mjs 50 12` | 成功、ランキング12台、最大RSS108,812KiB、約0.99秒 |
| `timeout 50s node --max-old-space-size=96 evidence/v5/memory-plan-probe.mjs 50 12` | 成功、ランキング12台、最大RSS106,484KiB、約1.24秒 |
| 上の2件の結果ハッシュ | いずれも `ba782af9aedee884dc2a15352e4c3188284780f2195c09c29622504e48c037e6` |
| `python evidence/v5/run-memory.py node evidence/v5/memory-plan-probe.mjs 180 106` | 成功、履歴18,974台日、ランキング106台、約40.2秒、Node最大RSS402,680KiB、親側child rusage最大403,064KiB（約393.6MiB） |
| 180日106台の結果ハッシュ | `791ba0460f0e82e8891a8633057ab55165c80a85ee19d3d7c6317bf3203b7fca` |
| `python evidence/v5/run-memory.py node --max-old-space-size=96 evidence/v5/memory-plan-probe.mjs 180 106` | メモリ不足、終了134（SIGABRT）、約18.8秒、child rusage最大273,508KiB（約267.1MiB）、結果なし |

`--max-old-space-size=96` はJavaScriptヒープだけの制限で、Sitesの128MB全体メモリ枠と等価ではない。Node RSSもWorkers isolateと同じ計測ではない。大規模入力の成功結果は得られたが、制限下の同等結果は得られていない。本番で記録した最大791.8MiBのモデル探索そのものは今回再実行しておらず、上記は現在予測の別ベンチマーク。

前回の8日試験は元のv5AnalyzeStoreが履歴9日未満をnullにする条件に該当する。これをメモリ不足の根拠には使わない。今回のLinux `/proc` RSSサンプリング値（496KiB等）は内部 `process.resourceUsage()` と一致せず、この環境では指標として採用しない。終了後のchild rusageを併記し、ログの値を都合よく隠していない。最初の `/usr/bin/time` 呼び出しはコマンド不在で終了127、その記録も保持した。

解決候補: 同じ履歴・特徴量・探索候補を保持した日別処理と中間結果のR2保存、重複した配列とVMの削減、全候補の順序を保つ集約や外部ソート。現在どの確保が支配的かの詳細プロファイルと、分割後の完全出力一致試験が必要。Sites内で収まらない場合の候補は独立Node解析実行基盤とSitesの分離だが、構成変更は未確定・未作成であり、採用前にユーザーへ説明・承認が必要。

## 試験原本と結果

全コマンド・終了値・ファイルは `evidence/v5/command-results.json`、`evidence/v5/logs/`。判別・UIの前回テストも今回まとめて再実行した。

- `node --test tests/port-*.test.mjs`: 21成功/0失敗（元の1,152判別入力の全フィールド一致も含む）。
- `node --test sites-migration/tests/*.test.mjs`（元リポジトリ）: 13成功/0失敗。同じ版の既存Miniflareを一時リンクして実行。新規クローンからのnpm install追試は未実施。
- 元 `npm test`: 83/83コマンド成功、終了0。
- 元 `npm --prefix vps test`: 570件中569成功/1失敗、終了1。`safe DB path resolves symlinked parent directories before production-path checks`。前回と同じ不存在の `/var/lib/jugest` とdangling symlink条件。元期待値・実装は変更せず、本番環境で同じ事象が起きるとは断定しない。
- `npm run db:generate` 2回: 成功。SQLはローカルのみに適用、2回とも終了0。
- Sites `build-site.mjs`: 2回成功。最終ログ `site-build-final.log`。
- 赤テスト: 読み取りAPI欠落5失敗、復旧部品欠落3失敗、履歴反復部品欠落1失敗（残り5成功）を確認後に実装し、最終21件成功。意図した開発途中の失敗で、最終失敗数には合算しない。
- ブラウザー: 元UIのJUGEST v6.0.2がローカルプレビューに表示され、実際の `/api/vps/stores` が `{"ok":false,"code":"unauthorized"}` を返すことを確認。認証済み店舗画面のブラウザー実証ではない。
- 実行シェルからのHTTP一括試験は127.0.0.1で接続拒否、公式返却のterminal.localでもソケット終了となり、5ケースは未実行。ログ2件を保持。ブラウザー経路の観測と混同しない。
- 今回未実施: 公開サイトの非公開店舗APIとの実資格情報比較、ホストD1/R2、実データ復元、全画面/モバイル、実端末同期、自動収集、招待/パスキー/MCP OAuth、大規模解析の分割版比較。

## 最新の機能判定

| 機能 | 判定・残り |
|---|---|
| 個別判別計算/公開API | ローカルの部品・API互換試験完成、ホスト未検証 |
| UI・並列・全台系 | 部分完成、元画面保持、全画面・全保存操作未検証 |
| 店舗一覧・営業日・台データ | 部分完成、元APIと比較成功・元画面のAPIへ接続、ホスト/実データ未検証 |
| 過去データ・保存済み分析・履歴・状態 | 部分完成、読取りのみ比較成功。新規解析/店舗横断分析は未実装 |
| D1/R2保存と復旧 | 部分完成、CAS・障害・ハッシュ復旧試験成功、自動回収/ホスト未対応 |
| 分割履歴読み込み | 部品として比較成功、解析には未接続 |
| 予測・答え合わせ・過去比較・モデル探索 | 移植困難、大規模制限下の結果なし、数学削減なし |
| 認証 | 部分完成、receiver/assistant-readと店舗スコープのみ。招待/管理/パスキー未実装 |
| 同期・取り込み・端末連携・収集キュー/自動取得 | 未実装、既存コード保持のみ |
| パチンコサーバー機能 | 未実装 |
| MCP | judge_machinesのみ部分完成、店舗ツール/OAuth未実装 |
| 実データ独立複製 | 未実施。安全なスナップショット、個人情報/秘密の分類、容量・復元・許可確認が先 |

## 変更ファイルと原本

追加: `scripts/generate-store-read.mjs`（元コード抽出）、`lib/generated-store-*.mjs`（API/認証/権限）、`lib/store-read-api.mjs`（Request/ResponseとD1境界）、`lib/store-history.mjs`（日別反復）、`lib/storage/recovery.mjs`（検査/正確な復旧）、`tests/port-store-read.test.mjs`・`tests/port-storage-recovery.test.mjs`（元版比較/障害）、`drizzle/000*.sql`とスナップショット（schema-only）、`evidence/v5/*`（計画/計測/原本ログ/検証手順）。

変更: `.openai/hosting.json`（独立D1/R2論理宣言）、`app/api/[...slug]/route.ts`（店舗読み取りへの実接続）、`db/schema.ts`（読取り対象8表）、`drizzle/meta/_journal.json`（生成移行履歴）、`lib/storage/relay-store.mjs`・`schema.sql`（ハッシュ整合性）、`package.json`・`pnpm-lock.yaml`（生成コマンドと元API比較用dev依存）、本書。削除なし。厳密な全パスと区分は配布の `CHANGED_FILES.tsv`、公開差分は `github-public-change.patch` に欠落なく記録する。

ZIPには本書の全文、現行の全追跡ソース、生成物の元コード、依存ロック、全保存済み試験ログ、Git bundle、対象SHA、追試手順、ファイルごとのSHA-256を含める。node_modules、未追跡環境設定、ローカルDB/R2、実資格情報、本番DB・利用者情報の値は含めない。Git bundleの復元・クリーン状態とZIP内ファイルの全ハッシュを検証してから提供する。

## 次回の再開地点

1. **保存版5** とDELIVERY_INDEXのSHAを照合してbundleを復元。原本 `REPRODUCE.md` に従い依存を導入し21件を実行。
2. 招待/パスキーとSites主体・チャネルの対応、独立した安全な認証データの初期設定を調査。既存の公開範囲を広げず、認証済み店舗読み取りの実動作を完成させる。
3. 元データの分類と整合スナップショット/復元手順・容量・資格情報除外を検証した後に、許可を確認して必要なデータだけ独立複製。移植先に本番への書き込み経路を作らない。
4. 大規模解析の確保元を測り、日別反復を元解析へ接続できる単位を特定。同じ全履歴と浮動小数の演算順序で出力一致・メモリを比較。履歴削減や簡易数学は不可。
5. 自動回収はwriter公開前とreader旧参照の競合を永続状態で防ぐ設計・障害試験を先に追加。未参照の検出だけでは削除しない。
6. 店舗分析/横断分析、予測・比較、同期/取り込み、キュー/収集、パチンコ、全MCPを順次比較。残課題を隠さず非公開保存を繰り返す。デプロイは直前のユーザー明示許可まで禁止。

# 保存版5からの継続：保存版6（2026-10-27）

**以下が最新状態。過去の節の「最新」は各保存時点の記録であり、この節で更新する。完全移植は未完了。本番サイト・VPS・DB・deploy/vps・元GitHub mainは変更せず、Sitesも公開/デプロイしていない。**

## 再開・保存・Git

開始時に保存版5のソース `e0b6db915050fa5e6ca9662227c453570ded05b6`、前回記録、元開発ブランチ `8f2fac6c67380ecb3c74029a140e28b0ae725ada` を照合。未コミット変更なし。Sitesプロジェクトは既存の `appgprj_6adfb3bed3bc81919a24843a8fbaf71a` を使用し、追加作成していない。開始時のlatestは5、live/preview URLはnull。

今回の公開開発ブランチは `work/sites-migration-20261027`、コミット `628c540573a59e45ed3aee017a818f18f2be0f86`。URL: https://github.com/2qt9wrwbj9-web/jugest/tree/work/sites-migration-20261027/sites-migration 。公開差分はsites-migration配下27ファイルに限定。GitHub接続で更新し、元本番コードには差分を加えていない。ローカル仮コミットaad3a09はarchive/sites-migration-local-aad3a09へ保持して、GitHubの同一ツリーのコミットへ揃える。確定したSites保存版番号/ソースSHA/未コミット有無は配布 `DELIVERY_INDEX.json` と `SITES_SAVED_VERSION.json` で照合する。

## A：元の店舗画面からの実操作

本番の `vps-ui-remote-stores.mjs`、元画面とブリッジ、元VPSの配信時パッチ、台データ表/ヒートマップ、店舗分析の描画を再利用した。`sites-store-connection.mjs` を一つ追加し、Sites上の同じURLの店舗APIへ接続。元資産は変更していない（HTMLへのこのモジュールの追加は明示的な差分）。元ブラウザークライアントの抽出版には、サーバー側で必ず認証するCookie通信と解析受領履歴の読み取りだけを追加した。

元キャッシュが台データの期待設定を求める `/api/vps/judge/machines` も移植した。元receiver認証、assistant-readの拒否、POST限定、262144バイト/200台上限、元と同じ判別出力を保持。欠損差枚はnullのまま元判別へ渡し、推測や独自数学で埋めていない。

### 安全な検証用認証

`dev/session.mjs` は `import.meta.env.DEV` と未追跡ローカル設定 `JUGEST_DEV_SESSION=1` の両方がある場合のみ使う。1時間で切れるランダムなHttpOnly/SameSite=Strict Cookieを発行し、元のreceiverハッシュ認証へ接続する。Cookie/トークンをHTML、localStorage、応答本文、ログ、ソース、ZIPへ出していない。許可のないOriginからのPOSTを拒否し、別の店舗データがあるDBへの検証データ投入は409で拒否する。実データ・本番の鍵・資格情報は使っていない。

ローカルD1/R2だけに「移植検証・第一店舗」（50日×12台）と「移植検証・空の店舗」を作った。観測はテスト専用の決定的な生成値、保存済み分析はその観測に対して**変更していない元runExistingStoreAnalysisを実行した出力**。手作りの解析結果で代用していない。検証用データ/セッションのコードは公開用ビルドから除去され、dist/serverにdev-store-one/development-session-v1/開始ボタンの文字列が含まれないことを確認した。実際のホスト環境に検証用認証を設置したわけではない。

### 実際に確認した画面

ローカル非公開プレビューの返却URLをCloud Browserで開き、開始ボタンからセッションを作成して通常のJUGESTへ移動した。

1. 元の店舗選択シートに2店舗を表示し、空店舗→第一店舗へ切り替え。
2. 第一店舗の概要に蓄積50日、最新12台、最新総G64182、差枚確認11/12台、総差枚+360枚等を表示。
3. 台タブに50営業日の選択肢、最新日、12台、30日分の期待設定ヒートマップを表示。営業日を2/19→2/18へ操作し、総差枚-1151枚、平均G5342G等へ変化することを確認。
4. 元の店舗解析画面に対象50日/600台日、平均設定2.86、使える根拠406と元の根拠リストを表示。
5. サーバー解析履歴を展開し、2026-02-19 / daily / vps-runtime-v1と日時を表示。これは受領履歴であり、過去の解析結果ペイロードの復元機能ではない。端末側スナップショットの履歴とは表示を区別した。
6. 読込中の表示、空店舗のデータなし表示を実画面で確認。401/403/503と通信断の表示状態は自動テストで確認し、全ケースをブラウザーで再現したとは扱わない。

スクリーンショットは `evidence/v6/browser-store-overview.jpg` と `browser-analysis-history.jpg`、観測・操作手順は `browser-observations.md`。画面にあるPIA大船-P等の元からの入口はサーバー機能の移植完了を示さない。取得状態は未接続と明示し、元キャッシュの既定enabled:trueを稼働中スケジューラーと誤認させない。

### 発見・修正した問題と限界

- 追加パネルのHTMLとDOMのinnerHTMLを文字列比較した結果、空属性の正規化差で更新通知が循環しブラウザーが停止した。描画済みキーを保持して同じ内容を再設定しない形へ修正し、その後の操作が継続可能であることを確認。
- 初期の汎用catch-all内の開発用リクエスト処理ではプレビューが500となった。専用 `/api/vps/[...path]` 経路へ分離し、URLからRequestを再構築して解消。Node/ネイティブWorkerの同じ認証処理は成功しており、ルーティングとRequest取り扱いのどちらが単独の原因かは未確定。
- 元UIは非同期に別の部品へ置換するため、最初の「日付」選択は最終描画後の「営業日」選択に変わる。最終UIで操作して検証した。
- 元概要は欠損差枚を11/12台として除外するが、元の全台表の勝率は別の分母を使う（例2/12）。描画途中の旧カードではnullを+0と表示する経路も見えた。元仕様/既存不具合の切り分けが必要なので、重要な集計や数学を勝手に修正していない。APIの欠損と判別はそのまま保持。
- 元remote cacheのPIA公開由来店舗フィルターを保っている。今回のowner認証済みPIA形式の検証は成功したが、すべての私有店舗の画面経路、パスキー/招待、実端末連携は未検証。

## B：メモリ消費の特定と同等性を維持した実装

### 処理ごとの計測

元の関数本体を変えず、同じスコープに計測ラッパーを置いた診断用コピーで180日×106台を調べた。`profile-stages.log` は変更前の出力ハッシュも保持。

| 境界 | ヒープ使用量の観測値（前→後、概数） |
|---|---|
| brutePrepare（日別特徴量の準備） | 70.9MB→170.9MB |
| v4ModelTraining（モデル学習） | 171.0MB→163.6MB |
| bruteSingleGenerate（単一根拠の集計） | 170.7MB→257.0MB |

GCが途中に入るため、これらは関数が保持した正味量や関数内ピークの厳密値ではない。ただし特徴量の準備と根拠集計が主要な調査対象であることを絞れた。初回のプロファイラーはグローバルから関数を参照できず段階記録が出なかったため、同じ字句スコープへ挿入する方式に修正。初回ログも残す。

### 値を変えないメモリ削減

`generate-analysis-runtime.mjs` は元実行アダプターをコピーして生成し、元特徴量の文字列を同じ値ごとに共有する。brutePrepareの中間作業行はこの関数が参照するスカラー項目の投影に変更し、元の全入力・台数・履歴・保存ペイロードは保持する。計算式、確率表、閾値、重み、FDR、モデル評価、演算精度は変更していない。

50日×12台の比較では元と最適化版の全モデルJSONおよび8段階の中間ハッシュが一致。中間ハッシュにはMap/Set/NaN/-0を区別した表現を用い、v5Backtestを含む。元runExistingStorePlanとのランキング全項目も一致。

180日×106台では通常版・最適化版・後述のネイティブWorker版の最終モデル全体のJSONハッシュがすべて `038b4c61d573d0ae0d4f6bc591a9bdd6b88177ffce89f6fd4ff262ebe7215e8b`。ランキングの元契約ハッシュも `791ba0460f0e82e8891a8633057ab55165c80a85ee19d3d7c6317bf3203b7fca` と一致した。大規模入力の全中間ハッシュや元VPSのモデル探索791.8MiBの処理まで網羅したとは扱わない。

### 元コードを事前に組み立てたWorker版

`generate-worker-analysis.mjs` は固定元の5個のJSとHTML内スクリプトを、元headlessアダプターと同等の実行コンテキストへ事前に組み立てる。実行時のnode:vm / fs / evalは不要。元数学の関数本体は上述の一時表現最適化以外維持する。各呼び出しに独立したコンテキストを作り、未来日/対象日以後の情報は元と同じ条件で除外する。

生成物 `lib/analysis/compiled-worker.mjs` は約436KB。Node上でも元のモデル全体との一致、および未来日の極端なデータを加えても対象日の結果が変わらないことを確認した。

| 実測 | 結果 |
|---|---|
| 元ランキング処理、前回の180×106 | Node最大RSS402680KiB、約40.2秒、成功 |
| 最適化したランキング処理、180×106 | Node最大RSS367572KiB（約359.0MiB）、約17.4秒、元と同じ結果 |
| 同じ最適化処理、Node heap96 | OOM、終了134、child最大RSS293300KiB、約10.5秒、結果なし |
| ローカルworkerd、50×12 | HTTP200、12台、約362ms |
| ローカルworkerd、180×106 | HTTP200、106台、約6822ms、元と最終モデル全体のハッシュ一致 |

Nodeの96MBヒープとWorkerの128MB全体枠は異なる。所要時間は実行条件が異なるため、上の速度差を最適化単体の効果と断定しない。モデル全体をJSONへコピー/ハッシュ化する監査用ハーネスでは、ランキング契約だけの実行より多くメモリを使う。`full-model-*.log` の値をランキング処理の値と混同しない。

**ローカルworkerdでの成功は確認できたが、ホストのSites 128MB制限への適合は未証明。** ローカルworkerdのisolateのピークメモリを直接測定できておらず、同じ強制上限をかけたと確認できていない。Python child rusageの529440KiB等はNode/実行基盤全体に関するプロセス側の指標で、isolateのメモリ値ではない。/procの値も前回同様不整合のため採用しない。ホスト試験のために公開を先行させていない。1 isolateでの同時大規模解析の合計メモリ、CPU上限、全履歴3660日、元モデル探索/PRE/過去比較は未検証。

## 入力時点固定と実際の解析への接続

`input-snapshot.mjs` はD1の3つのSELECTを単一batchで行い、同じDB時点の店舗・valid営業日・台ペイロードを取得する。元のlimit（既定180/最大3660）と順序、項目マッピングを維持。日別JSONを一意なR2キーへ保存し、全日が成功してからハッシュ付きmanifestを保存する。後から元のD1が更新されても、解析はその不変入力を日別に取得して検証できる。

D1 batchのトランザクション契約は公式資料 https://developers.cloudflare.com/d1/worker-api/d1-database/ で確認。ローカル試験では世代をそろえて更新する8件の並行writerとcaptureが混ざらないことも検証した。将来の取り込みでも営業日valid化と台データ更新を同じ確定単位にする必要がある。

元のopenStoreHistoryは複数SELECT間の時点固定を保証しないため、そのまま解析へ直結せず、同じ出力形式の不変入力に接続した。`run-frozen-node.mjs` と `run-frozen-worker.mjs` で実際の元モデルへ渡す。D1を更新しても以前の入力・モデルが変わらないこと、チャンク破損の検出、途中のR2失敗でmanifestを公開しないことを検証。ネイティブWorker内でD1取得→R2保存→元モデル実行→Node原本と全体ハッシュ照合するテストも成功した。

**制約**: capture時は単一D1 batchの結果をメモリに保持する。原本の取り込みエンジンは全日配列を要求するので、その入口では配列へ再蓄積している。完全な逐次計算ではない。原本が持つ400日のheadless取り込み上限も勝手に変えていない。計算途中からの再開、解析ジョブの永続lease/再試行/重複防止、結果の世代付き確定はまだ実装していない。snapshotの破棄/GCも有効化していない。

## 試験・比較の結果

コマンド原本と終了値は `evidence/v6/command-results.json`、全ログは `evidence/v6/logs/`。

- `node --test tests/port-*.test.mjs`: **34成功、0失敗**。元判別1152入力の比較、元API、8段階/全モデル/ランキング、未来情報除外、入力固定、競合、障害、ネイティブWorkerの実行を含む。
- 公開用 `node --test sites-migration/tests/*.test.mjs`: **26成功、0失敗**。公開パッケージ化の途中に不足したgenerated-judge、Miniflare import置換の不具合を修正。失敗ログも保持。新規npm installからの依存導入試験はしていない（前回からの同版Miniflare一時リンク）。
- 元 `npm test`: **83/83コマンド成功**。
- 元 `npm --prefix vps test`: **569成功、1失敗**。前回同様の `safe DB path resolves symlinked parent directories before production-path checks`。不存在の/var/lib/jugestとdangling symlinkの環境条件。期待値・元実装は変更していない。
- Sites build-site.mjs: 複数回成功、最終 `build-verified.log`。開発専用機能が生成Workerから除外されることを検査。
- 保護判別の初回比較では、直接取得したNodeオブジェクトのNaNとHTTP JSONのnullの差で失敗。元もJSON送信時にnullとなるため、両者を同じHTTP表現で比較する試験へ修正した。数学やAPI出力を合わせて改変したのではない。
- 新機能欠落の赤テスト、途中のOOM/診断の失敗と成功を区別して全ログを保持する。「native-worker-red.log」は名前にredがあるが最初から合格した記録であり、失敗を捏造しない。
- 今回未実施: ホストD1/R2とisolateメモリ、実本番データ/実認証情報を用いた対比、全画面/モバイル、私有店舗の全操作、招待/パスキー、全MCP/OAuth、収集/同期/運用キュー、PRE/パチンコ全機能。

## 機能別の最新版判定

| 機能 | 判定 |
|---|---|
| 元画面で店舗選択/営業日/台データ/保存済み解析/状態/受領履歴 | **ローカルの開発用認証で一連の動作確認済み**。ホスト・本番データ・全権限は未検証 |
| 公開判別/認証付き台判別 | 部品/ローカルAPI互換完成、ホスト確認未実施 |
| 現行v5予測のWorker版 | 部分完成。ローカルworkerd180×106で全モデル一致。ホスト上限・運用経路未検証 |
| 解析入力固定・D1/R2との接続 | 部分完成。ネイティブWorkerの接続テスト成功、全過程の逐次処理ではない |
| 保存・競合・欠損復旧 | 部分完成、既存試験継続成功。安全な自動GCは未実装 |
| 新規解析を画面から実行/店舗横断/全予測・答え合わせ・過去比較 | 内部の現行予測実行は前進。公開API/ジョブ/全エンジンは未実装 |
| 認証・招待・管理 | 既存receiver/読み取り鍵と隔離した開発セッションのみ。ホスト主体対応/パスキー/招待は未実装 |
| 自動収集・同期・端末取り込み・キュー | 未実装 |
| パチンコ/全MCP/OAuth | 未実装部分あり。MCPはjudge_machinesのみ |
| 実データ複製 | 未実施。分類・許可・整合バックアップ・容量・復元検証が先 |

## 変更と引き継ぎ

新規: `client/sites-store-connection.mjs`、生成ブラウザークライアント、専用API route/境界、隔離したdev fixture/session、静的生成Worker/Node原本比較ハーネス、固定入力とWorker接続部品、対応するテスト/生成スクリプト/証拠。変更: catch-all/API保存境界、HTMLへの接続モジュール追加、準備スクリプト/package、UI同一性テスト、本書。元upstreamのファイルと数学は編集なし。全変更パス/新規・変更・削除区分/各目的は `evidence/v6/CHANGED_FILES.tsv` と配布ZIPに省略なく記録する。

公開GitHubの `upstream` は元リポジトリrootへの相対シンボリックリンク（..）で、元コードの二重コピーを避ける。Linux等のsymlinkを扱えるcheckoutが必要。SitesのZIP側には元upstreamファイルそのものを含め、公開ブランチの追試に依存しない。

ZIPには全追跡ソース、元コード、Git bundle、すべての保存ログ、再現手順、対象コミット、ファイルごとのSHA-256と検証スクリプトを含める。開発セッションの実Cookie/ランダムトークン、ローカルDB/R2、.dev.vars、node_modules、利用者情報、本番DBは含めない。固定テスト文字列はテスト専用で、実環境の資格情報ではない。

## 次回の正確な再開

1. **保存版6** とDELIVERY_INDEXのSites SHAを確認し、bundleから復元。34件のテストと公開パッケージ26件の再現手順を確認。
2. 最優先はWorker版のisolateメモリ/CPUをホスト相当の上限で検証できる方法の特定。ローカルworkerd成功を128MB保証としない。公開は直前の明示許可まで禁止。
3. 固定入力→解析→結果の永続確定をジョブとして実装。単一実行・lease・失敗再試行・重複抑止・同時解析メモリ管理を確認してから、元画面の正しい予測モード/解析実行へ接続する。PREを現行v5で代用しない。
4. raw入力保持と同じ中間値を守り、batch capture/元importerの全配列保持を段階処理へ置き換える。400日/3660日等の元契約を無断変更しない。
5. 本番主体をコピーしない形でSitesユーザー/チャネル/閲覧招待/パスキーを移植し、私有店舗・実端末・同期・収集・パチンコ・全MCP/OAuthへ進む。
6. 実データ移行は分類/許可/整合バックアップ/復元試験後。元データへ一切書き込まない。GCもreader/writerの安全性を証明するまで禁止。

# 保存版6からの継続：保存版7（2026-10-27 日本時間）

**ここが最新版。完全移植は未完了。実装・比較・実画面検証を行い、新しい非公開保存版として引き継ぐ。本番サイト/VPS/DB/運用/ドメイン、元GitHub deploy/vps・mainは変更していない。Sitesの公開・デプロイも行っていない。**

## 復元した基準とGit

- 保存版6のSitesソース `f31e7e43e11ff63ea37335d1397273561de4a659`、latest=6、live/preview URL=null、未コミットなしを確認し、Sitesのsource helperで開いて続行した。
- 元本番固定 `1f8c29fc458f34e11e546fb57944d0fc31db98a5` のupstreamは編集なし。元GitHub開発ブランチの開始SHAは `628c540573a59e45ed3aee017a818f18f2be0f86`。
- 新しいGitHub開発ブランチ `work/sites-migration-20261027` は `8b88e3fcf02fe87e3cb658591a2af8c1579f5c7a`。公開可能な28ファイルだけをsites-migration配下へ反映し、GitHubで参照更新を受理、ローカルfetchで同じツリーを確認した。URL: https://github.com/2qt9wrwbj9-web/jugest/tree/work/sites-migration-20261027/sites-migration 。本番固定との差分はこの配下のみ。
- ローカル仮コミット3945608はarchive/sites-migration-local-v7-3945608に保持し、通常の作業ブランチをGitHub確定SHAへ揃えた。公開側は未コミットなし。
- Sitesの保存版番号・確定コミットは配布 `SITES_SAVED_VERSION.json` と `DELIVERY_INDEX.json` を正本とする。Sites独自リポジトリのmainと、元GitHubの保護対象mainを混同しない。
- 元GitHubのローカル取得はshallow（途中までの履歴）である。原本再現用には追跡ソースと既存のobjects/refs/shallow境界を、資格情報を含み得るGit config/FETCH_HEAD/hooks等を除いて別tarへ収録する。全リモート履歴を取得・完全収録したとは扱わない。Sites bundleは完全なSitesソース履歴。

## 今回実装した一連の機能

### 入力を同じ時点で固定し、1日ずつ読み出す

保存版6はD1 batchの全台ペイロードをJavaScript配列へ取得していた。今回は単一D1 batch内で、店舗情報とvalid営業日の台データを `sites_analysis_captures` / `sites_analysis_capture_days` へコピーして完了印を付ける。その後に日別JSONだけを順に読み、R2へ不変オブジェクトとして保存する。原本の並び順・日別マッピング・欠損・台情報を維持。以後のcanonical更新は混ざらない。

capture IDをジョブごとに固定し、途中でR2保存に失敗しても、再試行が別世代の入力を混ぜない。既存の同じキーは一致するハッシュ/バイトだけを受け入れる。全日完了までmanifestを作らない。元のテストに加え、8件の原子的writerとの競合、欠損/破損/R2失敗を確認。

R2読込後も全日をraw配列へ戻さず、元 `previewExternalJson` の正規化を1日ずつ呼び、正規化済みの日をまとめて元の保存処理へ一度だけ渡す。元の学習コードは正規化済み全履歴を使うため、この全保持までなくなったわけではない。元の400日上限を勝手に増減せず、超過は明示エラー。日次既定の180日や対象日の未来情報除外も維持する。

### 安全なジョブと確定

元queue.mjs、analysis/refresh-state.mjs、analysis/daily-analysis.mjs、coordinator.mjsを調査した。元の状態名（queued/leased/running/succeeded/retry_wait/failed/cancelled）、最大3失敗、条件付き所有権、古い実行の排除をD1に適合させた。全VPSキュー/スケジューラーの移植ではないため、別のsites_analysis_*表で元のjobs表と分離する。

1. 店舗・処理種別・対象日・入力営業日数・重複防止IDを記録。重複要求は同じジョブへ返し、同じIDで別の内容を指定すれば409。
2. 同一時点の入力を固定し、manifestと入力識別ハッシュを永続化。処理をいったん返す。
3. 不変入力から元解析を実行。全モデル/店舗分析をR2へ仮保存し、D1に候補の参照・ハッシュ・範囲を残す。この時点はqueuedで、結果取得は409。成功として公開しない。
4. 別の要求で全文とペイロードのハッシュを1度の読出しで同時検証し、D1の単一batchでsucceeded・結果参照・受領履歴を確定する。

永続的な実行枠を一つにし、大規模解析を同時起動しない。実行権は2分の期限と試行番号/所有者で条件付ける。期限切れは次の要求で回収し、古い処理の後着保存を拒む。最新ジョブIDが一致する場合だけ店舗の最新成功参照を進めるため、古いジョブが新しい解析を上書きしない。途中候補・失敗・新しい待機ジョブがあっても前の成功結果は保持する。

再試行時間は元coordinatorの `_retryAt` を生成コードへ抽出した。30秒×2^失敗回数（最大30分）にjob IDの0〜10秒の分散を加え、200組を元関数と照合した。初期の暫定1秒間隔は修正済み。古い試験/画面観測の記録も残す。

通常店舗分析の受領 input_hash は、元の日次処理と同じ `{storeId,analysisVersion,options,days}` を逐次ハッシュ化して保持した。固定snapshotの識別ハッシュは別に扱う。現行予測は元の日次解析と混同せず、新しいENGINE_VERSIONを受領記録に使う。既存の受領記録は書き換えない。

### 大容量出力を重複複製しない

180日×106台の全モデルは約26.7MBの正規化JSONになる。モデルをJSONへ複製し、さらにキー順を整えたオブジェクトへ複製する方式が大きな消費源だった。元の正規化JSONと同じバイト列を、オブジェクトを複製せず順に出す処理を追加した。数値の精度や計算式は変更していない。数値キーの列挙順・疎配列・null・不足フィールド・非有限値を元契約と比較した。HTTP JSONでNaNがnullとなる元の動作と、厳密canonicalJsonが非有限値を拒否する動作は区別している。

1MiB以上の結果は256KiBの不変R2部品に分割し、すべての部品後にmanifestを作る。各部品と全文のSHA-256を照合。R2結果取得APIも全モデルをサーバーで再JSON.parseせず、照合済みの同じETag/部品を順に返す。元の /analysis/default の表示内容も同じペイロード範囲から配信する。故障でmanifestができない時や途中部品が壊れた時は確定しない。

## 認証付きAPIと元画面

元receiver認証・assistant-read拒否・店舗閲覧権限を先に確認し、追加の解析APIにも適用した。POSTの異なるOriginを拒否し、入力本文は4096バイトまで。ジョブの取得は認証チャネルと店舗を照合する。通常ビルドのexecutionEnabledはfalseで実行を閉じ、DEVかつ明示的な開発設定で元receiverへ接続できた開発セッションのみ実行を許可する。本番の鍵をコピーしていない。公開ビルドに開発用セッション/データの実装がないことも検査した。

新規API:
- POST /api/vps/stores/:id/analysis/jobs
- GET /api/vps/stores/:id/analysis/jobs
- GET /api/vps/stores/:id/analysis/jobs/:jobId
- POST /api/vps/stores/:id/analysis/jobs/:jobId/advance
- GET /api/vps/stores/:id/analysis/jobs/:jobId/result

元の店舗一覧/日/台表示を保ち、店舗解析画面へ対象（店舗分析/現行予測）・日付・入力日数・実行/続行・ジョブ履歴を追加。既定店舗分析は元の日次オプション `{period:'180',minG:'2000',maxDims:'1',minDays:'4'}`。現行予測はPREと明確に分け、元の予測画面/PREを別の数学で代用しない。/analysis/default と /analysis/history に保存結果を接続した。

ブラウザー検証は独立した50日×12台の生成観測データで行った。50日/600台日/406根拠から、対象日2/18で49日/588台日/398根拠へ実際に変化した。現行予測の12台順位も表示し、保存結果を履歴から再取得した。データのない2025-12-31で失敗しても、元の成功結果は維持された。ページ再読込でジョブ履歴を復元し、有効な対象日に戻すと50日/600台日へ復旧。最終#5は三段階処理で保存完了した。

実画面の操作/不具合修正/観測値は `evidence/v7/browser-observations.md`、画像は `browser-analysis-controls.jpg` と `browser-saved-results.jpg`。初期の一覧未取得時のボタン無効、HTTPプレビューでcrypto.randomUUIDが使えない問題を修正した。すべての画面/モバイル/エラーをブラウザーで試したとは扱わない。

## 原本との一致

- 小規模50日×12台: 元の保存済み店舗分析と完全一致。現行予測の全モデル・8段階ハッシュも一致。
- 保存版6と同じ180入力日ケースは、元と同じ対象日当日の除外により179日が対象。全モデルハッシュ `038b4c61d573d0ae0d4f6bc591a9bdd6b88177ffce89f6fd4ff262ebe7215e8b` と8段階が一致。
- 別途、**全180日が対象日前**となる2026-06-30を対象日とした180日×106台を比較。元と移植版の8段階（特徴量準備、学習、設定分布、長期記憶、単一根拠、予測用履歴、バックテスト、予測）とモデル全体が一致。ハッシュ `e383f1fb9c3dba7e646cf2d88608352a9585f585e255e1936065ff840fb67cb0`。
- 同じe383...は実workerdの入力固定→解析→分割R2→検証/確定でも一致。数学・確率・閾値・重み・ランキング・精度を変更していない。
- これは現行v5系モデルと標準店舗分析の比較。元の全PRE/モデル探索/全バックテスト/正式試験/過去比較の移植・一致を証明するものではない。

## メモリ実測と未解決

Node v24.22.1、Miniflare4.20260515.0、workerd1.20260515.1、compatibilityDate2026-05-15、nodejs_compat。Inspectorの各段階停止でRuntime.getHeapUsageを読み、使用ヒープ、確保ヒープ、配列/外部文字列のbackingStorageSizeを別記した。プロセスRSSをisolateメモリと誤認していない。停止/計測の影響があるため所要時間はCPU上限測定ではなく壁時計時間。

| 最終の代表ケース | 実測/限界 |
|---|---|
| 入力/対象 | 全180日×106台、対象2026-06-30、入力180日を確認 |
| 入力固定→解析/仮保存→検証/確定 | 成功、解析/仮保存約10.8秒、検証約150ms。全文出力ハッシュe383...が原本と一致 |
| 使用ヒープの観測最大 | 108633888バイト（約103.6MiB） |
| 確保ヒープの観測最大 | 158605312バイト（約151.3MiB） |
| 使用ヒープ+backingの観測最大 | **138140301バイト（約131.7MiB）**。embedder等の全内訳を足した厳密な総量ではない |
| V8 old-space96MiB・semi-space4MiBを明示した別workerd test | 全180日×106台の元計算と逐次出力ハッシュ成功、約10.7秒。ただしD1/R2全段階・全体128MB枠を同時に試したものではない |

**128MBへの適合は未達/未証明。** ローカルは成功するが、使用ヒープ以外を含む観測値に128MiBを超えるものが残る。確保ヒープも128MiBを超え、同じisolateが要求間で再利用されるため、段階分割しても未回収のデータが即座に消えるとは限らない。途中の測定が約116MiBだったことだけを採用せず、超過した記録もすべて保持している。

モデル/出力の重複複製を減らし、仮保存と検証を別の要求へ分け、全文とペイロードの二重読出しを1回へ減らした。一方、R2読み戻し後の外部バッファと未回収ヒープが次の課題。ホストと同じ強制総量上限・CPU/副要求数・厳密な連続ピークは未測定。サイトは公開しておらず、ホスト検証のためにデプロイを先行していない。

生の全採取値と試行の区別は `memory-results.json` と全ログ。最終はfull-job-release.log。大規模比較用Node監査のメモリ値をWorker適合の根拠には使わない。元791.8MiBのMODEL_SEARCH自体はまだ移植していない。

## テストと失敗記録

原本は `evidence/v7/command-results.json` と `logs/`。途中ログを削除しない。

- `node --test tests/port-*.test.mjs`: **47成功、0失敗**（port-release.log）。入力固定、元解析/中間値、JSON、権限、3段階、同時実行、期限回収、古い確定拒否、候補破損/修復後再開、R2分割・範囲・途中失敗等。
- `node --test sites-migration/tests/*.test.mjs`: **39成功、0失敗**（public-release.log）。公開用はMiniflareの参照だけ同じ版へ直接適合。新規依存導入からは未検証。
- 元 `npm test`: **83/83コマンド成功**、終了0（upstream-root.log）。
- 元 `npm --prefix vps test`: **569成功、1失敗**、終了1（upstream-vps.log）。前回と同じ安全DBパス判定の/var/lib/jugest不存在/dangling symlink条件。元コードや期待値は変更せず、今回の失敗と混同しない。
- build-site.mjs成功（build-release.log）。生成コマンドも成功（generate-final.log/public-generate.log）。
- Inspector初回は接続先一覧の選択不足、次はdefault execution contextが存在しないため失敗。実際に停止したcall frameから段階名を読む方式へ修正した。失敗を隠して測定値を作っていない。
- 旧ネイティブ読み取りテストは追加importが不足して起動に失敗。必要モジュールを加えて再実行した。検証項目は削除していない。
- canonical比較の初回テストは元が拒否するundefined/NaNを受け入れると誤認して失敗した。元実装を読み、厳密拒否とHTTP JSON正規化の両方を検証するテストへ修正。数値を合わせるための数学変更ではない。数値キー/疎配列も追加して元の列挙順と比較。
- 分割R2をNode側から読む試験でBody二重使用が発覚。取得済みbodyを一度だけ使うラッパーへ修正して再試験した。

## 機能別の判定

| 機能 | 今回の状態 |
|---|---|
| 既存画面で店舗/日/台/保存済み分析 | 保存版6を維持、ローカルで継続動作 |
| 店舗分析/現行予測を画面から開始→保存→履歴から再取得 | **開発用認証のローカル環境では一連の検証完了**。ホスト/本番相当は未完成 |
| 固定入力/逐次正規化/分割R2/安全なジョブ確定 | 部品とローカル実行は実装・試験済み。全体128MB/ホスト運用は未検証 |
| 中断/再試行/二重実行/古い確定防止 | ローカル自動試験済み。期限回収は次の要求で行う |
| 無人運転/スケジューラー | 未実装。ブラウザーを閉じると自動的に次の段階へ進まない |
| 計算途中からの再開/完全な逐次数学 | 未実装。段階内で中断すればその計算を同じ固定入力からやり直す |
| 元の日次ジョブの全互換 | 部分完成。1〜2日だけのinsufficient_data分岐、特徴量/予測/正式試験/過去比較等の後続処理は未移植 |
| 店舗横断/PRE/答え合わせ/モデル探索 | 未移植部分が残る。現行予測で代用しない |
| 認証/パスキー/招待/OAuth/管理 | 元receiver境界と隔離した開発認証のみ。ホスト主体対応等は未実装 |
| 同期/取り込み/取得端末/自動収集/パチンコ/全MCP | 保存版6からの未対応部分が残る |
| 実データ複製/安全な自動不要回収 | 未実施。固定入力/候補/旧参照は削除しない |

## 残る制約・次の再開地点

1. **保存版7** と配布DELIVERY_INDEXのSites SHA、GitHub `8b88e3fcf02fe87e3cb658591a2af8c1579f5c7a` を照合し、bundleを復元。47件と39件の試験、REPRODUCE.mdを入口にする。
2. 最優先は実Workerの全工程に総量上限を適用できる検証方法と、再利用isolateのR2外部記憶/未回収ヒープの削減。V8 old-space96の計算成功を全体128MB保証としない。大きな構成変更や外部常駐サーバー導入はユーザーへ説明してから。
3. 照合段階のバッファ寿命を細かく測り、必要ならさらに短い検証単位と永続状態へ分ける。全日/全台/精度を落とさず、原本との8段階・全モデル一致を再確認。400日の超過を勝手に切り捨てない。
4. ホスト認証/権限、1〜2日の元日次分岐、無人進行/失敗回収を先に適合させ、元の各解析モード・PRE・後続処理へ順に接続する。元画面のVPS自動解析等の旧ラベルと端末スナップショットの同期も未完成として扱う。
5. D1内入力コピーは容量を使い、R2も元入力/候補/結果の旧世代を保持する。D1日別JSONの2MB行上限、大量write/副要求制限、10GB容量・運用料金・安全な保持期限を実データ移行前に確認する。GCの安全性証明が先。
6. 本番SQLite/個人情報/認証情報の調査・複製はまだ行っていない。分類・許可・容量・整合バックアップ/復元検証を経る。jugest.netを恒久バックエンドに使わず独立性を維持。
7. 公開/本番デプロイは直前のユーザー明示許可まで禁止。今回も一切行っていない。

全変更ファイルと目的は `evidence/v7/CHANGED_FILES.tsv`。配布ZIPには本書全文、全追跡ソース、Git履歴、全ログ、検証手順、画像、各ファイルのサイズ/SHA-256を含める。実Cookie/開発セッションのランダム鍵、ローカルDB/R2、.dev.vars、node_modules、本番データは含めない。

---

# 保存版8 継続開発記録（2026-10-27、日本時間の作業指定日）

## 再開元と保存境界

保存版7のSite `d40a19c0db9fa1e56162bd9c307eb4fb3ea8607d`、GitHub `8b88e3fcf02fe87e3cb658591a2af8c1579f5c7a` を確認して継続した。正解基準は変更せず `deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5`。既存の画面/計算コード/ジョブを再利用し、計算式・閾値・順位・精度は変更していない。

今回の公開可能な開発パッケージはGitHub `work/sites-migration-20261027@edc0fe50a1b81746614bd2d94b6065a4b59f0def` に反映し、remote fetchでSHA/tree一致を確認。tree `89461560cf4e5973776dd575da87558b6b4c43ab`。固定本番との差分はsites-migration/内だけ。元のmain/deploy/vps、本番VPS/サービス/DB/ドメインに書込みなし。実データの取得・複製、認証情報の流用なし。外部恒久インフラも作成していない。

Siteは既存project `appgprj_6adfb3bed3bc81919a24843a8fbaf71a` に保存版8として非公開保存する。SiteソースのmainはSites専用リポジトリのブランチで、元のGitHub mainではない。自己参照するcommit SHAは本文に埋め込まず、配布のDELIVERY_INDEX.json / SITES_SAVED_VERSION.jsonを正本とする。公開・private deployを含め全デプロイ禁止を維持。通常ビルドの解析実行APIも引き続き無効。

## 今回の実装

### D1の1営業日1行を解消

新規captureはformat_version=2。営業日メタデータと台ごとのpayloadを、同じD1 batch transactionで不変のcaptureテーブルへコピーし、最後にcompleteを立てる。営業日全体をD1のjson_group_arrayで一つの巨大な行にしない。台の読出しはUTF-8累積サイズ約256KiBごとのキー順ページ（1台自体が大きい場合はその1行）。元と同じ順序・SQLite json(payload_json)の表現を使って、旧版と**同じ日別R2バイト列とハッシュ**を生成する。空のmachine_key、1.00や日本語を含むJSONも旧SQLとバイト比較した。

schema変更は新規Drizzle migration `0003_mature_cammi.sql` と対応snapshot/journalのみ。適用済みmigrationは書換えない。旧format1 captureと既存manifestは引き続き読める。同じcaptureIdで再試行すれば元の固定コピーを使い、元データの後日の更新を混入させない。

2MBを超える営業日（36台、1台約72KB、日本語フィールド）で、各D1行は2MB未満のまま、R2アップロードの停止→元データ変更→同じ固定入力から再開を検証。D1 batchに意図的なSQL障害を入れ、capture行全体がrollbackされmanifestが公開されないことも確認した。

残る限界: 元のmachine_day_dataの**単一台行**自体の2MB制限、D1容量・write増加、SQL/副要求数上限は解消していない。R2に渡す日別JSONと解析正規化はまだ1日単位で組み立てるため、極端に巨大な1日が無制限に扱えるとはしない。コピーした入力/旧結果は自動削除しない。

### R2照合の逐次化と安全な確定

追加のdigestStoredCanonicalはR2 bodyの受信chunkをそのままSHA-256へ供給する。各256KiB部品全体をarrayBufferへ読み直す必要をなくした。部品・全文・payload範囲を一度の通過で照合し、不完全/破損出力を成功にしない。既存形式・JSONバイト・元ハッシュを変更していない。結果取得APIの最初の照合にも使い、ETag条件付きで同じ結果を配信する。

従来の三段階、最新世代ID、条件付き実行権、期限/試行番号、既存結果保持、元の再試行間隔は維持。確定直前での中断、確定D1 batch自体のrollback、その間に新しいジョブが成功した場合を追加試験。古い候補を後から再確定しても新しいheadは置換しない。候補の再照合で済む場合は数学を再実行しない。各段階の計測hookと限定したエラー分類を追加。

認証/店舗/チャネル範囲を継承したGET `/analysis/jobs/:id/runs` を追加し、試行番号、状態、開始/終了、入力/出力hash、段階時間、エラー分類を参照できる。lease所有者や認証値は返さない。API試験で3試行のinput_fixed/result_staged/succeededを確認。

### ブラウザーなしの進行（ローカル検証まで）

内部scheduled用runDueAnalysisPhaseとQueue consumerを追加した。1イベントで1段階を進め、D1のジョブ状態/実行権を正本とする。Queueは未完了ならmessage.retryで次の段階/元の再試行時刻へ再配信する。完了・失敗の重複配信はackし、二重受領を作らない。expired leaseも既存の回復へ委譲する。HTTPによる無認証の管理入口は作っていない。

公式Miniflare Queue bindingの実イベントで受付→再配信→3段階成功・元の結果hash一致・受領重複なしを確認した（native-queue.log）。scheduledアダプターもローカル自動試験で、ブラウザーadvanceなしの元店舗分析と一致。障害後の待機時刻までは実行せず、次のtickで安全に再開する。

既存Sites画面ではDEVのctx.waitUntilを、認証済み受付後の3段階へ接続。受付のbackground=trueの場合、画面はGETで観測し、advanceを送らない。正常例ではタブを閉じた後も完了。DEV処理はretry_waitで止まり、画面の操作を解放する。フォーム値も非同期の再描画をまたいで保持する。

**ホストの無人運用は未完成**。Sitesの公開されていない開発版にQueue/Cron/Workflowsを勝手にbind/provisionしない。worker側のqueue/scheduledは明示envのない場合拒否する。Sites公式の継続更新経路はpublished Siteと別途認可されたwriterが前提であり、保存だけでは利用可能と確認できない。DEV waitUntilはHTTP切断後最大30秒という制約があり、永続schedulerや自動復旧の代わりにならない。ホストの認証/主体/資源枠も未検証。構成変更や外部常駐基盤を無断で導入していない。

## 数学の一致と入力規模

元固定ソースの計算と移植版の8段階hash、モデル全体のdeep equality、全文hashが一致。さらに各ケースのD1固定→R2→解析→R2候補→照合→D1確定→結果取得のoutputHashを同じ基準へ照合した。対象日は入力最終日の翌日とし、全入力日が対象日前である。

|日数×台数|対象日|元モデル全文SHA-256|
|---|---|---|
|90×106|2026-04-01|669508853a624d5852bcb56afec9539bd5e274308116aba71f2b86c36e584338|
|180×106|2026-06-30|e383f1fb9c3dba7e646cf2d88608352a9585f585e255e1936065ff840fb67cb0|
|240×106|2026-08-29|710cc72a1cd90834ad18436bfacce16c7eca45ec1a88524ce161d193ffa54181|
|180×160|2026-06-30|66e3ee613e2db132c56486cb55aaadcb3f20e73eda3d2375f801b42ce4a42fec|

180×106の結果は約26.70MB、180×160は約40.25MB（envelopeを含む保存結果）。データ・履歴・特徴量・精度を減らさず実行した。240日入力も固定/入力hashが240日を含む。元エンジン内の本来の評価期間/未来日除外はそのままで、移植側で日数を切り捨てていない。これらは現行モデルの一連の比較であり、全PRE/MODEL_SEARCHや791.8MiBの元別モードを移植した証拠ではない。

## メモリの意味と実測

**128MB対応完了とはしない。** 前回131.7MiBはInspector usedSize+backingStorageSizeの独自観測値で、Cloudflareの資源判定そのものではなかった。今回も指標を合計して公式上限との適否を断定しない。Node RSS、V8使用/確保heap、backing、embedder、D1/R2サービスのメモリは別物である。

workerd1.20260515.1 / Miniflare4.20260515.0 / compatibilityDate2026-05-15 / nodejs_compat。最終87採取点では、受付、固定DB transaction、台ページ、日別組立/転送、R2逐次入力、元8段階、出力生成/仮保存、逐次検証、D1 commit、再取得を採取。Runtime.getHeapUsageでアプリWorkerを測定し、プロセスRSSを代用しない。繰返す段階は初回と30回ごとを採取し、連続する厳密ピークは未測定。コード/スタック/全native内部や転送領域の完全な内訳・ホスト独自accountingは未測定。

|ローカル全工程|使用heap観測最大|確保heap観測最大|backing観測最大（別時点）|
|---|---:|---:|---:|
|180×106、old-space96/semi4、最終試験|88.83MiB|95.43MiB|18.94MiB|
|180×106、old-space80/semi4|81.71MiB|87.51MiB|30.80MiB|
|180×106、V8上限無指定|119.47MiB|162.51MiB|37.68MiB|
|180×160、old-space96/semi4|118.93MiB|126.34MiB|40.69MiB|

今回はV8設定を**全D1/R2工程を含むworkerd Config**へ適用し完走した。前回の計算単体96MiB試験から進んだが、old-spaceはV8領域の設定で、総isolate128MBの強制枠ではない。old-space96より使用heapが多い観測も、両者が同じ指標でないことを示す。ローカルにホスト同等の資源制限実装がないことをCloudflare一次資料でも確認。Sitesのsave-onlyには実ホストURLがなく、デプロイは禁止されているのでホストの128MB/CPU/副要求枠は検証できていない。

部品配列化をなくしたことはコード/実行で確認したが、無指定全工程のピークが前回より下がったとは主張できない。GC時機により未回収heapが残り、今回のdefault観測は前回より大きい。上限付き試験の小さい値だけを選んで成功扱いにしない。必要なモデル出力自体と元処理の配列が規模に依存して増える問題は残る。

独立した各指標/段階/時間の原本は `evidence/v8/MEMORY_REPORT.md`、`memory-results.json`、全full-*.log。wall timeはInspector停止/並行回帰の影響を含みCPU時間ではない。元791.8MiBのMODEL_SEARCHは未検証。

## 実画面

独立50×12の生成観測を元エンジンで計算。#6店舗分析を受け付けた待機画面でタブを閉じ、D1で3段階成功を確認。再度開いて49日/588台日/398根拠を表示。#7は50日/600台日/406根拠。#8現行予測を実行/履歴再取得し、101番91点、110番90点、106番89点等の全12順位を確認。#9は対象日以前にデータがないため再試行待ち→元の間隔で3回失敗。前の店舗分析/予測は保持され、失敗後にも#8を再取得できた。

詳細と撮影はbrowser-observations.md、browser-prediction.jpg、最終保持画像。認証は元receiverへ接続した隔離DEVセッションのみ。認証を緩めず、通常buildにDEV session/fixtureがないことを検査。ホスト/全mobile/全エラー画面の完成とはしない。

## 試験結果・失敗の区別

実行コマンドと原本ログはcommand-results.json / logs/。主要結果:

- Site全回帰 `node --test tests/port-*.test.mjs`: 54/0（port-final.log）。その後の追加controller試験1/0（controller.log）。合計55/0。API試行履歴の追加照合も1/0（api-runs.log）。重複実行を合格総数へ二重加算しない。
- public package全回帰 `node --test sites-migration/tests/*.test.mjs`: 47/0（public-release.log）。
- 元 `npm test`: 83/83コマンド成功、終了0（upstream-root.log）。元ソースは変更なし。
- 元 `npm --prefix vps test`: 569成功/1失敗、終了1。従来と同じDB安全パスsymlink検査。/var/lib/jugest不存在の環境差。新規移植テスト失敗と混同せず、元のテスト/期待値は変更していない。
- build-site.mjs: 成功（build-release.log）。DEV値混入検索なし。生成/Drizzle migration生成も成功。
- 数学4規模は各8段階と全モデルが完全一致。全保存経路7試行の成功hashも照合。native Queue3段階/receipt重複なし。
- 競合/古いlease/固定後更新/部品欠落/破損/途中upload/確定直前/原子的commit失敗/新しいhead保持/期限回復/元再試行時刻を試験。
- 中間の失敗もログを残す。最初のV8試験helperでConfigのbyte配列やVoidをJSON往復で失いstartup失敗。原Configをdebug境界でそのまま捕捉するtest-only方式へ修正しnode_modulesは変更しない。途中試行を一つ手動中断。初回background試験はpayload.daysがundefinedという誤った新規仮定で失敗し、原本全payloadとの比較に修正した。実装/数学の期待値を都合よく変更したのではない。
- public初回は作業checkoutのtracked upstream symlink不在で失敗し、Git上の同じlinkを復元。最終clean。preview migration applyはdist/server/migrations未設定で初回失敗し、公式のlocal execute手順で新しいschema-only SQLだけを適用。
- 30×12の追加小規模では元コードもmodel unavailableとなり、移植版も出力なし。対象規模を密かに変更して成功とはしていない。原本の失敗ログも保存し、90×106等の成功比較と区別。
- 実ホストの総128MB枠、実OOMkill後のホスト自動復旧、全PRE/探索、実DB移行、空依存環境、全mobile等は未実行。

## 機能別の状態

|区分|状態|
|---|---|
|元画面の店舗/日/台/保存分析・ジョブ開始・現行予測・履歴|開発認証のローカルで一連の検証完了。ホストは未検証|
|台単位の固定入力/旧形式互換/R2逐次照合/安全確定|ローカル部品と一連の実行を実装・検証完了。容量/運用枠は部分完成|
|全工程へのV8 old-space試験|実装/成功。ただし総128MB適合は未証明|
|画面を閉じた後の正常進行|DEV waitUntilで実証。永続運用/中断自動復旧は未完成|
|Queue/scheduled adapterと実Queue試験|ローカル実装/検証済み。Sitesホスト統合は未接続・制約あり|
|段階内の途中計算再開・完全な逐次数学|未実装。失敗すれば同一入力からその段階を再実行|
|元VPSキュー全体/日次後続/insufficient_data分岐|部分完成。正式に移植したのは既述の店舗分析/現行モデル|
|PRE全処理/探索/横断/過去比較/収集/同期/端末連携|今回の重要課題を優先し未移植部分を維持|
|パスキー/招待/管理/OAuth/全MCP/パチンコserver|未移植部分が残る。開発認証で代用して完成とはしない|
|実データ/認証移行・安全な自動GC|未実施。元データ/旧結果の削除なし|

## 引き継ぎ

保存版8の正確なSHA/番号、GitHub SHA、ZIPの全ファイルhashは配布DELIVERY_INDEXと保存結果に記録。全変更と目的はevidence/v8/CHANGED_FILES.tsv、再開/復元はevidence/v8/REPRODUCE.md。ZIPに全追跡Siteソース、Site Git bundle、元shallow cloneの存在するGit履歴、全ログ/検証手順/保存archiveを含める。秘密値、実Cookie、runtime DB/R2、.dev.vars、node_modules、個人情報は含めない。

次は128MBホスト枠とローカル指標の乖離、defaultで残る未回収配列/転送バッファを追い、数学を変えない内部段階化/結果の分割永続化を具体化する。その後にsupported host identityと無人writer、期限切れ回復を統合する。ホスト測定のための公開・デプロイも直前明示許可なしでは実行しない。今回で完全移植を名乗らない。


# 保存版9：逐次入力転送・計算後checkpoint・元FEATURE_BUILD（2026-10-28 JST）

## 正本の復元と今回の境界
保存版8 Site c42f3a3178a6deb2ff0a163a1107d3751b2e9132、GitHub work/sites-migration-20261027@edc0fe50a1b81746614bd2d94b6065a4b59f0defを実コード/原本/ログと照合して継続。前回までの履歴全文は本書に残す。最新の記述はこの保存版9節。Sites project appgprj_6adfb3bed3bc81919a24843a8fbaf71a。Site checkoutのmainはSite専用で、本番GitHub mainではない。元本番固定1f8c29fc458f34e11e546fb57944d0fc31db98a5のソースへ変更なし。既存本番サイト/VPS/サービス/DB/ドメインは操作しない。本番データ/鍵/Cookieのコピーなし。

## 今回の実装
- input-snapshot: 台単位D1固定は維持し、日別JSONのWorker全文文字列組立をFixedLengthStreamでの逐次R2転送へ置換。元prefix/machine JSON順/末尾/数値表現と同じbytes/hash。新規不変UUID object keyでストリーム条件付きPUTの問題を避ける。旧manifest/captureは読める。Node fallbackのみdayバッファを保持し、メモリ証明に使わない。2.59MB/36台の日もnative bytes/hash一致。単一台がD1行上限を超える問題は未解決。
- rawJsonDays: 元のnormalizer前のJSON.parse→JSON.stringifyを省き、検証済み元day JSONをそのまま元の入力wrapperへ渡す。元normalizerと判別/予測/評価数学は変更なし。必要なモデル履歴/内部配列は残る。
- canonical-stream: payloadの走査/JSON化/ハッシュ/不変R2保存を1pass。大容量envelopeは既存payload部品と小さなprefix/tailを共有し、巨大JSモデルを再保持しない。既存canonical bytes/NaN/null/欠損/数値キー順/疎配列/精度とhashは不変。部品自動GCは無効。
- sites_analysis_payloads: 入力hash/実装hash/出力hash/bytes/不変keyを実行権条件付きでD1へcheckpoint。中断後は同じ入力・実装に限りpayloadを再照合して再利用。異なる実装/入力はfail closed。通常の3 advance API契約（固定→解析/仮保存→検証/確定）を維持。元8計算段階の途中から再開する機能ではない。
- durable outbox: 受付と同じD1 batchに配信予定を保存。producerがqueue送信前に停止しても内部dispatcherが回収。条件付きclaimで重複sendを抑制し、送信失敗を記録。transport retryは計算failure回数/元backoffと別。公開管理APIなし、ホストQueue/Cron等は有効化しない。
- 次の未移植単位FEATURE_BUILD: 元vps/src/research/feature-builder.mjsを無変更で再利用。元と同じ最新180valid営業日の固定→対象日以前filterの順序。historyLimit180以外を拒否し、勝手な範囲削減なし。元featureVersion/storeId/asOfDate/rowsと全metrics/inputHashを比較。元形式store_feature_snapshotsを成功確定と同じatomic batchに保存、古い世代が新headを上書きしない。PRE/モデル探索/後続研究cycleは未移植。
- 元画面に特徴量作成、251件結果/軸/期間/日数/台日/平均G/差枚合計を接続。表示に存在しないdiffMeanを使っていた新規UIを、原本が持つdiffSumへ修正し画面確認。数学変更なし。
- schema0004/5/6: payload/feature/outboxを追加。新しい未公開0005生成時の引用index式エラーを局所修正しschema/metaと整合。索引の物理昇順化で明示ORDER BY/計算意味は変えない。旧0000〜3は変更なし。最終回帰は空localDBへ全migrationを適用して合格。

## メモリと一致
原本evidence/v9/MEMORY_REPORT.md・memory-results.json・model-comparison.jsonと全raw logsを参照。local native workerdで受付→固定→R2→解析→payload→envelope→検証→D1確定→結果GETまで実行。4規模すべて元全モデルと8段階が完全一致。180×106 hash e383f1fb9c3dba7e646cf2d88608352a9585f585e255e1936065ff840fb67cb0。4規模すべて末尾日が対象日前で、対象日数は削っていない。

96MiB old-space/semi4の使用heap採取最大:90×106=53.40MiB、180×106=82.18MiB、240×106=88.65MiB、180×160=120.28MiB。無指定180×106=123.48MiB。heap割当、backing storage、embedderは別に原本記録。独立最大を合算して128MB判定しない。前回88.83→今回82.18（96MiB設定）だが採取/GC時点が異なる。無指定119.47→123.48と増えており一律改善や安全余裕の証明ではない。厳密ピーク/Node RSS/host totalではない。Sites実ホスト総128MB、CPU枠、全PRE/探索の適合は未証明。公開を伴うホスト試験はしていない。

## 無人実行・異常復旧
元のlease/世代/再試行間隔/仮保存/照合/成功のみ公開/古い上書き防止を維持。native Queueでproducer停止後のoutbox配信→3段階→成功、店舗分析と特徴量の両方で元hash一致/receipt1件。開発画面も#10現行予測の受付後すぐtab closeし、再openで成功/順位/保存結果を取得。これはlocal DEV waitUntilでの正常進行で、ホスト永続無人運用ではない。

実V8 OOMを2地点で起こした（例外を投げただけでない）。計算開始前とpayload checkpoint後にnative V8 heap fatal終了。親testが同じ永続D1/R2でlocal runtimeを再起動し、test clockでlease期限を進めて回収。旧成功結果保持/同一出力/failure1回、checkpoint後は再計算なし。原本oom-results.jsonとfatal stderr全文。Workers総128MB kill/ホスト自動再起動の証明ではない。数学段階途中のcheckpointは未実装。

## 最終検証と途中失敗
- Site回帰60成功0失敗（node --test --test-concurrency=1 tests/port-*.test.mjs）。公開開発パッケージ52成功0失敗。元root83/83コマンド。元VPS570件中569成功/既知1失敗（symlink production-path、環境に/var/lib/jugestなし）。
- build helper成功、production bundleに開発session marker/fixture混入なし。client最終1/0。native大容量日1成功、Queue2種成功、実OOM2成功、4規模8中間値/全出力一致。すべて詳細commandと全ログを同梱。
- 途中:並列run/queue/profile seedでMiniflare localhost UND_ERR_SOCKETが発生。数学不一致やOOMとは分類しない。同一最終逐次回帰60/0・Queue retry成功を確認。最初のfixture失敗は新migration引用index式、payload新規testのobject wrapper仮定、native境界harnessのmodule不足/manifest hash field名をそれぞれ訂正。元の期待値を広げず、失敗ログも残す。中断/timeoutした試行も成功に数えない。元VPS既知失敗とは区別。
- 実画面はBROWSER_CHECK.md/feature-dom.txt。店舗/営業日/台/保存分析/履歴/予測/新特徴量を操作。店舗分析#12(49日588台日398根拠)/#13(50/600/406)。#14データなしで再試行待ち→失敗、#13の正常結果保持。開発認証を維持。正式認証/全mobile画面は未検証。

## 機能別 最新状態
|機能|状態|
|---|---|
|店舗/日/台/分析/現行予測/履歴の元画面とAPI|開発認証localで実装・検証完了、host未検証|
|台単位固定/逐次R2入力/不変出力/検証確定|local実装・検証完了、大容量運用/単一台行制限は部分完成|
|計算後checkpoint・outbox・実OOM復旧|local実装・検証完了、段階内再開/host自動復旧は未実装|
|元FEATURE_BUILD計算/保存/画面|local実装・元値一致、後続PRE/探索への接続は未実装|
|Sites総128MB/CPU/host無人運用|未検証。移植困難性が残るが不能と確定しない|
|PRE全処理/モデル探索/研究cycle/バックテスト過去API/横断|未移植部分あり。現行エンジン内部計算一致と全サービス移植を混同しない|
|自動収集/運用scheduler/同期/端末連携|未移植部分あり|
|正式passkey/招待/閲覧権限/管理/OAuth/全MCP/パチンコserver|未移植部分あり。judge_machines等既存範囲は維持|
|本番実データの独立移行/安全な自動GC|未実施。自動削除無効|

## 保存・正確な再開地点
GitHub開発branchは072595e93badcc56305f8949d8b3216568715959に更新。本番deploy/vps/mainへ変更なし。Siteは保存版9として非公開保存し、正確なSiteSHA/版ID/保存receiptは同梱SITES_SAVED_VERSION.jsonとDELIVERY_INDEX.jsonで確認（自己参照回避）。保存後両checkoutはclean確認。全変更ファイルと目的はCHANGED_FILES.tsv。全原本/ソース/Git利用可能履歴/ログ/復元検査をZIP提供し、個別SHA256/CRCと別directoryへのGit復元を検証。秘密値/runtimeDB/R2/Cookie/env/node_modulesは除外。

次は保存版9から、MEMORY_REPORT/oom/feature-build差分を先に確認。最優先は180×160のピーク/ホスト総128MB未証明の解消。元8段階の依存を調査し数学/順序を変えない段階境界を実装候補にする。単一台2MBや巨大日parse問題も残す。ホスト内非公開Queue/期限回収の検証可否を確認し、公開が必要なら勝手に進めない。その後FEATURE_BUILD後の元後続job/research cycleを次の小単位として接続。完全移植は未完了であり、外部常駐基盤/数学/権限の重要変更は無断採用しない。


# 保存版10：FEATURE_BUILD checkpointの実装照合範囲を補強

保存版9は1712ec52fafbc9504183633ed2b949b061d10cc2として非公開保存済み（deployedなし）。その後の最終監査で、WORKER_IMPLEMENTATION_HASHが元の通常解析を含む一方、今回追加した特徴量adapter/元feature-builder/元canonical-jsonの変更までは包含しない点を発見。将来の変更後に古い特徴量payloadを再利用しないよう、生成時hashの範囲に3原本を追加。入力/数学/保存値は変更せず、異なる実装のcheckpointを拒否する既存動作を補強した。保存版9を黙って上書きせず、保存版10へ進める。

- 修正はscripts/generate-worker-analysis.mjsと生成compiled-worker.mjsの先頭identity exportのみ。計算body439539bytesは保存版9と完全byte一致（compiled-body-identity.json）。
- identity-scope.mjsは一時copyのfeature adapter/元feature-builder/元canonicalを1つずつ変更して元へ戻し、それぞれidentityが変わり計算bodyは不変であることを検査。実checkoutの元ソースは変更しない。
- 修正後の選択回帰:Site5/0、GitHub5/0（元全モデル/feature全値/保存値/identity不一致/再利用）。保存版9全回帰60/0・公開パッケージ52/0と区別する。修正後Site全回帰の結果はevidence/v9/logs/v10-port-final.logとcommand-resultsに記録。
- 修正後buildの最初の呼出しはclient build工程で終了し、完了記録がないため成功扱いにしない。再実行identity-build-final.logでBuild completeを確認。最初の保存helper JSON入力も制御文字付加でparse拒否され、秘密を出さず改行のみで再送し成功。
- 正確な最新GitHub開発branch:work/sites-migration-20261027@a2c532a7b156f87f505b4fee2012580bbd253ba8。Sites最新版は保存版10、SHAは配布SITES_SAVED_VERSION.json参照。旧版9の保存事実と最新10を区別。両checkout cleanを最終確認する。
- 保存版9の4規模メモリと元8段階/全モデル比較は同じ計算bodyの証拠として保持。保存版10で4規模メモリ試験を再実施したとは主張しない。128MB/host無人運用/正式認証/PRE全体などの未解決状態は保存版9節のまま。

最新の再開地点は保存版10。まずこの補強とevidence/v9原本（今回9→10で共用）を読み、総128MB/大規模モデル内段階化、ホスト非公開の無人運用、FEATURE_BUILD後続jobへ進む。元Site9の実装や部品を作り直さない。完全移植は未完了。

保存版10の全回帰も完了:60成功0失敗0skip0cancelled、exit0（v10-port-final.log、355135.52ms）。production bundleへのDEV fixture/session marker混入なしを再確認。公式のisolate/行/bind/query/DB上限とwaitUntil制約をOFFICIAL_LIMITS.mdへ再記録。一般Workerの機能がSitesで自由に有効化できるとはしない。


# 保存版11：現行予測の前半分割・元BACKTESTの独立移植（2026-10-28 JST）

## 再開確認と境界
Site10 07a9af36e09e4092e675af3b55746c3eb741ecaa、GitHub work/sites-migration-20261027@a2c532a7b156f87f505b4fee2012580bbd253ba8、前回原本/全ログ/メモリ/成果物を照合し、cleanな最新地点から継続。Siteはownerのみ、live/preview URLなしを確認。本番のサイト/VPS/DB/domain、元deploy/vps/mainは操作しない。元本番基準1f8c29fc458f34e11e546fb57944d0fc31db98a5の計算ソースは無変更。独立DEV fixtureのみ、秘密/本番データ移行なし。

## 現行予測の安全な前半分割
元v5AnalyzeStoreのv4PredictStore前の式と依存を調査。history配列は後半にlengthだけ、backtestはsupportsだけ必要なため、元と同じ計算でhistoryDays/signals/typePcts/comb/gate/bootstrap/blend/supportsを作り、入力固定呼出しでR2へ保存。D1 stage metadataはinputHash/implementationHash/body hash/key/bytesで拘束。次の呼出しは固定入力を再正規化して元v4計算/最終組立を実行。通常の3advanceは維持する。旧固定済みjobに前半stageがなければ元の単一計算へfallback。数学/範囲/履歴/候補/精度は削らない。

版付きgraph codecはMap/Set/非有限値/-0/undefined/穴/参照共有/挿入順を保持し、関数を黙って削除しない。元のclosure内で前半helperを生成し、index.html自体は変更しない。v4のfit/forRow等は単純JSON化できず、今回無理に分割しない。lib/analysisの実行関連ソース全mjs（自己生成compiled以外）と元の関係ソースを実装hashへ含める。新規result descriptorにも実装hashを記録。payload再利用時だけでなく最終確定時にも実装を照合し、アップグレード途中の未確定出力を黙って成功させない。成功attemptによる書込みをfenceする。

90日×106台、180×106、240×106、180×160の元全モデルと8中間値が完全一致。中間値は元Node auditと分割compiledのNode試験（graph JSON往復あり）、native workerdはD1/R2全工程の最終payload hashを比較する。両環境を混同しない。180×106モデルhash e383f1fb9c3dba7e646cf2d88608352a9585f585e255e1936065ff840fb67cb0。

## メモリと負担の実測
evidence/v11/MEMORY_REPORT.md、memory-results.json、全raw logsを参照。old-space96MiB/semi4の採取最大使用heapは90×106=52.20MiB、最新180×106=78.26MiB、240×106=83.95MiB、180×160=120.22MiB。無指定180×106=105.17MiB。最新180×106は元Site10コンパイル計算を同じwrapperへ渡した対照84.44MiBより小さいが、新方式の先行試行は84.37MiBで、GC/採取時点のばらつきがある。安定した削減幅や厳密ピークを保証しない。

heap使用/heap割当/backing storage/embedderは別値として原本に記録。無指定ではbacking storage64.40MiBへ増加しており、すべての指標が改善したとはしない。独立最大を単純合算しない。Node RSS/ホストtotal/CPU課金値/厳密ピークは未取得。最新180×106の使用heap最大採取はbruteSingleGenerate付近。大きい160台では依然余裕を証明できない。

最新180×106は受付〜GETでD1 API571/SQL593、R2 GET787/PUT288。対照はD1 568/SQL590、GET604/PUT287。前半の保存/再読込みでGET+183、PUT+1、保存約44KB、D1+3。論理read bytesや取得できたrows metadataは実wire/課金量と同じではない。詳しい呼出し別/工程別時間と計数条件は原本。処理は分割したが入力を2度正規化する負担があり、費用額はSitesの契約/実課金が未確認なので作らない。一般公式128MB/query/row/bind/CPU/waitUntil制約もOFFICIAL_LIMITSへ再記録。

Sites実ホスト総128MB/CPU/quota/無人運用は未証明。非公開保存だけでhost試験をしたとはしない。ホストbinding/外部常駐基盤/公開を無断で追加しない。

## FEATURE_BUILDの後続として移植した主要処理
元jobs/feature-build→ensureResearchCycle→BACKTEST→recordBacktestCompletion→MODEL_SEARCH→研究champion昇格/収束/holdoutという実行順序・保存先を確認（DEPENDENCIES.md）。今回、元BACKTESTの独立実行を元画面の既存解析選択へ接続した。

同じ固定入力のFEATURE_BUILD完了を前提に、元初回baselineModelまたは既存research_championを使用する。簡易モデルで代用しない。model JSON/fingerprintは受付時に固定し、待機中のregistry更新で差し替えない。canonical入力とfrontierはcaptureで照合して一度だけ閉じる。最新180valid日を先に読み、その後frontier以前へ絞る元順序を維持する。

元research/backtest、model-search、axis-discoveryの計算を無変更importし、元rankSplit/persistSplitを固定BACKTESTから生成する。walk-forward dataset、時系列分割、学習/検証スコア、順位、入力/元結果hashを再利用。最終評価用holdoutは計算/保存/表示しない。データ不足は元と同じinsufficient_dataを明示し、予測結果を捏造しない。

元のbacktest_runs/predictions形式へD1非同期保存を接続。確定と同一batchで両splitを保存し、失敗ならrollback。別input/model/splitの履歴を消さず、同一runの再実行だけ元同様置換。追加publication世代で古いjob/attemptが新しいrun行/時刻を上書きしない。新しいD1 unique indexはこの論理identityの競合対策で、本番の既存重複有無は未調査。実データを削除して適合させることはしない。

元SQLite BACKTEST子processを実際に起動し、初回baselineと非baselineで元結果hash、run全列（実時計created_at以外）、prediction全行が完全一致。50日×12台fixtureの初回結果hash1562f3c8670a222a610c414033b678982c61d79a7c81dbe5a06e480b2fa1eba0。native Queueでもfeature後の過去検証を実行し同じhash/2run/holdout0/receipt重複なし。

**未移植の境界:** 自動研究cycle全状態、research_loops完了/不足時のidle更新、BACKTEST→MODEL_SEARCH enqueue、モデル探索/候補評価全体/昇格/holdout解禁/active model採用、正式PRE-v2全試験。初回registry初期化も元の自動FEATURE_BUILD後とは異なり、この独立手動検証の受付/前提成立時に限定。これを元の自動研究cycleやPRE全体の完成とはしない。新BACKTEST大規模dataset/SQL batchの128MB容量は未検証で次回優先。

## ジョブ/障害/画面
元の固定入力、世代/lease、元の再試行間隔、仮保存/照合/成功のみ公開、outboxを維持。native Queueで現行予測/研究検証の3段階がbrowserのadvanceなしで完了し、元hash一致/receipt1。

実V8 heap fatalの3地点（計算開始、最終payload checkpoint後、新規前半checkpoint直後）をローカルnative childで再現。永続D1/R2を維持してlocal runtime再起動、試験clockでlease期限を進め回収。同じ入力/出力、旧結果保持、failure1回。新前半は再計算せず再利用。fatal stderr全文/oom-results.jsonを収録。これはホストtotal128MB killやhost自動再起動の証明ではない。

実画面では店舗選択/営業日/台表、#15特徴量251件、#16過去検証（開始直後tab close→再open→履歴/結果）、#17現行予測（101番91/110番90/106番89）、#18店舗分析02-18（49日588台日398根拠）を確認。#19前提featureがないfrontierは再試行待ち/前提不足を表示し既存正常結果保持。auth/permissionは共通の拒否回帰を維持、正式認証は未移植。元画面の構造へ1選択肢を追加し、ダミー出力で置換しない。BROWSER_CHECKと全DOM原本を参照。

## 試験/既知失敗
- 最終Site全回帰69/0、後に追加した最終実装fence1/0。現在の全file合計70件をすべて実行。public全回帰61/0+同追加1/0で62件。commandと時点はcommand-results.jsonで区別。
- 元完全cloneのroot83/83コマンド。元VPS570中569/既知symlink1（/var/lib/jugest環境依存）。新しい失敗とは混同しない。build complete、production bundleのDEV marker混入0。
- 初回分割はhelperが元closure外に出てReferenceError（1/4成功）。同じclosureへ修正して4/0、その後最終全試験も成功。故障注入の初回はcatchのbatchにも繰り返しfaultを入れtest失敗、確定batchだけへ絞り3/0と最終全試験成功。元の数学期待値を変えて成功にしていない。
- Site/upstreamの部分copyでroot commands.jsonやVPS fixturesが不足し失敗した記録を保持。これを元既知1件へ紛れ込ませず、完全cloneからroot/VPSを再実行して区別。生成された不要upstream/publicだけを除去、元固定ソースは無変更。
- 未実行:実host128MB/CPU/Queue/自動再起動、大規模研究backtest、PRE全体、正式認証・収集・同期・全MCP等、実データ移行、空cache依存導入/全mobile。

## 最新機能状態
|機能|状態|
|---|---|
|元店舗/日/台/保存分析/履歴/ジョブ/現行予測/FEATURE_BUILD|ローカルDEVで実装・検証、host未検証|
|現行予測前半の分割/保存/再利用/最終version照合|ローカル実装・比較/実OOM復旧完了、元v4内部のさらなる分割は未実装|
|元BACKTESTの学習/検証計算・保存・画面|独立単位をローカル実装/元SQLite比較完了。大規模/host/自動研究cycleは部分完成|
|D1/R2固定入力/不変保存/競合/復旧|既存を維持。単一台行2MB/容量/自動GCは未解決、GC無効|
|host総128MB/無人恒久運用|未証明/未接続|
|MODEL_SEARCH/昇格/holdout/active採用/正式PRE全体|未移植部分が残る|
|過去比較/横断/収集/scheduler/同期/収集端末|未移植部分を維持、今回の重要課題を優先|
|正式passkey/招待/閲覧権限/管理/OAuth/全MCP/パチンコserver|未移植部分あり。judge等既存範囲は維持|
|本番実データ独立移行|未実施、無断複製なし|

## 保存と次回
GitHub開発branchは0f7b254ab996fea05a34fdc64eaef3dde4f81765へ更新。保護本番branch/元ソースは無変更。Site保存版11の正確な番号/commit/保存receiptは配布SITES_SAVED_VERSION.jsonとDELIVERY_INDEX（自己参照回避）で確認する。非公開保存のみ、URL/デプロイなし。最終両checkout cleanを確認し、全変更/目的をCHANGED_FILES、全原本/ソース/取得済みGit/全ログ/再現手順をZIPで提供する。CRC/個別SHA256/別directoryへのGit復元を検査。runtimeデータ/秘密値/利用者情報は収録しない。

再開は最新保存版11。まずDEPENDENCIESとMEMORY_REPORT/原本テストを読み、元v4/bruteSingleGenerateの重い内部と新BACKTEST大規模SQL確定のメモリを測る。次に元の研究cycle/frontier/世代とBACKTEST→MODEL_SEARCHを順序どおり接続する。探索・昇格・holdout/正式PRE/active採用を飛ばさない。hostの非公開検証機構がなければ未検証を維持し、公開・外部常駐・数学/権限/データの重要変更は勝手に採用しない。完全移植は未完了。

# 保存版12：台別特徴量の永続分割・MODEL_SEARCH・研究hashの逐次化（2026-10-28 JST）

## 正本と再開の確認
保存版11 3e457b54430d6a8f5fbeaec1236a94f442ff777a / GitHub work/sites-migration-20261027@0f7b254ab996fea05a34fdc64eaef3dde4f81765のcleanなコード、前回status/全ログ/メモリ/ZIPを照合して継続。元本番固定1f8c29fc458f34e11e546fb57944d0fc31db98a5、元index/VPSの数学sourceは無変更。本番サイト/VPS/DB/domain、元deploy/vps/mainへ書込みなし。独立DEV authと合成データだけを使用し、本番データ・認証情報は取得/移行していない。

## 台数分割の実装と成立範囲
DEPENDENCIES.mdに関数単位で台履歴/機種/店舗/順位/時系列/モデル比較の依存を分類。brutePrepareの特徴量生成mapだけを台番号集合で分割した。各batchでも元と同じ全店舗/全機種/前日順位の共通mapと元の全日数を使う。元current配列のfilter前indexを_bidへ保持し、統合後は元順にbruteAddStat/bruteAggRowsを実行する。平均の平均・バッチ別順位の合成はしない。

API受付で任意のmachineBatchSizeをD1 sites_analysis_partitionsへ固定。同じrequestKeyで変更すると409。既定は保存版11相当の従来方式、元画面には20台ずつの検証用checkboxを追加。planに入力/実装/対象日/全台キー/分割条件とhashを保存し、1invocationで1batchを不変R2へ書き、既存stage表へlease/owner/attempt付きで確定。再開時は完了batchをスキップする。統合時は全body hash/plan/キー/ordinalを検査し、欠落・重複・異入力・異実装を拒否。NaN/Infinity/-0等を損失なく保存する固定row tuple codecは未知fieldを黙って捨てず拒否する。元のgraph codecも保持。

**分割できていない部分:** 全条件に対するbruteSingleGenerate/BH補正/対照群、全標本fit/モデル選択、店舗配分EM、全台制約、percentile/ランキング。これらを台ごとの独立エンジンへ変えると結果が変わる。負例試験で実際の台別出力差を確認し、その方法は不採用。統合後は全特徴量行をメモリへ展開し、全体エンジンは元のまま実行する。共通mapも各batchで再計算するため、時間/転送/保存が増える。この実装を「全解析が小バッチmemoryに収まる方式の完成」と扱わない。

90×106、180×106、240×106、180×160で固定元Node auditと全モデル/8中間値が完全一致。元の特徴量、浮動小数点の足し順、_bid、日別/最終ソート、モデル評価、未来情報除外を維持。native workerdの元無分割/保存版11/新分割の全工程も同じinput/output hash。中間8値はNode比較、nativeでは最終payload hashを比較したもので環境を混同しない。

## メモリ/時間/容量
原本はevidence/v12/MEMORY_REPORT.md、memory-results.json、全raw logs。元無分割対照は固定sourceをそのまま静的compile（old-space無指定）。保存版11対照はGitからlib全文を読み、元prefix保存も含める。保存版11/新分割はold-space96MiB/semi4。同条件での使用heap観測値は以下。

|入力|保存版11|20台分割（matrix）|
|---|---:|---:|
|90日×106台|46.69MiB|49.58MiB|
|180×106|86.17MiB|85.43MiB|
|240×106|85.06MiB|85.65MiB|
|180×160|119.52MiB|117.27MiB|

後の最終コード再測定は180×106=85.63MiB、180×160=120.97MiB。10/20/40台も測定したが固定的な最適値や安定した削減幅は証明できない。GC/採取時点の変動があり、一律改善とはしない。特に160台の全体エンジンは依然重い。backing storage/embedder/heap割当は別値で原本へ記録。別時点の最大を足して総量にしない。Node RSS/host総量/厳密peak/実CPU/実課金額は未取得。

新方式180×160の最終計測は11advance、R2 GET2922/PUT477、D1 API701/SQL764、論理write76,807,959bytes。入力の再読込み・中間行保存が増える。これを転送wire量/保持容量/料金と同じとは扱わない。20台は検証用の既定候補であり最適化済み本番設定ではない。

## FEATURE_BUILD→BACKTESTの後続MODEL_SEARCH
元jobs/model-search、research/model-search、axis-discovery、backtest、holdout、analysis/research-cycleを直接確認。元adaptiveMinSupportと探索blockを生成時にそのまま抽出し、元32軸/FDR .10/4 fold/8 pair seeds/最大128候補とcanonical model/fingerprint/全候補の順序/改善判定を再利用。対象日数/標本/モデル探索範囲/精度を減らさない。

同じ固定入力・frontier・モデルのFEATURE_BUILDと成功BACKTESTを前提とするresearch-model-search jobを実装。championは既存research_job_inputsで受付時に固定し、待機中registry更新で交換しない。学習/検証のみ探索へ渡し、holdoutはsealedのまま。R2へ全axis/candidate/scoreを保存し、既存の仮保存→照合→最終確定と同じtransactionでD1 sites_research_searchesへjob/input/champion/candidate/round/calculationHashを記録。途中計算・失敗からモデルを採用しない。

元SQLite MODEL_SEARCH子processを本当にforkして初回baselineと非baselineを比較。軸数/候補数/候補fpとbaseline/train/validation全scoreが一致。全axis/candidatesは元直接計算とも一致。holdoutの結果だけを改変しても探索出力が変わらない試験あり。元completion hashは昇格/収束/holdout反映も含むため、未昇格版のcalculationHashと同じとは主張しない。

DEV50×12の32軸/116候補、best1e51f0abadcdd02d716f551ffeb9dc22b0c84f43d4ca7170b1b9fa89329cb63b、calculationHash7036e45e0dad52be6343795c3fb2e34f3473f8f8e8c7c902257e3a4ec42609db。native Queueでも同結果、receipt1。大規模180×160は使用heap観測47.61MiB、計算/仮保存invocationの壁時間21,122ms、成功保存/GETまで確認。CPU時間/host適合は別途未検証。

**今回の部分完成の境界:** BACKTEST→MODEL_SEARCHはユーザーが元画面から開始する前提確認付きの手動接続。自動enqueue、research_loopsのfrontier/世代/反復/収束の全状態、候補registryの昇格/棄却履歴更新、holdout解禁、active model採用、正式PRE全体は未移植。この境界を「自動研究pipeline完成」と誤認させない。元画面にも未昇格・自動cycle未移植と表示する。

## 大規模BACKTESTの保存とhash改善
180×160の元研究計算と保存/GETをnative workerdで新たに計測。初回は使用heap141.49MiB、最終確定batch22,412文、推計SQL/params JSON25,279,041bytes。SQLを500行ずつprivate D1 stageへ準備し、part hash/出力hash/件数で再利用を検証、元run/predictions/成功/head/receipt/temp削除を最後の同じtransactionへ移した。元正常runを先に消さず、失敗時は旧結果維持。SQL分割だけのheapは155.21MiBとなり改善扱いにしなかった。

次に元research dataset inputHashのhashCanonicalが全特徴量objectを複製していた点を特定。元backtest.mjs全文の数学はそのまま、hash importだけを既存canonical streamへ置換して生成。元と同じcanonical JSONバイト列/SHA256を逐次生成し、全体のsorted cloneと巨大JSON文字列の重複をなくした。これにより使用heap観測34.27MiB、backing7.99MiBとなった。初回/SQLのみ/逐次hash追加後で入力・最終payload hashが完全一致（large-backtest-parity.json）。180×160 outputHash8f176522421d3921874d2dff83c5eadc53395f66f03ab9e36cc4cb2383e86232。

1000行超の試験では元dataset全特徴量/inputHashが一致し、元SQLite persistSplitで保存した全予測行/日別順位とD1最終行が一致。500行保存直後の停止、再利用、最後のtransaction故障rollback、再試行を検証。成功時だけ自身のprivate tempを回収し、元の予測/履歴を削らない。最終のBACKTEST自身のstage batchは最大501文、公開batch16文。全I/O最大1292文/JSON約1.35MBは前提FEATURE_BUILDも含む（SQL714bytes/bind20以下）。公式ではbatch一回はinvocation query上限上一queryであり、2万文を単純に1000query制限超過とは判定しない。host query30秒/CPU/メモリ/転送制約は未検証。

## ジョブ安全性・実OOM・画面
固定入力、input/implementation hash、lease/attempt、正常結果のみ公開、payload checkpoint、元retry間隔、古いjobの上書き防止を維持。台別plan/partの欠損/破損/重複・再開を試験。実V8 heap fatalは計算開始/payload checkpoint/v5-prefix checkpoint/台plan checkpointを再現し、local runtime再起動とlease回収で復旧。さらに台特徴量batch1保存直後の実OOMを再現し、同じR2 partを再利用して残り3batchだけ実行、同じ結果/旧結果保持/failure1回を検証。例外模擬と実OOMを区別し、host強制kill/自動再起動の証明とはしない。

既存画面で店舗切替、営業日02/18、12台、保存分析49日/588台日/398根拠を確認。#21feature251行、#22BACKTEST、#23MODEL_SEARCH、#24台分割current-modelを開始/保存/履歴取得。#23はtab close後に別tabから保存完了を再取得。#24は元ranking101番91/110番90/106番89、元hash46df403b617a...。最初のlocal migration先誤りで止まった#20も元画面の再試行で成功し、正常保存値は保持。失敗・訂正logとDOM原本を保持。

## 全回帰/保存/未検証
Site最終全79成功0失敗、公開package最終71成功0失敗。元完全clone root83/83 commands、VPS570中569成功/既知symlink production_path1失敗。build complete、production bundleのDEV marker0。元の数学期待値/既存試験を削除・書換えして成功にしていない。途中の78/0（SQL/hash改修前）、作業directory誤りで中断したcopy前public試験、NaN診断hashの失敗、初期generator quote修正、preview config/persist誤りを最終と区別して記録する。

|機能|保存版12の状態|
|---|---|
|既存店舗/営業日/台/保存分析/現行予測/FEATURE_BUILD/BACKTEST|ローカルDEV実装・回帰/画面検証済み、hostは未検証|
|台別特徴量の永続分割/復元|ローカル実装・4規模完全一致/実OOM復旧済み。全体モデル部分/統合メモリは部分完成|
|BACKTEST大規模hash/SQL保存改善|180×160 local計測と同値hash、元SQLite行一致・復旧済み。host制約は未検証|
|MODEL_SEARCH計算/候補/未昇格保存/画面|独立単位としてローカル実装・比較済み。自動cycle/昇格/PRE全体は未完成|
|host総128MB/CPU/Queue/Cron/Workflow/無人復旧|未証明・未接続。非公開保存で動作確認済みとしない|
|正式認証/passkey/招待/閲覧権限/管理/収集/同期/パチンコ/全MCP/OAuth|未移植部分あり、今回の依存機能を優先|
|本番データ独立移行|未実施、無断複製なし|

GitHub開発branchは85a4a063a54732df8ab8e61de8c3b7a400152307へ反映（専用sites-migration配下のみ）。Site保存版12の正確な番号/commit/保存receiptは配布SITES_SAVED_VERSION.json/DELIVERY_INDEX.jsonを参照。公開/本番デプロイなし、最終両checkout cleanを確認する。CHANGED_FILESに新規/変更/削除と目的、command-resultsに全最終command/成否/未実行を記載。ZIPに全source、取得済みGit、全ログ、再現/再開手順を収録し、CRC/個別hash/別directoryのGit復元を検査する。元Gitはshallowの取得範囲で全歴史ではない。秘密/runtimeDB/利用者情報は収録しない。

## 次回の正確な再開地点
保存版12と上記GitHub commitを読み、DEPENDENCIES/MEMORY_REPORT/最終79/71とOOM原本を先に確認。最重要の残りはbruteSingleGenerate等の全条件母集団・BH補正・元row順を維持する別軸の分割と、統合後メモリ。台別独立学習へ変えて近似しない。次に元research-cycleのfrontier/世代と自動BACKTEST→MODEL_SEARCH enqueue、候補履歴・昇格/棄却・収束/holdoutを順序どおり接続し検証する。未昇格候補をいきなりactiveへ反映しない。host非公開検証機構がない場合は未検証を維持。公開/外部常駐基盤/数学・権限・データ意味の重要変更を無断採用しない。完全移植は未完了。

---
# 保存版13：完成条件台帳・現行予測の保持削減・BACKTEST自動後続

日付：2026-10-28。再開Site12@2d871c32006550e65eca7f6e3f34dfe2f8328acf、GitHub開発85a4a063a54732df8ab8e61de8c3b7a400152307を実コード/Git/前版原本から照合。元固定deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5を維持。保存後の正確なSite13 SHA/IDとGitHub SHAは同梱SITES_SAVED_VERSION.jsonのnative receiptを正本とする（自己参照commitを推測記載しない）。本番・元ブランチ・VPS・本番DB・domainは変更せず、公開/deployなし。

## ① 今回完成した単位（local範囲）

1. **完全移植の管理正本を作成。** MIGRATION_MASTER_PLAN.md（55安定機能ID、元関数/API・Sites・状態・互換・証拠・UI/API・local/host・依存・障害・完成条件・次作業）、MIGRATION_BLOCKERS.md、MIGRATION_ACCEPTANCE_CRITERIA.mdを新規作成。進捗率を捏造せず、最終12gateの未達を管理。元155sourceの関数/guard、全固定tree blob、42SQL表+relay_kvの列/FKを原本索引へ収録。構文/path分類をsemantic全網羅の証明と呼ばない。
2. **現行予測の不要参照解放。** 元v4ModelTrainingの監査値を取得後、後続v4PredictStoreで使われないvalidationFit/discovery/confirm/val/ensemblePoints参照を外す。必要なfit/score/champion/全履歴を維持。元exportの戻り値と数学は変更しない。bruteSingleGenerateのgroup構築/評価/最終化に観測点を追加。候補・補正・母集団・浮動小数点順・ランキングを変えず、4規模全8段階/全モデル/最終hash完全一致。
3. **BACKTEST→未昇格MODEL_SEARCHの自動遷移。** 元research-cycleのrecordBacktestCompletion/scheduleModelSearchを直接確認・比較。成功の同じDB transactionで、固定manifest/input/model/fingerprint/featureVersion/frontier/世代/round/実装hashを持つ子job・context・head・outboxを作成。元logicalKeyに加えて既存channel/input境界でidempotencyを分離。新しいfeature/job/世代へ古い完了が割り込む場合は子受付をしない。未完了出力から探索しない。
4. **無人driver/画面の接続。** nativeローカルQueueでFEATURE_BUILD完了→BACKTEST受付→自動子探索→保存までブラウザーなしで完走。送信失敗後のterminal再配信がoutboxを回復し計算attemptを増やさない。元画面からBACKTESTを実行し、自動探索32軸/116候補の保存結果と履歴を表示。再実行は既存子を再利用。UIへ「自動接続はBACKTEST→探索まで、未昇格・収束/採用未移植」と表示。

**未達の境界：** FEATURE_BUILDが自動でBACKTESTを受付するedge、recordModelSearchCompletionの採用/棄却/registry履歴、昇格・収束・holdout解禁・active-model/正式PREは未実装。research_loopsのrunningは研究全体完了ではなく、sites_research_context.search_complete_unpromotedを区別して見る。旧保存版のcontextなしjobへ推定遷移をしない。全研究pipeline完成とは扱わない。

## ② 今回解消した局所障害・維持した安全性

- BACKTESTと探索の手動接続欠落をlocal範囲で解消。最終transaction故障で子/成功結果ともrollback、再試行で一度だけ確定。元logical generation/round、固定モデル、更新されたregistryの非混入を検証。
- 配信失敗をterminal再配信+outboxで回復、重複メッセージ・古い完了・feature更新・insufficient data・入力/実装mismatchを検証。holdout行を書かずchampionを変更しない。
- 5地点で意図的allocationによる**実V8 OOM**を再現し、runtimeを再作成して元正常結果を保持したまま復旧。prefix/payload/machine unitの再利用、failureCount1、入力/結果hash一致を確認。単なるthrowではないがhost128MB/1102とQueue再配信の実証ではない。

## メモリ・数学・I/Oの実測

native Miniflare/workerd、old-space96MiB/semi4、Inspector Runtime.getHeapUsage。受付→入力固定→R2日別転送→load→解析→仮保存→照合/確定→stream再取得。同じ入力の保存版12 controlとv13を測定。

|入力|save12使用heap観測最大|v13使用heap観測最大|減少|
|---|---:|---:|---:|
|90日×106台|50.68MiB|44.80MiB|11.6%|
|180日×106台|84.36MiB|74.38MiB|11.8%|
|240日×106台|86.21MiB|79.92MiB|7.3%|
|180日×160台|119.55MiB|89.52MiB|25.1%|

各caseのpayload bytes/input/output hashとD1/R2 I/O countsはcontrolと同一。各3advance、追加の保存/転送コストなし。最大caseはD1 SQL596、R2 GET995/PUT340、logical R2 write44,440,373bytes、結果40,253,032bytes。詳細memory-results.jsonは各request実行単位・各観測stageのused/total/backing/embedderとwall時間を保持。原8値/全モデルとの比較原本model-comparison.json・parity-final-*.log。

ヒープ観測値はhost総メモリ・厳密peakではない。異なる時点のheap/backing最大を足さない。ArrayBuffer/外部メモリ全体/allocator/host統計、同時requestの総量・CPU請求・料金は未測定。wall時間にはInspector停止と同時進行した回帰/build負荷を含み、CPU性能の比較ではない。v13はwall時間短縮を証明していない。Sitesホスト128MB適合は引き続き**未証明**。

台数分割の効果が限定的なのは、台別特徴量を統合後に全体training/候補/BH補正/rankingへ戻すため。MEMORY_DEPENDENCIES.mdに関数別依存を記録。全体trainingのfitはclosureを含むため、無損失永続化/順序の証明なしにcheckpoint化しない。今回は保持寿命を改善し、候補単位分割は次検証へ残す。

## ③ 新たに具体化した制約・未確認

- ホストQueue/Cron/Workflowsのbinding供給はUNKNOWN。一般Workers仕様にあることをSitesで使用できる証拠にしない。Sitesのrecurring updates手順はpublished Site/writer/cloud access/readbackを要求し、本Siteはsave-only。公開で検証していない。
- WebAuthn元configはrpID===origin.hostnameを要求。別origin+旧RPIDを元コードが拒否することを合成configで確認。新RPIDのconfig受理は旧credential移植を意味しない。正式認証、related-origin、招待/再登録/失効/復旧は未完。
- 単一台JSON>2MB、巨大day parse保持、全本番容量/履歴/FK/移行snapshot/復元は未検証。安全GCを自動有効化しない。本番データを取得/複製していない。
- 元固定treeにsw.js/登録が見当たらないため、PWA manifestとoffline/service-workerを分離してUNKNOWNを保持。元にない機能の実装を完成条件へ推測追加しない。

## 試験・証拠

全command/exit/count/失敗履歴はevidence/v13/command-results.json、全rawログはlogs/。Site全84件合格。GitHub側は76件合格・失敗0、最終結果をcommand-results.jsonへ記録。元フロント83/83commands合格、元VPS570件中569合格・既知symlink検査1件失敗。新しい元VPS失敗なし。4規模8job+4元数学比較、nativeQueue1chain、実OOM5地点、ledger整合、build/開発認証の本番bundle除外を別途記録。

初回のstaging試験はtransaction文数の固定16に依存するfault-injection harnessが追加SQLで働かなかったため失敗。公開batchを対象に故障させる条件へ修正し、元行/数値/期待結果を変えず全回帰で合格。新transition試験の初回は元queue APIをsnake_caseと誤読して失敗、実APIのidempotencyKey/payloadへ修正。両初回ログを削除せず保持。元VPS既知失敗とは別。

実画面はBROWSER_CHECK.mdとbrowser-*.txtに原本。元店舗選択/営業日切替/台表示、feature/backtest/auto探索、保存履歴、現行予測開始後タブcloseと別タブで結果/ranking再取得を確認。閉じる直前の正確なphaseは受付応答前DOMなので証明せず、ブラウザーなしの完走はnativeQueueで独立証明。正式authや全異常UIを手動検証したとはしない。

## ④ 完全移植までの残作業・正確な再開点

保存版13のreceipt/SHAを照合し、MASTER→BLOCKERS→ACCEPTANCE→STATUS→evidence/v13/REPRODUCE.mdから再開する。主な優先順：

1. B-MEM/AN-02：bruteSingleGenerateの候補/補正/統合を、元母集団・順序・同点を固定して安全分割検証。host総128MB/同時read/CPU/運用上限は別試験。
2. CYCLE-03/04：元recordModelSearchCompletionを基準に候補採用/棄却/registry/historyの原子確定、研究の反復・収束と正式holdout解禁を順番に移植。FEATURE_BUILD→BACKTEST edgeも追加。数学や昇格基準を変えない。
3. U-QUEUE/JOB-03：Sites binding/無人writer/監視条件を確認。公開が必要なら試験・費用・権限・復旧を具体化して直前承認を得る。外部恒久基盤は未採用。
4. B-COVERAGE：全動的画面/API/DB/実行経路のsemantic照合を完了。正式PRE、過去/店舗横断比較、Collector/自動収集、同期、正式passkey/招待/管理、pachinko、全MCP/OAuth、本番read-only移行/復元を依存順に実装。

全体の完成・検証済み機能行はまだゼロ（local単位の成功と区別）。未移植・UNKNOWNをなくすまで完全移植完了を名乗らない。今回の全変更一覧はCHANGED_FILES.tsv。全source・取得済みGit履歴・全ログ・4正本・再現手順・CRC/個別SHA/Git復元を一括ZIPに収録し、実保存後にのみ共有済みと報告する。


## 保存版14 — 研究採否・収束まで接続、正式holdoutは未確定

2026-10-29。再開receipt: Site13 00c5edcac2a2f1597db91800f08d176da9b746fe、GitHub d2f6513944a8d63d90e8ea33c8c8a06ed5eff34e。固定本番1f8c29fc458f34e11e546fb57944d0fc31db98a5。今回の最終SHA/保存版番号はパッケージのSITES_SAVED_VERSION.jsonとGITHUB_COMMIT.jsonを正本とする（commitに自身のSHAを埋め込まない）。新非公開保存はreceiptを取得した時だけ完了と扱う。

① 今回完成した機能（ローカル範囲）

- researchCycle opt-inでFEATURE_BUILD→BACKTEST→MODEL_SEARCH→研究champion採否/履歴→次BT/search→収束まで。元条件、fingerprint、世代、noImprove、round、重複候補、収束理由、次logicalKeyを維持。旧manual未昇格機能は既定で維持。active modelは変更しない。
- D1の親成功確定と採否latch/registry/loop/子job/outboxを同一batchで条件付き更新。固定入力/実装/世代/round/全registry/headのCAS、重複・旧世代・rollback・Queue失敗から既存方式で回復。
- 元SQLite採否6分岐＋実合成研究サイクル＋確定故障/世代競合8試験成功。native Queueで6ジョブ無人連鎖、実V8 OOM後の研究昇格1回だけ確定。画面#32〜#37で昇格/収束/履歴個別再取得。
- 解析以外: 独立した元access v2 DBに対するD1 session/失効/audit/challenge一度限りの保存層と比較試験2件。正式WebAuthn/発行/APIへは未接続。認証緩和なし。

② 解消/部分改善した障害

B-PIPELINEは収束までlocal/SQLite/API/画面/Queueを接続。AUTH01/03・DATA03は保存層のみ部分前進。55機能は削除せず、CYCLE03をlocal実装host未検証、CYCLE04を部分へ更新。完成12ゲートは全て全体達成未了。メモリは不要参照の寿命を短縮したが、一貫した全工程peak改善の証明なし。

③ 新たに明確になった障害

B-HOLDOUT: 元本番days配列ありの収束後は正式holdoutを確定するが、移植版はconverged_holdout_pendingで止める。元source側だけの解禁/2champion/218予測行を検証。SQLite完全一致の主張はdays:nullの採否直後までに限定する。正式PREv2/holdout/active modelは未完。
U-ACCESS-BINDING: 第二の独立したSites D1 binding/provisioning未確認。canonicalとの混在を拒否。registry CASは1.5MB安全拒否上限を持ち、巨大研究履歴での運用は追加検証。B-HOST/B-MEMORY/B-UNATTENDED/U-QUEUEは継続。

④ 完全移植までの残り

最優先は正式holdoutのimmutableモデル・予測行をD1/R2に保存/確定/再開し元SQLiteと全行比較。その後PRE正式試験/active採用、独立authbindingとWebAuthn/RP-ID、同期/Collector/スケジュール、パチンコ、MCP/OAuth、承認後の実データ移行。元55機能と全依存はMIGRATION_MASTER_PLAN.md、障害はMIGRATION_BLOCKERS.md、完成条件はMIGRATION_ACCEPTANCE_CRITERIA.mdで追跡。外部恒久基盤は導入していない。

最終メモリ実測（workerd Inspector usedHeap観測、old-space96MiB/semi4、厳密peak/総128MBではない）:

- 90日×106台: v13 44.31MiB → v14 48.72MiB。
- 180日×106台: v13 77.74MiB → v14 84.14MiB。
- 240日×106台: v13 80.47MiB → v14 83.00MiB。
- 180日×160台: v13 88.21MiB → v14 90.92MiB。

4規模すべて全モデル/8中間値/最終hash一致。180×160追加2回はv13 90.41/89.57、v14 89.51/89.01MiB。GCばらつきがありピーク低下を主張しない。R2 IO/bytes不変、通常jobにD1 SQL3文/API2呼出し増。モデル候補分割/新memory checkpointは効果未証明なので採用しない。総128MB/外部buffer全体/ホストCPU/concurrency/課金は未測定。MEMORY_REPORT.mdとraw memory-results.jsonを参照。

テスト: Site94成功0失敗、public86成功0失敗（最後の認証schemaと履歴UIの小修正は該当unitをSite/Public各2+1再試験成功）。元フロント83コマンド成功、元VPS569成功/既知symlink1失敗、新規VPS失敗なし。数学4/4、通常実OOM5ケース＋採否実OOM1成功、native無人chain成功、build成功。全コマンド/過程の失敗もevidence/v14/command-results.json・logs/へ収録。

成果物状態: ソース/管理資料/ログを作成、ZIP収録/永続保存/ユーザー共有は別々に検証する。保存版13 ZIPはローカル存在とCRC/hash/Git復元を確認、開始時には永続保存を確認できなかった。v13/v14両ZIPの永続保存とアクセスは最終delivery receiptで判定し、未成功を共有済みにしない。ZIP中に本番DB/利用者/秘密値を収録しない。

次回は保存版14のsafe receipt SHAからcheckoutし、4管理原本→evidence/v14/DEPENDENCIES.md→REPRODUCE.md。正式holdoutを最初の実装単位とする。公開・本番デプロイ・本番branch変更は禁止。

## 保存版15 — 正式holdoutのlocal計算・原子的保存・復旧・画面を移植

2026-10-30 JST。正本再開はSite14 b464c7b19f96098cffb6af4ed9c325f25c2fdece、GitHub work/sites-migration-20261027@c513570b07433d43e6a58445c959732079450a10。元本番1f8c29fc458f34e11e546fb57944d0fc31db98a5は変更なし。保存版15の正確なSHAとGitHub最終commitはZIPのSITES_SAVED_VERSION.json/GITHUB_COMMIT.jsonを参照する。自身のcommit SHAを事前に捏造してsourceへ書かない。非公開保存・ZIP作成・永続共有をreceiptで別判定する。

① 今回完成した範囲（local）

- converged_holdout_pending→内部research-holdoutを親成功と同時に受理。元finalizeSealedHoldoutの解禁/frontier、historical/research_championモデル選択、正確な全dataset・封印holdout日付・evaluateModel/rankRows/betterの評価/順位/同点を維持。
- 1モデル/Worker実行、immutable入力/実装/registry/loop hash、R2 canonical checkpoint・100行private D1 staging・part hash照合。全run/予測行/registry/loop/winner/研究完了/job/receipt/historyを最終D1 batchのINSERT SELECT+CAS/fenceでのみ公開。途中stageは正式APIから見えない。過去正常結果を保持。研究championのみ更新しactive modelは不変。
- 元SQLiteの2モデル218予測行、全run/予測/registry/loop/結果hash9d52664d0a5b667a3f84c93227b8804dff5c7b3c61b3976eb6307eb574a24ce9一致。full研究試験はBT全保存列と時系列モデル採否/次job/holdout後まで比較。独立IDの正規化と固定時計を比較記録に明記。
- 実local Queueでfeature→BT→探索採用→BT→探索継続→探索収束→正式holdoutの7jobをブラウザーなしで完走。元画面から研究完了/確定スコア/勝者/履歴を取得。通常店舗分析と、タブを閉じた後の現行予測完了/全12台順位も確認。
- 17holdout異常系を含む比較テスト：停止各段階/DB rollback/確定後応答喪失/重複/lease期限/世代frontier競合/featurehead競合/破損R2・stage/旧正常holdout保持/既存active不変。stage後に実V8 OOMで終了→永続D1/R2再接続→lease回復→1回だけ確定。元の6 OOMケースも維持し計7ケース。host自動復旧とは区別。
- 解析外：独立ACCESS v2 DBのviewer単独失効/audit・consumeRateの保持/reset/並列上限を元SQLiteと比較。合成4試験。正式route/WebAuthn/第2bindingは未接続であり正式認証完成ではない。

② 解消・部分改善した障害

B-HOLDOUTのlocal未実装原因を解消しCYCLE-04を実装済み実host未検証へ。研究cycleのlocal計算/SQLite/保存/Queue/API/画面を正式holdoutまで接続。ACCESS失効/rateの部分改善。全55機能/12gateを維持、全体完成gateは未達。

holdoutは全計算後の不要feature参照をcheckpointへ重複保持しない方式で改善：90×106 used43.21→26.10MiB、180×106 82.66→42.83、240×106 79.08→55.66、180×160 87.37→59.08。最後のR2書込27,838,502→5,920,784bytes。180×160追加run59.41MiB。最大11,520予測行。全4規模で全行/state/hash一致。数学/入力日数/台数/精度/順序は不変。

③ 新たに明確化した制約

現行予測の全体BH/scope分割は未採用。同じ4規模で保存版14control→15のused観測42.79→46.09、75.30→74.22、81.43→75.11、90.49→89.82MiB。4/4の全model/8中間値/最終hash一致。GC/Inspector/同時試験のばらつきを含み、安定peak改善や総128MB適合とは主張しない。rawのused/total/backing/embedderと親Node RSSを分離し、独立最大を足さない。実hostCPU/同時request/総memoryは未測定。

D1は最大bind34/SQL2013byte/batch101文でprivate保存成功、最終全予測行コピーもlocal成功。batch内SQL数をinvocation query数と混同しない。実host query/transaction/CPU/料金と大きな歴代registry集合は残RISK。自動GCは無効のまま。

元FEATURE_BUILDを再調査し、計算/特徴量保存以外のactive初期化/store_read snapshot/live prediction refreshが未移植と明確化。FEAT-01を部分実装へ精密化した。これは既存成功した計算の退行や機能削除ではない。正式holdout勝者→activeの無条件切替は追加しない。正式PRE依存はPRE_DEPENDENCIES.mdに記録。

Sites公式scheduleはpublished Siteが前提。Queue/Cron/Workflow/第2ACCESS D1の正式供給interfaceはUNKNOWN。DB10GBの公式案内と実アカウント上限/料金は別。非公開保存だけで無人運用可能と推定しない。B-HOST/B-UNATTENDED/B-MEM/正式認証/PRE/同期/収集/パチンコ/全MCP/OAuth/実データ移行は残る。

④ 完全移植までの次作業

最優先はPRE_DEPENDENCIES.mdの元store-read/active初期化副作用とformal trial storeのSQLite比較→条件付きD1公開。holdout研究championとactiveは分離。独立ACCESS正式bindingとWebAuthn/Origin/RPID/招待/CSRF/回復、host契約/監視/Queue、Sync/Collector、パチンコ、全MCP/OAuthを55行の完成条件に従い進める。本番dataは許可された読取snapshot/容量/個人情報/復元検証後のみ独立移行。重大な数学/権限/データ意味/外部恒久基盤変更は相談する。

最終コードの全回帰：Sites115成功0失敗、GitHub107成功0失敗。最後のUI/認証修正後に全件再実行。元フロント83/83コマンド成功、元VPS569成功/既知symlink環境依存1失敗、新規失敗0。全初期失敗・中断・修正前runは削除せずevidence/v15/logs、正確なコマンド/結果はcommand-results.json。transport切断で未完だったrunを完了数に入れない。公式production build成功。

原本：4管理資料、evidence/v15/RESEARCH_COMPARISON.md、MEMORY_REPORT.md、AUTH_SCOPE.md、BROWSER_CHECK.md、HOST_VALIDATION_PLAN.md、全raw logs/json/コード。ZIPは全source/取得済みGit履歴/全ログ/追試手順を収録しCRC/個別SHA/Git復元を検証してから共有する。前版14ZIPの存在/32,844,628byte/CRC/SHAと永続Library metadataも確認。今回のZIP作成と永続保存・共有の最終状態は外部delivery receiptのみを根拠とする。

次回は保存版15のSITES_SAVED_VERSION.json完全SHA→git status→4正本→evidence/v15/DEPENDENCIES.md→REPRODUCE.md。本番site/VPS/DB/main/deploy-vps/domainは不変。Sites公開/デプロイは未実施・未許可。
