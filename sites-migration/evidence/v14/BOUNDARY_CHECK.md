# 境界・成立性

本番サイト/VPS/DB/本番branch/domainへの書込み・本番データ複製・実資格情報流用は行わない。元repoに対する変更はsites-migration/だけ、専用branchだけ更新。固定sourceの機能/数学は比較参照のみ。

DEV_EXECUTIONと開発認証の既存境界を維持。研究cycle opt-inは同じorigin/権限/独立channelで限定。公開buildのdev-sessionとdispatchの利用不可は既存回帰試験/ビルド検査に従う。新ACCESS adapterは未接続で権限を広げない。Sites binding/cron/Queue/Workflowsが設定済みとはしていない。ホスト未確認のまま公開しない。

V8 old-space96MiB cap、workerd Inspector usedHeap、backing/Node RSSと実Workers128MB総量は別。独立の最大値を足さない。費用/転送量はアクセス・容量として観測、料金プランで換算していない。research registry全履歴snapshotのCAS bound1.5MBは安全拒否であり、将来大履歴運用に向けた分割CASが残る。

初期harnessのv13出力パスをv14へ修正。誤って生成した旧版ログは新evidence/v14/preliminaryへ移し、追跡済v13原本はGit基準へ戻した。初期失敗ログも残し、修正済みの失敗を最終成功数へ混入しない。
