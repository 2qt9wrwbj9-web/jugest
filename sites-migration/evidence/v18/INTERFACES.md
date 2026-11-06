# V18 planner interfaces (fixed integration contract)

Root-owned `lib/analysis/business-plan.mjs` exports `createBusinessPlan(db,{storeId})`. Plan:

- `await plan.load(table,{where='store_id=?',values=[storeId],keys=['store_id']})` loads exact D1 baseline and returns current row array. Repeated same table/scope returns current state. Use explicit source key columns, no implicit field changes.
- `plan.rows(table)` returns current rows. `plan.replace(table,row,keys)` inserts/replaces one complete source-shaped row. `plan.remove(table,predicate)` removes rows selected by JS predicate. Rows are ordinary SQL column objects, not API views.
- `await plan.nextId(table)` reserves MAX(id)+1 inside the plan with a publication guard; multiple calls increment the local high-water mark. Queue allocation additionally considers Sites execution IDs to avoid infrastructure ID collisions; logical/runtime IDs are preserved explicitly.
- `await plan.commit({onStage})` compares every loaded baseline/scope and allocated sequence under D1 transaction-local guards, then writes only changed/deleted/new rows. No DB transaction spans an await. It is one original business transaction boundary, not an all-day transaction.
- `plan.writes()` returns complete SQL/values operations if a higher-level atomic publication needs to combine writes.

Root-owned `lib/analysis/logical-queue.mjs` exports `enqueueLogicalJob(plan,options)` and `getLogicalJob(plan,id)` with exactly the original queue.mjs job shapes. `await loadLogicalQueue(plan)` scopes `jobs` to JSON payload storeId and retains global allocation guards. `enqueueLogicalJob` validates and canonicalizes source payload, checks original idempotency key, plans a source jobs row. It does not fabricate success or execute work.

Followup modules should expose planner functions accepting `{plan,...sourceOptions}` and exact source result shapes, plus execution functions using `{db,bucket,job,nowIso,...}`. Root integrates all schema and actual durable runtime dispatch. No migration files changed by workers.
