# 正式認証の保存層: 部分移植

lib/access/d1-sessions.mjsは元access v2 schemaに対するD1 session照合/最終使用更新、admin/viewer失効、credential/invite連鎖失効とaudit、challenge一度限りの消費を実装。元token形式/expiry厳密境界/null無期限を維持。WebCrypto SHA256。合成SQLite→独立D1の同じv2 schema/rowsで2試験成功。競合challengeは1回だけ成功し元の返却used_at:nullと一致。既存v1のNOT NULL expiry/duration schemaは拒否。

対象は9つの元アクセス表のみ。D1内部_cf_METADATAを許可し、canonicalその他混在DBは拒否。現行canonical D1へ認証表を混在させない。第二bindingのSites provisioningはU-ACCESS-BINDINGで未確認。

公開route/binding/セッション発行/WebAuthn登録/認証ceremony/管理画面/OAuthへは未接続。開発専用認証は変更していない。正式認証完成ではない。秘密値、実資格情報、利用者データを使わず乱数の合成テストのみ。公開成果物に実トークンを記録しない。
