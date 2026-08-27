v4.6.0 practical ranking + 2-day history
2026-08-25

What changed
- Strict validated P4+/Champion remains the conservative statistical layer.
- A separate practical ranking engine now orders morning targets using shrunk emerging evidence.
- Exact table-number history can contribute to practical ordering without being called a validated law.
- The short-history prediction window is 2 days, not 3 days. Two-day transition features are intended to
  preserve yesterday-dip -> raise and one-day-high -> hold patterns that a 3-day average can smear out.
- AI extension payload v3 exposes strict rejection reasons and practical ranking diagnostics.

What did NOT change
- externalJudge / reverseCore judgement mathematics.
- HANA judgement probability tables or hard constraints.
- Launcher acquisition/parser logic, PARSER_VERSION 4500, or the 30 requests / trailing 30 minutes limiter.
- The strict Champion acceptance thresholds.
- No external AI/API was introduced.

Operational note
- Existing BOOKMARKLET_v4500 remains correct.
- Deploy the whole Netlify project as before.
