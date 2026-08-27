v4.7.8 — runtime hardening for hybrid ranking / brute analysis

- Ordinary prediction no longer runs the expensive walk-forward hybrid-weight learner.
- Per-shop learned hybrid weights are persisted in the normal app state and reused while the store-data signature is unchanged.
- Missing/stale profiles use the conservative fallback until the user presses 「配合を再学習」.
- Explicit relearning runs historical checkpoints one at a time and yields between checkpoints to reduce Safari memory/CPU bursts.
- Historical replay remains leakage-safe and may explicitly force isolated walk-forward optimization.
- Brute analysis clears prediction-only runtime caches before execution.
- Finishing brute analysis no longer immediately launches the full digital-twin prediction; this removes the avoidable post-analysis spike that could make even single-condition analysis crash.
- Single/2/3-condition catalogs, strict Champion, calibration, store-share constraint, Juggler/HANA judgement math, relay protocol and Launcher are unchanged.
