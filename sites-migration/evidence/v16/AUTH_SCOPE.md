# 保存版16 認証の実装境界

専用ACCESS D1アダプターを維持。通常の店舗DBとの混在禁止・guard、元session hash/期限/失効/challenge一度限り/rate limitは既存回帰を維持。今回lookupEnrollmentのformat/hash/kind/used/revoked/expires/additional issuer active条件とputChallengeの元type/UUID/期限/label/channel/token hash validationを追加し元SQLiteの保存項目と比較した。UUID自体はランダムなので値を同一視せず、形式/永続値/lookup対応を比較する。

合成credential hashだけを試験用memory DBへ投入。本番credential/passkey/tokenを利用・コピーせず、公開enrollment発行/invite/登録/再認証/WebAuthn APIを有効にしない。DEV sessionは既存独立検証環境限定。正式Origin/CSRF/失効/権限をDEVで代用しない。

未完：第2専用D1の正式提供interface、enrollment/invite発行と管理、WebAuthn ceremony/RPID/新originでの端末再登録・復旧、正式session発行、全access route統合。U-ACCESS-BINDING/B-AUTHを未解消のまま維持。
