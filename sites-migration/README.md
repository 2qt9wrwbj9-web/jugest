# Sites storage adapter — development only

Base: 1f8c29fc458f34e11e546fb57944d0fc31db98a5. No production data or credentials included.

Run `npm install` then `npm test` in this directory with Node >=22.13. The tests exercise local Miniflare D1/R2 and compare the original SQLite store. No deployment or external data collection occurs.

Not wired to production or any Site route. Authentication, canonical ingestion, orphan-object collection, production D1/R2 behavior, billing and full synchronization remain unverified. Never remove old R2 objects eagerly: a reader can hold a previous pointer. Schema is a candidate test schema, not an applied hosted migration.
