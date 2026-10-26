CREATE TABLE `analysis_receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`store_id` text NOT NULL,
	`target_date` text NOT NULL,
	`component` text NOT NULL,
	`version` text NOT NULL,
	`input_hash` text NOT NULL,
	`output_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analysis_receipts_store_date_idx` ON `analysis_receipts` (`store_id`,`target_date`);--> statement-breakpoint
CREATE TABLE `analysis_refresh_state` (
	`store_id` text NOT NULL,
	`analysis_version` text NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`completed_generation` integer DEFAULT 0 NOT NULL,
	`active_job_id` integer,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `analysis_version`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `client_snapshots` (
	`store_id` text NOT NULL,
	`snapshot_type` text NOT NULL,
	`version` text NOT NULL,
	`business_date` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `snapshot_type`, `version`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`priority` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`size_class` text NOT NULL,
	`estimated_lease_mib` real NOT NULL,
	`max_attempts` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`lease_owner` text,
	`heartbeat_at` text,
	`available_at` text,
	`last_error_class` text,
	`last_error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "jobs_state_check" CHECK("jobs"."state" IN ('queued','leased','running','succeeded','retry_wait','failed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_sched_idx` ON `jobs` (`state`,`priority`,`available_at`,`id`);--> statement-breakpoint
CREATE TABLE `machine_day_data` (
	`store_id` text NOT NULL,
	`business_date` text NOT NULL,
	`machine_key` text NOT NULL,
	`payload_json` text NOT NULL,
	PRIMARY KEY(`store_id`, `business_date`, `machine_key`),
	FOREIGN KEY (`store_id`,`business_date`) REFERENCES `store_days`(`store_id`,`business_date`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `machine_day_data_store_date_idx` ON `machine_day_data` (`store_id`,`business_date`);--> statement-breakpoint
CREATE TABLE `sites_relay_refs` (
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`object_key` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`namespace`, `key`)
);
--> statement-breakpoint
CREATE TABLE `store_days` (
	`store_id` text NOT NULL,
	`business_date` text NOT NULL,
	`parser_version` text,
	`source_hash` text,
	`normalized_payload_hash` text,
	`quality_status` text DEFAULT 'pending' NOT NULL,
	`raw_artifact_path` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `business_date`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
