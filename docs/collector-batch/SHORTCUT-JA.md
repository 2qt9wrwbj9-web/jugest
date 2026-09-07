# 「JUGEST オート取得」batch版への変更手順

この手順はPreview用です。ProductionのURLへ切り替えるのは、別途反映を
承認した後です。今回iPhoneの設定・既存オートメーションは変更していません。

## 先に確認する制約

APIは「1件失敗しても残りを保存」「同じ送信の再試行」「部分送信」に対応します。
標準ショートカットの「URLの内容を取得」自体が通信例外で停止した場合、その後の
「もし」で例外を捕捉して繰り返しを続けることは保証できません。
受信できたエラーページ・空本文は、以下の繰り返しを続行できます。
通信例外まで同じ起動内で必ず続行する要件は、実機での確認と取得方式の決定が
残っています。存在を確認できない「エラーでも続行」設定は案内していません。
追加アプリや、画面を開く必要があるコールバック方式は勝手に採用していません。

現在Blobが停止しているため、この手順による実ページの取得・保存は未検証です。
PreviewのCollectorは専用名前空間を使用し、Production用キーを流用できません。
Blob復旧後にPreviewで発行するキーを使用してください。

## 1. 共通値

既存ショートカットを複製し、名前を「JUGEST オート取得 Preview」にします。
冒頭に「テキスト」を2つ置き、「変数を設定」で次の名前を付けます。

| 変数 | 値 |
| --- | --- |
| 送信先 | 最終レポートのPreview URLの末尾に `/api/relay` を付けたURL |
| Collectorキー | 同じPreviewのJUGESTで発行したキー |

キーはJSONの値として渡します。URLのクエリやページ取得URLには付けません。
本文を「テキスト」へ手作業で埋め込んでJSONを組み立てず、「辞書」と
「URLの内容を取得」のJSON本文を使用してください。改行や引用符を正しく送れます。

## 2. 最大5件を依頼

「URL」→「URLの内容を取得」を追加します。

- URL：変数「送信先」
- 方法：POST
- 本文：JSON
- `action`（テキスト）：`iosCollectorNextBatchV3`
- `collectorKey`（テキスト）：変数「Collectorキー」

送られる内容：

```json
{"action":"iosCollectorNextBatchV3","collectorKey":"発行されたキー"}
```

返答例：

```json
{
  "ok": true,
  "state": "RUN",
  "batchId": "その回の識別子",
  "expiresAt": 1788756000000,
  "betweenJobsSeconds": 2,
  "maxPushBytes": 4000000,
  "jobs": [
    {"jobToken":"取得用の識別子","shop":"店舗名","sourceStoreId":"店舗ID",
     "date":"2026-09-06","url":"https://ana-slo.com/2026-09-06-example-data/"}
  ]
}
```

「辞書の値を取得」で `state` を取り出し、「もし」で分岐します。

- `RUN`：`batchId` を変数「今回ID」に保存。`jobs` を変数「取得一覧」に保存。
- `WAIT`：この起動を終了。`waitSeconds` 秒間ずっと待つ必要はありません。
  次の15分枠で再度依頼します。別の起動が処理中の場合もWAITになります。
- `DONE`：この起動を終了。取得対象がないか、その範囲を取得済みです。
- `ok` がfalse：その回を終了して返答の `message` を確認。自動連打しません。

## 3. 各ページを順番に取得

空の「リスト」を作り、変数「送信結果」に設定します。
「各項目を繰り返す」の入力を「取得一覧」にします。

繰り返しの中に、次の順序で配置します。

1. 「辞書の値を取得」で「繰り返し項目」の `url` を取得し、「取得URL」に保存。
2. 同じく `jobToken` を「取得ID」に保存。
3. 「もし：繰り返しインデックスが1より大きい」内に「待機：2秒」を置く。
   0〜30秒のランダム待機や、1件ごとのNext依頼は置きません。
4. 「URL：取得URL」→「URLの内容を取得：GET」。Collectorキーは付けません。
5. 従来使っていたページ本文のテキスト化を維持し、「本文」に保存。
   行・見出し・店舗名・日付を削除したり、台数を間引いたりしません。
6. 「もし：本文に値がある」では、次の「辞書」を作る。
   `jobToken`＝取得ID、`text`＝本文、`fetchUrl`＝取得URL。
7. 「その他」では、次の「辞書」を作る。
   `jobToken`＝取得ID、`error`＝`empty_input`、`fetchUrl`＝取得URL。
8. 辞書を「変数に追加」で「送信結果」に追加。

400/403などのエラーページを本文として受け取れた場合も、本文をそのまま
`text` として加え、次の項目へ進みます。JUGEST側の既存検査がその1件だけを
失敗にします。返ってきたページの日付や店舗が違う場合も保存されません。
取得手段がエラー情報を値として返せる場合は、`error` に短い説明を入れます。

## 4. 成功・失敗を一括送信

繰り返しの外に「URL：送信先」→「URLの内容を取得：POST／JSON」を追加します。

| キー | 種類・値 |
| --- | --- |
| action | テキスト：`iosCollectorPushBatchV3` |
| collectorKey | テキスト：Collectorキー |
| batchId | テキスト：今回ID |
| results | 配列：送信結果（辞書のリスト） |

例：

```json
{
  "action":"iosCollectorPushBatchV3",
  "collectorKey":"発行されたキー",
  "batchId":"Nextで受け取ったbatchId",
  "results":[
    {"jobToken":"1の取得ID","text":"1のページ本文","fetchUrl":"1のURL"},
    {"jobToken":"2の取得ID","text":"2のページ本文","fetchUrl":"2のURL"},
    {"jobToken":"3の取得ID","error":"fetch_failed","fetchUrl":"3のURL"},
    {"jobToken":"4の取得ID","text":"4のページ本文","fetchUrl":"4のURL"},
    {"jobToken":"5の取得ID","text":"5のページ本文","fetchUrl":"5のURL"}
  ]
}
```

返答は `state: PROCESSED`、`saved`（今回保存）、`failed`（今回失敗）、
`duplicates`（以前処理済み）、`results`（各件の結果）です。
外側の `ok: true` は「送信処理が完了した」という意味で、全件成功という意味では
ありません。失敗日だけがサーバーの再試行候補になります。
同じbatchId・jobTokenで再送しても、成功済みの設定や日付を重複保存しません。

送信本文はJSON全体で4,000,000バイト以内です。大きい本文を切り詰めてはいけません。
必要なら「送信結果」を1〜2件ずつに分け、同じ `batchId` で複数回Pushします。
分割時は保存操作が増えますが、整合性を優先します。単独1ページでも上限を超える
場合は、そのjobを `error: input_too_large` として送り、個別に確認します。

## 5. 途中終了・送信失敗への備え

サーバーが保存を確認した日は再取得しません。まだサーバーへ送れていない本文は、
端末を終了すると失われ得るため、次の未送信ファイル方式を推奨します。

1. 初回だけ「このiPhone内／Shortcuts」に `JUGEST` フォルダを作る。
2. NextのRUN後、今回ID・expiresAt・空の送信結果を辞書にし、
   「ファイルを保存」で `JUGEST/pending.json` に保存（保存先を尋ねるOFF、上書きON）。
   Collectorキーはファイルに含めず、POST時に現在のキーを付けます。
3. 各GETの直前に「取得中のjobTokenとURL」を同じ辞書へ記録して上書き。
   GET後は本文または失敗を「送信結果」へ追加し、取得中の印を消して上書き。
4. 次回起動の冒頭で「フォルダの内容を取得」→「ファイルにフィルタを適用：
   名前がpending.json」→件数が1ならファイルを読み、「入力から辞書を取得」。
   Nextを呼ぶ前に、保存されている結果を同じbatchIdでPushする。
   取得中の印だけ残っていれば、そのjobを `error: interrupted` として加える。
5. `PROCESSED`を受信した結果は送信済み。未送信ファイルを削除して終了。
   通信に失敗したらファイルを残し、同じ内容を次回再送する。

このファイル方式はiPhone実機未検証です。端末で同じショートカットを並行実行
しないでください。サーバー側の競合保護はありますが、端末ファイルの同時上書き
まで保証するものではありません。

未送信のjobは発行から20分で期限切れになります。`job_expired`、`job_cancelled`、
`job_missing`、`lease_conflict`を受けた結果はそのtokenで再試行せず、次回Nextで
サーバーに選ばせます。未取得分だけが再発行されます。
期限内に届かなかった未送信本文まで、保存済みとみなすことはできません。

## 6. 15分ごとの起動

旧3分オートメーションと新しいオートメーションを同時に有効にしません。
本番切替前の今回は、複製したPreview版を手動実行する段階に留めます。

承認後は「オートメーション」→「時刻」→「毎日」→「すぐに実行」で、
対象時間帯の `毎時00／15／30／45分` に「ショートカットを実行」を設定します。
標準の時刻トリガーには、確認できていない「15分おき」を1つ選ぶ手順は書いて
いません。必要な時刻ごとに設定します。24時間なら96枠です。
15分の待機を挟んだ無限ループで代用しません。

## 参照

- Apple：APIへのPOSTとJSON本文
  https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios
- Apple：時刻トリガー（Daily / Weekly等）
  https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/ios
- Apple：ショートカットの停止とエラー
  https://support.apple.com/guide/shortcuts/shortcut-completion-apda9578f70f/ios
- Apple：x-errorコールバック（今回の自動取得には未採用）
  https://support.apple.com/guide/shortcuts/use-x-callback-url-apdcd7f20a6f/ios
