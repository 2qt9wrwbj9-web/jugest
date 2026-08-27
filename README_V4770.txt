# v4.7.7 — walk-forward hybrid weighting

- Screen ranking and AI JSON still share one final order.
- Practical/model/strict mixture is no longer hard-coded as the claimed optimum. With enough real local history, up to 8 chronological walk-forward checkpoints from the recent 84-day window are built.
- Each checkpoint is predicted only from earlier dates. A 5% simplex grid is tuned on the earlier 67% of checkpoints, then tested on the later holdout.
- Holdout failure or fewer than 6 usable checkpoints falls back to v4.7.6's conservative 55/30/15 prior. Accepted learned weights are shrunk toward that prior according to sample support and holdout advantage.
- Objective: combined Top3/Top5/Top10 lift in expected setting and P4+ versus that day's store baseline.
- strict Champion, calibration, store-share constraint, single-evidence math, Juggler/HANA judge formulas, Launcher and single-day companion are unchanged.
