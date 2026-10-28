import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,real,primaryKey,foreignKey,index,uniqueIndex,check} from 'drizzle-orm/sqlite-core';

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

// Sites runtime records are separate from the original VPS queue and snapshots.
export const sitesAnalysisCaptures=sqliteTable('sites_analysis_captures',{
 id:text('id').primaryKey(),storeId:text('store_id').notNull(),storeJson:text('store_json').notNull(),complete:integer('complete').notNull().default(0),createdAt:text('created_at').notNull(),formatVersion:integer('format_version').notNull().default(1)
});
// V2 captures keep individual canonical machine rows, never a whole day in a D1 row.
export const sitesAnalysisCaptureMachines=sqliteTable('sites_analysis_capture_machines',{
 captureId:text('capture_id').notNull(),businessDate:text('business_date').notNull(),machineKey:text('machine_key').notNull(),payloadJson:text('payload_json').notNull()
},t=>[primaryKey({columns:[t.captureId,t.businessDate,t.machineKey]})]);
export const sitesAnalysisCaptureDays=sqliteTable('sites_analysis_capture_days',{
 captureId:text('capture_id').notNull(),businessDate:text('business_date').notNull(),dayJson:text('day_json').notNull()
},t=>[primaryKey({columns:[t.captureId,t.businessDate]})]);
export const sitesAnalysisJobs=sqliteTable('sites_analysis_jobs',{
 id:integer('id').primaryKey({autoIncrement:true}),storeId:text('store_id').notNull(),channelId:text('channel_id').notNull(),kind:text('kind').notNull(),targetDate:text('target_date').notNull(),historyLimit:integer('history_limit').notNull(),idempotencyKey:text('idempotency_key').notNull().unique(),state:text('state').notNull().default('queued'),attempts:integer('attempts').notNull().default(0),failureCount:integer('failure_count').notNull().default(0),maxAttempts:integer('max_attempts').notNull().default(3),leaseOwner:text('lease_owner'),leaseUntil:integer('lease_until'),availableAt:integer('available_at').notNull().default(0),manifestKey:text('manifest_key'),inputHash:text('input_hash'),resultKey:text('result_key'),outputHash:text('output_hash'),resultSha256:text('result_sha256'),payloadOffset:integer('payload_offset'),payloadSize:integer('payload_size'),lastErrorClass:text('last_error_class'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('sites_analysis_jobs_schedule').on(t.state,t.availableAt,t.id),check('sites_analysis_jobs_state_check',sql`${t.state} IN ('queued','leased','running','succeeded','retry_wait','failed','cancelled')`)]);
export const sitesAnalysisHeads=sqliteTable('sites_analysis_heads',{
 storeId:text('store_id').notNull(),kind:text('kind').notNull(),latestJobId:integer('latest_job_id').notNull(),completedJobId:integer('completed_job_id')
},t=>[primaryKey({columns:[t.storeId,t.kind]})]);
export const sitesAnalysisJobRuns=sqliteTable('sites_analysis_job_runs',{
 jobId:integer('job_id').notNull(),attempt:integer('attempt').notNull(),owner:text('owner').notNull(),state:text('state').notNull(),inputHash:text('input_hash'),outputHash:text('output_hash'),timingsJson:text('timings_json'),startedAt:text('started_at').notNull(),endedAt:text('ended_at'),errorClass:text('error_class')
},t=>[primaryKey({columns:[t.jobId,t.attempt]})]);
export const sitesAnalysisExecutionLock=sqliteTable('sites_analysis_execution_lock',{
 name:text('name').primaryKey(),jobId:integer('job_id').notNull(),owner:text('owner').notNull(),leaseUntil:integer('lease_until').notNull()
});
export const sitesAnalysisPayloads=sqliteTable('sites_analysis_payloads',{
 jobId:integer('job_id').primaryKey(),inputHash:text('input_hash').notNull(),implementationHash:text('implementation_hash').notNull(),objectKey:text('object_key').notNull(),payloadHash:text('payload_hash').notNull(),payloadBytes:integer('payload_bytes').notNull(),createdAt:text('created_at').notNull()
});
export const sitesAnalysisDispatch=sqliteTable('sites_analysis_dispatch',{
 jobId:integer('job_id').primaryKey(),attempts:integer('attempts').notNull().default(0),nextDispatchAt:integer('next_dispatch_at').notNull().default(0),lastSentAt:integer('last_sent_at'),lastError:text('last_error')
});
export const storeFeatureSnapshots=sqliteTable('store_feature_snapshots',{
 storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'cascade'}),featureVersion:text('feature_version').notNull(),asOfDate:text('as_of_date').notNull(),dimensionKey:text('dimension_key').notNull(),dimensionValue:text('dimension_value').notNull(),windowDays:integer('window_days').notNull(),dayCount:integer('day_count').notNull(),machineCount:integer('machine_count').notNull(),rowCount:integer('row_count').notNull(),metricsJson:text('metrics_json').notNull(),inputHash:text('input_hash').notNull(),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.storeId,t.featureVersion,t.asOfDate,t.dimensionKey,t.dimensionValue,t.windowDays]}),index('store_feature_snapshots_store_asof_idx').on(t.storeId,t.featureVersion,t.asOfDate)]);

export const sitesAnalysisStages=sqliteTable('sites_analysis_stages',{
 jobId:integer('job_id').notNull(),stage:text('stage').notNull(),inputHash:text('input_hash').notNull(),implementationHash:text('implementation_hash').notNull(),objectKey:text('object_key').notNull(),bodyHash:text('body_hash').notNull(),bodyBytes:integer('body_bytes').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.jobId,t.stage]})]);

export const researchModelRegistry=sqliteTable('research_model_registry',{
 storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'cascade'}),fingerprint:text('fingerprint').notNull(),modelJson:text('model_json').notNull(),parentFingerprint:text('parent_fingerprint'),generation:integer('generation').notNull().default(0),status:text('status').notNull().default('candidate'),validationScore:real('validation_score'),holdoutScore:real('holdout_score'),scoreJson:text('score_json').notNull().default('{}'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[primaryKey({columns:[t.storeId,t.fingerprint]}),index('research_model_registry_store_status_idx').on(t.storeId,t.status,t.validationScore)]);
export const backtestRuns=sqliteTable('backtest_runs',{
 id:integer('id').primaryKey({autoIncrement:true}),storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'cascade'}),modelFingerprint:text('model_fingerprint').notNull(),modelJson:text('model_json').notNull(),featureVersion:text('feature_version').notNull(),splitKind:text('split_kind').notNull(),fromDate:text('from_date'),toDate:text('to_date'),predictionCount:integer('prediction_count').notNull().default(0),scoreJson:text('score_json').notNull().default('{}'),inputHash:text('input_hash').notNull(),createdAt:text('created_at').notNull()
},t=>[index('backtest_runs_store_model_idx').on(t.storeId,t.modelFingerprint,t.createdAt),uniqueIndex('sites_backtest_run_identity').on(t.storeId,t.modelFingerprint,t.featureVersion,t.splitKind,t.inputHash)]);
export const backtestPredictions=sqliteTable('backtest_predictions',{
 runId:integer('run_id').notNull().references(()=>backtestRuns.id,{onDelete:'cascade'}),targetDate:text('target_date').notNull(),machineKey:text('machine_key').notNull(),rank:integer('rank').notNull(),score:real('score').notNull(),outcomeScore:real('outcome_score'),detailsJson:text('details_json').notNull().default('{}')
},t=>[primaryKey({columns:[t.runId,t.targetDate,t.machineKey]}),index('backtest_predictions_run_date_idx').on(t.runId,t.targetDate,t.rank)]);
export const sitesBacktestPublications=sqliteTable('sites_backtest_publications',{
 runId:integer('run_id').primaryKey(),jobId:integer('job_id').notNull()
});
export const sitesResearchJobInputs=sqliteTable('sites_research_job_inputs',{
 jobId:integer('job_id').primaryKey(),inputHash:text('input_hash').notNull(),modelJson:text('model_json').notNull(),modelFingerprint:text('model_fingerprint').notNull(),featureVersion:text('feature_version').notNull(),frontierDate:text('frontier_date').notNull(),createdAt:text('created_at').notNull()
});

export const sitesAnalysisPartitions=sqliteTable('sites_analysis_partitions',{
 jobId:integer('job_id').primaryKey(),batchSize:integer('batch_size').notNull()
});
export const sitesResearchSearches=sqliteTable('sites_research_searches',{
 jobId:integer('job_id').primaryKey(),storeId:text('store_id').notNull(),inputHash:text('input_hash').notNull(),championFingerprint:text('champion_fingerprint').notNull(),candidateFingerprint:text('candidate_fingerprint'),round:integer('round').notNull(),calculationHash:text('calculation_hash').notNull(),status:text('status').notNull(),payloadKey:text('payload_key').notNull(),createdAt:text('created_at').notNull()
});
export const sitesBacktestStageRows=sqliteTable('sites_backtest_stage_rows',{
 jobId:integer('job_id').notNull(),ordinal:integer('ordinal').notNull(),splitKind:text('split_kind').notNull(),targetDate:text('target_date').notNull(),machineKey:text('machine_key').notNull(),rank:integer('rank').notNull(),score:real('score').notNull(),outcomeScore:real('outcome_score'),detailsJson:text('details_json').notNull()
},t=>[primaryKey({columns:[t.jobId,t.ordinal]})]);
export const sitesBacktestStageParts=sqliteTable('sites_backtest_stage_parts',{
 jobId:integer('job_id').notNull(),part:integer('part').notNull(),outputHash:text('output_hash').notNull(),rowsHash:text('rows_hash').notNull(),rowCount:integer('row_count').notNull()
},t=>[primaryKey({columns:[t.jobId,t.part]})]);
