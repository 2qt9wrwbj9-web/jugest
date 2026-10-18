# 店舗単日投入分析: 読取・原本検証・専用結果cache

新規53件と関連既存18件の計71件が成功した。指定日を完全一致で読み、native原本で日付・型・機種・全台帳が確認できる群だけを計算対象にする。原本を立証できない台の数値は保持できるが、通常参考判別と正のe判定の入力にはしない。台帳への所属と営業日観測の立証は別の軸とする。

- 作業branch: `work/store-day-allocation-20261017`
- 基準SHA: `1f8c29fc458f34e11e546fb57944d0fc31db98a5`
- 実行環境: Node.js `v24.19.0`
- 本番、既存ソース、既存DB schema・job・PRE・同期を変更していない。commit/push/checkoutも行っていない。
- 全体の `npm test` / `npm --prefix vps test` は親担当による統合後の実行範囲。この担当で全体成功を主張していない。

## 変更ファイル

1. `vps/src/allocation/store-day.mjs`
2. `vps/src/allocation/provenance.mjs`
3. `vps/src/allocation/results.mjs`
4. `vps/tests/allocation-store-day.test.mjs`
5. `vps/tests/allocation-provenance.test.mjs`
6. `vps/tests/allocation-results.test.mjs`
7. 本報告書

同じ作業treeには親・他担当の変更もある。上記以外はこの担当で編集していない。

## 読取契約

`await loadAllocationSnapshot({dbPath,rawRoot,storeId,date})` は `{ok,code?,store,date,snapshot,roster,groups,unsupported,quality}` を返す。存在しない店日では `store_not_found` / `day_not_found` を返し、最新日へ代替しない。不正な日付・引数・開けないDBは例外。

canonicalは `new DatabaseSync(dbPath,{readOnly:true})` と `PRAGMA query_only=ON` で開く。`BEGIN` 内で店舗、指定日header、台行、必要な前日headerを取得し、全同期読取を終えてから圧縮原本を読む。rawはheaderのSHA-256に一致させるため、同日訂正後の別版と混ざらない。原本欠損・hash不一致・source hash不在は保留。

`snapshot` は `id=inputHash`、`date`、`source`、`sourceHash`、`normalizedHash`、`rawHash`、`rosterHash`、`provenanceHash`、`inputHash`、`verificationScope`、`parserVersion`、`updatedAt` を持つ。入力hashはheaderだけでなくcanonical台行本文、原本・台帳・前日原本の証跡も含む。同日内容訂正で失効する。

`groups[].rows` は `{id,tableNo,machine,input:{games,bb,rb,diff},eligible,reasons,provenance,...}`。物理IDは台番であり、`machine_day_data.machine_key` の行順番号を台IDや機種キーに使わない。台番が欠けた行を連番で補わない。設置数未知は `nInstalled:null` とする。台帳にあるのにcanonicalにない台は `canonical_row_missing` とし、0Gで補完しない。

`roster` は `verified` / `partial` / `unverified` と全native行を保持する。集計は `nInstalled`（未知null）、`nObserved`、`nSupported`、`nUnsupported`。未対応は別途 `unsupported[]` に元機種名・元コード・元台ID・台番・理由を保持する。主なUI用名称は `machineName`、証拠用名称は `sourceMachineName`。

## 原本検証の範囲

### PIA

通常保存の営業日dの原本は、source date d+1の30日rolling履歴である。source date dの保存原本と比較し、当該台で追加行が一意のときだけ営業日dの観測とする。既存pure `validatePiaSnapshot` / `derivePiaBusinessDay` を利用し、元の数値型を検査した後で正規化結果を照合する。元null・空欄・boolean・配列・object・不正文字列を既存 `Number()` の前で拒否する。正しい数値文字列は受け付ける。

前日canonicalがある場合、その同じread snapshotに含まれるheaderの原本を使う。最初のcanonical日では、collectorが保存する同一店舗専用 `:snapshot` bucketの一致日付・hash付きseed原本が一意の場合だけ使う。任意店舗や任意日へ探索を広げない。複数seed異版は保留する。

全native機種をrolling差分へ含める。未対応機種も落とさない。新台・入替の一行初日、通常の短履歴増加を扱う。同一履歴・複数追加では営業日観測を保留する。両隣接原本で台IDが存在し、各原本内の機種名・コード・元台IDが一定で、両原本間も同じidentityなら、観測が保留でも台帳所属は確認できる。この所属規則は機種の対応可否や観測結果の良し悪しを参照しない。当該対応群に日付未確定の台があれば、その群の計算は保留する。

source日付gap、消失台、空の機種名、混在機種、履歴遷移異常、所属が曖昧な新規台・入替は完全台帳の確認を妨げる。現在台帳を根拠なしに過去日に流用しない。native collectorの5,000行上限へ達した現原本・前日原本、空の前日原本は完全なアンカーにしない。

`backfill` metadata付きの履歴切出しは `source-derived`。旧日の所在・全台帳を独立に立証できないため、metadataだけで営業日を確定しない。通常の隣接full snapshotとseed保存形式はpure fixtureで実際に利用できることを確認した。

### アナスロと端末再包装

元HTMLの明示的な全データ一覧について、店舗・日付をtitle/h1から確認し、機種列と台番列を持つ一覧を読む。日付と既知のページmetadataを構文で除いた店名全体を正規化して厳密一致させる。店名の部分文字列では認定せず、`テスト店2`・`スーパーテスト店`・`テスト店 南口`などの別店を拒否する。未対応も保持する。ページ送り・日付競合・店舗不一致・機種/台ID欠落は完全台帳と認定しない。全台一覧以外の表を設置台帳に読み替えない。

端末dayやbulk exportの再包装は `device-repackaged` とし、数値が整っていてもnative立証済みにしない。plain text、機種別補助表のみ、未対応の原本形式は未検証として保留する。この実装は全既存店日がnative立証できることを保証しない。

### 数値・重複

真の0Gは原本でBB=RB=0を確認し、説明不能な非零差枚がない場合に設置台数へ残す。G/BB/RB欠損、負数、小数回数、BB+RB>G、canonical推定G、native/canonical不一致は保留する。差枚のみ不明・推定なら差枚をnullとしてボーナス入力を使える。

差枚が小数またはsafe整数の範囲外なら、差枚をnullとし `diffIssue:'diff_not_safe_integer'` と `rows[].warnings` / `quality.warnings` の非blocking警告で通知する。正のGとBB/RBが立証済みなら主ボーナス計算は可能で、`provenance.diffObserved:false`。元の非零差枚と0Gの矛盾を先に検査するため、小数差枚を落として矛盾した0Gを中立にすることはない。元値はnative証拠に保持し、差枚不正を隠すために重複を同値化しない。

同一物理台の同値重複は1台にする。矛盾重複は保留し、好調な方や新しそうな方を採用しない。異なる機種名へ割れる重複は関係群の同定も保留する。

`zeroGamesN` は立証済み中立0G、`lowGamesN` は立証済みの `0<G<3000`、`diffN` は信頼できる差枚観測を持つ台数。低稼働表示用の3,000G境界は計算対象の除外条件にはしない。

## 専用結果cache

`new AllocationResultStore({dbPath:null,maxEntries:128,canonicalDbPath:null,maxPayloadBytes:16777216})` は既定でbounded memory。明示的な独立sqliteパスがある場合だけsidecarを作る。canonicalパス・同一inode・canonicalや他用途のtableがあるDBは、cache schemaを作る前に拒否する。canonical migration関数を呼ばない。

`get(key)` / `set(key,result)` の必須keyは `storeId,date,inputHash,rosterHash,modelHash,scopeHash`。追加の版・hash属性も全てcanonical化してkeyへ含める。同日訂正、モデル更新、宣言集合変更でmissとなる。LRU上限をmemory/sqliteの両方で適用し、再open後も件数を制限する。1payloadのbyte上限も持つ。

値はV8 serializationを用い、±Infinity/NaNなどの数値をnullへ変換しない。取得値と保存値はcallerの後続mutationから独立する。旧形式・破損・runtime非互換などで復元できないcacheはmissとして失効する。Node/V8をまたぐ永続archiveではなく、再計算できる専用cacheである。

## TDDと検証

- 初回33件: 未実装exportへのassertで33件失敗を確認してから実装。
- 追加41件: 機種競合・日付競合・source hash欠落・seed集計・非有限値保持・破損cacheの6失敗を確認し修正。
- 最終43件: 日付差分不能の立証flag、5,000行上限、canonical機種名矛盾の3失敗を確認し修正。
- 独立review後49件: 台帳所属と観測の分離、空機種名、前日cap/empty、HTML店名の前後部分一致、機種群単位の保留をfixture化し、6失敗を確認して修正。従来の同一履歴試験は「観測が保留・日付未確認」を維持し、承認された所属契約に合わせ台帳statusを更新した。
- 追加review後53件: PIA/HTMLの任意差枚の小数・safe整数範囲外、0G矛盾維持、不正型の前日rankingをfixture化し、4失敗を確認して修正。
- 新規53件と既存関連18件: **71/71成功、失敗0、skip0**。
- `git diff --check`: 成功。

実行した関連試験:

```bash
node --test \
  vps/tests/allocation-provenance.test.mjs \
  vps/tests/allocation-store-day.test.mjs \
  vps/tests/allocation-results.test.mjs \
  vps/tests/pia-public-collector.test.mjs \
  vps/tests/pia-backfill-once.test.mjs \
  vps/tests/canonical-ingest.test.mjs \
  vps/tests/device-backfill.test.mjs
```

全てtemp fixtureで実行。実DB、本番raw archive、外部source site、運用collectorへ直接アクセスしていない。canonical/header/台行の同日訂正を並行させたfixtureでも旧headerと旧行が同一snapshotになること、読取後もschema・job sentinel・店舗更新時刻が変わらないことを確認した。

## 独立review修正とローカル読取専用exportの確認

reviewで、①PIAの空機種名が台帳完全性の除外理由に含まれていない、②HTML店名の部分一致で別店を受け入れる、③安定した未対応台の観測不明が、全対応群の台帳確認まで妨げる、④前日原本の取得上限・空原本をアンカーとして使える、⑤小数差枚が既存adapterの入力制限で店全体の処理を止める、という境界を修正した。不正型の前日rankingも例外を投げず、証拠不足として保留する。

PIAの台帳行は `membershipVerified`、`observationDateVerified`、`observationVerified` を分けて持つ。全台の所属を確認しても観測が一部未確定なら、`verificationScope:'native-adjacent-membership-observations-partial'` とする。所属自体が未確定なら `native-adjacent-membership-unverified`、両証拠が完備なら従来の `native-adjacent-snapshots`。群の計算可否はその群の全観測と全台数照合で決める。全対応群が計算可能でも未対応台の観測が曖昧なら、全店品質は `partial` とし、全店観測完備を主張しない。

親担当が用意した既存のローカル読取専用exportを、temp DB/rawへ復元して同じ `loadAllocationSnapshot` で検証した。本番への再アクセスはしていない。export内の原本digestも復元時に照合した。

- export SHA-256: `8ec4cfeb5beabaad9978e0701adbe6af5f13688f64e61bc65d251d769568b851`
- 対象営業日: `2026-10-16`
- raw SHA-256: `c0a210697ce1529a44e8e5b72eeef3eeaea22816ca5470173f75a82d83055eb0`
- input hash: `552b8f9b1da6ea074a7de4ad21fb6425763be80e06c97fe38beddda697c3497c`
- 台帳: `verified`、設置107、対応106、未対応1、対応観測106。
- 対応群: my6は58/58、imは24/24、goは24/24。全群 `eligible:true`。
- 3155番台 `Ｌ/緑ドン５/ＦＹ`: 両原本の各30履歴で同じ機種名・コード・元台IDを確認。`membershipVerified:true`、`observationVerified:false` とし、`pia_day_ambiguous` と欠損理由を未対応一覧へ保持。
- 全店品質: `partial`。台帳所属の確認を営業日観測の確認へ読み替えていない。

追加理由codeは `pia_roster_membership_ambiguous`、`pia_previous_snapshot_incomplete`、非blocking警告codeは `diff_not_safe_integer`。既存の数学・q・確率表・強判定の有効化条件は変更していない。
