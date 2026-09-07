# JUGEST v5.1.2 UI改修

Production baseline: `9e8b8c30fe0c40fb70cb76863c6c40e2564c91ac`。
作業ブランチ: `preview/v512-home-jobs`。Production・mainは変更しない。

## 実装

- ホーム: 次の行動を1件、最近の解析2件、実戦2件、小さなデータ状況。実戦入力はホームへ戻る際に再取得し、保存済みと同一のジャグラー入力は再開対象にしない。
- SVGベル、端末に保存する既読管理。URL未登録・成功通知は未読数に含めない。同じ通知の再描画では増えず、解消後の再発生または内容変更は新規扱い。
- アプリ寿命の解析ジョブ: 開始店舗・optionsを固定。内部タブ遷移後も継続し、結果に戻れる。進捗は既存解析の処理段階・generator進捗を使用し、時間による架空の進捗は出さない。
- 152px幅・最低54px高の進捗チップ。解析画面では非表示、完了後60秒表示。完了結果はジョブと保存履歴から参照可能。
- 移動比較: 現在台・入力パネルのpadding、12px以上のラベル、長い機種名の折返し、狭幅時の縦積み、履歴の縦配置を追加。

## 評価

- `npm test`: **60/60コマンドPASS**。既存58コマンドを維持し、旧仕様を強制する絵文字・UI全体固定hash検査のみ新仕様へ更新。
- ホーム／通知／ジョブ: **9テストPASS**。追加修正のREDログも保存。
- 実ブラウザ: **320/360/375/390/414/430px × 7画面 = 42組合せPASS**。日本語フォント、長い機種名・台番号、カード内padding、横overflow、固定chromeのスクロール位置を検証。
- FOUC・アイコン・数学・Vercel API保護検査PASS。数学を含む広い既存hash区間は、解析呼出ラッパーの進捗callbackとframe yieldのみを厳密に正規化して照合。エンジン関数自体は変更なし。
- `api/`, Collector、判別ライブラリ、build、vercel.json、アイコン資材はbaselineとの差分0。

## 店舗別最適化

**今回は採用しなかった。** 実店舗の保存データがこのcheckoutになく、方式別の実コア性能比較・改善確認は未実施。時系列分離、inner選択/outer採点、future poisoning不変性を検証する研究harnessのみ追加。現行Championの45観測日要件と30日候補の不整合など詳細は `optimization.md`。

## 残るリスク・制限

- iOS実機のSafari/PWAでの確認は別途必要。OSがJavaScriptを停止する場合の継続は対象外。
- 大規模データの同期的な解析区間はメインスレッドを占有し得る。今回は計算方式・数学を変更していない。
- 通知は現在の状態から導く通知の内容単位。外部から同内容のイベントが連続し、解消状態が端末に届かなかった場合の個別イベント数は保証しない。
- 実戦記録の編集中draftは従来どおりアプリ内状態。ページ再読込を跨ぐdraft永続化は今回の範囲外。
- 新データ到着後の再解析提案は未追加。
- PreviewはProductionとは別originのため、Productionの端末保存データを自動共有しない。同期・Collectorへの実データ書込みは検証で実行しない。

## 再現

```sh
npm test
JUGEST_CHROMIUM_PATH=/path/to/chromium JUGEST_TEST_FONT_DIR=/path/to/@fontsource/noto-sans-jp node tests/ui-responsive.mjs
```

ブラウザテストはPlaywrightを `CODEX_PRIMARY_RUNTIME_NODE_MODULES` から読み込む。通常の回帰コマンドとVercel buildにブラウザ依存は加えていない。
