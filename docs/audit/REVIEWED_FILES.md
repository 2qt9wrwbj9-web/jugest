# 調査した実コード・設定・資料

- `index.html`: 保存/復元、起動、現行bridge定義、Collector・店舗管理・JSON・バックアップ・Sync adapter、旧Relay関数の削除先参照。判別/研究部分は不変性照合対象。
- `app-v510.js`: constructor/FOUC/lifecycle、ホーム、全workspace導線、onInput/onChange/onClick/handleAction、Collector、店舗追加、JSON、records/tag/店舗収支、Sync、backup、error/busy/render。
- `core-v510.js`: createBridge、API公開、subscribe、DOM分離、math bridgeの不変性。
- `sync-core.js`: buildLocalPackage、applyPackage、暗号化/復号、merge、create/join/pull/push/chunk、clientStateと保存キー。
- `ana-launcher.js`: script origin導出、relayPair/claimPair、sender保存、send分割、bridge経路。parserはバイト保持。
- `relay-bridge.html`: message origin検査、same-origin `/api/relay`。
- `api/relay.js`, `api/sync.js`, `api/_node-web.js`: Vercel Node→Web Request/Response。
- `api/_relay-web.js`, `api/_relay-payload-{0,1,2}.js`: packed sourceを展開し、create/claim/status/send/receive/ack/unlink、iOSキー/target、collector push/pull、CORS、保存キーを調査。
- `api/_sync-web.js`: 認証、revision比較、push/pull、chunk commitと競合窓。
- `api/_blob-store.js`: privateアクセス、key prefix、onlyIfNew、get/list/put/delete、無条件overwriteの範囲。
- `build.mjs`, `package.json`, `vercel.json`: 実行ソース、出力、依存、API routing、キャッシュ。
- `app-v510.css`, `site.webmanifest`, `assets/jugest-mark.png`, `deploy-assets/`: レイアウト構造・PWA・現行アイコン再構築とバイト照合。変更なし。
- `hanahana-judge.js`, `missing-inference.js`: 保護対象のバイト比較と既存テスト。式の改変なし。
- `ana-single-day.js`: Vercel基準とのバイト比較。変更なし。
- 基準artifactの `package.json`、既存tests、`BOOKMARKLET_v4860.txt`、`IPHONE_SHORTCUT_SETUP*.txt`、旧Netlify relay/sync: 設計/回帰参照。実行先として復活させない。

# 18観点の横断確認

| 観点 | 確認範囲・結果 |
|---|---|
| 1 説明だけで操作なし | Collector初回・Launcher初回・店舗0件で再現し修正 |
| 2 handlerなし | backup Undoの分岐不足を修正 |
| 3 core未接続 | Collector create/ios/unlinkのbridge接続を追加 |
| 4 到達不能API | RelayとiOSキーの既存機能を再接続 |
| 5 表示と内部状態 | home、pending/linked/invalid、確認日時、エラー回復を修正 |
| 6 状態分岐 | 未連携/待機/期限切れ/401/通信失敗/新着0/初回店舗を確認 |
| 7 reload永続性 | receiverのv1保存、pending再開、Sync/backup gateを検証 |
| 8 disabled | Launcher未計上で受信不能、保存後busy残留を修正 |
| 9 無反応 | global errorとUndo、clipboardを修正 |
| 10 Netlify | active launcher/coreはsame-origin。歴史的fixture/commentと旧配布loaderを区別 |
| 11 Vercel origin | loader/script origin→relay、same-origin sync、bridge、Vercel config確認 |
| 12 Collector/Sync混同 | 保存キー・API・解除対象を分離。UIにも別連携と明示 |
| 13 文言不一致 | 稼働中/正常、Undo範囲、コピー成功を修正 |
| 14 存在しない画面 | action map/rendererと既存UIテストを確認。89 bridge参照の未定義なし |
| 15 古いソース退行 | Production/current/artifact比較、FOUC/iconのハッシュ保持、build入力固定 |
| 16 起動/空状態 | pending復元、home未確認、初回店舗登録を検証 |
| 17 Safari復帰 | pageshow/visibilitychange/poll cleanup/pagehideをVM再現。実機目視は未実施 |
| 18 UI刷新で孤立 | 旧Relay描画依存、CollectorPullのみの新受信、Undo、新規店舗を修正 |

この表は調査の範囲を示します。全操作・全データ組合せの網羅保証ではありません。研究ロジックには変更を加えていません。
