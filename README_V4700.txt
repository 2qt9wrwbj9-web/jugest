JUGGLER / HANA HANA TOOL v4.7.0 — SINGLE-CONDITION EVIDENCE ENGINE
Date: 2026-08-25

PURPOSE
-------
v4.7.0 changes the center of store analysis from “find a small number of complicated certified patterns”
to “scan a very large amount of history for many simple reasons quickly, measure each reason alone,
and attach the useful reasons to tomorrow's tables.”

The intended user workflow is practical store-reading. A reason can be simple and still valuable if the
historical evidence is broad and repeatable. Examples include prior-day dip -> raise, high-setting hold,
prior-day difference, 2/5/7/14-day difference slump, previous-setting state, special dates, weekday,
exact table number, table ending and machine context.

WHAT IS NEW
-----------
1. Single-condition analysis is the default and recommended mode.
   - 店舗解析 has a dedicated 「単一根拠」 tab.
   - Fresh state defaults to 「単一条件のみ（最速・推奨）」.
   - 2-condition / 3-condition exhaustive search remains optional auxiliary analysis.

2. Broad pre-declared single-condition catalog.
   - Calendar: weekday, date ending, exact day-of-month, month phase, week-of-month, nth weekday,
     last weekday, double dates.
   - Table: exact table number, last digit, last two digits, numeric block, parity.
   - Previous day: inferred setting, difference, G, BB/RB/zero-bonus, bonus rates/bias/extreme state.
   - Short/medium history: 2 / 5 / 7-day setting/difference state, loss/high/zero-bonus counts,
     average games and bonus behavior.
   - Explicit cumulative-difference thresholds for 2 / 5 / 7 / 14 days.
   - Explicit average-setting and average-P4+ thresholds for 2 / 5 / 7 / 14 days.
   - Streak / days-since-high / days-since-win.
   - Same weekday (7 days ago) difference/setting state.
   - Machine/store recent context.
   - New v4.7 single engine intentionally does not use legacy 3-day short features.

3. Every simple reason is evidence-backed on its own.
   Each result carries:
   - sample days and rows,
   - condition prevalence,
   - expected-setting difference,
   - P4+ difference,
   - chronological discovery -> confirmation effect,
   - OOS win rate,
   - 6-block time reproducibility,
   - FDR q as a diagnostic,
   - recent 30/60/90-day effect,
   - confidence and shrunk practical contribution.

4. Practical use is not blocked by strict FDR certification.
   - Discovery/confirmation direction must be consistent to contribute.
   - p/q, sample size, effect size, OOS/block repeatability and recency shrink contribution continuously.
   - FDR is shown as evidence quality, not used as an all-or-nothing gate for morning ranking.
   - Reversing/unstable evidence contributes zero.
   - Conditions applying to almost every row receive a contrast/prevalence penalty so a tiny leftover
     control group cannot create an oversized practical signal.

5. Duplicate evidence is controlled without making the reasons complex.
   Nested thresholds from one family are evaluated independently, but only the best supported member of
   the family contributes to a table's aggregate score. For example, 7-day cumulative difference <=-3000,
   <=-5000 and <=-7000 may all be tested; they are not blindly triple-counted.

6. Morning ranking is single-evidence-first.
   - Strict P4+/Champion remains a separate probability/certification layer.
   - v4.7 morning order primarily uses the simple reasons that are active for that table today.
   - The v4.6 complex/emerging model is retained only as a secondary fallback/tie-breaker.
   - 「次回狙い台」 no longer requires old complex-pattern S/A certification before showing a practical shortlist.

UNCHANGED ON PURPOSE
--------------------
- externalJudge and Juggler setting-discrimination mathematics.
- HANA HANA setting-discrimination formulas and hard constraints.
- Strict Champion eligibility gate and strict P4+ probability path.
- Calibration, store-share constraints and strict move-comparison safety behavior.
- Acquisition parser, relay and rolling 30 accesses / trailing 30 minutes limiter.
- Launcher VERSION 4.5.0 / PARSER_VERSION 4500.
- BOOKMARKLET_v4500 remains the correct bookmarklet.

IMPORTANT INTERPRETATION
------------------------
A simple reason being displayed does not mean “this law is proven.” v4.7 separates practical evidence
from strict certification. The point is to let a human see many understandable, quantitatively supported
store-reading reasons instead of throwing every non-Champion signal away or hiding it inside a complex cross.
