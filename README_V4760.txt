# v4.7.6 — Hybrid ranking unification

This release fixes the split between the visible 「次回狙い台」 forecast and the AI JSON `targets` ordering.

## What changed
- One final hybrid ranking is now computed in `v4PredictStore()` and reused by both the screen forecast and AI JSON.
- Hybrid weight: practical single-condition signal 55%, existing v4 model/root signal 30%, strict calibrated P4+ signal 15%.
- A positive already-validated calendar-memory match can add at most +5 points.
- The practical side intentionally retains machine identity; the legacy v4 root side intentionally keeps its previous `machineIdentity` exclusion. This preserves complementary information instead of counting the exact same root twice.
- The screen shows the same final order and exposes the practical/model/strict component values.
- AI JSON exposes `hybridScore`, `hybridComponents`, practical-root audit fields, and the same target ordering.

## Unchanged
- Strict Champion eligibility/gates.
- Calibration math.
- Store-share constraint.
- Juggler/HANA judgement mathematics and HANA hard constraints.
- Launcher/parser/relay protocol.
- Single-day companion bookmarklet.
- v4.7.5 trend-roster lazy behavior.

Launcher remains 4.5.0 / parser 4500.
