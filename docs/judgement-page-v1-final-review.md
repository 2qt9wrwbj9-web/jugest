# 独立した判別ページ v1 最終レビュー

最終分類は **B：軽微修正後、本番反映候補にできる**。本番反映の許可を意味しない。

## 対象と基準

- 復元原本：`restore/judgement-page-v1-5918c134` / `5ab2cc00d02f44adace9fa51095d84741927abaa`。
- 比較基準：`codex/cloud-dev-baseline-20261003` / `011ca7a9418ef9d8e68a8b8d4259146a2d6a2bfd`。
- 実運用系列：`deploy/vps` / `69a9f61d71b192776d8a7349d00c819367e16793`。mainは比較基準に使用していない。
- 修正候補：`work/judgement-page-v1-final-review-20261003`。復元原本を親として分岐し、原本を変更していない。
- ルートAGENTS.mdを作業開始時に確認。Node.js v24.19.0で検証した。

## 発見した問題と修正

1. 並列詳細の履歴がmode・台IDを保持せず、詳細を閉じて戻ると一覧になったり、別台を表示したりした。履歴にmode・rowIdを追加し、対象の結果が失われた場合は一覧へ戻す。モード変更時も画面・履歴を整合させる。
2. preservation helperが追加ブロック全体を無条件に除外していたため、その中に実戦状態の書き換えを挿入しても旧ハッシュ検証を通過できた。レビュー済みブロックのSHA-256を固定し、境界と置換アンカーの件数を検証する。既存のproduction保護ハッシュは変更していない。不正な保存処理・CSS変更・境界重複の挿入が拒否される回帰テストを追加した。
3. bonus-onlyの診断callbackが計算中のログ配列を変更すると、設定確率まで変えられた。診断へ渡す配列・逆算行をコピーし、callbackから内部計算を変更できないようにした。逆算側も同じ分離を行った。現行UIは元々callbackで値を書き換えていなかった。

修正はapp-v510.js、index.html、tests/helpers/judgement-preservation.mjs、tests/judgement-page.mjs、tests/judgement-page-browser.pyと本書。判別式・設定表・PRE・店舗解析・店舗予測・MCPの意味・既存保存データの意味は変更していない。

## 独立レビュー結果

別レビュアーが原本と修正差分を読み取り専用で確認した。上記3指摘は修正後に解消し、新たな指摘はない。

- 判別数学はexternalJudge()だけ。単品・並列ともjudgeObservedMachine()を通り、描画で再判別しない。診断は同じ1回のexternalJudge / reverseCore呼び出しから取得する。
- expectedSetting、P4+、P5+、P6は元のMCP posteriorSummaryと同じ演算順序。MCPレスポンスのキーとjudgeVersionは維持される。
- 差枚未入力はbonus-only、差枚0はreverse-diff。BB/RBの0は有効。空欄、負の通常G、小数、非数値、非対応機種、BB+RB>Gなどは拒否される。
- 分布集中度を的中率とは表示していない。ログ尤度の意味を区別し、最大確率の同率設定をすべて保持する。差枚なしでは逆算結果を作らない。台番号等はHTML escapeされる。
- judgement-model.jsはglobalThisへ共通ヘルパーを登録するだけで、importによる保存・タイマー・通信はない。windowのないNodeでも使用でき、MCP起動と既存応答のテストも通る。
- 既存5 workspaceのキーを維持し、判別を追加。判別の入力・結果はメモリ内だけで、reload時に古い結果を復元しない。
- build出力とVPS配信加工の双方で動作し、patchJugestIndexSourceの2回適用が1回適用と一致する。
- preservationで正規化した6ファイルは基準コミットと完全一致する。追加ブロック内の不正変更も固定ハッシュで検出する。

## 内部値比較

基準コミットのindex.htmlとMCP posteriorSummaryをgit showで取り出し、別VMで実行して比較した。丸め前の値をdeep strict equalityで比較し、NaNも維持した。

- 8機種すべて。
- 差枚：未入力、0、+830、-830。
- BB/RB：(19,22)、(0,22)、(19,0)、(0,0)。通常Gは5278。
- 合計128入力。現externalJudge、judgeObservedMachine、単品の実UI action、並列の実UI action、公開MCP judge_machinesの5経路、計640比較が完全一致。
- 比較項目：q、expectedSetting、p4、p5、p6、method、estimatedGrape、estimatedGrapeCount、grapeCountLo、grapeCountHi、reverseWarn。
- 8機種×差枚4条件で、診断callbackがlogs・q・逆算値・逆算行を変更してもexternalJudgeの戻り値はcallbackなしと完全一致。

## 副作用と再検証

判別Bridgeと単品・並列操作の前後で、liveSessions、実戦入力data、sessions、shops、店舗選択、externalDays、modelForecasts、bruteResults、解析履歴、予測キャッシュ、同期状態を比較した。通常保存・IndexedDB・タイマーは変化せず、autosave / queueAutoSave呼び出しは0。タブ・モードのUI設定保存だけが許可された差分。

| 検証 | 結果 |
| --- | --- |
| 修正前 npm test | 72/72コマンド成功 |
| 修正前 VPS test | 361/361成功 |
| 修正後 npm test | 72/72コマンド成功 |
| 修正後 VPS test | 361/361成功 |
| 判別ページのNode回帰 | 10/10成功（元7件に履歴・診断改変・保護検出の3件を追加） |
| build | 成功 |
| ブラウザ | Chromiumで320/375/390px、単品/並列、build/VPS加工の12条件成功 |
| 履歴・入力・再読込 | 詳細close→Back、別台からのBack、モード切替、0・未入力、編集による結果破棄、reload後の結果破棄を確認 |
| git diff --check | 成功 |

ブラウザは実ChromiumをローカルHTTP配信で使用した。外部通信を遮断しており、実VPS・jugest.netへ変更やテスト操作は行っていない。実機iPhone / Safariの確認は未実施。

本番DB、VPS、cron、scheduler、環境変数、再起動、Productionデプロイ、本番ブランチへの反映は行っていない。候補ブランチのGitHub保存で停止する。
