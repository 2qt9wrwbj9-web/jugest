# JUGEST 管理者認証・PIA閲覧共有：実装前調査チェックポイント

調査日：2026-10-06（日本時間）

## 状態

以下は記録コミット `39e9613` 時点の初回調査スナップショット。接続復旧後の確認結果は末尾の追記、実装・運用手順は [pia-access-operations.md](pia-access-operations.md) を参照。

**実装未着手。本番照合に必要なVPS接続がオフラインのため停止。**

アプリコード、DBスキーマ、認証、画面、migration、環境変数は変更していない。本番デプロイ、サービス再起動、本番DB操作、cron変更、bootstrap発行、GitHubへのpush／mergeは実行していない。この文書だけをローカルの調査ブランチへ記録した。

## コードと作業基準

- リポジトリ：https://github.com/2qt9wrwbj9-web/jugest
- 調査した本番系列：`deploy/vps@04fc937a852c77004fe3f7fa9bb163b07d0cf234`
- 同コミットの変更内容：PIAの遠隔店舗データが空のローカル店舗登録に隠れる問題の修正。
- `main`：`273ed61ed2019365ae1b38d76288f20e9625c9e1`。開発基準として採用していない。
- `deploy/vps` 上の `AGENTS.md` が指定する承認済み開発基準：`69a9f61d71b192776d8a7349d00c819367e16793`。
- 調査記録用ローカルブランチ：`work/pia-access-preflight-20261006`。上記承認済み基準から作成。
- **本機能の実装ブランチは、稼働中のコミットと未コミット差分を確認し、作業基準を確定してから用意する。この調査ブランチの古いアプリコードをそのまま本番へ反映してはいけない。**

`AGENTS.md` は「安全性、基準ブランチ、本番状態のどれかに不明点がある場合は、推測で進めず停止して確認する。」と定める。今回は稼働中の本番状態と開発基準を照合できないため、実装を進めていない。

## GitHubの実コードで確認できた構成

| 対象 | 確認内容 |
| --- | --- |
| フロントエンド | HTML、CSS、JavaScriptの既存アプリ。`index.html`、`app-v510.js`、`judgement-model.js`、`judgement-view.js` など。 |
| 配信時の加工 | `vps/src/web-server.mjs` がルートHTMLへ `ui-source-patch.mjs` の加工を適用する。生成された `public/` とVPS配信を同一とみなせない。 |
| バックエンド | Node.jsのHTTPサーバー。Express等へ置き換える必要はない。VPSパッケージはNode.js 22.13以上を要求。 |
| DB | Node.js組み込みSQLite、WAL、外部キー有効。`vps/src/db.mjs` と `schema.mjs`。 |
| 収集データ | `stores`、`store_days`、`machine_day_data`。収集状態は `source_collector_state`、解析成果は `client_snapshots` 等。 |
| 保存先の既定値 | 正規データ `/var/lib/jugest/jugest.sqlite`、連携情報 `/var/lib/jugest/relay.sqlite`、原本 `/var/lib/jugest/raw`。実際の設定は未確認。 |
| 既存認証 | Collector受信側認証、読み取り専用キー、MCP用のOAuth。PIA共有用Cookie／パスキー管理者認証は確認したコードにはない。 |
| データ取得API | `/api/vps/stores`、`/api/vps/stores/:id/days`、`/api/vps/stores/:id/days/:date`。既存認証を先に要求し、店舗単位の認可も行う。 |
| PIA画面連携 | `vps-ui-remote-stores.mjs` → `vps-browser-analytics.mjs` → 上記API。既存の受信側認証情報を使用。 |
| PIAアクセス制御 | `store-access.mjs`。既定の `owner` モードは所有者チャンネルとの一致を要求。`public` モードの設定も存在するため、本番値を確認する必要がある。 |
| MCPの設定判別 | `/mcp` の `judge_machines` は一般公開。保存店舗データの取得ツールは別途認証を要求。 |
| 公開の設定判別API | `/api/public/judge` は一般公開。PIA閲覧者を含め、誰でも使える既存仕様を変更してはいけない。 |
| 認証が必要な設定判別API | `/api/vps/judge/machines` は受信側認証を要求。PIA共有Cookieだけで入れるようにしてはいけない。 |

PIA収集元の識別子は `pia-public-ranking-top`。収集側は `visibility: public` をメタデータへ保存するが、これだけで未認証取得を許可しているわけではなく、APIの認証と `store-access.mjs` が別途適用される。メタデータを書き換えて収集や店舗表示を壊すべきではない。

追跡済みファイル一覧とビルドの配信対象では、PIA収集データ専用の静的JSONは確認していない。**本番ディスク上にないことは未確認。** VPSの静的配信は複数ディレクトリを拒否する方式なので、サーバー独自の追加ファイル、公開JSON、Nginxの別ルートも確認が必要。

## 自動デプロイ条件

- コード上はVPSが `deploy/vps` の更新を約1分間隔で検知する方式。
- 新しいコミットを `/opt/jugest/releases/<SHA>` へ取得し、VPSテスト後に `/opt/jugest/current` を切り替え、Webサービスを再起動する。
- デプロイの制御コードは `/opt/jugest/deployer` に別置き。リポジトリの最新版と本番制御コードが一致するかは未確認。
- GitHub Actionsの確認済みワークフローは、`sol/vps-canonical-ingest-analysis`、`sol/vps-*`、手動実行を対象とするテスト用。
- `vercel.json` も残る。外部サービス側の現在の自動デプロイ設定は未確認なので、この段階では調査ブランチもpushしない。
- 本番のtimer有効状態、監視ブランチの上書き設定、実際の配信コミットは接続復帰後に読む。

## 実装候補（未実装・未テスト）

現在のNode.js＋SQLiteへ独立した認証モジュールを追加するのが最小構成の候補。パスキーの検証には、標準に沿った既存ライブラリを使い、署名検証を独自実装しない。

- 管理者は本人確認を必須にしたWebAuthn。公開鍵、識別子、署名カウンター、同期状態等を保存し、秘密鍵は保存しない。
- 初回登録はサーバーCLIが発行する短時間・1回限りの登録トークン。トークンの照合値だけを保存し、登録完了と消費を同一トランザクションで確定する。
- 管理者セッションとPIA閲覧セッションを分離。長い乱数のCookie、DBには照合値のみ、毎回サーバー側の失効状態を確認。
- 発行、追加、無効化などには直近のWebAuthn本人確認を要求。
- 招待は1回、入力期限30分、閲覧24時間を初期値とし、管理者が指定可能にする。コードは最低128ビットの乱数を持たせる。
- 招待の消費と閲覧セッションの作成はSQLiteのトランザクションと条件付き更新で確定。2接続からの競合テストを用意する。
- PIA閲覧権限は専用の閲覧APIだけに適用し、Collector、OAuth、管理APIへ昇格させない。
- 既存の所有者のPIA閲覧経路を維持する。MCPや既存のデータAPIの店舗認可も検査する。
- 画面・APIのキャッシュ抑止、CSRF、入力制限、失効、rate limit、監査ログを実装する。ログに生コードとセッションを出さない。
- migrationは認証関連の追加テーブルだけに限定し、既存PIAデータを更新・削除しない。

公開されている `judge_machines` をPIA閲覧者からだけ禁止することは、一般公開仕様を維持する条件と両立しない。検証対象は「PIAのCookieが非公開の判別API／管理APIの認証として認められないこと」と「一般公開の判別は従来どおり」である。

参考：

- https://simplewebauthn.dev/docs/packages/server
- https://www.w3.org/TR/webauthn-3/

## 接続復帰後の読み取り専用調査

1. `/opt/jugest/current` の実体、Gitのコミット、未コミット差分を確認。秘密情報を含む差分をログへ丸ごと出さない。
2. `AGENTS.md` の指定基準と本番の新しい系列を照合し、既存UI改善・PIA修正を落とさない基準を確定。
3. Webサービス、デプロイtimer、独立デプロイヤーの実際の構成を読む。再起動・変更しない。
4. 環境変数の名前と非秘密の設定だけ確認。環境ファイルやプロセス環境を丸ごと出力しない。
5. SQLiteを読み取り専用で開き、実スキーマと保存経路を確認。既存の `openDatabase()` と `migrate()` は書き込みを行うため本番調査には使わない。
6. 実際のPIAデータ取得API、パチンコ等のサーバー側追加機能、Nginx別経路、静的JSON、原本ファイルを調べる。
7. 確定した基準から専用の実装ブランチを用意し、設計・計画を記録して実装する。細かな判断は依頼された範囲で自律的に行う。
8. 追加テスト、ルート `npm test`、`npm --prefix vps test`、仮想認証器での検証、独立した突破観点のレビューを行う。
9. 環境変数、migration、登録、紛失時復旧、デプロイ、rollbackを実コードに合わせて記録する。
10. 完了報告後、本番反映の明示許可を待つ。

## 今回の検証結果

- GitHubと取得済みリポジトリの読取り調査を実施。
- 調査用VPS接続はオフラインというエラーを返した。接続の再起動・修復は実行していない。
- 本番Webを調査用の検索サービスから取得できず、HTTPの実応答も確認できていない。これを「本番が停止している」という証拠にはしない。
- アプリコードを変更していないため、自動テストは未実行。既存／新規テストのPASS、セキュリティレビュー完了は主張しない。
- 新規API・画面・認証テーブル・migration・CLIはすべて未作成。

本番デプロイ直前の完了状態ではなく、**実装開始前の本番照合待ち**。調査用接続をオンラインに戻す必要がある。認証情報をチャットに送る必要はない。

## 接続復旧後の追記（2026-10-06 UTC）

ユーザーの「重大な食い違いがなければ自律的に続行」の指示に従い、前回ブランチと記録を引き継いだ。VPSは読み取り専用で照合し、featureへ本番系列をローカル統合した。deploy/vps、main、GitHubのremote、本番ファイル・設定・DB・サービスは変更していない。

| 対象 | 本番で確認したこと |
| --- | --- |
| 実配信 | `/opt/jugest/current` → `/opt/jugest/releases/04fc937a852c77004fe3f7fa9bb163b07d0cf234` |
| Git | detached HEADで同SHA。tracked差分なし。release内に未管理／ignoredコード・データを検出せず（.gitと依存は除外） |
| 主要ファイル | web-server、schema、store-access、deploy-runner、ui-source-patchのSHA-256がGitHubの同SHAと一致 |
| プロセス | Node.js22.23.2、systemd jugest-web.service、jugestユーザー、vpsディレクトリからnode src/web-main.mjs |
| 配信 | Nginxで443 → 127.0.0.1:3000へ全経路proxy。80はHTTPSへ転送。22はSSH。別static／aliasを検出せず |
| Proxy header | X-Real-IPをremote_addrで上書き。X-Forwarded-Forも設定。新機能は前者だけを明示信頼できる設定を持つ |
| 自動反映 | jugest-deploy.timer稼働。約1分でdeploy/vpsを監視。独立 `/opt/jugest/deployer/scripts/deploy-vps.mjs` と `/var/lib/jugest-deploy/state.json` を使用 |
| 反映工程 | release準備、依存導入、VPSテスト、currentの原子的切替、Web再起動、内部／Nginx health。切替後失敗は旧releaseへ戻す |
| 独立deployerとの差 | release内コードと一部異なる。依存導入の条件・失敗ログ末尾・検査の差。実インストール版はvps/package-lock.jsonがあるとnpm ciを実行する。今回lockfileを含める。監視系列は一致 |
| DB／原本 | コードの既定先は正規jugest.sqlite、relay.sqlite、raw。接続ユーザーは `/var/lib/jugest` の読取り権限なし |
| 環境 | unitでWEB_ROOT、WEB_HOST、WEB_PORT、RELAY_DBのJUGEST変数名を確認。process environは権限拒否。環境ファイル／DBの秘密値は出力していない |
| 本番確認の未完了 | SQLite実schema、実際の保存パスの上書き、プロセス環境名の完全一覧、PIA所有者モードの実設定。読取り権限のある運用担当者による最終照合が必要 |

権限昇格による読取りも接続ツールで「Command not allowed」と拒否された。この制限を迂回していない。主要コード・運用系列は一致するため実装を続行し、既存DBへ認証migrationを追加することを避けた。

### 実際のPIA経路

- `/api/vps/stores`、`/stores/:id/days`、`/stores/:id/days/:date`: 既存認証＋店舗認可。本番の未認証GETで前2経路401を確認。新機能はここだけにPIA限定Cookie認証を追加する。
- `/api/vps/stores/:id/analysis/default`、`analysis/history`、`research/store-read`、`research/comparison`、`status`、`legacy-plan`: 同じ既存認証を通り店舗認可。新Cookieを拒否する。UIが呼ぶURLもこの配下で、収集データをbundleへ埋める方式ではない。
- `/mcp` の保存店舗ツール: Receiver／assistant／OAuth認証と店舗認可。新Cookieを認めない。一般公開judge_machinesは保存データ取得と別。
- `/api/relay` と `/api/vps/backfill`: 既存の収集・同期認証。新しいviewer／管理者Cookieをその認証として渡さない。生原本のstaticルートはない。
- 静的 `/data/pia.json`、`/static/pia-data.json`、`/public/pia.json`、`/vps/src/schema.mjs`、`/raw`、`/backup.json`: 本番GETで404を確認。releaseの未管理ファイル、静的PIA JSON、別Nginx配信は検出しなかった。見えないDB領域内のファイル一覧まで確認したという主張はしない。
- `/api/health`: 200。`/mcp`のGET:405。読み取り以外の本番呼出しや、本番の認証済みAPIによる内部migration発生を避けた。

取得経路に認可を追加し、JSON／DB／原本・バックアップ拡張子のstatic配信とsymlink抜け道も遮断した。正規DBのPIAメタデータや所有者設定は変更しない。実装・検証・独立レビューの最終結果は [pia-access-review.md](pia-access-review.md) に記録する。

### 最終照合の追加更新

完了前の読取り確認で、別の更新により本番 `current` が `b9ea99b9f5d8640baee90311f9d516f19360838e` に進んでいた。GitHubのdeploy/vpsも同SHA。releaseのtracked・untracked差分はなし。前基準との差は `vps-ui-audit-store.mjs` のスクロール保持と `vps/tests/store-data-matrix-ui.test.mjs` の追加テスト1件のみ（2ファイル、9行追加・4行削除）。追加2ファイルと主要API・schemaのSHA-256を本番とGitHubで照合して一致した。featureへローカルmerge `bc9cf4c` で取り込み、アクセス制御コードに変更がないこと、判別・収集・MCP・配信パッチが最新基準と同じことをgit diffで確認した。本番の更新をこちらから発火したものではない。未認証PIA API401、health200も再確認した。

追加の最終読取りでは最新release内の未管理／ignoredファイルは0（.git・node_modulesを除外）。Nginxの独自log_formatはなく、Cookie／Authorization／request_bodyを記録する独自書式を検出しなかった。既存Nginx logrotateはdaily・rotate14。実際のログにある秘密値を読み出す操作はしていない。新機能はPOST body・HttpOnly Cookie・登録リンクfragmentを使い、queryへ秘密値を載せない。
