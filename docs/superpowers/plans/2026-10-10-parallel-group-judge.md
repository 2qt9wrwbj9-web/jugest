# 並列判別・全台系 実装計画

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. User explicitly requested autonomous design, implementation, testing and independent review; proceed through authorized work without renewed implementation approvals.

**Goal:** 既存個別判別を保持して、全台系仮説・条件付き配分・下振れ反証を高密度の並列画面から利用できるようにする。

**Architecture:** 純粋なgroup-judge.js、表示専用のgroup-judge-view.js、既存画面の入力・結果管理を分離する。集合評価には既存成功結果と機種別表だけを渡す。

**Tech Stack:** 現行JavaScript IIFE、Node>=22.13、node:test、検証用Python/SciPy、Playwright。製品依存追加なし。

**Spec:** docs/superpowers/specs/2026-10-10-parallel-group-judge-design.md

## Global Constraints

- 元の基準SHA f728b2587a9bdd81541ccb50d3ae802a8492486a。2026-10-12はユーザー指定の保存版a563a04からwork/parallel-group-checkpoint-20261012を継続。元ブランチは保持。
- 個別数学・設定表・MCP・PRE・店舗・DB・同期を変更しない。合算を追加証拠として使用しない。
- 仮説の成立確率は表示しない。包含仮説を排他的な4択にしない。条件付き配分は条件を常に明示する。
- 製品依存追加なし。本番VPSへの書込み・サービス変更・deploy/vps/mainへのpush/mergeなし。
- 入力は16px以上、操作44px以上。320px横スクロールなし。差枚欠損は0として集計しない。

## Review Focus

- 行編集後に集合評価／詳細の古い結果が残らない。
- 重複台番／不正入力を含む集合で黙って台を除外しない。
- ほぼ全6に集中するデータでも補集合が桁落ちせず計算できる。
- 無順序配分の割当て順列を漏らさない。
- 保存容量不足／保存形式破損で既存UIが起動不能にならない。

### Task 1: 純粋集合エンジンと数値契約

**Files:** Create group-judge.js, tests/group-judge.mjs; no protected math edits.

**Interfaces:** Produces JUGESTGroupJudge.analyze(entries) with exact interface in spec.

- [x] 先に2台・3台の全設定列挙と全456対補集合の比、配分多重度、CDF境界、不正入力、混在、差枚欠損の失敗テストを書く。
- [x] node --test tests/group-judge.mjsを実行し、新機能未実装の失敗を確認。
- [x] logsumexpと2状態補集合DP、条件付き設定分布／配分DP、二項CDF、3仮説補正した反証検査、感度比較、集計を実装。
- [x] 上記テスト成功を確認し、純粋エンジンをコミット。

### Task 2: 高密度入力・表示・保持・集合統合

**Files:** Modify app-v510.js, app-v510.css, judgement-view.js; Create group-judge-view.js, tests/parallel-group-ui.mjs. Modify index.html script tags, build.mjs file list, tests/helpers/runtime.mjs, vps/src/analysis/runtime-adapter.mjs loader, tests/commands.json for new files only.

**Interfaces:** Consumes JUGESTGroupJudge.analyze(entries). Produces display-only JUGESTGroupJudgeView.render(report,{hypothesis}) and existing app actions for duplicate/sort/group toggle/allocation choice.

VPS解析runtimeへのgroupファイル追加は不要と判明したため、独立レビュー後にloader全体を基準へ完全復元した。最終差分には含めない。新エンジンはブラウザと直接Node実行から利用する。

- [x] 先にdraftのreload保持・複製・並べ替え・不正入力時の全台系停止・編集による失効・エスケープ・ON/OFFで個別qが変わらないテストを書く。
- [x] node --test tests/parallel-group-ui.mjsで機能不足の失敗を確認。
- [x] 仕様の高密度2段行と結果一覧、版付き入力保持、集合統合と折りたたみ表示を実装。既存詳細や戻る操作維持。
- [x] 新旧画面テストを実行。古い数学のハッシュは維持し、UI承認用ハッシュだけをレビュー可能な範囲で更新／変換。
- [x] ビルドと加工後ソースの起動を確認してコミット。

### Task 3: 独立照合・回帰・シミュレーション・ブラウザ

**Files:** Create tests/group-judge-independent.py, tests/group-judge-simulation.mjs, tests/parallel-group-browser.mjs, tests/group-judge-regression.mjs, docs/development/2026-10-10-parallel-group-judge-validation.md.

**Interfaces:** Consumes same pure engine and new UI; writes reproducible evidence summaries, not production data.

- [x] SciPy binom.cdfと純粋エンジンを固定境界／ランダム値で照合。独立列挙／多項式の係数計算で仮説比と配分を確認。
- [x] 8機種×128入力の旧コミット・新コミットの個別出力を別々に実行して全フィールドを一致確認。
- [x] 種固定の全456／全56／全6／低混在／弱い台／低稼働／混在をシミュレーションし、反証の過剰率と限界を記録。
- [x] Chromium/WebKit、320/375/390px、ビルド／加工後配信で実操作を検証。npm testとnpm --prefix vps testを実行。
- [x] 仕様・数学・画面・互換性の独立レビューを依頼。重要な指摘を再現テストから修正し再確認。
- [ ] ブランチ全体を最終独立レビューし、必要な修正を再検証する。
- [ ] 最終結果を記録・コミット、GitHub専用開発ブランチへpushし保存SHAを照合。

## 2026-10-12 再開：完成済みTask 1・2は再実装しない

保存版READMEと失敗ログを先に確認し、元環境・bundle・a563a04を保全。既存数学／設定表の変更、設計の全面置換は禁止。以下だけを継続する。

### Task 4: 残る表示3件の修正と境界条件

**Files:** app-v510.js, group-judge-view.js, judgement-view.js, tests/parallel-group-ui.mjs, tests/helpers/judgement-preservation.mjs.

**Interfaces:** Consumes existing report and complete editor rows; Produces display-only render(report,{hypothesis,rowNumbers}) with stable ID to current editor ordinal. Standalone fallback identifies target ordinal. Numerical report and ordinary q stay unchanged.

- [x] 既存16件を実行し13成功・3失敗を再現。Expected: 行番号と最有力表示の3件だけが失敗。
- [x] 許容設定や計算を変えず、入力全行の番号対応を渡して全表示を統一。最有力表示も復帰。Expected: 16/16成功。
- [x] 並べ替え後の編集・再判別、番号情報の型／継承境界を追加。Expected: 18/18成功。
- [x] 保護検査と個別1,024件を確認、途中保存。Expected: 既存数学・保護fixtureは変更なし。

### Task 5: 数学と反証能力の最終確認

**Files:** tests/group-judge-simulation.mjs, validation documents and logs; group-judge.js remains unchanged unless a proven defect requires a scoped fix.

**Interfaces:** Consumes existing model/tables; Produces reproducible rates that distinguish true-hypothesis rejection, false-hypothesis nonrejection and evidence ratio from event probability.

- [x] 既存SciPy412CDF／独立列挙27／エンジン17件／個別1,024件を新ログで再検証。
- [x] 既存7条件を維持し、近い低設定混在・2台・低稼働・差枚入力有無の検証を追加。真偽両側の反証率・否定できない率を保存。
- [x] 限界・低い反証能力を画面の既存説明と照合し、結果を記録して途中保存。

### Task 6: 全体・ブラウザ・独立レビュー・保存

**Files:** tests/parallel-group-browser.mjs, completion-20261012 evidence and screenshots, final README.

**Interfaces:** Consumes completed UI/model; Produces fresh all-suite results, mobile evidence and reviewable development preview.

- [x] Chromium/WebKit × built/patched × 320/375/390/430px。入力、空台番の対応、複製・削除・空行、再判別、並べ替え、画面切替、reloadを実操作。
- [x] npm test／npm --prefix vps test。Expected: 全件成功、旧73/553や保存時79/553は最新結果の代用にしない。
- [ ] 別コンテキストの最終レビュー。重要指摘は再現テストから修正。公開本番へは反映しない。
- [ ] ヒロが画面・計算例を確認できる開発成果、全ログ、レビュー結果、次回READMEをGitHub保存し遠隔SHAを照合。
