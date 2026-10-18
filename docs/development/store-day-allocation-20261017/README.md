# 単日投入分析 実装成果物

最終確認日：2026-10-18。ブランチ：`work/store-day-allocation-20261017`。基準：`deploy/vps@1f8c29f`。**本番未反映。強判定無効。**

- [実装報告・結果・残存リスク](implementation-report.md)
- [API・権限・反映前確認・ロールバック](operations.md)
- [最終実行記録とソースhash](verification.json)
- [引継ぎ設計の要点](design-summary.md) / [詳細設計](../../superpowers/specs/2026-10-17-store-day-allocation-design.md) / [実装計画](../../superpowers/plans/2026-10-17-store-day-allocation.md)
- [数学の実装](math-implementation-report.md) / [独立数学レビュー](math-review.md)
- [データ読取・原本確認](data-implementation-report.md) / [独立統合レビュー](integration-review.md)
- [独立数値照合](numeric-validation.md) / [詳細JSON](numeric-validation.json)
- [仮想データ検証・検出力と限界](simulation-validation.md) / [集計JSON](simulation-validation.json) / [乱数・選択manifest](simulation-seeds.json)
- [ローカル処理性能](performance-validation.json) / [実店舗入力のローカル再現](real-data-validation.json)
- [UI実装・確認](ui-implementation-report.md) / [実ブラウザー記録](ui-browser-validation.json) / [320px](ui-browser-chromium-patched-320.png) / [390px](ui-browser-chromium-patched-390.png)

## 主なコード

| 層 | ファイル |
|---|---|
| 独立数学 | `store-day-allocation.js` |
| 既存尤度の捕捉 | `vps/src/allocation/likelihoods.mjs`、`vps/src/analysis/runtime-adapter.mjs` の追加adapter |
| 原本・店日 | `vps/src/allocation/store-day.mjs`、`provenance.mjs` |
| 結果 | `vps/src/allocation/results.mjs` |
| 統合計算 | `vps/src/allocation/service.mjs`、`calculator.mjs`、`worker.mjs` |
| 読取API | `vps/src/allocation/handler.mjs` と既存Web/analytics/accessへの小さい接続変更 |
| 画面 | `store-day-allocation-view.js`、`app-v510.js/css` の追加、`vps-ui-store-v2.mjs/css` の入口、`index.html`、`build.mjs` |
| 通信 | `vps-browser-analytics.mjs` の専用read-only追加 |
| テスト | `tests/store-day-allocation*.mjs`、`vps/tests/allocation-*.test.mjs` |
| 保護検査 | `tests/helpers/allocation-preservation.mjs`、`approved-allocation-ui-changes.json`。承認済みUI追加だけを戻して従来hashを検査し、元の期待hashは保持 |
| オフライン検証 | `scripts/allocation-validation/*`、`tests/fixtures/store-day-allocation-pia-20261016.json` |

全変更ファイルと内容hashはverification.jsonに記録する。生成したpublic/、node_modules/、実DB、元の運用情報を含むexportはコミット対象にしない。実店舗fixtureは公開観測を保持し、絶対原本パスと運用metadataを除去した版。

## 再現

Node>=22.13。検証時はNode24.19.0、Python3.12.14、NumPy2.3.5、SciPy1.17.0。Python側の依存はオフライン検証専用で、本番Webの追加依存ではない。

```bash
npm install --ignore-scripts --no-package-lock
npm --prefix vps ci --ignore-scripts
npm test
npm --prefix vps test
node scripts/allocation-validation/compare.mjs
node scripts/allocation-validation/simulate.mjs
python3 scripts/allocation-validation/summarize.py
node scripts/allocation-validation/real-data.mjs tests/fixtures/store-day-allocation-pia-20261016.json /tmp/allocation-real-data.json
taskset -c 0,1 node --expose-gc scripts/allocation-validation/benchmark.mjs /tmp/allocation-performance.json
```

Linuxのtasksetは利用可能CPUに合わせる。仮想データは数分と約1,650万台分の生成を要する。生成数とスコア数を混同しない。広いgridでは結果を見ずに固定した最初の標本だけを計算し、対象店舗familyの標本はすべて計算する。

既存VPSの `pachinko-cli.test.mjs` はローカル `/var/lib/jugest` の実在を仮定するsymlink fixtureを含む。今回の使い捨て検証環境では空ディレクトリを用意して実行した。既存のテスト期待値を変更せず、本番ディレクトリの作成・変更も行っていない。

画面は、PlaywrightとChromium実体・日本語フォントを用意して次を実行する。実行時のブラウザーパスはUI報告を参照する。

```bash
node build.mjs
JUGEST_BROWSER_EXECUTABLE_PATH=/path/to/chromium node tests/store-day-allocation-browser.mjs
```

テストはローカルHTTPだけを使い、実エンジンで作ったfixtureを実ブラウザークライアントから読む。実店舗の設定正解やSafariの表示をこのテストから推定しない。
