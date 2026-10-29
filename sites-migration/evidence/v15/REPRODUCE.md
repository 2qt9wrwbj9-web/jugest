# 保存版15の独立追試・再開

ZIP展開後 `python VERIFY_EVIDENCE.py` と `python VERIFY_GIT_RESTORE.py`。DELIVERY_INDEX.jsonとSITES_SAVED_VERSION.jsonの完全SHAから復元する。Sitebundleは取得済み全local refs、元repositoryはshallow取得済み履歴（shallow marker保持）。全GitHub履歴取得済みとは主張しない。復元後sites-migration/upstreamのsymlinkは正本rootを参照。原本Source/状態/ログはsource以下にも無省略収録。

Sites環境：Node22+（node:sqlite）、pnpm依存をlockから公式install helperで導入。Sites plugin skillのsource helperで開いてから作業。外部公開は不要/禁止。元root/upstreamテストは固定1f8c29fのまま。

- Sites: `node --test --test-concurrency=1 tests/port-*.test.mjs`
- publicmirror: repository rootで `node --test --test-concurrency=1 sites-migration/tests/*.test.mjs`（既存Miniflare resolverを保持）
- 元root: `npm test`、元VPS: `npm test --prefix vps`
- 正式比較: `node evidence/v15/holdout-comparison.mjs`
- 研究全chain: `node evidence/v15/native-research-chain.mjs`
- 4規模holdout: `node evidence/v15/holdout-load.mjs 180 160`等。4規模/前後の実コマンドはholdout-load-commands*.json。run-comparisons.pyはfixed14control/currentの全工程と全model8中間値を再実行。
- 負荷budget: `node evidence/v15/holdout-budget-probe.mjs 180 160`
- 実OOM: `node evidence/v15/oom-recovery.mjs`、`node evidence/v15/oom-recovery.mjs machine-only`、`node evidence/v15/cycle-oom-recovery.mjs`、`node evidence/v15/holdout-oom-recovery.mjs`。子workerdのV8実枯渇後に永続D1/R2を開き直す。hostOOMではない。
- ledger: `python evidence/v15/validate-ledger.py`、rawメモリから `python evidence/v15/summarize-memory.py`。
- generator: package.json prepare chainの全generatorを実行して差分不変を確認。buildはSites公式build-site.mjs。preview前に公式execution profile/managed preview guidanceを読み、local空DBへ未適用migrationのみを順に適用。DEV_SESSIONはignored開発設定限定、build/ZIPへ含めない。

ログはevidence/v15/logs/。初期失敗/transport中断/修正前runも残しfinalと区別する。元VPSのsymlink環境依存1件は既知、新しい失敗と混同しない。raw値を省略した結果summaryではなく、全source/全行比較json/全logsが正本。

次の最初の作業はPRE_DEPENDENCIES.mdのactive初期化/正式trialの元計算・保存値比較。公開・外部恒久基盤導入・数学/権限/データ意味変更は禁止。重大変更が必要なら論点を示して確認する。
