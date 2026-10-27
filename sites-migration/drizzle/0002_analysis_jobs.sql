CREATE TABLE `sites_analysis_capture_days` (
	`capture_id` text NOT NULL,
	`business_date` text NOT NULL,
	`day_json` text NOT NULL,
	PRIMARY KEY(`capture_id`, `business_date`)
);
--> statement-breakpoint
CREATE TABLE `sites_analysis_captures` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`store_json` text NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_analysis_execution_lock` (
	`name` text PRIMARY KEY NOT NULL,
	`job_id` integer NOT NULL,
	`owner` text NOT NULL,
	`lease_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_analysis_heads` (
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`latest_job_id` integer NOT NULL,
	`completed_job_id` integer,
	PRIMARY KEY(`store_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `sites_analysis_job_runs` (
	`job_id` integer NOT NULL,
	`attempt` integer NOT NULL,
	`owner` text NOT NULL,
	`state` text NOT NULL,
	`input_hash` text,
	`output_hash` text,
	`timings_json` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`error_class` text,
	PRIMARY KEY(`job_id`, `attempt`)
);
--> statement-breakpoint
CREATE TABLE `sites_analysis_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_date` text NOT NULL,
	`history_limit` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`lease_owner` text,
	`lease_until` integer,
	`available_at` integer DEFAULT 0 NOT NULL,
	`manifest_key` text,
	`input_hash` text,
	`result_key` text,
	`output_hash` text,
	`result_sha256` text,
	`payload_offset` integer,
	`payload_size` integer,
	`last_error_class` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "sites_analysis_jobs_state_check" CHECK("sites_analysis_jobs"."state" IN ('queued','leased','running','succeeded','retry_wait','failed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_analysis_jobs_idempotency_key_unique` ON `sites_analysis_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `sites_analysis_jobs_schedule` ON `sites_analysis_jobs` (`state`,`available_at`,`id`);