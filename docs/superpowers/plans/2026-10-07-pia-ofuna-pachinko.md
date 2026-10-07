# PIA大船-P Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実rawと営業日根拠を失わず、PIA大船のパチンコ3機種を通常台データの入口から見る。

**Architecture:** 独立SQLite、機種別推定、件数付きsnapshot差分、readonly APIと独立画面。既存Sのstore/canonical ingest/judge/PREへPを通さない。

**Tech Stack:** Node.js 22.13以上、標準node:sqlite、既存Web server、JavaScript module、node:test、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-07-pia-ofuna-pachinko-design.md`

## Global Constraints

- 本番基点 `c48790725ca5da6ebe060f042b37f40015ba58ff`、branch `work/pia-ofuna-pachinko-20261007`。
- 本番deploy、deploy/vps merge、本番DB migration、cron/env/service変更は一切禁止。
- 判別数学・S collector・スロットstore/PRE/実戦contextは変更しない。
- verified以外はestimated_k=null、差玉をKの追加根拠にしない。
- 営業日は初回30件に付けず、consecutive snapshot multiset +1/-1のみderived。
- 保管する完全rawにcredentialsを含めない。公開データしか取得しない。
- 日付は新しい日が左、Pを開く時はPの必要queryのみ。

## Review Focus

1. 同じ台番の入替/台移動で別設置の履歴を結合しない。
2. 部分応答/遅延/同日途中更新で取得anchorを壊さず日付を捏造しない。
3. rawが同値のゼロ複数行でも追加/削除の件数を失わない。
4. 権限失効と並行読み取りで古い結果を再表示しない。
5. P閲覧がスロット判別・設定解析・実戦保存を起動しない。

---

### Task 1: パチンコ独立データdomain

**Files:** Create `vps/src/pachinko/models.mjs`, `estimator.mjs`, `snapshot.mjs`, `schema.mjs`, `store.mjs`, `vps/tests/pachinko-domain.test.mjs`.

**Interfaces:**
- `MODELS`: key、displayName、apiName、sisMachineCode、estimatorStatus/Reason、estimatorId/Version、formName、denominationを持つ3件の配列。
- `identifyPachinkoModel(raw) -> model|null`、`estimatePachinko(modelKey,raw) -> {estimated_k,normal_out,normal_safe,net_consumption,estimator_id,estimator_version,estimator_status,sample_size,confidence,diagnostics}`。
- `validatePachinkoSnapshot(payload,options={}) -> metadata`、`derivePachinkoDay(previous,current,options={}) -> {businessDate,assignments,diagnostics,transitions}`。fingerprintとidentityをexport。
- `migratePachinko(db)`、`openPachinkoDatabase(path,{readOnly=false}={})`。
- `importPachinkoSnapshot(db,{payload,rawText,observedAt,provenance,collectorVersion}) -> {snapshotId,status,businessDate,assignedCount,diagnostics}`。
- `getPachinkoMatrix(db,{storeId='pia:35-p',modelKey='',limit=30}={}) -> {store,models,dates,records,summaries,undated,latestSnapshot}`。datesはDESC、recordsはcompact（record_id/business_date/identity/model/K/start/difference/estimator/sample/date metadata）。summariesは `{business_date,models:[{machine_model_key,total_machine_count,valid_machine_count,total_start,total_difference,positive_count,non_negative_count,pooled_k,simple_mean_k,median_k,estimator_status}]}`。
- `getPachinkoRecord(db,recordId) -> detail|null`（raw+derived+snapshot/date metadata）、`reestimatePachinkoRecords(db) -> counts`。

- [ ] 先に上記interfaceの存在と消費者向け挙動のfailing testを書く。
- [ ] `node --test vps/tests/pachinko-domain.test.mjs` で機能欠如の失敗を確認する。
- [ ] specのexact model identity、nullable estimator、schema/FK/unique、multiset/date、query/reestimateを実装する。
- [ ] 部分snapshotはprovenanceの対象modelだけ比較し、欠けた他機種を撤去にしない。
- [ ] 列挙した異常・migration再適用・SQLite readonly・weighted Kを実DBで検証しテストを通す。
- [ ] 差分自己確認と担当結果を記録する。

### Task 2: 収集・CLI・API・Web接続

**Files:** Create `vps/src/pachinko/collector.mjs`, `handler.mjs`, `config.mjs`, `vps/scripts/pachinko.mjs`, `vps/tests/pachinko-api.test.mjs`, `pachinko-collector.test.mjs`; Modify `vps/src/web-server.mjs`, `web-main.mjs`.

**Interfaces:** Task 1を消費。`createPachinkoHandler({dbPath,relayDbPath,authenticatePia,authorizeReceiver})`、`readPachinkoConfig(env,{canonicalDbPath,relayDbPath,rootDir})`、`startPachinkoCollectorScheduler({dbPath,...}) -> {tick,stop}`。

- [ ] 実DB/APIのGET/HEAD/認可失効/owner/unrelated/404/400/405とreadonly非作成のfailing test。
- [ ] 公開取得mockは実payload形式に限定し、タイムアウト・打切り・窓・cooldown・遅延・排他のfailing test。
- [ ] Task 1だけを使うP routeを既存dispatchより前に追加する。sharing scopeはcookie、ownerはReceiverとPIA allowlistでチェックする。
- [ ] 新しい独立path/flagを既存readWebConfigの戻り構造を変えずに別configで読む。起動/停止接続、既定OFF。
- [ ] CLI migrate/import/reestimate/statusを実装。本番パス保護と明示引数、バックフィルprovenanceを保持する。
- [ ] 各テストを成功させ、既存web/collector/認可テストの変更不要を確認する。

### Task 3: 通常台データから開く独立画面

**Files:** Create `vps-ui-pachinko.mjs`, `pachinko-browser.mjs`, `vps/tests/pachinko-ui.test.mjs`, `vps/tests/browser/pachinko-e2e.mjs`; Modify `vps/src/ui-source-patch.mjs`（module tag追加のみ）。

**Interfaces:** Task 2の3GETを消費。`createPachinkoClient({fetchFn,storage,baseUrl='/api/pachinko'})`、render/helperは純関数でnode:test可能。UIは`.pachinko-data-screen`、store selectorの専用row→`app.navigate('store','pachinko')`。

- [ ] 実表示/HTML escape/null K/filter/日付順・client認可fallbackのfailing tests。
- [ ] module hookで既存rendererへdelegateし、P screenだけ独立renderする。スロットstore stateを変更しない。
- [ ] 表、機種summary、日付filter、セル詳細、日付未確定履歴とroot外に溢れないstylesを実装。
- [ ] 非同期描画と詳細開閉でscroll維持、失効/ログアウトでcacheクリア。
- [ ] 320/375/390px実ブラウザ、横scroll/日付/filter/detail/summary確認。Pでjudge/analysis APIの追加呼出しゼロを確認。
- [ ] source-patch配信済みindexからmoduleがロードされることを確認。

### Task 4: 実raw検証・全回帰・作業branch反映

**Files:** Create `vps/tests/fixtures/pachinko/`の3raw snapshot圧縮fixture/provenance、`vps/tests/pachinko-real-data.test.mjs`、`docs/pia-ofuna-pachinko-audit-20261007.md`、`docs/pia-ofuna-pachinko-operations.md`。

- [ ] 初回30履歴の日付nullと3つのsnapshotのderived48件×2を実rawで検証。
- [ ] 10/5 `20.6116816826`、10/6 `20.2947761194`、旧30履歴 `20.484696...`、最新 `20.4773...` の再現。母集団変化は数値調整せず説明する。
- [ ] 公式仕様URL・独立監査JSON・sample数/回帰/K分布/不確実性を文書化。
- [ ] `npm test` / `npm --prefix vps test` と既存PIA browser、P browserを実行し結果を読む。
- [ ] 全branch差分を独立レビューし、重要指摘のtest→fix→再確認を行う。
- [ ] production基点の更新有無を再fetch確認、意図したfilesのみ実VPS branchへcommit/pushしremote SHA一致を確認する。
- [ ] 本番準備/rollbackと確認事項、未実施事項を報告する。本番deploy/merge/migrationはしない。
