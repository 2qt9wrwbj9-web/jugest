# 保存版14 再現・再開

ZIP全体を展開し、python VERIFY_EVIDENCE.py と python VERIFY_GIT_RESTORE.pyを実行。Site全ローカルrefsのbundle、取得済みshallow元Gitを収録。全GitHub履歴取得済みとは主張しない。固定元1f8c29f、Site13 00c5edca、公開branch旧d2f65139と新receiptを照合。

Site source/のpackageManagerとpnpm-lock.yamlに従いnpm run install:ci（pnpm installer）。全回帰はnode --test --test-concurrency=1 tests/port-*.test.mjs。原rootのnpm testは83 command、原vpsはnpm testで既知symlink1件を区別。公開sites-migrationはnpm test。元source参照の一部probeは../../jugest-sourceまたは../upstreamのパスを使うので各script先頭のresolveを読み、元Gitを同じ固定SHAへ展開する。

数学/メモリ: python evidence/v14/run-comparisons.py → python evidence/v14/summarize-memory.py。内部全コマンドはcomparison-commands.json（4規模×baseline/candidate全工程+original parity）。各runはworkerd Inspector/old96MiB/semi4。repeat-memory.pyで大規模追加run。memory-results.jsonのraw samplesとmodel-comparison.jsonを確認。ホスト128MB検証ではない。

研究: node --test tests/port-research-cycle.test.mjs。node evidence/v14/native-research-chain.mjs。node evidence/v14/holdout-boundary.mjsは元source側だけの正式holdout境界。node evidence/v14/cycle-oom-recovery.mjsは実V8 OOMを子processへ起こすため、通常の開発PCで限定して実行。既存oom-recovery.mjsは引数をcommand-results.jsonで確認。

認証: node --test tests/port-access-sessions.test.mjs。秘密値/本番DBを渡さない。合成access専用DBのみ。手動画面はsites-previewを起動し0013/0014を適用、開発sessionから合成seed、既存店舗解析パネル。HOST_VALIDATION_PLAN.mdなしにdeployしない。

次の開発は4管理原本の保存版14節→DEPENDENCIES.mdの順で、正式holdoutの保存と確定を最初の実装単位とする。モデル採用条件/holdout分離/activeモデル境界を変えない。保存receiptのsource SHAを正確にcheckoutし、git status確認。新version番号はreceiptで検証し、公開操作は禁止。
