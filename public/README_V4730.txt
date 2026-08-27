JUGGLER / HANA HANA TOOL v4.7.3 — RELAY RECEIVE HOTFIX

v4.7.3 is a narrow tool-side hotfix on top of the v4.7.1 performance build.

The Launcher relay receive path now creates a deferred external-storage readiness gate before any receive handler can await it, while keeping the actual IndexedDB startup at the original post-restore phase, preventing the Safari-visible temporal-dead-zone error:
  Cannot access 'externalStorageReadyPromise' before initialization

No ranking, judgement, evidence, acquisition, parser, rate-limit, relay protocol, or ACK semantics were changed. The Launcher and BOOKMARKLET_v4500 are intentionally unchanged.
