# Maruhan collector — alternative source feasibility (2026-10-12)

This checkpoint is for a **non-production** experiment. No daily collection, background job, production deployment, API credential usage, or new ingestion has been authorized or performed.

## Goal
Find a sustainable, inexpensive, iPhone-independent way to collect individual slot machine results (date, store, machine label, machine number, G, BB, RB, estimated net difference) for the publicly viewable Maruhan Kawasaki Sakuramoto shop.

## Results from one-off public source inspections
| Source | One-off visibility | Essential fields | Restriction / blocker | Decision |
|---|---|---|---|---|
| Maruhan official app | Legitimate Android package launches, guest registration is possible | Official in-app machine data nominally available for 7 days | Startup performs Google Play Integrity verification. Sideloaded emulator displays a data retrieval error; no machine rows obtained. Do not impersonate installer or bypass verification. | No working collector |
| Pekasen | Single public HTML read for 2026-10-10 contained 90 machine types and all 510 unique slot positions | G / BB / RB / estimated diff; grape is estimated | https://pekasen.com/terms expressly prohibits automated **large-scale** collection by bots/crawlers; derived data rights reserved. Robots excludes historical year and individual unit paths. | Best *technical* fit but permission required before recurring ingestion |
| Min-repo | Shop index listed 2026-10-10 report at https://min-repo.com/3401582/ | Individual reports can display G/BB/RB/diff on other days | VPS received a 408-byte JavaScript check instead of report; do not automate past challenge. Permission for recurring collection unverified. | Not usable automatically |
| Pachislo shop Michishirube | Public HTML returned; single shop page view | Machine #, G, estimated diff; **no BB/RB** in observed page | robots.txt: `Disallow: /*.json$`, `Disallow: /store-day-results.html`; website data too limited for JUGEST discrimination | Not sufficient |
| Ana-slo | Existing historical pages and previous JUGEST collector integration | Some historic daily records include G/BB/RB/diff | Existing fragile operational collection and automated access restrictions; not treated as fresh independent solution. | Existing fallback only |
| Official Maruhan/P-WORLD storefront | Open web, shop specs and machine roster | Not per-machine daily BB/RB/diff | Not a machine-result feed | Roster only |

## Requests for permission (not sent)
**Pekasen contact:** https://pekasen.com/contact (Google Form, name, required reply email, required message)
**Maruhan app support:** support-app@s.maruhans.net (Google Play official support listing)

Suggested source-permission inquiry (Japanese):

> 個人で非公開のパチスロ実戦分析ツールを開発しています。貴サイトで公開されている店舗・営業日・台番号ごとのG数、BB、RB、差枚の情報について、個人利用を目的として、指定の1店舗につき営業終了後に1日1回程度の自動取得と、自分の非公開データベースへの保存を許可いただくことは可能でしょうか。外部公開・再販売・大量の高頻度アクセスは行いません。禁止事項を拝見した上で事前に確認しています。許可可能な範囲、必要なクレジット表記、取得頻度やAPIの提供可否などをご教示いただけますと幸いです。

Never submit this inquiry or a third-party form without explicit user approval and suitable reply contact. A single store × 510 units/day accumulates substantially over time; do NOT assume that the site's prohibition on automated **large-scale** collection exempts one daily HTML request.

## Recommended next milestone
1. Ask user if a permission inquiry to Pekasen and/or Maruhan may be sent; obtain sender name and reply address.
2. If authorized, clarify allowable programmatic access, field retention, scope, and reuse before implementing any recurring source adapter.
3. If permission not granted, use official documented licensed providers, or user-controlled manual app export. Investigate legitimate business data partnerships if needed.
4. Keep extractor design source-agnostic, auditable, immutable raw evidence, provenance labels, date snapshots, field-level trust, and failure/backoff. No new source writes into JUGEST production without a separate explicit request and pre-deploy consent.
