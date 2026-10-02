# Independent judgement page v1

Development base: `codex/cloud-dev-baseline-20261003` at
`011ca7a9418ef9d8e68a8b8d4259146a2d6a2bfd`.

The second navigation tab, 判別, supports single and parallel observed-data
judgement for the eight existing Juggler machines. Drafts and results stay in
application memory. Only the workspace, mode and local debug display preference are restored after reload.

`JUGEST_CORE_BRIDGE.judgeObservedMachine(input)` validates observations and calls
the existing `externalJudge` exactly once. Its optional diagnostic capture
receives already-computed values without changing probabilities. No sessions,
store context, records or domain autosave are changed. The MCP's existing
posterior summary is shared through `judgement-model.js`; its response contract
is unchanged.

Required input: `machine`, `games`, `bb`, `rb`. Optional: `tableNo`, `diff`.
Games must be positive safe integers; bonus counts must be nonnegative safe
integers. Blank bonus counts are not zero. A missing difference remains `null`.
Actual engine methods, including `bonus-only`, are shown in the UI.

`document.querySelector('jugest-app').acceptMachineRows(rows, {append:false})`
fills drafts without judging. One row selects single mode; multiple rows select
parallel mode. `{append:true}` appends to parallel drafts. Rows use the input
keys above; keys are exact existing machine IDs, not guessed aliases. Future
OCR callers must complete their review step before calling this interface.

Displayed concentration calls the existing `trendConfidence(q)`. It describes
probability concentration, not accuracy. No new contribution or confidence
formula is introduced. Reference bonus rates are only displayed, not fed back.

Display levels:

- Ordinary results retain probabilities, concentration and observed bonus rates.
- “詳細分析を見る” retains method, style, warnings and estimated grape count/range.
- Settings → “高度なデバッグ情報を表示” defaults to OFF. Only ON adds the
  collapsed “開発者情報” containing log likelihoods, setting-specific reverse
  rows, technical identifiers and a separately collapsed table JSON.

The preference is a boolean `observedDebug` in the existing localStorage UI key
`jugest:v510:ui`. It is excluded from domain IndexedDB, records and sync.
Switching it only renders existing results; neither judgement nor reverse
calculation runs again. No diagnostic capture is removed.

Validation:

```sh
npm test
npm --prefix vps test
python3 tests/judgement-page-browser.py
```

The browser regression serves only loopback fixtures and blocks all nonlocal
requests. It tests built and VPS-patched delivery at 320, 375 and 390 pixels, including
both debug states in single/parallel mode and persistence after reload.
Set `JUGEST_TEST_NODE` for a specific Node binary, and optionally
`JUGEST_SCREENSHOT_DIR` to save screenshots outside the repository.

Original production hash fixtures remain unchanged. Preservation tests remove
only the approved UI additions and diagnostic taps before comparing those
hashes. All other existing math, collection, prediction and persistence code
remains protected.

OCR and HANA UI support are outside v1. No production deployment is included.
