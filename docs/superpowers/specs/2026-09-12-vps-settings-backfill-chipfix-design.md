# JUGEST VPS Settings / Backfill / Analysis Chip Design

## Goal

Ship three related production fixes without changing protected judgment or ranking semantics:

1. A failed analysis chip disappears after the user opens its details, while the error remains visible on the analysis screen.
2. Existing iPhone-resident `externalDays` can be backfilled into the VPS canonical store and used by VPS analysis.
3. Collector connection/key setup moves out of the Data > 自動取得 screen into a new Settings flow reached from a top-left gear icon styled like the existing bell.

## Constraints

- Do not change Juggler/HANA probability tables, `externalJudge`, single-evidence math/catalog, strict Champion, Calibration, store-share constraint, HANA hard constraints, or ranking/prediction semantics.
- Keep the existing VPS canonical store authoritative.
- Device backfill must never overwrite a canonical day that already exists on VPS.
- Backfill must be authenticated with the existing iPhone Collector key and scoped to that Collector channel.
- Backfill provenance must be explicit (`device-indexeddb-backfill-v1`) and must not pretend to be an ana-slo raw fetch.
- Raw source HTML is unavailable for historical device-only data, so immutable archive content for backfill is canonical JSON, not fabricated HTML.
- Existing Collector NextV2/PushV2 and 30–90 second pacing remain unchanged.

## Architecture

### UI integration

The canonical `app-v510.js` remains untouched. VPS serves `index.html` through a deterministic source patch that:

- injects `vps-ui-enhancements.mjs`, and
- exposes a read-only bridge method returning a cloned snapshot of local `externalDays` for migration.

The enhancement module attaches to the existing `<jugest-app>` shadow root and re-applies its additions after app re-renders. It adds the left gear button, Settings pages, the backfill card, hides Collector connection setup from the Auto Fetch screen, and acknowledges failed analysis chips.

This keeps the protected application runtime unchanged and confines VPS-only UI behavior to an auditable module.

### Failed analysis chip

When a chip whose visible text is `解析失敗 / 詳細を見る` is tapped, the enhancement stores a session-scoped fingerprint and immediately hides it. Re-renders keep the same failed chip hidden. A running or completed chip clears the acknowledgement so future analysis results are visible.

### Settings / Collector

The top-left gear uses the same `icon-btn` visual language, SVG sizing and stroke weight as the existing notification bell. Gear opens a Settings page; Collector settings is a child page reachable only from Settings.

Collector settings reuses the existing Collector bridge actions (`data-collector-pair`, `data-collector-ios`, `data-collector-unlink`) so key rotation/link/unlink semantics do not fork.

Data > 自動取得 keeps operational status, target controls, refresh/receive, and store management, but the large connection/key panel is removed. Other direct UI links that specifically say “Collectorを連携する” are hidden so connection settings are entered from Settings only.

### Device backfill API

Add Relay action `iosCollectorBackfillV1` to the existing Collector authenticated action set. It uses the Collector sender key, resolves the authenticated channel and matches each incoming day to a configured Collector target by normalized shop name.

Request shape:

```json
{
  "action": "iosCollectorBackfillV1",
  "collectorKey": "...",
  "days": [
    {"date":"YYYY-MM-DD","shop":"...","sourceUrl":"...","capturedAt":"...","machines":[]}
  ]
}
```

Maximum batch size is 30 days. Per-day results are returned so the client can resume safely.

### Canonical ingest policy

A dedicated `ingestDeviceBackfillDay()` path writes only missing canonical days.

- Existing same-hash day => `duplicate`.
- Existing different-hash day => `conflict` and preserve the VPS copy.
- Missing day => archive canonical JSON immutably, insert `store_days` + `machine_day_data`, and mark store analysis dirty.

Store metadata for an existing store is not replaced with backfill provenance.

## Error handling

- Missing/invalid Collector key => existing 401 behavior.
- Unconfigured shop => per-day `store_not_configured` result; other days continue.
- Invalid day payload => per-day `invalid_day`; other days continue.
- Server ingest failure => per-day `server_error`, response remains structured.
- Client migration shows progress and totals for inserted / duplicate / conflict / skipped / failed.
- Migration can be run repeatedly; it is idempotent for already-present days.

## Testing

- Unit tests for backfill canonical ingest: insert, duplicate, conflict-preserves-existing.
- Relay tests for authentication, target matching, batch limit, and per-day continuation.
- Source-patch/static tests proving the Settings module is injected and the bridge exposes local days.
- UI enhancement static tests proving gear, failed-chip acknowledgement, Collector panel removal, and backfill action hooks are present.
- Existing root and VPS suites must remain green before `deploy/vps` is advanced.

## Deployment

Implement on `sol/vps-settings-backfill-chipfix`, verify full suites, then fast-forward `deploy/vps` without force. The existing VPS deploy timer will roll Production forward. Verify live health and the served Settings enhancement after rollout.
