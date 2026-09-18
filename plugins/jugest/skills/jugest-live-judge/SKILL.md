---
name: jugest-live-judge
description: Use JUGEST to judge one or many Juggler machines from observed live data, including screenshots showing machine number, machine model, G, BB, RB, and optional coin difference.
---

Use this skill when the user asks for Juggler setting judgement, sends a screenshot of a pachislot data site, asks which current machines look strongest, or provides G / BB / RB / 差枚 values. スクリーンショット・画像からの一括判別を主な利用ケースとして扱う。

## Core rule

Setting judgement is based on the machine data currently in front of the user. 店舗名があっても、PRE v2・店舗傾向・店読みを設定確率へ自動で混ぜない。

Always use the JUGEST `judge_machines` tool for setting probabilities. 設定確率を自分で計算しない。Do not recreate, approximate, or replace JUGEST probability math in the model.

## Screenshot workflow

1. Read the screenshot directly and extract, for every visible row when possible:
   - `tableNo`: 台番
   - `machine`: 機種名
   - `games`: G / 総回転
   - `bb`: BB
   - `rb`: RB
   - `diff`: 差枚 when clearly available
2. Preserve the values exactly as shown. Do not invent unreadable digits. If one field is genuinely unreadable, omit the optional field or clearly mark the affected row rather than silently guessing.
3. Normalize obvious machine-name abbreviations only when the identity is clear from the image or conversation context.
4. Send all readable machines together to `judge_machines`. Prefer one batch call over one call per machine.
5. Use the returned JUGEST values as authoritative for:
   - setting 1–6 probabilities (`q`)
   - expected setting (`expectedSetting`)
   - P4+ (`p4`)
   - P5+ (`p5`)
   - P6 (`p6`)
   - judgement method
6. For a multi-machine screenshot, make the answer fast to scan. Show table number, machine, G/BB/RB, expected setting and P4+ first; add full setting probabilities when useful or requested.

## Difference data

If actual 差枚 is clearly visible, pass it as `diff`; JUGEST may use its current reverse-difference path. If 差枚 is not visible or cannot be read reliably, omit it. Never estimate 差枚 from a graph merely to force the reverse-difference path unless the user explicitly asks for an approximation.

## Store context and PRE

A store name may be used to identify context or to fetch stored information separately, but its presence does not change live setting judgement.

Do not call `get_store_prediction` merely because a store name appears. Use PRE/store-reading tools only when the user asks for PRE, 狙い台予測, 店読み, 店舗傾向, or another store-level analysis. If both live judgement and PRE are shown, keep them visibly separate and do not merge them into a new probability unless JUGEST later exposes an explicit combined model for that purpose.

## Safety against stale or mixed inputs

Treat each screenshot or explicitly supplied dataset as the current observed input. Do not silently combine machine counters from different timestamps, screenshots, or days unless the user indicates they belong together. If newer data for the same table is present, prefer the newer complete row rather than summing snapshots.
