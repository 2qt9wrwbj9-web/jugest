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
export const researchLoops=sqliteTable('research_loops',{
 storeId:text('store_id').primaryKey().references(()=>stores.id,{onDelete:'cascade'}),featureVersion:text('feature_version').notNull(),currentFingerprint:text('current_fingerprint'),bestFingerprint:text('best_fingerprint'),generation:integer('generation').notNull().default(0),noImproveCount:integer('no_improve_count').notNull().default(0),repeatedFingerprint:text('repeated_fingerprint'),state:text('state').notNull(),lastError:text('last_error'),frontierDate:text('frontier_date'),searchRound:integer('search_round').notNull().default(0),holdoutFinalizedAt:text('holdout_finalized_at'),holdoutWinnerFingerprint:text('holdout_winner_fingerprint'),updatedAt:text('updated_at').notNull()
},t=>[check('research_loops_state',sql`${t.state} IN ('idle','running','converged','failed')`)]);
export const sitesResearchContext=sqliteTable('sites_research_context',{
 jobId:integer('job_id').primaryKey(),parentJobId:integer('parent_job_id'),featureJobId:integer('feature_job_id').notNull(),inputHash:text('input_hash').notNull(),modelFingerprint:text('model_fingerprint').notNull(),frontierDate:text('frontier_date').notNull(),generation:integer('generation').notNull(),round:integer('round').notNull(),logicalKey:text('logical_key').notNull(),implementationHash:text('implementation_hash'),childJobId:integer('child_job_id'),state:text('state').notNull(),createdAt:text('created_at').notNull()
});
export const sitesResearchCycleJobs=sqliteTable('sites_research_cycle_jobs',{
 jobId:integer('job_id').primaryKey(),rootJobId:integer('root_job_id').notNull(),enabled:integer('enabled').notNull().default(0)
});
export const sitesResearchDecisions=sqliteTable('sites_research_decisions',{
 jobId:integer('job_id').primaryKey(),attempt:integer('attempt').notNull(),resultKey:text('result_key').notNull(),inputHash:text('input_hash').notNull(),implementationHash:text('implementation_hash').notNull(),decisionHash:text('decision_hash').notNull(),action:text('action').notNull(),reason:text('reason'),planJson:text('plan_json').notNull(),createdAt:text('created_at').notNull(),appliedAt:text('applied_at')
});

// Private sealed holdout generations; never queried by original result readers.
export const sitesHoldoutInputs=sqliteTable('sites_holdout_inputs',{
 jobId:integer('job_id').primaryKey(),identityHash:text('identity_hash').notNull(),inputHash:text('input_hash').notNull(),implementationHash:text('implementation_hash').notNull(),loopJson:text('loop_json').notNull(),registryJson:text('registry_json').notNull(),createdAt:text('created_at').notNull()
});
export const sitesHoldoutModels=sqliteTable('sites_holdout_models',{
 jobId:integer('job_id').notNull(),modelIndex:integer('model_index').notNull(),fingerprint:text('fingerprint').notNull(),identityHash:text('identity_hash').notNull(),objectKey:text('object_key').notNull(),bodyHash:text('body_hash').notNull(),bodyBytes:integer('body_bytes').notNull(),rowCount:integer('row_count').notNull()
},t=>[primaryKey({columns:[t.jobId,t.modelIndex]})]);
export const sitesHoldoutRows=sqliteTable('sites_holdout_rows',{
 jobId:integer('job_id').notNull(),modelIndex:integer('model_index').notNull(),ordinal:integer('ordinal').notNull(),targetDate:text('target_date').notNull(),machineKey:text('machine_key').notNull(),rank:integer('rank').notNull(),score:real('score').notNull(),outcomeScore:real('outcome_score'),detailsJson:text('details_json').notNull()
},t=>[primaryKey({columns:[t.jobId,t.modelIndex,t.ordinal]})]);
export const sitesHoldoutParts=sqliteTable('sites_holdout_parts',{
 jobId:integer('job_id').notNull(),modelIndex:integer('model_index').notNull(),part:integer('part').notNull(),rowsHash:text('rows_hash').notNull(),rowCount:integer('row_count').notNull()
},t=>[primaryKey({columns:[t.jobId,t.modelIndex,t.part]})]);
export const sitesHoldoutCommits=sqliteTable('sites_holdout_commits',{
 jobId:integer('job_id').primaryKey(),validated:integer('validated').notNull()
},t=>[check('sites_holdout_commit_valid',sql`${t.validated}=1`)]);

// Exact source columns, keys and checks for active/store-read and formal PRE v2.
export const activeStoreModels=sqliteTable("active_store_models",{
 storeId:text("store_id").primaryKey(),
 fingerprint:text("fingerprint").notNull(),
 modelJson:text("model_json").notNull(),
 featureVersion:text("feature_version").notNull(),
 sourceFrontierDate:text("source_frontier_date").notNull(),
 holdoutScore:real("holdout_score"),
 activatedAt:text("activated_at").notNull(),
 updatedAt:text("updated_at").notNull()
},t=>[foreignKey({columns:[t.storeId],foreignColumns:[stores.id]}).onDelete('cascade')]);
export const storePredictionSnapshots=sqliteTable("store_prediction_snapshots",{
 id:integer("id").primaryKey({autoIncrement:true}),
 storeId:text("store_id").notNull(),
 targetDate:text("target_date").notNull(),
 engine:text("engine").notNull(),
 engineVersion:text("engine_version").notNull(),
 modelFingerprint:text("model_fingerprint").notNull(),
 featureVersion:text("feature_version"),
 sourceFrontierDate:text("source_frontier_date").notNull(),
 inputHash:text("input_hash").notNull(),
 payloadJson:text("payload_json").notNull(),
 payloadHash:text("payload_hash").notNull(),
 createdAt:text("created_at").notNull()
},t=>[foreignKey({columns:[t.storeId],foreignColumns:[stores.id]}).onDelete('cascade'),index("store_prediction_snapshots_store_target_idx").on(t.storeId,t.targetDate,t.engine),uniqueIndex("sites_store_prediction_snapshots_identity").on(t.storeId,t.targetDate,t.engine,t.engineVersion,t.modelFingerprint),check("sites_store_prediction_snapshots_check_0",sql`engine IN ('pre_research','current_shadow')`)]);
export const preV2FormalTrials=sqliteTable("pre_v2_formal_trials",{
 storeId:text("store_id").notNull(),
 lineageId:text("lineage_id").notNull(),
 trialNumber:integer("trial_number").notNull(),
 trialVersion:text("trial_version").notNull(),
 scorerVersion:text("scorer_version").notNull(),
 sequentialVersion:text("sequential_version").notNull(),
 promotionAlpha:real("promotion_alpha").notNull(),
 safetyAlpha:real("safety_alpha").notNull(),
 championFingerprint:text("champion_fingerprint").notNull(),
 challengerFingerprint:text("challenger_fingerprint").notNull(),
 machineSetHash:text("machine_set_hash").notNull(),
 status:text("status").notNull(),
 decision:text("decision").notNull(),
 stateJson:text("state_json").notNull(),
 stateHash:text("state_hash").notNull(),
 startedAt:text("started_at").notNull(),
 updatedAt:text("updated_at").notNull(),
 decisionAt:text("decision_at"),
 decisionTargetDate:text("decision_target_date")
},t=>[primaryKey({columns:[t.storeId,t.lineageId,t.trialNumber]}),foreignKey({columns:[t.storeId],foreignColumns:[stores.id]}).onDelete('cascade'),index("pre_v2_formal_trials_store_status_idx").on(t.storeId,t.status,t.lineageId,t.trialNumber),check("sites_pre_v2_formal_trials_check_0",sql`trial_number>=1`),check("sites_pre_v2_formal_trials_check_1",sql`status IN ('running','promoted','blocked')`)]);
export const preV2FormalPredictions=sqliteTable("pre_v2_formal_predictions",{
 storeId:text("store_id").notNull(),
 lineageId:text("lineage_id").notNull(),
 trialNumber:integer("trial_number").notNull(),
 targetDate:text("target_date").notNull(),
 role:text("role").notNull(),
 modelFingerprint:text("model_fingerprint").notNull(),
 sourceFrontierDate:text("source_frontier_date").notNull(),
 machineSetHash:text("machine_set_hash").notNull(),
 rankingsJson:text("rankings_json").notNull(),
 predictionHash:text("prediction_hash").notNull(),
 createdAt:text("created_at").notNull()
},t=>[primaryKey({columns:[t.storeId,t.lineageId,t.trialNumber,t.targetDate,t.role]}),foreignKey({columns:[t.storeId,t.lineageId,t.trialNumber],foreignColumns:[preV2FormalTrials.storeId,preV2FormalTrials.lineageId,preV2FormalTrials.trialNumber]}).onDelete('cascade'),index("pre_v2_formal_predictions_store_date_idx").on(t.storeId,t.targetDate,t.lineageId,t.trialNumber,t.role),check("sites_pre_v2_formal_predictions_check_0",sql`role IN ('champion','challenger')`)]);
export const preV2FormalOutcomes=sqliteTable("pre_v2_formal_outcomes",{
 storeId:text("store_id").notNull(),
 lineageId:text("lineage_id").notNull(),
 trialNumber:integer("trial_number").notNull(),
 targetDate:text("target_date").notNull(),
 judgedRowsJson:text("judged_rows_json").notNull(),
 outcomeHash:text("outcome_hash").notNull(),
 createdAt:text("created_at").notNull()
},t=>[primaryKey({columns:[t.storeId,t.lineageId,t.trialNumber,t.targetDate]}),foreignKey({columns:[t.storeId,t.lineageId,t.trialNumber],foreignColumns:[preV2FormalTrials.storeId,preV2FormalTrials.lineageId,preV2FormalTrials.trialNumber]}).onDelete('cascade'),index("pre_v2_formal_outcomes_store_date_idx").on(t.storeId,t.targetDate,t.lineageId,t.trialNumber)]);
export const preV2FormalTrialDays=sqliteTable("pre_v2_formal_trial_days",{
 storeId:text("store_id").notNull(),
 lineageId:text("lineage_id").notNull(),
 trialNumber:integer("trial_number").notNull(),
 targetDate:text("target_date").notNull(),
 top10Delta:real("top10_delta").notNull(),
 top5Delta:real("top5_delta").notNull(),
 top10Informative:integer("top10_informative").notNull(),
 top5Informative:integer("top5_informative").notNull(),
 top10LogE:real("top10_log_e").notNull(),
 top10MaxLogE:real("top10_max_log_e").notNull(),
 top5DegradationLogE:real("top5_degradation_log_e").notNull(),
 top5DegradationMaxLogE:real("top5_degradation_max_log_e").notNull(),
 evidenceJson:text("evidence_json").notNull(),
 evidenceHash:text("evidence_hash").notNull(),
 stateHashAfter:text("state_hash_after").notNull(),
 createdAt:text("created_at").notNull()
},t=>[primaryKey({columns:[t.storeId,t.lineageId,t.trialNumber,t.targetDate]}),foreignKey({columns:[t.storeId,t.lineageId,t.trialNumber],foreignColumns:[preV2FormalTrials.storeId,preV2FormalTrials.lineageId,preV2FormalTrials.trialNumber]}).onDelete('cascade'),index("pre_v2_formal_trial_days_store_date_idx").on(t.storeId,t.targetDate,t.lineageId,t.trialNumber),check("sites_pre_v2_formal_trial_days_check_0",sql`top10_delta>=-1 AND top10_delta<=1`),check("sites_pre_v2_formal_trial_days_check_1",sql`top5_delta>=-1 AND top5_delta<=1`),check("sites_pre_v2_formal_trial_days_check_2",sql`top10_informative IN (0,1)`),check("sites_pre_v2_formal_trial_days_check_3",sql`top5_informative IN (0,1)`)]);
export const preV2FormalModels=sqliteTable("pre_v2_formal_models",{
 storeId:text("store_id").notNull(),
 lineageId:text("lineage_id").notNull(),
 trialNumber:integer("trial_number").notNull(),
 role:text("role").notNull(),
 modelFingerprint:text("model_fingerprint").notNull(),
 featureVersion:text("feature_version").notNull(),
 modelJson:text("model_json").notNull(),
 modelHash:text("model_hash").notNull(),
 createdAt:text("created_at").notNull()
},t=>[primaryKey({columns:[t.storeId,t.lineageId,t.trialNumber,t.role]}),foreignKey({columns:[t.storeId,t.lineageId,t.trialNumber],foreignColumns:[preV2FormalTrials.storeId,preV2FormalTrials.lineageId,preV2FormalTrials.trialNumber]}).onDelete('cascade'),index("pre_v2_formal_models_store_trial_idx").on(t.storeId,t.lineageId,t.trialNumber,t.role),check("sites_pre_v2_formal_models_check_0",sql`role IN ('champion','challenger')`)]);

export const sitesPreEpochs=sqliteTable('sites_pre_epochs',{storeId:text('store_id').primaryKey(),revision:integer('revision').notNull(),owner:text('owner').notNull()});
export const sitesPreFences=sqliteTable('sites_pre_fences',{operationId:text('operation_id').primaryKey(),valid:integer('valid').notNull()},t=>[check('sites_pre_fence_valid',sql`valid=1`)]);
export const sitesFeatureOutputs=sqliteTable('sites_feature_outputs',{jobId:integer('job_id').primaryKey(),inputHash:text('input_hash').notNull(),implementationHash:text('implementation_hash').notNull(),objectKey:text('object_key').notNull(),bodyHash:text('body_hash').notNull(),bodyBytes:integer('body_bytes').notNull()});
export const sitesPrePlans=sqliteTable('sites_pre_plans',{jobId:integer('job_id').primaryKey(),inputHash:text('input_hash').notNull(),implementationHash:text('implementation_hash').notNull(),objectKey:text('object_key').notNull(),bodyHash:text('body_hash').notNull(),bodyBytes:integer('body_bytes').notNull()});

// Runtime job identity is adapted to the Sites durable queue, while original refresh columns retain their meaning.
export const featureRefreshState=sqliteTable('feature_refresh_state',{storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'cascade'}),featureVersion:text('feature_version').notNull(),generation:integer('generation').notNull().default(0),completedGeneration:integer('completed_generation').notNull().default(0),activeJobId:integer('active_job_id').references(()=>sitesAnalysisJobs.id,{onDelete:'set null'}),frontierDate:text('frontier_date'),requestedFrontierDate:text('requested_frontier_date'),completedFrontierDate:text('completed_frontier_date'),updatedAt:text('updated_at').notNull()},t=>[primaryKey({columns:[t.storeId,t.featureVersion]})]);
export const sitesFeatureRequests=sqliteTable('sites_feature_requests',{jobId:integer('job_id').primaryKey()});

export const sitesFeaturePublications=sqliteTable('sites_feature_publications',{storeId:text('store_id').notNull(),featureVersion:text('feature_version').notNull(),asOfDate:text('as_of_date').notNull(),jobId:integer('job_id').notNull()},t=>[primaryKey({columns:[t.storeId,t.featureVersion,t.asOfDate]})]);
