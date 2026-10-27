CREATE TABLE `backtest_predictions` (
	`run_id` integer NOT NULL,
	`target_date` text NOT NULL,
	`machine_key` text NOT NULL,
	`rank` integer NOT NULL,
	`score` real NOT NULL,
	`outcome_score` real,
	`details_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`run_id`, `target_date`, `machine_key`),
	FOREIGN KEY (`run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backtest_predictions_run_date_idx` ON `backtest_predictions` (`run_id`,`target_date`,`rank`);--> statement-breakpoint
CREATE TABLE `backtest_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`model_fingerprint` text NOT NULL,
	`model_json` text NOT NULL,
	`feature_version` text NOT NULL,
	`split_kind` text NOT NULL,
	`from_date` text,
	`to_date` text,
	`prediction_count` integer DEFAULT 0 NOT NULL,
	`score_json` text DEFAULT '{}' NOT NULL,
	`input_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backtest_runs_store_model_idx` ON `backtest_runs` (`store_id`,`model_fingerprint`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sites_backtest_run_identity` ON `backtest_runs` (`store_id`,`model_fingerprint`,`feature_version`,`split_kind`,`input_hash`);--> statement-breakpoint
CREATE TABLE `research_model_registry` (
	`store_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`model_json` text NOT NULL,
	`parent_fingerprint` text,
	`generation` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`validation_score` real,
	`holdout_score` real,
	`score_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `fingerprint`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_model_registry_store_status_idx` ON `research_model_registry` (`store_id`,`status`,`validation_score`);--> statement-breakpoint
CREATE TABLE `sites_backtest_publications` (
	`run_id` integer PRIMARY KEY NOT NULL,
	`job_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_research_job_inputs` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`model_json` text NOT NULL,
	`model_fingerprint` text NOT NULL,
	`feature_version` text NOT NULL,
	`frontier_date` text NOT NULL,
	`created_at` text NOT NULL
);
