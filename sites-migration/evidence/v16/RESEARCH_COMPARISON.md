# 保存版16 元SQLite比較と実装境界

固定元 deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5。合成データのみ。元の計算式・候補集合・重み・順位・時系列境界を変更しない。全比較コード、入力fixture、expected/actual原本、失敗を含むログを収録する。

## FEATURE_BUILD全子プロセス

`tests/port-feature-side-effects.test.mjs` は元jobs/feature-build.mjsを本当の子プロセスとしてforkし、独立SQLiteを使用する。固定Date preloadで両側時刻を同一にする。本番のソースは変更しない。初回・既存active・研究championだけ変更・古いfrontierと新frontier待機/追従を比較。元IPC完了hashと移植payload hashが一致。特徴量全行、active全列、client payload/hash、live prediction全列、research registry/loop、feature_refresh_stateが一致。期待値を変更して通していない。

`feature-child-initial.json`, `feature-child-existing-active.json`, `feature-child-changed-research-champion.json`, `feature-child-queued-old.json`, `feature-child-followup-new.json` が無省略全列原本。activeがなければ元初期研究championで一度だけ初期化。既存activeがあればfingerprint/model/source_frontier/activated_at/holdout_scoreを変更せず、store-read snapshotと次営業日liveを更新する。正式holdout winnerから無条件active更新はない。重複live保存は元どおり最初の行を維持する。

研究継続opt-inは前版互換のため維持。既定の計算のみモードでも元ensure registry/loop+active/snapshotを実行するが、研究の子job受付はopt-inのみ。元物理queueの受付ID/coalescing/常駐scheduler全体の同一性は主張しない。Sites内の物理idを元feature_refresh_state.active_job_id相当へ写像し、完了状態・後続frontier・公開値を比較した。

## 正式PRE v2

`tests/port-formal-pre.test.mjs`, `port-pre-jobs.test.mjs`, `v16-pre-fixture.mjs`。元formal-start/auto-start、モデル/予測store、trial/evaluation/daily-loopを独立SQLite oracleとして使用する。全formal_trials/models/predictions/outcomes/trial_daysの各列、state_json/hash、modelHash、machineSetHash、predictionHash、全台順位/scoreが一致。正式model本文、lineage/trial/feature/scorer/時刻を固定する。再要求再利用、異なるpair/fingerprint/feature/start roster、source frontier逆転、異なる予測hashを元と同じく拒否する。正式target日の未来実績を開始用予測へ含めても元と同じ予測を維持する。

元実装は開始時のmachineSetHashと毎日生成時の実際の集合hashを区別する。各日のchampion/challengerは同一台集合を要求するが、trial開始時の集合へ全日を無条件固定する追加仕様はない。元normalizePredictionの挙動をそのまま維持し、独自に厳格化/緩和していない。

`formal-comparisons/*.json` は各checkpointの期待/移植全行と両hash。時刻は同一固定値。ランダムな内部CAS owner/物理jobidはbusiness table比較外。live/autoincrementは独立fixtureで初期値を揃え、元全行と比較する。

元の日次target judgementは静的Worker生成へ機械的に組み込み、runExistingStoreDayJudgementに対し全台q/期待設定/全出力が完全一致。実target日到着のジョブから元daily-loopまで、outcome・逐次evidence・状態・次日予測pairを厳密比較する追加統合試験も合格。採点済み結果の差し替えは元と同じhash conflictで拒否。実績未到着はwaiting_for_target。

## 接続と安全性

新formal-pre kindは既存の開発認証・scope・Origin・実行gateの内部だけ。元daily-analysisで行う「進行中trialの日次更新→なければholdout確定済みから開始」の順序を再利用する。元scheduler/daily-analysis全体の自動受付は未移植。手動DEV受付後は既存outbox/実local Queue/lease/checkpoint/最終CASでブラウザー非依存に進む。

公式データはprivate R2 planと入力/実装hash検証を通し、D1 epoch/元行preimage/job最新headを同じbatchで確認し、job成功・履歴・business tableを原子的に確定する。古いモデル/loop/frontier/世代の更新が間に入れば失敗し正常旧値を保持する。失敗/成功応答消失/重複配信/実OOMはFAULT_REPORT.md。

研究champion・正式holdout winner・実予測active・trial champion/challengerは分離。trialがpromotedになったとしても実active採用の後続を実装したとは扱わない。公開認証、正式scheduler、全PRE terminal統合・比較APIは残る。

## 従来回帰

4規模で元全モデル/8段階中間値/最終hashが一致（model-comparison.json）。正式holdout2モデル218行fixtureおよび4規模全行・state/hashも維持。native-research-chainは7研究job→正式PREの8番目を実Queueで完走し、active baselineが研究winnerで置き換わらず、正式2予測へ固定されることを確認する。
