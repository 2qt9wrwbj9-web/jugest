CREATE TABLE `active_store_models` (
	`store_id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`model_json` text NOT NULL,
	`feature_version` text NOT NULL,
	`source_frontier_date` text NOT NULL,
	`holdout_score` real,
	`activated_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pre_v2_formal_models` (
	`store_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`trial_number` integer NOT NULL,
	`role` text NOT NULL,
	`model_fingerprint` text NOT NULL,
	`feature_version` text NOT NULL,
	`model_json` text NOT NULL,
	`model_hash` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `lineage_id`, `trial_number`, `role`),
	FOREIGN KEY (`store_id`,`lineage_id`,`trial_number`) REFERENCES `pre_v2_formal_trials`(`store_id`,`lineage_id`,`trial_number`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sites_pre_v2_formal_models_check_0" CHECK(role IN ('champion','challenger'))
);
--> statement-breakpoint
CREATE INDEX `pre_v2_formal_models_store_trial_idx` ON `pre_v2_formal_models` (`store_id`,`lineage_id`,`trial_number`,`role`);--> statement-breakpoint
CREATE TABLE `pre_v2_formal_outcomes` (
	`store_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`trial_number` integer NOT NULL,
	`target_date` text NOT NULL,
	`judged_rows_json` text NOT NULL,
	`outcome_hash` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `lineage_id`, `trial_number`, `target_date`),
	FOREIGN KEY (`store_id`,`lineage_id`,`trial_number`) REFERENCES `pre_v2_formal_trials`(`store_id`,`lineage_id`,`trial_number`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pre_v2_formal_outcomes_store_date_idx` ON `pre_v2_formal_outcomes` (`store_id`,`target_date`,`lineage_id`,`trial_number`);--> statement-breakpoint
CREATE TABLE `pre_v2_formal_predictions` (
	`store_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`trial_number` integer NOT NULL,
	`target_date` text NOT NULL,
	`role` text NOT NULL,
	`model_fingerprint` text NOT NULL,
	`source_frontier_date` text NOT NULL,
	`machine_set_hash` text NOT NULL,
	`rankings_json` text NOT NULL,
	`prediction_hash` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `lineage_id`, `trial_number`, `target_date`, `role`),
	FOREIGN KEY (`store_id`,`lineage_id`,`trial_number`) REFERENCES `pre_v2_formal_trials`(`store_id`,`lineage_id`,`trial_number`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sites_pre_v2_formal_predictions_check_0" CHECK(role IN ('champion','challenger'))
);
--> statement-breakpoint
CREATE INDEX `pre_v2_formal_predictions_store_date_idx` ON `pre_v2_formal_predictions` (`store_id`,`target_date`,`lineage_id`,`trial_number`,`role`);--> statement-breakpoint
CREATE TABLE `pre_v2_formal_trial_days` (
	`store_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`trial_number` integer NOT NULL,
	`target_date` text NOT NULL,
	`top10_delta` real NOT NULL,
	`top5_delta` real NOT NULL,
	`top10_informative` integer NOT NULL,
	`top5_informative` integer NOT NULL,
	`top10_log_e` real NOT NULL,
	`top10_max_log_e` real NOT NULL,
	`top5_degradation_log_e` real NOT NULL,
	`top5_degradation_max_log_e` real NOT NULL,
	`evidence_json` text NOT NULL,
	`evidence_hash` text NOT NULL,
	`state_hash_after` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `lineage_id`, `trial_number`, `target_date`),
	FOREIGN KEY (`store_id`,`lineage_id`,`trial_number`) REFERENCES `pre_v2_formal_trials`(`store_id`,`lineage_id`,`trial_number`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sites_pre_v2_formal_trial_days_check_0" CHECK(top10_delta>=-1 AND top10_delta<=1),
	CONSTRAINT "sites_pre_v2_formal_trial_days_check_1" CHECK(top5_delta>=-1 AND top5_delta<=1),
	CONSTRAINT "sites_pre_v2_formal_trial_days_check_2" CHECK(top10_informative IN (0,1)),
	CONSTRAINT "sites_pre_v2_formal_trial_days_check_3" CHECK(top5_informative IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `pre_v2_formal_trial_days_store_date_idx` ON `pre_v2_formal_trial_days` (`store_id`,`target_date`,`lineage_id`,`trial_number`);--> statement-breakpoint
CREATE TABLE `pre_v2_formal_trials` (
	`store_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`trial_number` integer NOT NULL,
	`trial_version` text NOT NULL,
	`scorer_version` text NOT NULL,
	`sequential_version` text NOT NULL,
	`promotion_alpha` real NOT NULL,
	`safety_alpha` real NOT NULL,
	`champion_fingerprint` text NOT NULL,
	`challenger_fingerprint` text NOT NULL,
	`machine_set_hash` text NOT NULL,
	`status` text NOT NULL,
	`decision` text NOT NULL,
	`state_json` text NOT NULL,
	`state_hash` text NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`decision_at` text,
	`decision_target_date` text,
	PRIMARY KEY(`store_id`, `lineage_id`, `trial_number`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sites_pre_v2_formal_trials_check_0" CHECK(trial_number>=1),
	CONSTRAINT "sites_pre_v2_formal_trials_check_1" CHECK(status IN ('running','promoted','blocked'))
);
--> statement-breakpoint
CREATE INDEX `pre_v2_formal_trials_store_status_idx` ON `pre_v2_formal_trials` (`store_id`,`status`,`lineage_id`,`trial_number`);--> statement-breakpoint
CREATE TABLE `sites_feature_outputs` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`implementation_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`body_bytes` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_pre_epochs` (
	`store_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_pre_fences` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "sites_pre_fence_valid" CHECK(valid=1)
);
--> statement-breakpoint
CREATE TABLE `sites_pre_plans` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`implementation_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`body_bytes` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_prediction_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`target_date` text NOT NULL,
	`engine` text NOT NULL,
	`engine_version` text NOT NULL,
	`model_fingerprint` text NOT NULL,
	`feature_version` text,
	`source_frontier_date` text NOT NULL,
	`input_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sites_store_prediction_snapshots_check_0" CHECK(engine IN ('pre_research','current_shadow'))
);
--> statement-breakpoint
CREATE INDEX `store_prediction_snapshots_store_target_idx` ON `store_prediction_snapshots` (`store_id`,`target_date`,`engine`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_store_prediction_snapshots_identity` ON `store_prediction_snapshots` (`store_id`,`target_date`,`engine`,`engine_version`,`model_fingerprint`);