import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,real,primaryKey,foreignKey,index,check} from 'drizzle-orm/sqlite-core';

// Subset of the frozen canonical schema needed by the read APIs. No seed data.
export const stores=sqliteTable('stores',{
 id:text('id').primaryKey(),name:text('name').notNull(),sourceMetadataJson:text('source_metadata_json').notNull().default('{}'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
});
export const storeDays=sqliteTable('store_days',{
 storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'cascade'}),businessDate:text('business_date').notNull(),parserVersion:text('parser_version'),sourceHash:text('source_hash'),normalizedPayloadHash:text('normalized_payload_hash'),qualityStatus:text('quality_status').notNull().default('pending'),rawArtifactPath:text('raw_artifact_path'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.storeId,t.businessDate]})]);
export const machineDayData=sqliteTable('machine_day_data',{
 storeId:text('store_id').notNull(),businessDate:text('business_date').notNull(),machineKey:text('machine_key').notNull(),payloadJson:text('payload_json').notNull()
},t=>[primaryKey({columns:[t.storeId,t.businessDate,t.machineKey]}),foreignKey({columns:[t.storeId,t.businessDate],foreignColumns:[storeDays.storeId,storeDays.businessDate]}).onDelete('cascade'),index('machine_day_data_store_date_idx').on(t.storeId,t.businessDate)]);
export const clientSnapshots=sqliteTable('client_snapshots',{
 storeId:text('store_id').notNull(),snapshotType:text('snapshot_type').notNull(),version:text('version').notNull(),businessDate:text('business_date').notNull(),payloadJson:text('payload_json').notNull(),payloadHash:text('payload_hash').notNull(),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.storeId,t.snapshotType,t.version]})]);
export const analysisReceipts=sqliteTable('analysis_receipts',{
 id:integer('id').primaryKey({autoIncrement:true}),storeId:text('store_id').notNull(),targetDate:text('target_date').notNull(),component:text('component').notNull(),version:text('version').notNull(),inputHash:text('input_hash').notNull(),outputHash:text('output_hash').notNull(),createdAt:text('created_at').notNull()
},t=>[index('analysis_receipts_store_date_idx').on(t.storeId,t.targetDate)]);
// Included for the original refresh state's nullable active_job_id reference.
// No queue runner or scheduler is activated by defining this table.
export const jobs=sqliteTable('jobs',{
 id:integer('id').primaryKey({autoIncrement:true}),type:text('type').notNull(),priority:integer('priority').notNull(),idempotencyKey:text('idempotency_key').notNull().unique(),payloadJson:text('payload_json').notNull(),sizeClass:text('size_class').notNull(),estimatedLeaseMib:real('estimated_lease_mib').notNull(),maxAttempts:integer('max_attempts').notNull(),attempts:integer('attempts').notNull().default(0),failureCount:integer('failure_count').notNull().default(0),state:text('state').notNull().default('queued'),leaseOwner:text('lease_owner'),heartbeatAt:text('heartbeat_at'),availableAt:text('available_at'),lastErrorClass:text('last_error_class'),lastErrorMessage:text('last_error_message'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('jobs_sched_idx').on(t.state,t.priority,t.availableAt,t.id),check('jobs_state_check',sql`${t.state} IN ('queued','leased','running','succeeded','retry_wait','failed','cancelled')`)]);
export const analysisRefreshState=sqliteTable('analysis_refresh_state',{
 storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'cascade'}),analysisVersion:text('analysis_version').notNull(),generation:integer('generation').notNull().default(0),completedGeneration:integer('completed_generation').notNull().default(0),activeJobId:integer('active_job_id').references(()=>jobs.id,{onDelete:'set null'}),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.storeId,t.analysisVersion]})]);
export const relayRefs=sqliteTable('sites_relay_refs',{
 namespace:text('namespace').notNull(),key:text('key').notNull(),objectKey:text('object_key').notNull(),valueSha256:text('value_sha256'),revision:integer('revision').notNull().default(1),updatedAt:integer('updated_at').notNull()
},t=>[primaryKey({columns:[t.namespace,t.key]})]);
