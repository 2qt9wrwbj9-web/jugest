# 運用UI・API・アクセス範囲の独立レビュー

担当: operations_review_final。2026-10-09 09:20 UTC時点。

作業ブランチは `work/data-reliability-prediction-loop-20261009`。比較基準は `a461a08005d8533107879813db29a57027c139b5`、レビュー時のローカルHEADは `d1317d0724859b0a337612cd418f2a16f3e171be`。HEADだけでなく、その後の未コミット実装を読んで検証した。

## 結論

初回にP2を3件、最終差分の追加確認でP2を1件、実コードを使う独立fixtureで再現した。親担当の修正後、同じ条件を再検証し、4件とも解消した。今回の独立確認範囲では未解決のP1/P2はない。

通常の権限範囲、POST保護、ジョブ統合、待機期間、未取得店舗、評価0件・実測0枚・訂正日の区別を別途確認した。これはコードとローカルAPI・controllerの結果であり、本番動作や390px実機画面の成功判定ではない。

この担当は実装コードを編集していない。レビュー文書とscratchのfixture/logだけを作成した。commit/push、本番DB・設定・サービス、保護対象の判別数学・順位採点・NDCGは変更していない。

## 初回に再現した問題と修正後の確認

### O1 / P2 — 再試行の権限拒否後も以前の非公開表示を保持

初回の `vps-ui-operations.mjs` の `retry()` は、catchでerrorとbusyだけを変更し、401/403でもoverview/performanceを保持していた。以前に許可された `PRIVATE_OWNER_STORE` を読み込み、その後の再試行が `unauthorized` となるfixtureで、エラー表示と同時に旧店名・成績が残ることを確認した。通常のrefresh失敗時には消すため、通常refreshの既存テストではこの経路を検出できなかった。

また、初回のsettings統合は `jugest:pia-access-changed` を購読しておらず、PIA権限の失効を別のUIが検知しても運用controllerに伝えなかった。通常のrefresh開始だけでは古い表示をすぐ消さないことも確認した。

修正後は、unauthorized / forbidden / retry_scope_denied / vps_credentials_unavailableの4条件で、店名・overview・performance・storeIdを消す。controllerの `invalidate()` 後に古いrefresh結果を返しても復活せず、古いretryの拒否が後から返っても現在の状態を書き換えないことを独立検証した。settings統合のPIAアクセス変更、Receiverストレージ変更、Collector操作後のinvalidate呼出しはコードで確認した。実DOMへのイベント配送・再描画は親担当の別検証対象。

証拠: scratch `operations-review/controller-repro.mjs` / `.log`、修正後 `controller-confirmed.mjs` / `.log`。6ケース成功。

### O2 / P2 — POST body待ちの間に失効した認証でジョブを登録

初回の `vps/src/analytics-handler.mjs` は、認証と店舗範囲確認の後に `await readJsonBody()` を行い、その認証を再確認せず `retryStoreOperation()` に渡していた。

実ReceiverのHTTP POSTを部分bodyで止め、handlerがbody待ちに入ったことをIncomingMessageのreadable listenerで確認してからchannelをrevokeした。別GETが401となった後にbodyを完了すると、retryは202となり評価ジョブを1件登録した。同じ条件を実PIA admin sessionのrevokeでも再現した。認証stubによる推測ではなく、実Receiver hash照合・実access DBのsession認証を通した結果。

修正後、同じ2条件で別GET=401、retry=401/unauthorized、評価ジョブ=0となった。body完了後に現在のReceiverまたは現在のPIA adminを再認証し、店舗管理可否もfresh principalで検証するコードを確認した。

証拠: scratch `operations-review/revoked-retry-repro.mjs` / `.log`、修正後 `revoked-retry-confirmed.mjs` / `.log`。Receiver/adminの2ケース成功。

### O3 / P2 — 台数のみ分かる取得元の不足を0台・0%と表示

初回は、店舗のmissingMachinesとperformanceの不足率が `missingKeys.length` だけを使っていた。実ingestへ `quality.expectedMachineCount:3` と保存2台を渡すと、検品は `partial` / `source_count`、expectedCount=3、actualCount=2だがmissingKeys=[]となる。その結果、収集画面は「保存2台・期待3台／台不足0台」、成績画面は「台不足率0%」となった。

修正後、同じingest条件で店舗不足=1台、概要不足=1台、completeness不足=1台、不足率=1/3となり、旧0台・0%表示が消えた。共通の `missingMachineCount()` は、台数差と識別値で分かる欠損数の大きい方を使い、期待台数が不明ならnullを返す。今回の修正は検品・採点可否の既存規則を変更せず、表示用不足数を直している。

証拠: scratch `operations-review/source-count-repro.mjs` / `.log`、修正後 `source-count-confirmed.mjs` / `.log`。1ケース成功。

## 追加の独立確認

| 対象 | 独立確認結果 |
| --- | --- |
| 実権限マトリクス | 21 HTTPケース成功。Receiver ownerは自店+PIA、別Receiverは自店のみ、Assistant-readはowner相当の読取だけ、PIA admin/viewerはPIAだけ、匿名は401 |
| POST保護 | adminのOrigin欠落・別Origin・form content-type・専用header欠落は403。cross-siteは401。viewer/Assistant-readのretryも拒否。拒否された要求からjobは0件 |
| 正常再試行とcooldown | adminの正当なPIA評価retryは202、直後は429、jobは1件。5分経過後の追加評価依頼も既存active jobに統合され2依頼で1job |
| Collector再取得 | 30分未満の再要求は429。当日・存在しない暦日を400で拒否。許可された過去日のrequeue後もcanonicalのstore_days/machine_day_dataはバイト相当の行比較で不変 |
| 未保存Collector対象 | 別の2Receiverにそれぞれ実targetを登録。自分の未取得店舗だけ見え、configuredOnly=true、not_collected、integrity=null、正常完了0店舗、retry actionなし。URL・token・他人の店名を応答へ出さない。canonical未登録idへのretryは404、job0 |
| 営業日期間 | 不連続の保存日11件と過去の結果未取得予測1件で、直近7対象日は9/28〜10/8。30/90/allは12件。暦日間隔として扱わず、from/throughと説明を表示 |
| 当日・翌日 | JST当日10/9と翌日10/10の予測を期間集計から除外し、日別表示では結果待ちとして残す |
| 日別状態 | waiting_result、data_insufficient、corrected、historical、not_predicted、completeを実保存・実評価・source訂正条件から区別 |
| 0と不明 | 実測0枚の評価をmeanDiff=0、positiveRate=0として保持。評価のない方式/店舗のmetricsとunavailableRateはnull、UIは評価0件と「—」を表示 |
| HTML安全性 | 店舗名・台数根拠・reason・保存識別値などはescapeを通す。HTML生成を読取り、任意の店名がraw HTMLにならない既存実装を確認 |

追加証拠は `scope-matrix-confirmed.log`（21ケース）、`collector-retry-confirmed.log`（未取得店舗と再試行の2グループ）、`period-status-confirmed.log`（期間・状態・0/nullの1グループ）。全て `/workspace/scratch/2f9e5eaabf52/operations-review/` 内。修正後6fixture scriptはすべてexit 0。既存full suiteはこの担当では再実行していない。

## 再確認時の実装識別

2026-10-09 09:20 UTC時点のSHA-256。後続編集があれば変更部分の再確認が必要。

| ファイル | SHA-256 |
| --- | --- |
| `vps-ui-operations.mjs` | `6d784ede0d7681faf642cc038000b166192e87310d5d1d62f15b2e7a0acb3d76` |
| `vps-ui-enhancements.mjs` | `d22cca29bfb00498e1c61003df5466b11391735c896c4cf01f2a9c020ec1d492` |
| `vps-browser-analytics.mjs` | `e9ffcc47a188f9335968139b0c6c5041e083d6a298aecfc8c99a672c07b17e65` |
| `vps/src/operations.mjs` | `ed10515cbb57811bb4441df74d25ad13f9a907082787f4e9ebd6a4a32deb9ae6` |
| `vps/src/analytics-handler.mjs` | `236ac4cab115ed90245c74b3a045ed469f46bfff54c6b1445665c232b3850b9c` |
| `vps/src/access/handler.mjs` | `9e37dd8fc7598a8b0d639d16aa1c62dce55404039649ebe2680970eea6939aae` |
| `vps/src/research/prediction-performance.mjs` | `2f68b2ec4f6007d88c19c3ca5120bc5089d6179dc7975a5c8fe84b5d67ce7fa3` |
| `vps/src/ingest/day-integrity.mjs` | `92b0d202c6bd7d8cc0dde872f6055076f7c18c2fa04d550849aba6155e1caaeb` |

## 限界

本番VPS、配信中release、Nginx、実取得元・実iPhone Shortcut、実設定の正解は検証していない。本番データを使わず、取得元へHTTPアクセスもしていない。ローカルSQLite fixtureのみを作成し削除した。

この担当はPlaywright/390px・Safari・実機・配信パッチ適用後のDOM操作を実施していない。settingsから操作へ到達する見た目、横幅、aria/focus、PIAアクセスイベントでの実DOM消去は親担当の実画面検証と合わせて判断する必要がある。

運用画面は最後にAPIから取得した状態を表示する。未通知のReceiver失効や店舗範囲変更を常時監視する画面ではない。既知のアクセス変更イベント、手動更新、再試行の拒否によりキャッシュを捨てることを今回確認した。取得先がまだ公開していない日は、架空の実績0・完全取得として数えていない。

既存数式や正式試験の統計正当性・メモリ測定・全体回帰の最終成功はこのレビューの結論に含めない。対象コードの安全な範囲判定と今回の再現条件から、数学や本番について未実施の成功を推測しない。

## 最終差分の再確認（2026-10-09 09:27 UTC）

親担当から、lastCollectedAtを受理receiptの最大時刻へ変更し、台数・台不足が各店舗の最新営業日である説明を追加したとの連絡を受け、差分だけを追加確認した。

通常の欠損再送は成功: 02:00の受理後に03:00の不足再送を拒否してもlastCollectedAtは02:00、lastAttemptは03:00、canonicalの元行は完全保持。同じデータを04:00に受理して再送した場合はlastCollectedAtが04:00に進む。追加説明「台数・台不足は各店舗の最新営業日。過去の取得待ちは別に表示します。」が実HTMLにあることも確認した。

### O4 / P2 — 同じpayload hashの検品根拠変更で最終取得時刻が過去へ戻る

この最終差分には表示時刻の残条件を1件再現した。過去営業日のデータを01:00に受理、最新営業日のデータを02:00に受理する。その後、dayは同一のまま外部の `input.expectedMachineKeys` を2台から3台へ増やし03:00に再送すると、保存済み2台を保護して正しく拒否するが、receiptは同一のnormalizedHashなのでdecisionがacceptedからquarantinedへ更新される。そのためaccepted receiptの最大時刻が01:00となり、canonicalの最新日updated_atは02:00のままなのにlastCollectedAtが01:00へ戻る。

保存データの欠落や上書きは発生しない。問題は「最後に受理した取得時刻」の誤表示。単純な異なるhashの欠損再送は正常なため、通常の再送確認では見落とす条件だった。実装担当へ再現条件を送付済み。この担当はコードを変更していない。

`store_days.updated_at` はcanonical-ingestで受理時だけ更新され、拒否時には更新されない。全営業日のMAX(updated_at)を受理時刻の根拠にすれば、同hash receiptのdecision変更と、後から取得した過去営業日の補完の双方を扱える。最新営業日だけのupdated_atでは直近に受理した過去日の補完を取り逃す条件が残る。

追加証拠: `/workspace/scratch/2f9e5eaabf52/operations-review/accepted-time-final.mjs` / `.log`。通常拒否・受理再送はPASS、同hash外部検品根拠変更のケースでtimeMovedBackwards=true。初回O1〜O3の解消結論は維持するが、この時点ではO4が未解決のP2として1件ある。

| 最終差分ファイル | SHA-256 |
| --- | --- |
| `vps/src/operations.mjs` | `3667a2dd211a49ba0405c53f280071f547e64f169588f305f3116c6d83a70818` |
| `vps-ui-operations.mjs` | `7cc31362b10361ef08775daca2fb8feec71ed3bbea4c2c88d0898f35d52d4a4a` |
| `vps-ui-enhancements.mjs` | `d22cca29bfb00498e1c61003df5466b11391735c896c4cf01f2a9c020ec1d492` |

親担当からは、実SQLite/HTTPを使う390px Chromium E2Eで期間選択、結果待ち・欠損・訂正表示、retry202/1job、401後の非公開表示消去、overflowなし、pageErrorsなしがPASSしたとの連絡を受けた。これは親担当の検証結果として記録し、この担当が同E2Eを独立実行した結果には含めない。全体回帰の最終結果と本番動作は依然このレビューの範囲外。

### O4修正後の独立再確認（2026-10-09 09:29 UTC）

親担当が全営業日のMAX(store_days.updated_at)も取得時刻の根拠に追加し、native last_success_at / accepted receipt時刻 / canonical保存時刻の実時刻比較で最新を取る実装へ修正した。

元の同hash・外部期待台集合変更の条件を再実行し、canonical最新日の02:00を保持してtimeMovedBackwards=falseとなることを確認した。さらに、最新営業日は10/8のまま過去営業日10/7を05:00に補完し、その同hash再送を06:00に拒否する条件を追加して、lastCollectedAt=05:00を保持することも確認した。通常の欠損再送拒否、同一データの受理再送、追加説明の表示も同時に再確認した。

`accepted-time-confirmed.mjs` / `.log` の4ケースはexit 0。取得時刻と最新営業日の台数を混同せず、拒否再送時刻へ進まず、同hash receiptのdecision変更で過去へ戻らない。O4は解消。O1〜O4について、現確認範囲の未解決P1/P2はない。

settings統合の最終変更 `globalThis.addEventListener?.(...)` は、ブラウザ上のアクセス変更イベント登録の動作を変えず、非ブラウザfixtureでEventTarget APIがない場合にも対応する変更と読取り確認した。実DOMの再検証は親担当のE2E結果へ留保する。

| 最終再確認ファイル | SHA-256 |
| --- | --- |
| `vps/src/operations.mjs` | `2ee3e8cb7a03d2fd28b09dff67aed01415df24ce35f54e32d2dfea2bc62bccb4` |
| `vps-ui-operations.mjs` | `7cc31362b10361ef08775daca2fb8feec71ed3bbea4c2c88d0898f35d52d4a4a` |
| `vps-ui-enhancements.mjs` | `6e7fd9056f39f1311fc6d4177a05665faf8d2ac49c449b9973e8a25edc4a8bdf` |

09:20 UTCの識別表は当時の検証版、上表は最後の差分検証版。時刻変更に関係しない前述5ファイルの識別値は変更されていない。全体回帰は担当外のままで、今回の追加検証をその代替にはしていない。本番変更・実装コード編集・commit/pushはこの担当では行っていない。
