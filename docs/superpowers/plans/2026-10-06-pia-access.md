# PIAアクセス制御 実装計画

> 実行方法：superpowers:executing-plansでこのセッション内に実装し、最後に独立したreviewerが確認する。細部はユーザーの指示に従って自律判断する。本番反映は禁止。

**Goal:** パスキー管理者と、1回限りのPIA閲覧招待を追加する。

**Architecture:** 既存Node.js HTTP配信と所有者APIへ小さな認証境界を追加。認証情報は別のSQLite DBへ保存し、既存DBの読み取り・収集方式を維持。

**Tech Stack:** Node.js 22.13以上、node:sqlite、SimpleWebAuthn、標準WebAuthnブラウザAPI。

**Spec:** `docs/superpowers/specs/2026-10-06-pia-access.md`

## Global Constraints

- 本番操作、deploy/vps・mainへの反映は禁止。
- 管理者12時間、再認証5分、bootstrap15分、PIA招待30分・閲覧24時間を初期値とする。
- 判別数学と一般公開の設定判別を変更しない。
- 管理者・閲覧者CookieはSecure/HttpOnly/Strict、保存トークンは照合値だけ。
- 既存正規DBに認証用migrationを適用しない。

## Review Focus

- SQLiteを2接続から使用した招待消費の競合。
- WebAuthnを待つ間にcredentialや追加登録の発行者が失効する場合。
- URLをエンコード・変更して静的配信へ回り込む場合。
- 他人の店舗ID、偽造Origin、期限境界、Cookie混在。
- フォームの二重送信、セッション切れ、パスキーキャンセルからの再試行。

### Task 1: 永続化・migration・運用CLI

Files: `vps/src/access/schema.mjs`、`store.mjs`、`vps/scripts/access-admin.mjs`、`vps/tests/access-store.test.mjs`、`vps/package.json`、`vps/package-lock.json`。

Interfaces: `migrateAccessDatabase(dbPath)`、`createAccessStore({dbPath,now})`。Storeはトークン発行／照合、credential／セッション失効、challengeの単回消費、audit、招待一覧を提供する。既存データを読み書きしない。

- [x] 行動を検証するテストを先に書く。招待初回成功・再利用失敗・期限切れ・失効・独立接続競合・生値非保存・credential失効・bootstrap再利用を含める。
- [x] `node --test vps/tests/access-store.test.mjs` が機能未実装により失敗することを確認する。
- [x] SQLite transaction、条件付き更新、照合値保存を実装する。登録確定時と本人認証確定時にも失効を再確認する。
- [x] テスト成功後、migration／bootstrap／追加登録復旧／credential失効CLIを用意する。
- [x] Taskをコミットして進捗を記録する。

### Task 2: 認証・閲覧APIと静的配信の境界

Files: `vps/src/access/handler.mjs`、`config.mjs`、`vps/src/web-server.mjs`、`analytics-handler.mjs`、`vps/tests/access-api.test.mjs`。

Interfaces: `createAccessHandler({config})`、`authenticate(req)`。認証結果は `kind: admin|pia-viewer`、対象IDとpia:viewだけ。既存認証へチャンネルを偽装して渡さない。

- [x] 未認証、PIA限定閲覧、所有者継続、管理API拒否、Origin不一致、rate limit、Cookie、直接URLを実サーバーで検証するテストを書く。
- [x] 該当テストが失敗することを確認する。
- [x] WebAuthnのoption／verify、短期challenge、Cookie、登録、再認証、招待・セッション管理を実装する。
- [x] 既存analyticsのPIA店舗リスト・日別APIだけに追加の認証を許可する。静的データ／バックアップ経路を拒否する。
- [x] 実APIテスト成功後コミットし、進捗を記録する。

### Task 3: 画面と仮想認証器での検証

Files: `vps/src/access/pages.mjs`、`access-ui.mjs`、`access-ui.css`、`vps/tests/access-webauthn.test.mjs`、ブラウザ検証用テスト。

Interfaces: 管理者ログイン／登録／再認証、管理一覧、招待発行、PIA閲覧。動的表示はtextContent。発行コードは再取得できず、追加登録リンクはfragmentにのみ秘密値を載せる。

- [x] APIと実WebAuthnがつながる検証を先に用意し、Origin/RP/本人確認/失効とブラウザ動作を確認する。
- [x] 既存スタイルに合わせた画面を実装し、日本語の説明と期限・エラー表示を入れる。
- [x] ブラウザで登録→ログイン→招待→PIA閲覧→強制停止を検証する。
- [x] コミットと進捗記録。

### Task 4: 全体検証・レビュー・手順

Files: `docs/pia-access-operations.md`、`docs/pia-access-review.md`、前回調査記録の追記。

- [x] `npm test` と `npm --prefix vps test` を実行。失敗は原因を確認して修正し、必要範囲を再検証する。
- [x] 独立したreviewerへ、本番基準04fc937との差分、要件、検証記録を渡す。
- [x] 重要な指摘に再現テストを追加し、修正して全体を再検証する。
- [x] 環境変数名、CLI、初回登録、共有、紛失、migration、本番反映、rollback、実DB未確認点を文書にする。
- [x] feature branchにコミットし、本番変更なしを報告して明示許可待ちで停止する。

完了記録: docs/pia-access-review.md。実DB・全環境・実所有者設定の本番読取り照合は権限不足で未確認。コード・ローカル検証・独立指摘の修正まで完了し、本番反映前で停止する。最終配信基準b9ea99bをローカル統合し、認証DBはWAL＋FULL、既存363件＋新規43件（406/406）、ルート72/72コマンド、仮想認証器ブラウザ1/1成功。
