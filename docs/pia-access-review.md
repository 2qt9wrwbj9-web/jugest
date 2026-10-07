# PIA共有アクセス：実装・検証・停止報告

2026-10-06 UTC。作業ブランチ `work/pia-access-preflight-20261006`。本番操作は禁止のまま。実装とローカル検証を完了し、本番反映を行わず停止する。

## 本番照合の結果と限界

開始時はGitHub・本番とも `04fc937a852c77004fe3f7fa9bb163b07d0cf234`。完了確認時には別の更新で `b9ea99b9f5d8640baee90311f9d516f19360838e` へ進んだ。変更は店舗表のスクロール保持とテスト1件の2ファイルだけ。新しい本番releaseにも未管理／ignoredファイルは0（.git・依存を除外）。Gitの差分なし。主要コードと追加2ファイルのSHA-256はGitHubと一致した。ローカルmerge `bc9cf4c` で保持し、今回のアクセス制御実装に変更がないことを確認した。

JavaScript画面＋Node.js22.23.2＋組み込みSQLite。systemdでjugestユーザーがWebサーバーを起動し、収集・coordinatorを監督する。Nginxが443から127.0.0.1:3000へproxy、80はHTTPS転送、22はSSH。別のstatic配信なし。標準以外のlog_formatは検出せず、Cookie／Authorization／bodyを記録する独自書式なし。既存Nginxログはdaily・rotate14。

独立deployerが約1分ごとのtimerでdeploy/vpsを監視し、release作成、依存導入、VPS test、current切替、Web再起動、health確認を行う。インストール済みdeployerはrelease内と一部異なるが、今回のlockfileがあればnpm ciを実行する。deployer自体は変更しない。

**実DBのschema・実パスの上書き・全プロセス環境名・実際のPIA所有者設定は未確認。** 接続ユーザーに `/var/lib/jugest` とprocess environの読取り権限がない。権限昇格は接続ツールで拒否されたため迂回していない。これらは本番反映前の必須読取り照合として残す。コード照合だけで実schemaを確認済みとは扱わない。

詳しい読取り記録は [pia-access-preflight-20261006.md](pia-access-preflight-20261006.md)。

## 実装

本人確認必須のWebAuthnと固定Origin／RP IDを採用した。標準の署名検証をSimpleWebAuthnに任せ、IP・User-Agent・fingerprintを管理者判定に使わない。秘密鍵を保持しない。同期可能なパスキーを管理者credentialとして扱う。管理者12時間、重要操作の直近本人確認5分。初回CLI bootstrap／追加登録／復旧は256ビット、15分、単回、照合値だけ保存。

PIA招待は128ビット、初期30分・1回使用・閲覧24時間。名前と期限を指定できる。生コードは発行応答だけ。単回消費と別の256ビット閲覧セッション作成をSQLiteのBEGIN IMMEDIATE、条件付き更新、invite_idのUNIQUEで確定する。CookieをすべてSecure／HttpOnly／SameSite=Strictにし、毎回DBで失効・期限を確認する。管理者credentialの失効は新規ログイン、管理者セッション、未使用の追加登録権限にも効く。

最終確認で認証DBだけ `synchronous=FULL` に強化した。既存のWAL＋NORMALでは電源断後に直近の招待消費・失効が巻き戻り得るため。別の認証接続にもFULLが適用され、既存収集DBのNORMALが変わらないことをRED→GREENで確認した。実電源断の再現試験は行っていない。

大規模な構成変更を避け、既存HTTPサーバーへ小さな境界を加えた。認証専用access.sqliteのschema1だけを追加する。既存正規DB・Relay DBのschema、PIAの保存内容・メタデータ、収集、判別数学は変更しない。

PIAの旧publicモードは有効なReceiverを持つ非所有者も読めるため、共有有効時はownerモードと非空の所有者許可リストを起動時に必須にした。不適合なら失敗し、暗黙に公開設定を上書きしない。共有無効時の旧ポリシーと一般公開judgeを維持する。

## データ経路と保護

| 経路 | 確認と変更 |
| --- | --- |
| /api/vps/stores | 既存認証＋店舗認可を維持。新CookieではPIA源の店舗だけ。未認証401 |
| /api/vps/stores/:id/days, /days/:date | 既存所有者またはPIA閲覧Cookie。非PIA IDの交換は403。失効・期限切れは401 |
| analysis/default, analysis/history, research/store-read, research/comparison, status, legacy-plan | 従来の認証を維持。新Cookieの権限では拒否 |
| MCP保存店舗ツール全8種類 | 従来Receiver／assistant／OAuthと店舗認可。新Cookieは認証として認めない |
| /api/relay、/api/vps/backfill、所有者管理API | 新CookieをReceiverやCollector認証へ変換しない。収集・設定変更権限を与えない |
| /mcpのjudge_machines、/api/public/judge | 一般公開を維持。入力データの判別であり保存PIA取得とは別 |
| 静的JSON、DB、CSV、原本・バックアップ等 | 本番でPIA専用staticを検出せず。典型的URLは404。サーバーへ拡張子・保存用ディレクトリ拒否を追加。symlink解決後も隠しファイル・データ先を検査 |

本番で未認証 `/api/vps/stores` とPIA daysの401、典型static URLの404を確認。最新releaseでもstores401、health200を再確認した。認証済み本番APIを試して内部migrationを発生させる操作はしていない。不可読のDB領域にある全ファイルを調べた、あるいは旧publicモードが本番で実際に有効だった、という主張はしない。

## 追加API・画面・DB・運用

新APIは `/api/access` 配下の登録、ログイン、再本人確認、招待発行、追加登録、一覧、各失効、閲覧コード使用、閲覧状態、ログアウト。POSTは固定Origin・JSON・専用ヘッダー・64KiB上限。存在しない経路はDB処理の前に拒否する。

画面は `/admin/login`、`/admin/register`、管理者専用 `/admin`、コード入力 `/pia/access`、認証済み `/pia`。管理画面にキー発行と一度だけのコピー表示、招待一覧、閲覧開始・期限・最終アクセス・強制停止、credential一覧・追加・無効化を設けた。既存色と余白に合わせ、動的文字列はtextContent、専用画面はCSPでinline script等を禁止する。再訪では有効Cookieで継続し、停止・失効時は表示も消す。管理者の閲覧画面には「管理画面へ戻る」を表示する。

新DBはadmin_credentials、admin_sessions、admin_enrollment_tokens、pia_access_invites、pia_viewer_sessions、access_audit_eventsと、challenge・rate・metaの補助3テーブル。migrationは `vps/src/access/schema.mjs`、実行CLIは `vps/scripts/access-admin.mjs`。監査は内部ID・固定イベント・時刻だけ。新しいIP生値を永続保存しない。公開鍵は秘密値ではないが管理APIに返さない。

初回は非公開のサーバーCLIでbootstrap → iPhoneの登録ページへ入力 → パスキー本人確認 → 登録とトークン消費 → 管理画面。追加は管理者が再確認して15分のリンクを発行し、新しい端末が登録する。紛失は別の管理者credentialまたはCLIから失効し、必要ならCLI recoveryで復旧する。今回、本番登録トークンを発行していない。

共有は管理者が名前・期限を指定して発行 → 相手へコードと/pia/accessを伝える → 単回消費 → 閲覧Cookie → PIA限定API。招待無効化は関連閲覧も止める。閲覧セッションだけの強制停止もできる。

具体的な環境変数、全API、初回登録・追加・紛失、migration、本番反映、rollbackの手順は [pia-access-operations.md](pia-access-operations.md)。必要な新設定はJUGEST_ACCESS_ENABLED、JUGEST_ACCESS_DB、JUGEST_ACCESS_ORIGIN、JUGEST_ACCESS_RP_ID、確認済みNginxを信頼するJUGEST_ACCESS_TRUST_LOOPBACK_PROXY。既存JUGEST_PIA_ACCESS_MODEはowner、所有者はJUGEST_PIA_OWNER_CHANNEL_IDSまたはJUGEST_PIA_OWNER_CHANNEL_FILEを確認する。JUGEST_ACCESS_ALLOW_LOCALHOSTは本番に設定しない。

## 検証結果

Node.js22.23.2で実行。最終基準b9ea99bの既存VPSテスト363件と今回の43件がすべて成功した。

| 検証 | 結果 |
| --- | --- |
| ルート npm test | 72/72コマンド成功 |
| npm --prefix vps test | 406/406テスト成功、failure／skipとも0 |
| Chromium153・Playwright・CDP仮想認証器 | 1/1 integration成功 |
| git diff --check、追加moduleの構文検査 | 成功 |
| 判別・分析・収集・MCP・正規schema・配信パッチ | 最新本番基準とgit diffで不変 |

ブラウザintegrationは初回CLI、パスキー登録、管理者Cookie、再本人確認、招待発行、XSS用の文字列表示、別ブラウザの閲覧、再訪、管理API拒否、即時強制停止と表示消去、追加credential登録と無効化、再ログイン、320／375／390pxの表示を通した。実iPhone・Face IDの試験とは区別する。

| 要求・攻撃観点 | 自動検証 |
| --- | --- |
| 未認証PIA取得 | stores・日一覧・日データ401 |
| 招待初回／再利用／期限／無効化 | 初回成功、残り拒否。期限境界も検証 |
| 同時使用 | HTTP並行と独立SQLite worker2接続で成功1件だけ |
| 閲覧期限／サーバー即時失効 | 閲覧成功→期限／強制停止後401。残存Cookieでも拒否 |
| viewer権限 | 管理API・非PIA店舗・非閲覧API・全MCP保存ツールを拒否 |
| 既存所有者と公開判別 | ownerのPIA閲覧維持、非owner拒否、既存公開judge成功 |
| WebAuthn | 実署名で登録・ログイン・再確認。誤Origin／RP／UVなし／偽署名／誤userHandle／replay／別手続きCookieを拒否 |
| credential・bootstrap | credential失効でログインと既存session不可。bootstrap再利用・登録後再発行不可 |
| CSRF／Cookie | Originなし・異なるOrigin・専用ヘッダーなし拒否、Secure／HttpOnly／Strict／Host cookie |
| 秘密値 | 生招待・登録・session値がDB・WAL・audit・HTTP処理のstdout／stderrへ残らないことを確認 |
| 直接static | 公開JSON、CSV、SQLite、gzip、encoding、symlinkの別拡張子・隠し先を拒否 |
| 遅いbody | body待ち中のsession失効・直近本人確認期限切れを重要処理直前に再確認 |
| 試行制限 | 推測制限、複数DB接続、proxy opt-in、偽装header拒否、peer拒否がglobal枠を減らさない |
| 管理対象の発見 | 200件以上の失効履歴、200件以上の有効sessionでも停止対象を一覧へ含める |
| migration | 反復可能・0600・別の既存DBを拒否しtableとrowを保持 |
| 保存保証 | 認証DBの全接続はWAL＋FULL、既存収集DBの設定は変更しない |

## 独立レビューと修正

実装者とは別の新しいコンテキストのreviewerが、`04fc937..a555a56` の全機能差分と周辺を攻撃者視点で読み、アクセス試験39/39を独立実行した。Criticalは確認されず、Important3件とMinor1件を指摘した。肯定だけのレビューではない。

| 指摘 | 対応と証拠 |
| --- | --- |
| 制限済みpeerの試行がglobal枠を消費 | peerを先に拒否。1接続元101試行後も別接続元が成功する再現テストでRED→GREEN |
| 直近200件の履歴が有効な招待・sessionを隠す | 有効分は全件＋直近履歴200件。201件の失効履歴と211有効sessionの試験でRED→GREEN |
| legacy publicモードと共有が併存 | owner＋非空許可リストを起動時に必須。public／未設定の拒否、共有無効の維持、owner／非ownerの試験でRED→GREEN |
| 管理者の「閲覧を終了」が実際にはlogoutしない | 管理者は「管理画面へ戻る」、viewerはsession logout。ブラウザでRED→GREEN |

修正コミット `b4f20f0`。その後の本番系列取り込みは認証コードを変えず、全suiteを再実行した。修正の評価は実装者が再現テストと全体の成功で行った。第二の独立再レビューを実施したという主張はしない。最終版で確認済みの重要指摘は解消している。

自分の攻撃レビューでも、静的JSON・隠しファイルのalias、未作成DB親symlink、遅いbodyに古い認可が残る問題、未知経路によるrate bucket増大、停止後の古い表示を再現して修正した。新しいOrigin／RP IDをリクエストから推測しない。新CookieにCollector／OAuthの権限を載せない。失敗応答は秘密値や内部例外を返さない。

### 評価を保留した事項への判断

- 実iPhone、実DB・環境・所有者設定、外部Vercel自動反映は未確認のまま本番前提に置く。実装テストで確認したことへ読み替えない。
- backup復元は演習していない。失効済みsessionが復活し得るので、復元後の全session・未使用grant失効を運用手順に記載した。今回のrollbackは専用DBを保持して機能停止・旧releaseへ戻す方式で、収集DBのdown migrationを不要にする。
- 個別の管理者sessionを遠隔一覧から止める画面は追加していない。原依頼の管理一覧はPIA閲覧sessionが対象。管理者は現在sessionのlogoutとcredential単位の全session失効を実装しており、要求する失効機構を満たす。
- 同期パスキーを物理端末固定とみなさず、コピー済みPIAデータを取り消せるとも扱わない。

## 変更ファイル（最新本番基準との差）

| 種類 | ファイル |
| --- | --- |
| 既存境界 | vps/src/web-server.mjs、analytics-handler.mjs、store-access.mjs |
| 新認証 | vps/src/access/config.mjs、handler.mjs、pages.mjs、schema.mjs、store.mjs |
| CLI・依存 | vps/scripts/access-admin.mjs、vps/package.json、vps/package-lock.json |
| 画面 | access-ui.mjs、access-ui.css |
| 自動テスト | vps/tests/access-api.test.mjs、access-cli.test.mjs、access-config.test.mjs、access-store.test.mjs、access-webauthn.test.mjs |
| 試験補助 | vps/tests/helpers/access-fixture.mjs、access-authenticator.mjs、access-log-probe.mjs、vps/tests/browser/access-e2e.mjs |
| CI | .github/workflows/vps-canonical-ingest-tdd.yml（VPS npm ciだけ追加） |
| 文書 | docs/pia-access-preflight-20261006.md、pia-access-operations.md、pia-access-review.md、docs/superpowers/specs/2026-10-06-pia-access.md、docs/superpowers/plans/2026-10-06-pia-access.md |

本番のスクロール保持2ファイルは基準側の更新を保持したもので、この機能の差分へ含めない。判別数学・設定確率を変更していない。

## 本番直前での停止

featureはローカルコミットで保持する。VPS timerが監視するdeploy/vps・mainへのpush／merge、本番migration、環境変数変更、ファイル編集、restart、bootstrapは実行していない。Vercelの外部自動反映条件が未確認なのでfeature pushも実行していない。

残るのは、権限のある接続での本番DB・環境・所有者の読取り照合、正規Origin／RP IDの最終確認、許可後の専用DB migrationと設定・反映、実端末の確認。これらを済ませず「本番反映準備がすべて整った」とは扱わない。手順は運用文書へ具体化済みで、今回実行していない。

**ここから先は本番デプロイになるため、ヒロの明示許可待ち。**

## 2026-10-07：設定統合・閲覧期間の追加検証

上記は初回実装時の記録。この節は完成コミット`af05ef99`時点の設定統合記録で、無期限Cookieの30日制約は後述の長期保持修正で変更した。完成基準`9f1626307be074919868b11fe1bd4ed033d8fe93`から、既存認証を保ったまま設定ページへ共有UIを統合した。引き継いだ本番前提照合はA判定。本番に接続せず、GitHub／Vercelへ書き込まず、ローカル実装とテストだけを行った。

設定のPIAセクションはサーバーが確認した管理者なら共有管理、非管理者ならコード入力、有効閲覧者なら有効状態・期限・PIA台データを表示する。初回・設定再表示の認可応答待ちは確認中表示にし、未確認の役割で入力欄や管理操作を出さない。専用ページも残し、固定テンプレートと操作処理を共有した。

閲覧期間は1時間・24時間・3日・7日・30日・無期限（管理者が停止するまで）。APIは1～720時間の整数または明示的NULL。無期限は招待の閲覧期間とviewerのexpires_atだけがNULLになり、入力期限30分と1回限り消費は維持する。Cookieは最大30日、有効な閲覧状態応答で更新し、有限期限やサーバー失効を超えない。30日間未訪問／Cookie削除後は新しい招待が必要。

専用access.sqliteだけschema 1→2の追加migrationを用意した。2テーブルをtransactionで再構築し、旧データ・制約・外部キーを保持する。新規作成もschema 2になり、反復実行と異常入力時のrollbackをテストした。既存収集DB・Relay DB、判別数学、PIA収集・分析計算、Nginx、systemdには変更がない。初回本番導入時はこの最終migrationを使用する。

### 独立レビューでの修正

別コンテキストのreviewerが今回の差分と新規ファイルを読み、期間・NULL・Cookie・認可・UI寿命・migrationを攻撃者視点で確認した。重大な認可突破は検出されず、下記を修正した。最終差分も同reviewerが再確認し、残る重要指摘はなし。

| 指摘 | 修正・確認 |
| --- | --- |
| Cookie logoutで既存所有者の表示まで消える | キャッシュを消してからReceiver所有者を再認可。実ブラウザで失敗を再現し、logout後のPIA表示維持を確認 |
| 背景更新のapp.renderで入力・発行結果が失われる | 設定が開いていれば既存UIを新しいDOMへ移す。発行応答を遅延させてapp.renderを行う再現試験で入力と生コード表示を確認 |
| 再表示時に前の役割を表示してしまう | 新しい設定UIは必ず確認中から始め、現在Cookieで照会。初回と再表示で入力／管理フォームを応答前に出さない |
| 閉じたUIからWebAuthn検証を継続し得る | 送信前の破棄チェックと認証器のAbortSignal。reviewerの独立プローブで中止後のverify送信なしを確認 |

reviewerは独立に追加の期間・ブラウザクライアント試験15/15、既存所有者のキャッシュ再認可、migration失敗時のschema／行保存を確認した。対象外として報告された判別数学・Collector意味・既存収集schema・公開judge・本番操作は、依頼どおり変更しない。実Safari／Face IDはローカル仮想認証器の検証結果へ読み替えない。

### 最終ローカル検証

| 検証 | 結果 |
| --- | --- |
| npm test（Node22） | 72/72コマンド成功 |
| npm --prefix vps test | 421/421成功＝既存406＋追加15、失敗／skipなし |
| WebAuthn仮想認証器・Chromium | 従来専用ページ＋設定統合2/2成功 |
| migration | schema 1データ保持、初回schema 2、反復、失敗rollback成功 |
| UI | 管理者／非管理者、有効状態、同一画面PIA、再訪、停止、320/375/390px、発行中の背景更新成功 |
| 秘密・権限の既存試験 | コード・session平文不保存／ログ非出力、競合消費1件、CSRF、所有者、公開judge、管理者失効、PIA以外拒否を維持 |

残る制約は、実iPhoneでの確認、パスキー同期、取得済みデータを回収できないこと、Cookie削除・30日間未訪問時の再招待。無期限閲覧は信頼する相手に限り、不要になったら管理者が停止する。schema 2を旧schema 1用コードへ戻す場合は機能を無効化し、DBを保持したまま切り戻す。手順は運用文書に記載。

**実装・テスト完了。本番デプロイは未実施。ここから先はヒロの明示許可が必要。**

## 2026-10-07：無期限閲覧の長期保持修正

基準`af05ef99ef4999550eb197b5ad314154dec6359e`。無期限閲覧に30日ごとの訪問を要求していたブラウザ保存期限だけを400日（Max-Age=34560000）へ変更した。[Chromeの保持上限](https://developer.chrome.com/blog/cookie-max-age-expires)に合わせ、永久Cookieや巨大な未来日時は使わない。状態確認の成功時には同じトークンで再設定するため、60日・半年の未訪問でも保存情報が残っていれば新しい招待が不要になる。

サーバーでは引き続き`expires_at IS NULL`を無期限とし、閲覧と招待が失効していないことを毎回確認する。Cookieの残存や更新だけで認可しない。期限付きは最大30日かつサーバーの残り期限を維持し、管理者・登録手続き用Cookieの寿命は変えない。DB構造・schema 2 migration・既存収集DB・Relay DB・UI文言は変更していない。

### 再現と検証

変更前に時間経過とCookie保持を組み合わせた試験を追加し、期待どおり30日制約で7件の失敗を確認した。変更後は期間試験12件＋新しい試験8件の20/20が成功。保存情報は最初の発行応答から保持し、途中のアクセス・更新なしで時計だけを進めた。実際に数か月待った試験ではない。

| 検証 | 結果 |
| --- | --- |
| 無期限の30／60／180／399日未訪問 | 最初のCookieが期限内で、PIA取得とNULL期限の状態確認が成功 |
| 180日後の管理者による停止 | 長期Cookieが残っていても店舗・日一覧・日データ・状態APIで即時401、更新Cookieなし |
| 本人のログアウト | Cookie削除に加えてサーバー権限失効、残存トークンでも401 |
| 新しい招待の使用 | 独立した新トークン、旧権限失効、偽トークン拒否 |
| 有限の5期間 | 更新後のCookieは残り期限へ短縮し、サーバー期限を延長しない |
| 招待・権限・秘密 | 入力期限30分、再利用不可、管理API／非PIA拒否、所有者と公開judge維持、DB／WAL／auditに平文トークン・コードなし |
| npm test（Node22） | 72/72コマンド成功 |
| npm --prefix vps test | 429/429成功＝既存421＋新規8、失敗／skipなし |
| WebAuthn仮想認証器・Chromium | 専用ページ＋設定統合2/2成功。実Cookieの保存期限も399～400日であることを確認 |

### セキュリティ再レビュー

別コンテキストのreviewerが今回の差分・追加試験・既存認可処理を読み、期間試験20/20を独立実行した。重大・重要な未解決指摘はなし。長期化を厳密なNULL分岐だけへ限定し、Secure／HttpOnly／SameSite=Strict／__Host／Path=/を維持していること、状態更新が認可成功後だけであること、招待使用時の新規トークン発行・再利用拒否・停止・logoutを確認した。既存のHTTPログ非出力試験も全suite内で再実行した。

盗まれた無期限トークンは、もともとサーバー上では管理者停止まで有効な持参式認証情報だった。長期保存は端末侵害時に露出し得る期間を広げる。PIA限定のままで、疑わしい相手は管理者が即時停止する。自動トークン交換は受動的な盗難コピーを無効化し得る一方、持参者本人と攻撃者を区別できず、先行交換・競合・復旧が必要になるため今回追加しない。新しい招待の使用時に交換・旧権限失効を行う既存処理は維持する。

400日以上未訪問で保存期限に達する場合や、利用者・Safari等のサイトデータ削除、別端末・プライベートブラウズ終了では再招待が必要。サーバーの無期限を400日へ短縮したわけではない。実iPhoneの長期保存やブラウザ独自の削除条件は保証せず、取得済みデータや既に進行中の応答も回収できない。本番操作・push・merge・PRは行っていない。

**実装・テスト完了。本番デプロイは未実施。ここから先はヒロの明示許可が必要。**
