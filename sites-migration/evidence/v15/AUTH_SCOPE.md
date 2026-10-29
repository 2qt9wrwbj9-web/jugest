# 正式認証の移植範囲

独立ACCESS DBのv2 schema確認を維持。店舗/解析DBを渡した場合は拒否。DEV独立session経路と正式認証を混同しない。

保存版15追加：元access/store.mjsの単独viewer session失効・not_found・audit、consumeRateの保持/expiry/reset/同時上限をD1へ移植。rate admissionはatomic UPSERT RETURNING。元専用SQLiteとの合成比較4試験で全session/challenge/audit/rateの対象値を照合。初期testのerror.code期待は元にないためmessage比較へ修正し、その失敗ログも保持した。認証の期待する許否を緩めていない。

未完：第2専用D1 bindingの正式Sites供給interface、session発行API、WebAuthn登録/認証のRP ID・Origin・署名/counter、招待/失効連動、CSRF、全rate適用、既存passkey再登録/回復、正式画面/API統合。今回新しい公開認証routeは追加せず、本番credential/利用者情報は取得していない。

証拠：tests/port-access-sessions.test.mjs、logs/access-expanded.log（初期失敗）、最終port-final.log/github-final.log。元のACCESS DB分離と権限境界は不変。合成token文字列はテスト専用であり本番資格情報ではない。
