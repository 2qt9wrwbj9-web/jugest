# Task 2 report — validated axis registry and JUGEST row adapter

## Scope

Implemented only:

- `research/axis-auto-selector/registry.mjs`
- `research/axis-auto-selector/jugest-adapter.mjs`
- `tests/axis-auto-selector-registry.mjs`

No current runtime, protected math, Collector, Sync, dependency, build, or test-command registry was changed. Controller-owned documentation remains unstaged.

## TDD evidence

### RED

Command:

```text
node --test tests/axis-auto-selector-registry.mjs
```

Observed expected failure before production files existed:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../research/axis-auto-selector/registry.mjs'
tests 1
pass 0
fail 1
```

The failure was caused by the missing Task 2 module, not by a test typo.

### GREEN

Focused command after the minimal implementation:

```text
node --test tests/axis-auto-selector-registry.mjs
```

Observed:

```text
tests 9
pass 9
fail 0
```

Fresh allowed registry plus baseline-parity verification:

```text
node --test tests/axis-auto-selector-registry.mjs tests/axis-auto-selector-parity.mjs
```

Observed:

```text
tests 12
pass 12
fail 0
cancelled 0
skipped 0
todo 0
```

## Exact public API

### `DEFAULT_AXIS_DEFINITIONS`

A deeply immutable array of four frozen descriptors in stable order: `practical-v1`, `model-v1`, `strict-v1`, `calendar-v1`. Every descriptor exposes:

```js
{
  id,
  label,
  version,
  approved,
  sourceId,
  sourceField,
  aliases,             // frozen string array
  scope,
  minHistory,
  availability,
  audit,
  correlationGroup,
  maxWeight
}
```

The three approved descriptors map one-to-one to `practicalSignal`, `modelSignal`, and `strictSignal`. `calendar-v1` is `approved:false`, has `sourceField:null`, has availability `unavailable-phase-1`, and therefore always adapts to `null`. `sourceId` is the canonical identity for source/alias vote deduplication; `aliases` carries additional stable legacy identities if needed.

### `createAxisRegistry(input?)`

Accepted inputs:

```js
createAxisRegistry()
createAxisRegistry(definitionArray)
createAxisRegistry({definitions: definitionArray, correlationGroups})
```

The array form uses the built-in declared correlation-group schema. Custom group names use the options form with `correlationGroups: [{id, maxWeight?}]`. An axis referencing an undeclared group is rejected. Axis and group `maxWeight` values must be finite numbers in `[0,1]`; axis versions must be positive integers. Duplicate axis/group IDs and malformed required metadata are rejected.

Return value (frozen, with the internal `Map` retained only in closure):

```js
registry.get(id)       // frozen descriptor or undefined
registry.has(id)       // boolean
registry.list()        // frozen array of every descriptor
registry.approved()    // frozen array filtered by approved === true
registry.groupCap(id)  // declared numeric combined cap, otherwise null
registry.groupCaps()   // frozen {groupId: cap} object, explicit caps only
```

Default explicit combined group caps are `{ "calendar-model": 0.2 }`; the three distinct approved groups have no extra combined cap beyond each descriptor's `maxWeight:1`.

### `axisSignalsFromPredictionRow(row, registry)`

Returns a frozen row with frozen `axes`:

```js
{
  key,                 // existing non-empty row.key, else `${machine}|${tableNo}`
  controlRank,         // exact finite row.rank
  controlScore,        // exact finite row.hybridScore; never aimScore
  fixedBonus,          // exact finite row.hybridValidatedBonus, else 0
  axes,                // every registry id; exact finite source value or null
  actualES,            // exact finite optional outcome or null
  actualP4             // exact finite optional outcome or null
}
```

The adapter reads already-produced values only; it contains no practical/model/strict formula. Missing, non-number, `NaN`, or infinite signals/outcomes become `null`. Calendar remains `null` regardless of row contents. Invalid bonus becomes `0`. Required identity, rank, or control score fails closed with `TypeError` rather than inventing a numeric value.

## Self-review

- Default approval policy is exactly three approved axes plus unapproved calendar.
- Source values are not rounded, normalized, recomputed, or coerced from `null` to zero.
- The validated calendar bonus is preserved exactly once as `fixedBonus`, outside `axes`.
- Registry inputs are snapshotted; later mutation of caller-owned arrays/objects cannot mutate registry state.
- No mutable `Map` or mutable descriptor/list/caps object is exposed.
- Duplicate IDs, invalid versions, invalid weights, and unknown correlation-group references are covered by focused tests.
- Shared `sourceId` values remain visible so the selector can prevent aliased axes from receiving duplicate vote weight.
- Optional outcomes remain separate fields for Task 3's prediction-field whitelist and later outcome attachment.

Concern for integration: callers creating non-default groups must use the object input and explicitly declare those groups. This is intentional fail-closed behavior. Required malformed control fields throw; Task 3 should catch/reject such rows at its receipt boundary rather than treating them as rank/score zero.

Implementation commit: `7b055ff` (`feat: add approved shadow axis registry`).
