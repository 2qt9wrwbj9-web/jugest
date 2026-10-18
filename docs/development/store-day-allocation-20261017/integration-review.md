# 店舗単日投入分析：独立統合レビュー

レビュー日：2026-10-17〜2026-10-18。対象branch `work/store-day-allocation-20261017`、基準 `1f8c29fc458f34e11e546fb57944d0fc31db98a5`。承認済み設計・実装計画・AGENTS.mdと、作業treeの読取／原本／cache／認可／worker／画面を確認した。

状態：重要所見INT-01〜10は修正後のソース・独立再実行でcloseした。最終ラッパー／通信差分を含め、確認した範囲に未解決の重大・重要所見はない。全体回帰は実装担当の別証拠で確認する。Chromiumの最終証拠は読取確認済みで、WebKitは実行環境不足による未確認が残る。以下の過去所見は、修正後の残存不具合と同義ではない。

## 前回修正後の独立再確認

VPS allocationの6ファイル **70/70成功**、UI/clientの2ファイル **23/23成功**、失敗・skip 0。`git diff --check` 成功。新規の境界試験には、名称欠損・近似店舗名・PIA前snapshot上限・未知の当日観測と台帳所属の分離・OAuth・read-only cache・全経路の同時数／取消し・差枚参考・全台0G・不正な任意差枚を含む。

| 所見 | 再確認結果 |
|---|---|
| INT-01 | PIAの空欄identityで全台帳を認定しない。前snapshotにも完全性条件を適用 |
| INT-02 | 店舗見出しを解析し、前方・後方の別店舗名や支店違いを拒否 |
| INT-03 | 実UIから新分析専用の `piaOnly:true` clientを生成。実clientの取消しも確認 |
| INT-04 | Receiver／PIA adminだけ計算可。他の認可readerは現行hashの保存結果を閲覧。OAuth失効・scope・期限をreadonly検査 |
| INT-05 | 原本読取から同時数を制限。取消し後は計算を開始しない。cache障害を計算失敗と混同しない |
| INT-06 | 差枚込みは別のapproximate reference。e数値・宣言登録・強候補を無効化。主分布・並び順・通常qと分離 |
| INT-07 | 専用readonly一覧へ接続。一時HTTP再現でcanonical表数3→3、session.last_used_at 7→7 |
| INT-08 | 全台0Gと数値許容差内のBF=1は情報不足。n=1〜120の実engine/renderで候補文言なし |
| INT-09 | 非整数／安全整数外の任意差枚を警告付きで除外し、正常なボーナス主計算を維持。0Gの非零差枚矛盾は引き続き保留 |

INT-07の修正後には、本担当でも初回と同じ3表fixture・本物client・PIA Cookieで再実行した。最初の要求が `/api/vps/allocation/stores` へ変わり、応答okでも表数と認証時刻に差分はなかった。

modelHashにはpure engine、likelihoods、runtime-adapter、worker、service、provenance、store-dayのソースと既存runtimeのfingerprintが含まれることを確認した。

追加の接続確認として、合成9機種×111台＝999台、全台に整数差枚ありのfixtureを実service/workerへ渡した。処理約2,879ms、V8 serialize後4,757,479bytes、cacheWarningなし。直後の `allowCompute:false` も保存結果を正常に再利用した。現在のcache上限8entries・8MiB/payloadに入ることを確認した。これは開発環境上の1回の接続試験であり、固定2vCPU環境の正式な性能保証ではない。

## 確認方法と境界

- 本番への接続、実店舗の独自判別、collector実行、製品コードの編集、commit/push、追加subagentは行っていない。本ファイルだけをレビュー記録として作成した。
- 新規モジュールと関連差分を読んだ。既存の確率表・個別判別・group・sync・ingest・PRE・daily-analysisの数学・処理本体に対する基準からの差分は認めなかった。`index.html` の差分は新しい表示scriptの追加。runtime-adapterの追加は既存関数を呼ぶ別capture経路である。
- 一時Nodeスクリプトで不正な原本境界を再現した。実店舗の設定推定はしていない。
- 独立実行した局所試験はVPS 54/54、UI/client 16/16成功（失敗・skip 0）。この時点のテスト成功は、以下の未試験境界を否定しない。

## 初回の重要所見と返却内容

### INT-01：PIAの名称欠損台があっても全台帳をverifiedにできた（重要）

対象：`vps/src/allocation/provenance.mjs` の `verifyPia`、初回149行付近。

再現：前後の日付が隣接する30行rolling履歴を2台作る。一方はマイⅤ、もう一方は全履歴で `name:''` とし、両方の追加行を一意にする。初回実装は後者に `missing_machine_identity` を付けた一方で、`roster.status:'verified'`、`dateVerified:true`、マイⅤ行はeligibleを返した。

影響：名称不明台を対応機種の分母へ入れるべきか判定できないのに、別の対応群を全台取得済みとして通せる。

必要修正：当日観測と当日所在・機種帰属の立証を分け、名称／ID欠損や帰属不明は完全台帳の証明に使わない。名称不明・混在・撤去等の負例を維持する。

### INT-02：元HTMLの店舗照合が名前の前方部分を別店舗にも一致させた（重要）

対象：`vps/src/allocation/provenance.mjs` の `verifyHtml`、初回167行付近。

再現：要求店舗名を `テスト店`、元HTMLのtitleを `2026-10-15 テスト店2` とする。他の必要な全データ一覧・値は整える。初回実装は `roster.status:'verified'`、`dateVerified:true`、理由なしを返した。

影響：日付と数値が一致する別店舗の原本を、その店の証跡にしてしまう。

必要修正：文字列の `includes` を店舗同定の十分条件にせず、既知の見出し構文・境界を解析した店舗名の厳密一致を使う。近似名、支店番号、名称の包含を負例にする。

### INT-03：PIA Cookieだけの閲覧者は実UIからAPIを呼べなかった（重要）

対象：`app-v510.js` の `getVpsAnalyticsClient` / `runAllocation`、`vps-browser-analytics.mjs`。

再現：実UIと同じ既定 `createVpsAnalyticsClient()` を使い、ReceiverのlocalStorageを空にする。`getAllocation('PIA大船1','2026-10-16')` は `vps_credentials_unavailable`、fetch実行0回。既存の新client試験は `piaOnly:true` を直接指定し、UI試験はclientをstubしたため、この接続を通っていなかった。

必要修正：新分析専用clientのCookie許可を実UIへ接続する。既存PRE等のclientの意味を変えず、実UIの生成経路からCookie-onlyの要求が届く試験を追加する。

### INT-04：読取主体が未保存の計算まで起動した／OAuth経路がなかった（重要な契約差分）

対象：新allocation handlerと `authenticateReadOnlyPrincipal`。

初回コードではPIA viewer・assistant-readもcache missから同じ計算を起動した。承認設計8.8の「保存結果の閲覧・起動は原則所有者」と異なり、OAuth `jugest:read` も受け付けなかった。

実装担当の修正方針：Receiverによる認可店舗の実行、PIAのpasskey adminによる所有者側実行を許可。viewer・assistant-read・OAuthは現在の入力hashに一致する保存結果だけ閲覧し、必要な計算が未保存なら409 `allocation_result_not_ready`。計算を要しない保留理由は閲覧可能。OAuthは既存scopeとrecord属性・期限・channel失効を読み取り専用で検証する。この方針に重大な異論はない。未保存の詳細条件も同じ409になることをUIで説明する必要がある。

### INT-05：計算workerの上限だけでは原本読取負荷を制限しなかった（重要な運用条件）

対象：`service.mjs` のloader呼出し、`provenance.mjs` のgunzip／JSON検証、`calculator.mjs`。

初回は同時数上限が計算workerだけに適用され、原本読取・解凍・検証はqueueに入る前、cache hitでも実行されていた。loaderにキャンセルが届かず、切断後もそこまで進んだ。

実装担当の修正方針：原本読取から計算まで全経路を最大2件に制限し、loader直後にキャンセルを再確認する。計算workerのtimeout／queue／abortも別に維持する。cacheの保存障害で正常な分析結果まで失敗扱いにしない。

### INT-06：差枚込みの「投入比較」参考経路が未接続だった（重要な仕様差分）

対象：`worker.mjs`、pure engineへの入力、表示部。

初回workerは `bonusLogs` を持つ行で主分析を一度だけ実行し、capture済みの既存差枚込み `logs` による別の投入台数比較を返さなかった。通常個別qの表示だけでは承認設計8.4／9.5の「差枚込み参考の並記」「結論差を隠さない」を満たさない。

必要修正：既存の総合ログ値を別の参考経路へ接続し、主分析のe値・補正・通常qを変更しない。近似経路へ誤検出保証や強候補を付けず、主計算と混ぜない。あるいは未実装の要件として明示した判断が必要。

### INT-07：実clientの店舗名解決がlegacy一覧経路を通り、schemaと認証時刻を書き換えた（重要）

対象：`vps-browser-analytics.mjs` の `getAllocation` → `resolveStore` → `request('/stores')`、既存analytics `/stores`。

新allocation endpoint単体がreadonlyでも、ボタン操作全体は最初に既存の一覧APIを呼ぶ。既存一覧は `openDatabase/migrate` と書込み可能なPIA認証を使う。

再現：PIA Cookie-onlyの一時HTTPサーバーと本物のclientを使用。canonicalをloaderに必要な3表だけで作り、viewerの `last_used_at` を7に固定して `client.getAllocation('PIA大船1','2026-10-16')` を実行した。

```json
{
  "calls": ["/api/vps/stores", "/api/vps/stores/pia%3A35/days/2026-10-16/allocation"],
  "ok": true,
  "before": {"tables": 3, "lastUsed": 7},
  "after": {"tables": 25, "lastUsed": 1792267053284}
}
```

必要修正：選択済みcanonical storeIdで `getAllocationById` を呼ぶか、専用のreadonly店舗解決経路を追加する。実clientの全要求について、canonical schema・データ・job・認証timestampに差分がないことを試験する。既存一覧APIの意味を無断で変更する修正は避ける。

### INT-08：全台0Gでも丸め誤差を正の支持と読み、全イベントを候補表示した（重要な表示境界）

対象：`store-day-allocation-view.js` の `eventLabel`。

実engineへ全台 `[0,0,0,0,0,0]` の中立ログを渡すと、n=2では9イベントすべての `logBF` が約 `1e-16〜4e-16`、n=58では約 `1e-14` の正値になった。これは計算誤差の許容範囲内だが、表示が `logBF>0` だけで「比較上の候補」に分類するため、情報を全く得ていない群を全456／56／6の候補と表現した。n=120では誤差が負になり、台数によって表示が変わることも確認した。

必要修正：既存数理を変更せず、数値許容差内のBF=1は「同程度に説明」「情報不足」等へ区別する。少なくとも実engineの全台0Gをrendererまで通し、正の候補文言にならない試験を追加する。新しい経験的な候補閾値を同じデータから調整する要求ではなく、無情報の数値同値性を守る修正である。

### INT-09：任意の差枚だけが不正な場合に、正常なボーナス主計算まで失敗した（重要）

対象：`provenance.mjs` の `inputReasons`／差枚読取、`likelihoods.mjs` の `checkedRow`、既存validatorとの接続。

再現：native HTMLに `G=1000, BB=5, RB=4, diff=1.5` を入れると、原本検証はeligible・理由なしを返した。その行を本物のcaptureへ渡すと、既存 `judgeObservedMachine` の整数差枚検証により `allocation_likelihood_unavailable` で失敗した。PIAでも差枚の読取は同じ非整数を受け入れる。workerはこの例外を店日全体の計算失敗にする。

必要修正：差枚の実測としての適格性を既存個別入力契約に合わせる。不確かな差枚だけであればnullと理由に分け、正常なG/BB/RBによる主分析を維持する（設計4.1）。既存validatorを緩めない。

## データ分離について実装担当へ返した判断

PIAの既知非対応機種1台について、履歴の追加を一意に取れないだけで対応3群の設置数まで不明となるケースが報告された。新しい観測を取れないことと、その日の所在・機種帰属が不明なことは別である。

前後の隣接snapshotで同じ台ID・元機種名・コードが確認でき、各snapshot内でも一意なら、台帳所属を独立に確認し、その台の観測だけをheldにする分離は妥当と判断した。成績に基づいて台を除外する変更ではない。名称欠損、入替の帰属不明、prior-only撤去、snapshot欠落・上限などを一緒に緩めてはならない。

追加境界として、前snapshotが5,000行上限に達した場合、そのsnapshotにない台を「真の新台初日」とは立証できない。初回実装ではこの場合でも新しい一行台の観測eligibleがtrueになることを一時fixtureで確認した（全体は撤去台の不確実性でpartialだった）。台帳／観測の分離時にも、この不完全な前snapshotを完全な不在証拠にしないよう返却した。

## cache・非変更境界の確認

指定店日headerと台行・前日headerはreadOnly接続の同じtransactionから取得され、raw本文はそのheaderのhashと照合される。raw読取はrawRootの内外・symlink・hash・byte上限を検査する。native欠損をゼロ化せず、端末再包装をnativeと同格にしない。

サービスはauthより前にcache結果を返さず、結果は元canonicalとは別のcacheへ保存する。新経路はlegacy openDatabase/migrateより前に分岐し、readOnly認証ではセッションlast_used_atも変更しない。privateの他店ID、未認証、無効な日付・queryを拒否する局所試験が成功した。

cacheの入力hashはcanonical行本文・raw・台帳・前原本証跡も含み、同日訂正で変わる。modelHashにはcaptureを行うruntime-adapterとworkerを含むリリース／ソースの識別も必要であり、既存表のfingerprintだけではadapter改訂を識別できない点を追加返却した。既定memory cacheの再起動では通常消えるが、将来sidecarを使う場合の再現契約となる。

## 2026-10-18 最終ラッパー／通信差分の独立確認

最終確認時刻：2026-10-18 01:46 UTC。Node.js `v24.19.0`。HEADは `def8a17ec1c4d3ea053781077d7ca09236443f0b`、以下のハッシュは未commitの製品ファイルも含む実体を識別する。最終の回復修正を含め、この範囲に重大・重要な残存不整合は認めなかった。

### INT-10：部分計算失敗の保存結果が所有者の再試行を遮った（重要、修正確認済み）

対象：`vps/src/allocation/service.mjs` のcache hit／`calculation_failed`処理、`vps/tests/allocation-service.test.mjs` のowner retry回帰。

最終workerは1機種の失敗を明示的に保留し、他の完全な機種結果を残す。初回の最終ラッパーでは、その部分結果も通常のcache hitとして返すため、所有者が再実行しても同じ入力hashでは計算を再開しなかった。最初のcalculator応答だけを `calculation_failed`、2回目を成功にする一時fixtureで、2回の所有者要求に対し実計算1回、両方 `completed:false` を再現した。

修正後は `allowCompute:true` かつ保存結果に `calculation_failed` がある時だけcache hitを迂回する。閲覧者は保存済みの部分結果を読み、所有者の再試行が成功すると同じkeyの結果を置き換える。独立fixtureの結果は次のとおり。

```json
{
  "first": {"completed": false, "reasons": ["calculation_failed"]},
  "savedPartial": {"completed": false, "reasons": ["calculation_failed"]},
  "callsAfterReader": 1,
  "retry": {"completed": true, "reasons": []},
  "recoveredRead": {"completed": true, "reasons": []},
  "calculateCalls": 2
}
```

### 最終差分の確認事項

- 既定cacheは8件・payload 8MiB上限。全要求の入場制限、worker制限、取消し確認、機種単位の失敗表示と部分結果の完了フラグを維持する。cache取得／保存障害を原本不整合や正常な計算失敗に置き換えない。
- 店舗名解決は専用のreadonly `/api/vps/allocation/stores` を通る。ReceiverとPIA Cookieの併存では、認可されたReceiverの所有者実行を優先し、別のReceiverがPIA共有を隠す場合は独立したCookie認証へ戻る。private store認可とPIA source制限は各要求で再検証する。実clientと一時HTTPサーバーを通す既存回帰を含めて成功した。
- 非整数・安全整数外の任意差枚は `diff_not_safe_integer` の警告付きでnullにし、正常なG/BB/RB主入力を保つ。0Gと非零観測の矛盾、原本・canonical不一致は引き続き保留する。警告は公開応答と表示まで保持する。
- 原本・canonical行・前原本・台帳の版は入力／provenance hashに含まれ、同じreadonly snapshotのheaderと行を使う。同日訂正、modelソース、台帳、detail scopeのいずれが変わっても古い結果を再利用しない。
- 主分析は既存captureの `bonusLogs` を使う。差枚込み参考は別の `approximate` / `primary:false` 応答で、e値・宣言登録・modelPass・強候補を無効化する。新しい小さな感度診断も `eRegistered:false`、e値・閾値はnullで、主比較のM／e値や比較順へ合成しない。並び順は主分析のイベントだけを参照する。

### 最終の独立試験

- `node --test vps/tests/allocation-api.test.mjs vps/tests/allocation-likelihoods.test.mjs vps/tests/allocation-provenance.test.mjs vps/tests/allocation-results.test.mjs vps/tests/allocation-service.test.mjs vps/tests/allocation-store-day.test.mjs`：**72/72成功**。
- `node --test tests/store-day-allocation.mjs tests/store-day-allocation-client.mjs tests/store-day-allocation-ui.mjs`：**数理27/27、UI/client 27/27成功**。数理scriptはNode test runnerでは1ファイルとして計上される。失敗・skip 0。
- 上記とは別にINT-10の一時fixtureを実行し、部分保存の読取→所有者再試行→回復後の保存読取を再現確認した。
- `git diff --check` 成功。基準から `core-v510.js`、既存group・judgement・machine-names・sync、VPS ingest・research・daily-analysis本体の差分はない。

別担当の `ui-browser-validation.json` も読取確認した。Chromium 153.0.8010.0、source／built／VPS-patchedの各320/375/390/430px、計12ケースが成功し、実Cookie client、保存結果・未保存409、感度反転表示、exact 0台を含む。記録上は横はみ出しなし、page error 0、本番要求0、合成fixtureのみ。本担当がブラウザーを独立再実行した証拠ではない。

### 最終確認対象のSHA-256

| ファイル | SHA-256 |
|---|---|
| `vps/src/allocation/store-day.mjs` | `8a75c901679226bdf0dc7235b3b1bf7304011f757f7203f883bc1059f9359bff` |
| `vps/src/allocation/provenance.mjs` | `af19d7369f7f8655ba4d46769ef8fcb04406e2ba8e98647d14b108ffbf409def` |
| `vps/src/allocation/results.mjs` | `a1ad654f40ae325782eb9ec8ca33d3a66fb1eb4e1b649bfdd75e01dea09d5f87` |
| `vps/src/allocation/likelihoods.mjs` | `ffc04037977fde3cb83ee0a18d59777c8d47071a2f7245223f9cd9f078e7565a` |
| `vps/src/allocation/service.mjs` | `355031843103a64fb30e3d7f7f8a06ef41065870c02d4a3b9ee60ae078d40956` |
| `vps/src/allocation/calculator.mjs` | `4061fdf72cf81385882953438f5183a433ed05d4dce7569123e00fa4f2e973b5` |
| `vps/src/allocation/worker.mjs` | `c0d67333cbd052920351f95b59d625bd5964f7610c26feaa6025a55211f16c24` |
| `vps/src/allocation/handler.mjs` | `e6b63b2fef83bf093ac9c0ef9e968f4a022c61f6f347ca25b65e308d26fc18a5` |
| `vps/src/analysis/runtime-adapter.mjs` | `effce3f3fe0758f1a522fe9bfe0772d5f857716be08c549a3c41c28d522107f7` |
| `vps/src/analytics-handler.mjs` | `0fdb2a18bc9da943109501fa73b6ef6a57a0f773f5bbc76d6e3210ac78cf0085` |
| `vps/src/assistant-read-key.mjs` | `3813a4623077b8e54eb0d9ed5fad7ed5618f91c6fd5bae88de06251eaa25bb83` |
| `vps/src/access/handler.mjs` | `e98ee76bf4d5b2e4f23d21d35770f3b71f7ab82427b6b5c99d80f3c8843fde70` |
| `vps/src/access/store.mjs` | `14583697dca4600f7e8b47b68c95b884bcbf234c6ab2230b5d0683b15f7055ba` |
| `vps/src/web-server.mjs` | `00a47cafc6746cce138e898cecb897d9debb2f703a76b512966330ea6991c324` |
| `vps/src/ui-source-patch.mjs` | `797133e143315703c12f913942eb5519d48868f84bd3029edabc4f35c9d99ff7` |
| `vps-browser-analytics.mjs` | `5815d3eca02c2262c60bfe95dfc3963040fa55e9f37ec83adf84cac3592307e5` |
| `store-day-allocation.js` | `d69631c56ed0334eef8685c0298a0f4ec05d78c8622e7971475c6b2bf1067ce6` |
| `store-day-allocation-view.js` | `f01ee3dceabaf56adf8637f0ca45b8e666f9470d32a12a1d296e44bd8fcc0949` |
| `app-v510.js` | `c78da20413ef4fb8aa53aacbb1e637c25578afdd41412def580e8d99365374a5` |
| `build.mjs` | `1f05d272c6e8acd7a27a5e544ccb7696b991a8415b07fc51990d2125ec161fd6` |
| `index.html` | `acafa82d75e552f0987f256487497efbb2be0a6e4c0bd1506a9d03d17bcf5979` |

## 最終確認で残す限界

- このレビュー担当は、全体root/VPS suiteと実ブラウザー最終ログを自分で完走していない。局所成功を全体成功として報告しない。
- Chromiumは上記の別担当記録を確認した。WebKitは実行バイナリがなく未実行で、Safari実機の保証に置き換えない。
- 実店舗の真設定、実店舗の的中率、モデル外の稼働・欠測に対する校正はこのレビューの範囲外。strongEnabledをfalseのままにする。
- 認証や権限を長時間の計算中に変更する運用について、各要求の開始時認可と進行中要求の扱いを区別する。連続的な権限監視を実装済みとは主張しない。
- 読取専用利用者の未保存結果409、再起動時のmemory cache消失、sidecar未設定という運用条件を引継資料に明記する。
