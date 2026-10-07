# PIA共有アクセスの運用

本機能はVPSのNode.js配信向け。作業ブランチ `work/pia-access-preflight-20261006` で実装した。開始時の本番配信基準は `04fc937a852c77004fe3f7fa9bb163b07d0cf234`。作業中の別更新 `b9ea99b9f5d8640baee90311f9d516f19360838e`（店舗表のスクロール保持と既存テスト）も最終照合後にローカル統合した。本番反映・migration・登録は実行していない。

2026-10-07の設定統合・期間選択は完成済み認証基盤 `9f1626307be074919868b11fe1bd4ed033d8fe93` を基準に追加した。本番前提照合のA判定を引き継ぎ、今回の作業では本番へ接続・変更していない。専用access.sqliteだけは初回反映時にschema 2を適用する。

## 仕組みと権限

管理者はパスキーで本人確認する。WebAuthnの署名検証は固定バージョンの `@simplewebauthn/server` が行い、登録・ログインともUser Verificationを必須にする。Face ID、端末のPINなど、ブラウザと認証器が対応する方法を使える。秘密鍵をサーバーへ送らない。パスキーの同期を許容するので「物理的な1台への固定」ではない。

管理者Cookieは12時間。キー発行、追加登録コード発行、招待・閲覧・credential無効化には5分以内の本人確認が必要。古ければ画面が自動的にパスキー確認を要求する。本人確認の開始だけでは時間を更新せず、署名の検証成功後に更新する。

PIA閲覧コードは128ビット乱数（`JGST-`と4文字×8組）、1回限り。初期値は入力期限30分・使用後の閲覧24時間。発行画面は1時間・24時間・3日・7日・30日・無期限（管理者が停止するまで）を選べる。APIは1～720時間の整数または明示的な`null`を受け付ける。名前と1～1440分の入力期限も指定できる。使用と独立した256ビット閲覧Cookieの発行を、SQLiteの1トランザクションで確定する。入力期限と閲覧期限は別の時刻。無期限でもコードの使用回数と入力期限は変わらない。

Cookieは `__Host-jugest_admin`、`__Host-jugest_pia`、WebAuthn手続き用の `__Host-jugest_ceremony`。すべてSecure / HttpOnly / SameSite=Strict / Path=/、Domain指定なし。認証・閲覧・登録・手続き用のトークンは照合用SHA-256だけをDBへ保存する。Cookieの期限内でも各リクエストでサーバー側の失効・期限を確認する。

期限付き閲覧Cookieは最大30日かつサーバーの残り期限まで。無期限閲覧Cookieだけは400日（Max-Age=34560000）にする。認可に成功した閲覧状態APIで同じトークンのCookieを更新するが、期限付きの閲覧権限は延長しない。無期限は30日ごとの更新が不要になり、60日・半年空いても保存情報が残っていれば同じ招待の閲覧を再開できる。DBの無期限判定はNULLのままで、400日後という日時をサーバーの期限に保存しない。管理者・登録手続き用Cookieの寿命は変更しない。refresh tokenの仕組みも追加しない。

400日は[Chromeの保持上限](https://developer.chrome.com/blog/cookie-max-age-expires)に合わせた長期値で、永久Cookieの保証ではない。400日以上未訪問で期限を迎えた場合や、利用者／Safari等がサイトデータを削除した場合、別端末・プライベートブラウズ終了等で保存情報を失った場合は再招待が必要。ブラウザによっては400日より短く削除することもある。Cookieが失われてもサーバー上の招待や閲覧の期限を勝手に変更しない。

長期の認証情報を盗まれた場合は、管理者が停止するまでPIAを取得され得る。Secure／HttpOnly／Strict、URL・保存領域・ログへのトークン非出力、PIA限定認可は維持し、疑わしい閲覧は一覧から即時停止する。無期限は信頼する相手に限る。定期的なトークン交換だけでは盗まれた認証情報を持つ相手と本人を区別できず、今回は自動交換を追加しない。新しい招待を同じブラウザで使用すれば新しいトークンを発行し、旧閲覧を失効させる。本人のログアウトもサーバーの閲覧権限を失効させる。

閲覧Cookieと管理者Cookieのデータ権限は `pia:view` に限定。`source=pia-public-ranking-top` の店舗一覧・営業日・収集済み台データを取得できる。Collector、Relay、設定変更、所有者管理、解析・予測API、MCP保存データツールへ昇格しない。管理者だけが共有管理APIを使える。既存Receiver／assistant／OAuthの認証・店舗所有者判定は維持する。一般公開の `judge_machines` と `/api/public/judge` は引き続き誰でも利用できる。

共有有効時は既存PIAの `owner` モードと空でない所有者許可リストを必須にし、`public` モードや所有者未設定なら起動を拒否する。旧publicモードは有効なReceiverを持つ非所有者にもPIAを許可し得るため、招待制と併存させない。共有無効時には旧認証ポリシーを変えない。所有者の実設定を確認・保持することが本番反映の前提。

## DBとmigration

認証専用DBの既定値は `/var/lib/jugest/access.sqlite`。正規収集DB、Relay DB、原本ファイルとは独立する。Web配信ルートの内部や、正規DB／Relay DBと同じファイルには設定できない。存在前の親ディレクトリのsymlinkも検証する。

認証DBの全接続はWALと `synchronous=FULL` を使い、招待の消費・失効が電源断で巻き戻る危険を抑える。既存収集DBの設定は変更しない。SQLiteの[保存保証](https://www.sqlite.org/pragma.html#pragma_synchronous)に従った設定で、ストレージが同期要求を正しく処理することが前提。古いバックアップの復元で失効が戻る問題は別に対処する（rollback参照）。

| テーブル | 保存内容 |
| --- | --- |
| admin_credentials | 名前、credential ID、公開鍵、署名カウンター、同期情報、登録・最終利用・失効時刻 |
| admin_sessions | credentialとの関連、セッション照合値、期限、最終利用、直近本人確認・失効時刻 |
| admin_enrollment_tokens | bootstrap／追加／復旧の種別、照合値、発行者、短期期限、使用・失効時刻 |
| access_challenges | WebAuthn challenge、手続きCookie照合値、用途、登録またはセッションとの関連、5分期限、使用時刻 |
| pia_access_invites | 名前、照合値、発行者、入力期限、閲覧時間、使用・失効時刻 |
| pia_viewer_sessions | 招待との1対1関連、照合値、開始・期限・最終アクセス・失効時刻 |
| access_audit_events | イベント種別、actor・targetの内部ID、時刻。秘密値・IPを含めない |
| access_rate_limits | 短期試行回数。IP生値を保存しない |
| access_meta | 乱数のWebAuthnユーザー識別子 |

`vps/src/access/schema.mjs` のschema 2を、`npm --prefix vps run access:migrate` で明示適用する。新規DBは最終schema 2になり、schema 1からも反復可能に更新できる。起動時の自動適用はしない。未適用なら新しい共有認証は失敗する。既存の空でない別DBや未知のschemaバージョンを拒否する。新規DBの権限は0600。既存収集テーブルへの列追加、データ移動・更新・削除はない。

schema 2では専用DBの`pia_access_invites.viewer_session_duration`と`pia_viewer_sessions.expires_at`だけをNULL許可にする。NULLは自動失効なしを表す。入力期限、管理者セッション期限、登録期限はNOT NULLのまま。schema 1の招待・閲覧2テーブルを1トランザクションで再構築し、全行、UNIQUE、外部キーを保持して検証する。失敗時は旧schema・行・user_versionへ戻る。期限付き閲覧はコード使用時のサーバー時刻＋期間（UTC epoch milliseconds）、表示だけ利用者のローカル時刻へ変換する。

## 初回登録

以下の本番操作は、ヒロの本番反映許可後にのみ行う。

1. migrationと本番用Origin／RP ID設定を完了する。
2. サーバー管理者が `JUGEST_ACCESS_DB` を同じDBに設定して `npm --prefix vps run admin:bootstrap` を、出力を記録しない対話端末で実行する。ログ収集付きのジョブ、tee、画面収録に流さない。
3. 出力される256ビット登録トークンを、ヒロのiPhoneで `/admin/register` の登録コード欄へ入力する。15分・1回限り。URLのqueryへ入れない。
4. 名前を付け、Safari等の対応ブラウザでパスキー登録と本人確認を行う。
5. 登録トークンは登録確定時に消費され、管理者Cookieが発行される。`/admin` が開く。失敗したWebAuthn手続きは最初から再試行する。

既にcredentialが1つでも登録されたDBで初回bootstrapを再発行できない。すべて無効化しても再公開しない。登録完了前にbootstrapを再発行すると古い未使用bootstrapを失効させる。

## キー発行と閲覧

1. JUGESTの「設定」を開く。非管理者には「PIAデータ閲覧」のワンタイムパスワード入力欄が出る。ヒロは「管理者としてパスキーでログイン」で本人確認すると、その場所に「PIA共有アクセス」が表示され、入力欄は消える。表示切替はサーバーの認証応答だけで決め、応答待ちは確認中表示にする。
2. 「PIA閲覧キーを発行」で名前、入力期限、閲覧時間を指定する。
3. 発行直後のコードをコピーして、相手にJUGESTの「設定」から入力するよう伝える。生コードは再取得できない。設定を閉じる・別の設定へ移る・タブを隠すと表示を消す。通常のバックグラウンド更新では開いているUIと進行中の操作を保持する。紛失したら一覧で無効化して新しく発行する。
4. 相手がコードを入力すると1回限りで消費し、別の閲覧Cookieを発行する。同じ設定内で有効状態・期限・PIA店舗／営業日／台データを表示し、通常の店舗画面のPIA一覧も更新する。ブラウザの保存領域へコードや新しい閲覧トークンを保存しない。PIA用のキャッシュはメモリ上で、失効確認時に消す。既存所有者のReceiver認証が有効なら再認可して表示を継続する。
   閲覧Cookieが有効な同じブラウザでは再入力不要。互換用の `/admin/login`、`/admin`、`/pia/access`、`/pia` も残し、共有した画面部品と操作ロジックを使う。専用アクセスページでは従来どおり `/pia` へ移る。
5. 管理者画面の招待一覧は未使用／使用済み／期限切れ／無効化と閲覧期間を表示する。閲覧セッションには名前、開始、期限（無期限を明記）、最終アクセス、状態、停止ボタンを表示する。「一覧を更新」で再取得できる。
6. 「閲覧を強制終了」は次のデータリクエストから即時拒否する。「招待と閲覧を無効化」は、その招待の未使用権限と既存閲覧を両方停止する。画面は30秒ごと・再表示時にも権限を確認し、失敗時に表示を消す。

有効な閲覧・未使用招待・閲覧継続中の招待は件数にかかわらず一覧へ含め、直近200件の履歴も表示する。履歴によって停止対象を隠さない。管理者がPIA画面を開いた場合のボタンは「管理画面へ戻る」で、管理者ログアウトは管理画面から行う。

既に相手が取得・撮影したデータを取り消すことはできない。停止が効くのはサーバーからの以後の取得。共有内容は全PIA店舗の収集データで、今回は店舗別・期間別の絞り込みを実装していない。

## 端末追加と紛失

管理者画面の「端末を追加」で15分・1回限りの登録リンクを発行する。新しい端末でリンクを開いて名前を付け、パスキー登録する。トークンはURL fragmentに入れるためHTTPアクセスログ・Refererへ送られず、ページ起動時に履歴から取り除く。発行したcredentialが失効すると未使用の追加登録権限も失効する。

一覧の「パスキーを無効化」で、該当credentialからの新規ログインと既存管理者セッションを止める。同期された同じパスキーにも効く。最後の有効なパスキーも無効化できるため、その後はサーバーCLIでの復旧が必要。

すべての端末を失った場合、サーバー管理者が `admin:status` で内部credential IDを確認し、`npm --prefix vps run admin:revoke -- <credential-id>` で紛失credentialを失効させる。続いて `npm --prefix vps run admin:recover -- --confirm-recovery` で15分の復旧登録トークンを発行する。復旧トークンは既存credentialの自動失効を行わないので、失ったものを先に明示無効化する。公開HTTP経由の復旧APIはない。操作するサーバーアカウントの権限が復旧の認証境界になる。

## 環境変数

秘密鍵や共通bootstrap secretを設定する必要はない。トークンを環境変数へ保存しない。

| 名前 | 用途 |
| --- | --- |
| JUGEST_ACCESS_ENABLED | `1` で新機能を有効化。未設定は無効 |
| JUGEST_ACCESS_DB | 新しい認証専用DB。既定 `/var/lib/jugest/access.sqlite` |
| JUGEST_ACCESS_ORIGIN | 登録・認証を行う正規HTTPS Origin（scheme、host、必要ならportだけ。末尾slashなし） |
| JUGEST_ACCESS_RP_ID | パスキーのドメイン識別子。本実装ではOriginのhostnameと完全一致を要求 |
| JUGEST_ACCESS_TRUST_LOOPBACK_PROXY | `1` は、loopbackから接続しX-Real-IPを上書きする確認済みNginxを試行制限だけに信頼する。未設定では直接接続元で制限 |
| JUGEST_ACCESS_ALLOW_LOCALHOST | ローカルテストでだけ `1`。HTTP localhostの許可。本番では設定しない |
| JUGEST_PIA_ACCESS_MODE | 既存変数。共有有効時は `owner` が必須（既定もowner）。public等なら起動を拒否 |
| JUGEST_PIA_OWNER_CHANNEL_IDS / JUGEST_PIA_OWNER_CHANNEL_FILE | 既存の所有者許可リスト。前者または読取り可能なファイルで非空の実所有者設定が必須。既定ファイルは `/opt/jugest/pia-owner-channel` |

JUGESTの正規ホストが `https://jugest.net` であることを最終確認して、そのOrigin／hostnameを設定する。別サブドメイン・別ホストへの変更ではパスキーの再登録が必要になるため、後から変更する前提で決めない。

本番調査でNginxが `X-Real-IP $remote_addr` を上書きし、Node.jsが127.0.0.1:3000でのみ待ち受けることを確認した。試行制限は1操作系統あたり接続元10回／5分、全体100回／5分。接続元で拒否した試行は全体枠を消費しない。optionとverifyは同じ系統に数える。信頼設定を使わない場合、Nginx利用者が接続元枠を共有する。X-Forwarded-Forの任意チェーンを採用しない。IPを管理者判定には使わない。接続元はプロセスごとの乱数鍵でHMAC化して保存し、鍵はDBへ残さない。古いrate bucket・challengeは24時間超、auditは90日超を次の制限処理で削除する。小規模共有用の保守的な上限であり大量アクセスの負荷対策基盤ではない。

既存の `JUGEST_WEB_ROOT`、`JUGEST_WEB_HOST`、`JUGEST_WEB_PORT`、`JUGEST_RELAY_DB` はsystemd unitで名前を確認した。`JUGEST_DB_PATH`、`JUGEST_RAW_ROOT`、PIA所有者・収集設定等は既存設定で、値を変更していない。初回実装時に未確認だった実DB・環境・所有者設定は別途本番前提照合でA判定となった。反映直前にその後の差分がないか確認し、実際の所有者許可リストを保持する。今回のUI／期間拡張で追加の環境変数は不要。

## APIと配信の境界

| 経路 | 認証・用途 |
| --- | --- |
| GET /api/access/admin/state | 管理者だけ。公開鍵・照合値・トークンを返さない一覧 |
| POST /api/access/register/options, register/verify | 有効な登録トークン、ブラウザ手続きCookie、検証済みWebAuthnで登録 |
| POST /api/access/login/options, login/verify | 登録済み有効credentialによるWebAuthn |
| POST /api/access/reauth/options, reauth/verify | 既存の管理者と同じcredential・セッションに結び付けた再確認 |
| POST /api/access/admin/invites | 直近本人確認済み管理者が招待発行。生コードはこの応答だけ |
| POST /api/access/admin/enrollment | 同管理者が追加登録トークンを発行 |
| POST /api/access/admin/invites/:id/revoke | 招待と関連閲覧を失効 |
| POST /api/access/admin/sessions/:id/revoke | 閲覧を失効 |
| POST /api/access/admin/credentials/:id/revoke | credential、管理者セッション、未使用の追加登録権限を失効 |
| POST /api/access/admin/logout | 管理者Cookieをサーバー側でも失効 |
| POST /api/access/viewer/redeem | 1回限り招待を使用。新しい閲覧Cookieを発行 |
| GET /api/access/viewer/status | 閲覧／管理者Cookieの有効性と期限 |
| POST /api/access/viewer/logout | 閲覧Cookieをサーバー側でも失効 |
| GET・HEAD /api/vps/stores, /stores/:id/days, /stores/:id/days/:date | 既存の所有者等、または新CookieのPIA限定権限 |
| その他 /api/vps、/api/relay、/api/vps/backfill、MCP保存データツール | 既存認証を維持。新Cookieはその認証にならない |

変更POSTは固定Origin照合・JSON・専用ヘッダーを必須にし、bodyは64KiBまで。body待ちの間にセッション失効や5分期限が起きても、重要処理の直前に再照合して拒否する。WebAuthn challengeは5分・用途別・手続きCookieとの関連・1回限り。

静的JSON／JSONL／NDJSON、CSV、SQLite、DB、バックアップ等の直接配信を拒否する。data、static、raw、backup等の保存用ディレクトリと既存非公開ディレクトリも拒否する。symlink解決後の保存先も検証し、別拡張子のaliasでJSONや隠しファイルを読むことを防ぐ。既存本番releaseには未管理ファイルや収集静的JSONを検出しなかった。Nginxは別のstatic配信をしていない。今後も原本・バックアップはWebルートの外へ置く。データをJS・HTML・画像に埋めて公開する運用は本機能では保護できない。

## 本番反映手順 — 許可が出るまで実行禁止

1. ヒロの明示許可を得る。deploy/vps更新は約1分後の本番反映になり得る。まず実DBを読み取り専用で照合できる権限で、実際の保存先、schema、所有者設定、環境変数の名前を最終確認する。PIAのownerモードと実所有者許可リストが必要。旧publicモードだった場合、その所有者への限定は本番設定変更として許可された反映工程に含める。秘密値は出力しない。未確認のまま反映しない。
2. 本番 `current` SHAと最新 `deploy/vps` が基準から進んでいないか確認する。進んだらfeatureへ取り込み、差分・テストを再確認する。今回の古い基準を丸ごと上書きしない。
3. 自動更新timerを一時停止する作業も本番変更なので、許可後に運用担当者が行う。timer停止だけでは実行中のdeploy serviceが止まらないため、その終了と更新lockの解放を確認してから進む。正規DB・Relay DB・原本の既存バックアップを確認し、機能導入前の設定とrelease SHAを記録する。新しい認証DBはWeb外で作成する。access.sqliteが既にある場合は整合したSQLiteバックアップを非公開に保管し、migration中はそれを使うWebサービスも停止して旧schema接続と競合させない。
4. 許可された完成コミットのコードを本番Web外の準備用checkoutへ取得し、`cd <checkout>/vps`、`npm ci` を実行する。認証DBをjugestユーザーが作成・利用できるディレクトリに用意し、同じユーザー・`JUGEST_ACCESS_DB`指定で `npm run access:migrate` を実行する。正規DBへ `migrate` を実行する工程は追加しない。
5. Webサービスだけに上記の新しい環境変数を設定する。既存設定と収集設定を保持する。正規HTTPS Origin／RP IDを確認し、localhost許可は設定しない。unit自体を変えず既存EnvironmentFile等へ設定する場合は、実際の運用を権限のある担当者が確認する。deployerのテスト環境へ本番の認証DBパスや有効化フラグを流し込まない。
6. レビュー済みfeatureの変更だけを許可された方法で `deploy/vps` に統合する。現行独立deployerはlockfileを検出して `npm ci` → VPSテスト → `/opt/jugest/current` の原子的切替 → Web再起動 → 内部／Nginx health確認を行う。失敗時は前releaseへ切り戻す。timer再開・反映待ちはこの手順を確かめてから行う。deployerコードそのものは今回更新しない。
7. 未認証のPIA API拒否、静的URL404、既存所有者の閲覧・収集、公開judge、管理画面、Cookie設定を確認する。管理者を初回bootstrapで登録し、使い捨てテスト招待から閲覧・即時停止を確認する。実iPhoneのSafari／Face IDはこの段階で確認する。監査に秘密値がないことも確認する。
8. Node22.23.2、DBの権限、schedulerと収集、health、deployer stateを確認する。新しい機能の設定・DBをVPSの非公開バックアップ運用へ加える。

GitHub Actionsのテストはdeploy/vpsのtimer反映とは別。mainへのpushはVercel本番、work/*へのpushはVercel確認環境を発火した実績がある。今回の設定統合ではGitHub／Vercelへの書込みを一切行わず、featureもローカルcommitだけにする。

## rollback — 許可後の運用手順

自動health切戻しだけでは設定・DBは戻らない。運用担当者はtimerを止め、`JUGEST_ACCESS_ENABLED` を無効にしてから記録した前releaseへ `current` を原子的に戻し、Webを再起動してhealthを確認する。その後、意図したrollbackコミットを監視ブランチへ反映し、再度新releaseが配信されないようdeployer状態を確認してtimerを再開する。これらもすべて本番操作であり、今回実行しない。

新DBを保存したまま機能を無効化してよい。専用DBなので収集DBのdown migrationは不要。全面削除する場合は、機能無効化・Web停止後に認証DBとWAL／SHMを非公開に退避し、再有効化時は全登録・招待・セッションが失われることを確認する。古い認証DBのバックアップ復元は失効済みセッションを復活させ得るため、復元後は管理者／閲覧セッションと未使用登録・招待を全失効させ、パスキー状態を確認してから公開する。

schema 2は旧schema 1用のアクセスコード（`9f162630`等）で読み込めない。旧アクセス実装へ戻す場合もまず機能を無効化する。NULL期限を勝手に有限期限へ変換するdown migrationは用意しない。新実装へ戻せば保存したschema 2を再利用できる。初回導入前の本番releaseへ切り戻す場合はアクセスDBに触れる必要がない。

## ローカル検証

通常は `npm ci --prefix vps`、`npm test`、`npm --prefix vps test`。VPS testコマンドは `JUGEST_ACCESS_ENABLED=0` を明示し、本番の有効化フラグを継承して既存fixtureが本番認証DBを読むことを防ぐ。既存PIA suiteはpublicモード、追加の共有試験はテスト用ownerモード・一時DBを明示する。本番DBを指定しない。

ブラウザ試験は通常suiteの外にあり、PlaywrightとChromiumを別途用意して `node --test vps/tests/browser/access-e2e.mjs` を実行する。必要なら `JUGEST_PLAYWRIGHT_MODULE`（PlaywrightのES module絶対パス）、`JUGEST_CHROMIUM_EXECUTABLE`（Chromium絶対パス）を指定する。毎回一時DB・localhost・CDP仮想認証器だけを使用し、本番登録を行わない。初回CLIから登録・本人確認・重要操作の再確認・別ブラウザの閲覧・強制停止・端末追加・再ログイン・320/375/390px表示を通す。実端末の生体認証をエミュレートする試験ではない。

設定統合は併せて `node --test vps/tests/browser/access-settings-e2e.mjs` で検証する。配信パッチ適用済みのindexから、管理者／非管理者の表示、確認中表示、発行途中の背景更新、同一画面認証・PIA表示、再訪、停止、所有者認証の維持を通す。

WebAuthn検証仕様の参照: https://simplewebauthn.dev/docs/packages/server 、https://simplewebauthn.dev/docs/advanced/passkeys 。
