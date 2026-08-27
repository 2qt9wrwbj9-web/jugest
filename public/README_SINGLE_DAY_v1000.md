# アナスロ 単日データ取得ブックマークレット v1.0.0

- 対象: ana-slo.com の日別データページ (`YYYY-MM-DD-店舗名-data/`)
- 今開いている1日分だけをDOMから解析。追加のアナスロ通信なし。
- 対象機種: Juggler 8機種 + HANA HANA 5機種（Launcher v4.5.0 / parserVersion 4500 と同じalias/parser core）
- 出力: `juggler-external-import-bulk` version 5、1日分。既存ツールの外部JSON取込と互換。
- 長期取得、IndexedDB保存、Relay、30回/30分カウンタは使用しない。

## 使い方
1. `ana-single-day.js` を `https://2qt9wrwbj9-web.github.io/jugest/ana-single-day.js` として配置。
2. `BOOKMARKLET_SINGLE_DAY_v1000.txt` の1行をSafariブックマークのURL欄へ貼る。
3. アナスロの日別データページを開き、読み込み完了後にブックマークレットを実行。
4. 「JSONをコピー」または「共有 / ファイル保存」。
