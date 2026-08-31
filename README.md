# jugest

Juggler / HANA HANA setting-analysis tool.

Current app release: **v4.8.3**. Store analysis snapshots are persisted as compact history records with duplicate-run suppression and IndexedDB-backed compressed payloads; complete backups include that history. The store-analysis history view also shows compressed history size and, when the browser exposes StorageManager estimates, current site storage usage, estimated quota, and usage percentage without loading every snapshot payload.

Primary frontend + Relay: Netlify (`https://jugest.netlify.app`). GitHub remains the source repository and GitHub Pages may remain available as a backup/static mirror. The prepared VPS migration path is parked in `vps/README.md` for future use.
