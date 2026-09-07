# Collector batch V3 continuation

Production baseline: `2ca6df37d4b71b4a37095c0b031692c874088597`.
Resume branch: `preview/v512-collector-batch`, HEAD at baseline.

Resume inventory: only the five clean jitter files were modified. All five match
`ebfd684f5aaf697df52c2a9cc0967e901c850b4f`; no Collector implementation or batch
checkpoint existed. Older `docs/ui-refresh` logs belong to the preceding UI task.
The clean fix had passed build and 14 focused tests before interruption; the final
combined candidate will receive fresh tests. Production alias still resolves to
the specified baseline. No combined Collector Preview has been created yet.

## Design

- Reuse the existing parser, identity checks, calendar, priorities and retry rules.
- Consolidate Collector metadata into a versioned, channel-scoped snapshot.
  Read without cache; commit with the read ETag (`ifMatch`). Retry conflicts from
  a fresh snapshot. Missing ETag or corrupt state must fail closed.
- Stage compact parsed days in one immutable batch blob; publish all pointers,
  index revisions, receipts and lease releases in one conditional snapshot write.
  Normal five-success cycle target: Next snapshot + data pack + Push snapshot.
- Keep legacy endpoints on the same transactional adapter, so V2 and V3 cannot
  allocate or publish conflicting jobs. Import old metadata lazily, retain old
  blobs and read unmigrated daily payloads through fallback.
- Keep authentication lifecycle in the same snapshot after migration. Preserve a
  revocation tombstone on unlink, preventing old-format fallback resurrection.
- V3 issues up to five jobs, a 20-minute lease, and a 15-minute channel cadence.
  Page interval is two seconds. Partial pushes/duplicates are idempotent; missing
  results remain leased until expiry. A stale lease owner cannot overwrite a newer
  attempt. Saved dates remain skipped; explicit requeue invalidates old attempts.
- Unlink/store removal removes jobs, leases, failure/coverage/index references and
  safely reclaims unreferenced payloads. Cleanup has separate operation accounting.
- Conditional-write races, initial migration, cleanup, retries and polling are
  accounted separately from the steady-state five-success measurement.

## Work remaining

1. Add failing behavioral tests and an instrumented Blob SDK mock.
2. Implement the conditional adapter, snapshot transaction and batch endpoints.
3. Test replay, races, lost acknowledgements, aborts, migration, cleanup and parser
   preservation; measure old/new operations under the same fixture.
4. Audit protected files and excluded diagnostics, run the complete regression.
5. Write Japanese Shortcut instructions including actual action limitations,
   request-size limits and interruption recovery; do not invent error-catching
   features in native Shortcuts.
6. Commit only to the Preview branch, deploy/verify Preview, record final evidence.

No main update, Production deployment/alias, Blob setting change or live Blob
write is authorized by this work. Suspended real Blob remains unverified; tests
use an instrumented mock. No diagnostic endpoint/token forwarding is included.
