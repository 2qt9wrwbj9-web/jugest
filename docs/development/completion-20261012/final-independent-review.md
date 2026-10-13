# 最終レビュー残存確認・継続記録

この席は中断した単一最終レビューの続き。数学・UI のレビューは再実施せず、保存済みの結論を継承する。残る確認は保護6ファイル、preview と12ソースの整合性、統合・ブラウザ完了証拠のみ。作業はローカルの読み取りに限定し、チェックアウト・製品コードは変更しない。

継承済み: Critical なし。Important: 保存ケース警告の内部行IDが利用者に表示され誤った行位置を示す。Minor: グループ範囲エラーがエディタ順ではなくターゲット順を示す。root は UI 22件中20件成功・2件失敗を再現、モデル6ケース完全比較は成功済み。修正前のため準備状態は WITH FIXES。

残存証拠確認を開始。最終報告で確認対象・証拠・継続境界を明記する。

残存確認完了: d8d3e9cfcdb2c0ea8f006ecae61aace574257896 の追跡535パスは a563a04 に全件保持。533ファイルのgit blobが同一。残る2ファイル（tests/parallel-group-ui.mjs と docs/development/2026-10-10-parallel-group-judge-validation.md）はsource-sha256.jsonの保存済み未コミット内容と一致し、preservation-final.jsonの535報告を独立に裏づけた。group-judge.jsはa563a04から未修正。取り込まれた店舗UIの4ファイルもde812821とバイト一致（実装内容そのもののレビューは対象外）。

preview導出の最終照合: 固定した18c23d6dのbuilderとソースを使い、fs書込みをメモリ内に捕捉してHTMLとmanifestを組み立てた。両者が保存成果物と完全一致、実ファイルの書込みなし。HTMLパーサーで実headが1個、CSPがその内部にあることを確認。最初のscriptはfetchスタブと専用保存キーjugest:completion-preview:uiの架空5台初期化。CSPはconnect-src/worker-src/form-action/base-uriをnone、default-srcもnone。相対/api/のGETだけ空のローカル応答を返し、その他fetchは拒否。外部script参照・静的リモートsrc/href/actionなし。末尾はcustom element定義後、bridge準備を待って判別画面とjudge-allを初期化し、開発注記と他workspace無効化を適用。これらは開発コピー内の変更で、製品ソースの判別ロジックは埋め込み由来。

---

# 正式最終レビュー（修正前、2026-10-13）

判定は **WITH FIXES**。Critical なし、Important 1件、Minor 1件。残存証拠確認から新しい指摘は出なかった。Importantの警告対象行表示を直し、下記の限定検証を通せば技術的な完了条件を満たす。本判定は本番反映の許可ではない。

**継続境界**：これは中断した単一の最終レビュー席の完了報告。先行担当が純粋エンジン328行、view89行、app/storage差分、数値・シミュレーション・ブラウザの実装と生ログを読了した結論を継承した。今回は数学・UIの再読や第二の意見取り直しを行わず、保護・preview・統合証拠のみ独立照合した。確認用ソースは製品修正前18c23d6d（依頼6af2ffddと製品ソース同一）で固定。rootが進める以後の修正は本レビューの対象外。

**Strengths**：先行レビューでは補集合DP、無順序配分の多重度、composite＋family反証に追加の数学欠陥を見つけていない。表示比率と条件付き配分、差枚近似の限界、低い反証力の説明を区別している。保護6ファイルはf728/a563と完全一致。旧535ファイルの保存も独立に確認した。previewは12ソースと成果物のSHA-256が一致し、メモリ内で再導出したHTML/manifestも完全一致。実head内のCSP・先行fetchスタブ・専用保存キーを確認した。

**Critical**：なし。

**Important — 逆算警告が別の台を指す**：修正前 group-judge.js:315 は空台番で内部IDを警告文字列へ埋め、group-judge-view.js:85 がそのまま表示する。単品初期化後、1行目（内部id2）を台番空・my・5000G・BB20・RB20・差枚50000、2行目を台番2・同BB/RB・差枚なしにして全台系判別すると、警告が「台2：差枚の逆算に警告」となり、正常な2行目を指して見える。単独viewでもid9001を「台9001」と表示する。計算値は正しくても、修正・確認すべき入力を誤認させるため修正必須。旧reportの警告文字列・数値フィールドを維持しつつ、表示専用の構造化警告行メタデータ（例 reverseWarningRows）を追加し、viewで既存の行ラベル正規化と同じ経路へ渡す。エディタ順メタデータがあれば現在の入力行、なければ明示した対象順を使い、内部IDを台番として表示しない。rootの実再現はUI22件中20成功・2失敗で、この2失敗が本件。保存モデルとの6条件完全比較は成功している。

**Minor — 範囲外入力の行案内が対象順を入力行と誤認させる**：修正前 group-judge.js:177,187／group-judge-view.js:69。完全空行→正常台5000G→空台番10000001Gで、実際は入力3行目なのに「2台目：全台系の通常Gは10,000,000以下…」となる。集合計算は安全に止まり、数学の誤りや黙った除外はない。エディタの行番号へ対応させるか、「対象2台目」と対象内の連番であることを明示する。稀な範囲外入力の案内であり、Importantとは区別する。

**指定5観点の確認（先行担当の実読・実検証を継承）**

| 観点 | 結論と確認範囲 |
| --- | --- |
| 行編集後に集合評価／詳細の古い結果が残らない | 確認済み。編集時の失効、再判別、詳細表示、ブラウザ操作を先行レビューで確認。今回の16条件ログにも対応する操作成功を確認。 |
| 重複台番／不正入力を含む集合で黙って台を除外しない | 確認済み。完全空行のみ除外し、重複・不完全・未判別の非空行で停止。案内のMinorは残るが黙った除外ではない。 |
| ほぼ全6に集中しても補集合が桁落ちしない | 確認済み。補集合DPと対数領域、極値、独立数値照合の先行レビュー結論を継承。今回の再計算はしていない。 |
| 無順序配分の割当て順列を漏らさない | 確認済み。配分多重度と全設定列挙27条件の先行レビュー結論を継承。今回の再計算はしていない。 |
| 保存容量不足／保存形式破損で既存UIが起動不能にならない | 確認済み。実保存失敗・破損／未知形式・上限超過時の起動と入力継続、最後の正常保存保持を先行レビューで確認。 |

**完了証拠の実照合**：統合frontend79/79コマンド、VPS557/557・失敗0。browser-integratedはChromium/WebKit×built/patched×4幅の16/16、previewは両engine×4幅の8/8。両者の生ログ末尾JSONと結果ファイルは完全一致し、全boolean成功・ページ例外0。previewは通信遮断・編集保持・再判別を含む。これは警告回帰追加前の統合成功であり、現在のUI22件がすべて成功したという意味ではない。旧preview-check.logのタイムアウトは修正前診断として扱った。

**Declined to judge**：物理iPhoneのソフトキーボード・OS挙動（実機未使用）、実店舗の真の全台系確率や差枚近似の経験的較正（宣言したモデルでのシミュレーションのみ）、現時点の本番稼働版・サービス・DB状態（本番通信なし）、既に公開済み店舗UI4ファイルの内部仕様・正しさ（de812821とのバイト一致と統合境界のみ確認）。これらを検証済みとは扱わない。

**残る検証を限定**：一回のTDD修正パスで既存2件のwarning回帰をGREENへ戻す（UI22/22）、保存モデルとの6条件で追加メタデータ以外の旧report全フィールドを完全一致させる、数値エンジン17件と個別1024件完全比較を確認する。Minorも同時に直す場合は上記の空行を含む3行の再現を1件追加し、表記のみの修正を確認する。製品ソース変更後にpreviewとmanifestを再生成し、12ソースハッシュ・成果物の一致、既存preview8条件、共通行表示へ影響する既存browser16条件を確認する。最終保存版として統合frontend79コマンドとVPS557件を一度通し、最終SHAと証拠を揃える。追加の設計や独立再レビューは不要で、本報告は修正後再レビューを要求しない。

証拠捕捉の境界: rootにpreview現物・12ソース採取完了を通知。今後rootが警告表示を修正するため、残存照合は未修正の固定コミット18c23d6dを使う。依頼HEAD6af2ffddとの差は記録・回帰テストだけ。rootから5dd02bd23f049e0f2b0cb07c35fe495bd91fd299へ同一treeのチェックポイント移動との通知あり。

残存確認3: frontend-integrated.log の最後に79/79 commands passed、失敗行なし。vps-integrated.log の集計はtests/pass 557、fail/cancelled/skipped/todoすべて0。browser-integrated.logはPASS16件で、末尾JSONがbrowser-integrated-results.jsonと完全一致。Chromium/WebKit × built/patched × 320/375/390/430pxの全16条件、全boolean成功、pageErrors0。preview-green.logはPASS8件でpreview-results.jsonと完全一致。両engine×4幅、再判別・draftReload・networkBlockedが全件true、pageErrors0。古いpreview-check.logのTimeoutErrorを成功証拠とは扱っていない。review-warning-red-22.logは重要指摘の未修正再現記録として保持。

残存確認1: 保護6ファイルは現物のバイト列を f728b2587a9bdd81541ccb50d3ae802a8492486a、a563a04e4771420ef8689593e90cf6aa97e36c3d、依頼HEAD 6af2ffdd5449d0d3a6f0f7a9e8a1308e5ae8358d、実際HEAD 18c23d6d9a3b1d9c2d2622a3ebc303a85d3fff40 と独立に比較し、全件一致。対象は judgement-model.js、core-v510.js、sync-core.js、vps/src/analysis/runtime-adapter.mjs、hanahana-judge.js、missing-inference.js。18c23d6d の追加は記録とUI回帰テストだけで製品コードは同じ。

残存確認2途中: preview.html の実SHA-256は b01e8edfbe924fd7f5fb93293ae95a68068b7a91b9889a91d5bd7b234f093e72 で manifest と一致。manifest掲載12ソースも現物のSHA-256全件一致。builderを読み、開発用CSP・fetchスタブ・専用保存キー・実headへの初期化挿入を確認。次に実物への反映と導出を照合する。
