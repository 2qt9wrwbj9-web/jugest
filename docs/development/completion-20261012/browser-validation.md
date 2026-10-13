# モバイル操作と開発確認版の検証

## 最新の実行

Chromium 153.0.8010.0／WebKit 26.5（Safari相当）、ビルド配信／VPSソース加工後の2方式、320・375・390・430pxの組み合わせ全16条件で終了コード0。browser-all.log／browser-results.jsonに実行記録。images/に両エンジン、4幅、入力／全台系の16枚を保存。日本語フォントを読み込んで実画面を目視確認した。

各条件で台番・機種・G・BB・RB・差枚、入力保持、複製／削除、同番号拒否、まとめて判別、全台系ON/OFF、3仮説の条件付き配分、結果並べ替え、詳細の最有力設定、戻る、画面切替、reload、負差枚／差枚欠損、HTMLエスケープを確認。空台番と途中の完全空行を含む複製・削除後も、最も整合しない台・条件付き行・反証表が現在の入力行番号へ対応することを検査。編集後の旧結果失効を確認した。

320pxを含め横スクロールなし。入力文字16px以上・主要操作44px以上、入力中のフォーカス／キャレット／スクロールを検査。iPhone 13のブラウザ設定と844px高でのエミュレーションであり、物理iPhoneのソフトキーボード・OS操作を実機確認したものではない。

最初の8条件成功後にWebKitのローカルキャッシュ不在を検出。browser-before-runtime-restore.logを保持し、ブラウザと共有ライブラリをローカルへ復元して16条件を通し実行した。ブラウザ本体の取得後、未使用FFmpeg取得中にinstallerのロック更新エラーが出たが、画像操作に必要なWebKit起動・全操作は最終ログで成功。製品やテスト期待値は変更していない。

追加検査の初回、機種が残っている行を「完全空行」としたfixtureと、同名ホームボタンを区別しないlocatorを修正した。実装の不具合を隠す期待値緩和ではなく、すべての入力を空にし、実際の下部ナビ操作対象を指定した。診断ログは削除せず保持。

## ヒロが開く確認用コピー

preview.htmlをダウンロードし、JavaScriptが動くブラウザで開く。架空のミスタージャグラー5台を入力済み。入力変更・再判別・行操作・表示比較ができる。真の店舗データではない。

製品のindex.html、9スクリプト、CSS、ロゴからコピーを生成している。判別計算を別実装に差し替えていない。tests/build-offline-judge-preview.mjsで再生成でき、preview.sources.jsonに元ファイルと成果物のSHA-256を保存。元ソースは変更しない。

確認コピーだけの変更：外部通信をCSPで禁止、相対/api/のGETを空の開発状態として応答、その他のfetchを拒否、別の入力保存キー、他ワークスペースボタン無効化、開発表示、資産の埋め込み。元のHTML履歴コメントをコピーから除き、実際のheadにCSPと初期入力を追加する（履歴中の文字列headへ誤挿入していた初回版をpreview-red.logで再現して修正）。本番接続・DB書込み・サービス起動は行わない。

確認コピーも両エンジン×4幅の8条件で終了コード0。5台の結果、入力変更での旧全台系失効、再判別、編集を保持したreload、外部GET拒否、リモート要求0、ページ例外0を検査。preview-green.log／preview-results.json。最初のeditor locatorはVPS加工版の折りたたみを前提としていたため、存在する場合だけ開くようにした。製品ソース版は入力30欄が直接表示される。

## 再現コマンド

```bash
npm run build
node tests/build-offline-judge-preview.mjs
NODE_PATH=/path/to/playwright/node_modules \
  PLAYWRIGHT_BROWSERS_PATH=/path/to/browser-runtime \
  JUGEST_BROWSER_EXECUTABLE_PATH=/path/to/chromium \
  JUGEST_UI_EVIDENCE_DIR=docs/development/completion-20261012/images \
  node tests/parallel-group-browser.mjs
NODE_PATH=/path/to/playwright/node_modules \
  PLAYWRIGHT_BROWSERS_PATH=/path/to/browser-runtime \
  JUGEST_BROWSER_EXECUTABLE_PATH=/path/to/chromium \
  node tests/offline-judge-preview-browser.mjs
```

今回の環境設定：PlaywrightはCodex primary runtime、Chromiumは/workspace/scratch/e04472ff9640/browser-runtime/chromium、WebKitは/workspace/scratch/de64dcbbff0a/browser-runtime/webkit-2336。日本語フォント設定は/workspace/scratch/2f9e5eaabf52/browser-deps/fonts.conf。復元済みの共有ライブラリをWebKit実行環境へリンクし、既知のホスト検出を省略するPLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1を使用した。全操作の成功は実際のブラウザ起動で検証済み。

## 2026-10-14 最終：最新本番由来の機能を保持した開発版

browser-current-production.log／results.json：16/16。preview-current-production.log／results.json：8/8。browser-current-production-exit-codes.jsonは両方0。画像はimages-current-production/に18枚。320px入力とWebKit430px全台系画面も目視確認した。390pxの警告ID衝突はmy6とmyの実入力を使う。横スクロールなし、16px以上の文字、44px以上の行操作、結果失効と行識別、保存／再読み込みを検査。

機種名の読み込み追加により確認コピーはindex＋10スクリプト＋CSS＋ロゴの13ソース。preview.sources.jsonの全SHAと成果物SHAが実ソースと一致。PIA復旧の最後の2ファイル取り込みはVPScollectorのみで、この13ソースは変更しない。WebKitの依存リンクは永続しないため同一実行内でリンク復元とnodeテスト実行を行った。物理iPhoneキーボードは未検証。
