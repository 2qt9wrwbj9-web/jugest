# JUGEST VPS 自動デプロイ設計

日付: 2026-09-10
対象ブランチ: `sol/vps-auto-deploy`
基点: `sol/vps-web-foundation` (`e228207854b7720fcb43d6972e832b411cd2c223`)

## 目的

`deploy/vps` ブランチに反映された JUGEST を、KAGOYA VPS が自動で検知し、安全確認を通過した場合だけ `jugest.net` に反映する。

開発中のブランチや `main` の更新では本番を変えない。壊れた更新は本番へ切り替えず、切り替え後に異常を検知した場合は直前の正常版へ自動で戻す。

## 最上位の安全原則

- `main` は変更しない。
- 自動デプロイ対象は `deploy/vps` だけに限定する。
- 判別数学、strict Champion、Calibration、store-share constraint、Juggler/HANA 判別式、HANA hard constraints、単一根拠エンジン、店舗解析の保護領域には触れない。
- 更新中の作業ディレクトリをそのまま本番配信しない。
- テスト失敗時は現在の正常版を維持する。
- 切り替え後の起動・ヘルスチェック失敗時は直前の正常版へ自動ロールバックする。
- GitHub 側に VPS の SSH 秘密鍵やサーバー用シークレットを置かない。
- force update は使わない。
- KAGOYA VPS 上で自動デプロイのタイマーを実際に有効化する直前には、ヒロの明示確認を取る。

## 採用方式

GitHub Actions から VPS に SSH する方式は採用しない。

VPS 自身が 1 分ごとに GitHub の `deploy/vps` を確認する pull 型を採用する。リポジトリは現在 public のため、読み取りに GitHub トークンは不要。

更新を検知した場合は、新版を別ディレクトリへ取得し、テストを通してから `current` を原子的に切り替える。

## ディレクトリ構成

```text
/opt/jugest/
  current -> /opt/jugest/releases/<現在のSHA>
  releases/
    <SHA1>/
    <SHA2>/
    ...

/var/lib/jugest-deploy/
  last-successful-sha
  previous-successful-sha
  last-attempt-sha
  last-result

/var/log/ または journalctl
  systemd journal に実行結果を保存
```

現在の `/opt/jugest/current` は通常ディレクトリなので、初回導入時だけ現在の正常版を `releases/<現在SHA>` に移し、`current` をシンボリックリンクへ移行する。

この初回移行は、現在の Git HEAD を取得でき、必要ファイルが存在し、`vps` テストが成功した場合だけ行う。途中失敗時は既存の `/opt/jugest/current` を壊さない。

## 更新検知

1 分ごとの systemd timer が oneshot service を起動する。

サービスは次を行う。

1. `flock` で多重実行を防ぐ。
2. GitHub の `refs/heads/deploy/vps` の SHA を取得する。
3. 現在配信中の SHA と同じなら何もせず終了する。
4. 未取得 SHA なら `/opt/jugest/releases/<SHA>` に取得する。
5. 取得した内容が要求された SHA と一致することを確認する。

ブランチが確認途中に進んでも、実際にデプロイする対象は取得時に確定した commit SHA とし、途中で別 commit を混ぜない。

## 新版の事前検証

新版は本番切り替え前に次を確認する。

- Git checkout の HEAD が対象 SHA と一致する。
- `vps/package.json` が存在する。
- Node.js の最低要求を満たす。
- `vps` で `npm test` を実行し、終了コード 0 である。
- 将来 `package-lock.json` が追加された場合のみ `npm ci` を事前に行う。現在は依存パッケージがないため不要。

テスト件数は 43 に固定しない。今後テストが増減しても、登録された全テストが成功したかを終了コードで判定する。

この段階で失敗した場合、`current` は一切切り替えない。

## 本番切り替え

事前検証成功後、現在の `current` のリンク先を `previous` として記録する。

新しいリンクを一時名で作り、同一ファイルシステム内で `mv` を使って `current` を原子的に差し替える。これにより、利用者が更新途中の半端なディレクトリを見る時間を作らない。

その後 `jugest-web.service` を restart する。

既存の Nginx、Let’s Encrypt、DNS 設定は自動デプロイの対象外とし、コード更新で勝手に上書きしない。

## 切り替え後の確認

再起動後、一定時間内に次を確認する。

必須:

1. `jugest-web.service` が active。
2. `http://127.0.0.1:3000/api/health` が正常応答。
3. Nginx 経由の `http://127.0.0.1/api/health` が正常応答。

参考確認:

- `https://jugest.net/api/health` の外部経路確認もログへ残す。

外部経路だけが一時的な DNS・ネットワーク要因で失敗した場合に正常なアプリを戻してしまわないよう、ロールバック判定は VPS 内部の必須確認を基準にする。

## 自動ロールバック

切り替え後の必須確認に失敗した場合:

1. `current` を直前の正常版へ原子的に戻す。
2. `jugest-web.service` を再起動する。
3. 直前版の必須ヘルスチェックを行う。
4. 失敗した SHA と理由を journal と状態ファイルに記録する。

ロールバック自体にも失敗した場合は明確なエラーを残し、無限再試行しない。次の timer tick でも同じ失敗 SHA を毎分再デプロイし続けないよう、失敗 SHA と結果を記録し、同じ SHA は新しい判断なしに再試行しない。

## systemd 構成

追加予定:

- `vps/systemd/jugest-deploy.service`
- `vps/systemd/jugest-deploy.timer`

タイマー:

- 起動後に開始。
- 約 1 分間隔。
- `Persistent=true`。
- 同時実行はスクリプト側の `flock` でも防ぐ。

デプロイ service は `/opt/jugest` の切り替えと `jugest-web` の再起動が必要なので root で動作させる。ただし常駐プロセスにはせず、1 回処理して終了する oneshot とする。

可能な範囲で systemd hardening を行い、書き込み先を `/opt/jugest` と `/var/lib/jugest-deploy` に限定する。GitHub への HTTPS 通信と systemd へのサービス再起動は許可する。

## スクリプト構成

追加予定:

- `vps/scripts/deploy-vps.mjs` または役割を分離した同等実装
  - 更新 SHA の確認
  - release 取得
  - 検証
  - current 切り替え
  - restart / health
  - rollback
  - 状態記録
- `vps/scripts/install-auto-deploy.sh`
  - 初回ディレクトリ移行
  - systemd unit 配置
  - daemon-reload
  - timer を有効化する直前までの導入

実装時に責務が大きくなりすぎる場合は、Git 操作、切替、ヘルス確認を小さなモジュールへ分離する。

## `deploy/vps` の扱い

`deploy/vps` は実運用用の専用ブランチとする。

- 開発は `sol/*` や Astra 作業ブランチで行う。
- 検証済み commit だけを `deploy/vps` へ fast-forward する。
- `deploy/vps` の更新だけが VPS 自動反映のトリガーになる。
- `main` と `deploy/vps` は別の役割として扱う。
- `deploy/vps` への force update は禁止する。

初回の `deploy/vps` は、今回の自動デプロイ実装と全テストが検証された commit を基点に作る。VPS の timer がまだ無効な間は、ブランチを作成しても実サーバーは自動更新されない。

## ログと観測性

各実行で最低限以下を journal に残す。

- 実行開始時刻
- 現在 SHA
- remote `deploy/vps` SHA
- 更新なし / 更新あり
- 取得結果
- テスト結果
- 切り替え結果
- health 結果
- rollback の有無と結果
- 最終状態

秘密情報はログへ出さない。

状態確認用として、最後の成功 SHA、直前 SHA、最後の試行 SHA、最後の結果を読みやすい形で残す。

## release 保持

無制限に release を増やさない。

成功後に古い release を整理し、最低でも次を保持する。

- current
- previous successful
- 直近数世代（初期値 5 世代）

current / previous を削除対象にしてはいけない。失敗 release は調査に必要な場合があるため、即削除せず保持上限の中で扱う。

## テスト方針

TDD で実装する。

最低限、次を自動テストする。

- remote SHA が current と同じ場合は何もしない。
- 新 SHA の取得先が release ごとに分離される。
- checkout SHA 不一致を拒否する。
- `npm test` 失敗時に current が変わらない。
- テスト成功時のみ current が切り替わる。
- health 成功時に成功 SHA が記録される。
- health 失敗時に previous へ戻る。
- rollback 後に web service 再起動が行われる。
- 同じ失敗 SHA の無限再試行を防ぐ。
- lock 中の二重起動を拒否する。
- release cleanup が current / previous を消さない。
- install script の初回移行が既存 current を欠落させない。
- install script を再実行しても壊れない。
- systemd timer が `deploy/vps` のみを対象にする。

既存の `npm test` 全体も必ず通す。

## 初回導入と本番有効化

実装・テスト・GitHub 上の検証が完了した後、KAGOYA VPS への導入は次の二段階に分ける。

### 段階 A: 導入のみ

- 新しい自動デプロイスクリプトと unit を VPS へ配置する。
- 現行 JUGEST を release 構造へ安全に移行する。
- 手動 dry-run / status 確認を行う。
- timer はまだ有効にしない。

### 段階 B: 自動更新 ON

ヒロの明示許可を取った後にだけ timer を enable/start する。

有効化後、テスト用の無害な `deploy/vps` 更新を 1 回行い、

`検知 → release 作成 → 全テスト → 切替 → restart → health`

が VPS 実機で通ることを確認する。

## 対象外

今回やらないこと:

- Vercel / Netlify の復活。
- GitHub Actions から VPS へ SSH する push 型デプロイ。
- Nginx / DNS / Let’s Encrypt の自動変更。
- DB スキーマ変更。
- VPS-native データ収集の実装。
- 解析ロジック・判別数学の変更。
- `main` の変更。

## 完了条件

1. `sol/vps-auto-deploy` 上で実装が完了している。
2. 新規テストと既存 VPS テストが全 PASS。
3. `deploy/vps` 以外のブランチ更新では自動デプロイされないことが確認できる。
4. 壊れた候補版が current を変更しないことを確認できる。
5. health 失敗時の自動 rollback を確認できる。
6. GitHub に VPS の秘密鍵・トークンを置いていない。
7. `main` と保護ロジックに差分がない。
8. KAGOYA VPS への本番 timer 有効化は、ヒロの明示許可まで行わない。
