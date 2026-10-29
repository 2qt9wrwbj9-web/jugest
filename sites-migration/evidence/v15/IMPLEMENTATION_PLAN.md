# 保存版15 実装計画

基準Site14 b464c7b19f96098cffb6af4ed9c325f25c2fdece、GitHub c513570b07433d43e6a58445c959732079450a10、固定本番1f8c29f。receipt/ZIP CRC SHA照合済。最初のsource helperは非空cwdで拒否、空の正規Siteディレクトリで開き直し成功。

1. 収束transactionで同じsnapshot/全registry/loopをholdout子jobへ固定。既存opt-inのみ継続しmanual未昇格は不変。
2. 元holdout.mjsからrankRows/betterを機械抽出、元evaluateModel/buildWalkForwardDataset/splitを再利用。モデルごとに別phase、R2 checkpoint＋小さなD1 private staging。全holdout行は最終確定前は公開表に置かない。
3. 入力/実装/loop/全registry CASと既存leaseを最終成功batchへ適用。run/prediction/registry/loop/receipt/履歴をO(models) SQLの一transactionで公開。上限はlocal大容量試験で測りhost未検証を区別。
4. fixture2モデル218行、全registry/loop/source返値hashを厳密比較。停止/破損/重複/古世代/frontier/最終DB失敗/実OOMを試験。active_store_models writer追加なし。
5. 独立ACCESS D1のsession/challenge/失効互換を追加、正式APIとDB分離は維持。host binding契約確認はnative/公式資料に限定。
6. 全runtime修正確定後にSite/Publicの全回帰を実施。元root/VPS、実Queue、ブラウザー、4規模数学、全ログ、55ID/12ゲート4原本、safeGitHub commit、非公開save、復元ZIPと永続共有を順に確定。

memory停止条件：現行予測の候補/全BHに対する新しい低保持契約を証明できない場合は新分割を採用せず、数学回帰とholdout phase測定に時間を使う。参照解放の反復だけを進捗にしない。
