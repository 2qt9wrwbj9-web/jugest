# PIA大船-P 実装・検証結果（2026-10-08）

## 状態

- production basis: `c48790725ca5da6ebe060f042b37f40015ba58ff`
- work branch: `work/pia-ofuna-pachinko-20261007`
- `origin/deploy/vps` は最終実装前fetch時点でも上記SHAと一致（divergence 0/0）。
- production deploy / production branch merge / production DB migration / cron・service変更は未実施。
- 対象は大海5SP (`00021`)、東京喰種399 (`00022`)、東京喰種999 (`00406`) の3機種のみ。鬼がかり2は対象外。

## 実装

- 独立 `pachinko.sqlite` schema v2、raw snapshot、multiset occurrence、設置identity、派生営業日、transition、collector stateを実装。
- 大海Kは `sea-normal-consumption-10/v1` のverifiedのみ数値化。東京喰種399/999はprovisionalかつ `estimated_k=null`。
- 営業日は連続snapshotのmachine-wise multiset差分が安全条件を満たす場合のみ `consecutive_snapshot_multiset_previous_day` でderived。初回rolling historyは未日付。
- 専用read-only API `/api/pachinko/...` を追加。cookie認証を先に使い、必要時のみ所有者Receiver認証へfallback。通常APIはDB作成/migrationを行わない。
- PIA公開endpointへ1回だけ `machine_type=P&store_id=35&limit=20000` をPOSTする独立collectorを実装。HTTP-success rawは検証前にprivate archiveへ保存し、collectorは既定OFF。
- 収集窓はJST 00:30–06:00、retryは30分以上、同時tickを抑止。
- CLI `migrate/import/backfill/reestimate/status/collect` を実装。backfillは全fixture/hashをDB mutation前に検証し、production pathは明示overrideなしで拒否。
- 通常の店舗選択に `PIA大船-P` を追加し、独立 `.pachinko-data-screen` でmatrix/summary/filter/未日付履歴/detailを表示。既存slot state・判別・analysisを起動しない。

## 実raw再現

保存済みrawのみのoffline auditで以下を再現した。

- 大海 latest candidate pooled K: `20.477272715217104`
- 大海 valid-positive pooled K: `20.477283577339275`
- 東京喰種399 audit candidate pooled K: `15.688138816258617`（UI/運用Kはnull）
- 東京喰種999 audit candidate pooled K: `32.398616973020694`（UI/運用Kはnull）
- derived 2026-10-05 大海 pooled K: `20.611681682605084`
- derived 2026-10-06 大海 pooled K: `20.294776119402986`（1101/1116はzero playでK null）
- 2026-10-07 22:51:52→23:43:44 snapshot multiset差分: added 0 / removed 0
- 保存済み圧縮statisticsと再実行auditの `models/comparisons/date_backfill/recommendations/formulas` は完全一致。

## テスト

最終実装treeで確認済み。

- Pachinko focused Node tests: `75/75 PASS`
- root `npm test`: `72/72 commands PASS`
- VPS `npm --prefix vps test`: `507/507 PASS`
- PIA大船-P real-browser E2E: `1/1 PASS`
  - 実fixture DB/APIを使用（P API結果mockなし）
  - 10/5・10/6、pooled K 20.2948、3filter、raw detail、未日付399、横scrollを確認
  - 320 / 375 / 390 pxでdocument/P-screen overflowなし
  - P画面操作後の追加judge/analysis/PRE request 0
  - screenshot: `/tmp/jugest-pia-p-browser-shots/pia-ofuna-p-mobile-390.png` (390×7498)
- 既存PIA access browser tests: `2/2 PASS`
- `git diff --check`: PASS
- 新規/変更JS `node --check`: PASS

## 反映前の残事項

本番反映にはユーザーの別途明示許可が必要。許可後も、独立P DB/backfill、private raw archive path、collector flag、release切替を本番用手順で実施し、既存PIA大船-S・共有閲覧・healthを確認する。production DBや既存slot schemaへPデータを混ぜない。
