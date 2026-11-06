CREATE TABLE `sites_pia_collection_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`jst_date` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`snapshot_date` text,
	`snapshot_hash` text,
	`raw_key` text,
	`business_date` text,
	`row_count` integer,
	`machine_count` integer,
	`imported_count` integer,
	`diagnostics_json` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `sites_pia_collection_attempts_started` ON `sites_pia_collection_attempts` (`started_at`);--> statement-breakpoint
CREATE TABLE `sites_pia_collection_state` (
	`collector_id` text PRIMARY KEY NOT NULL,
	`last_snapshot_date` text,
	`last_snapshot_hash` text,
	`last_snapshot_key` text,
	`last_result` text,
	`last_ingested_date` text,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error` text,
	`retry_not_before` integer,
	`lease_owner` text,
	`lease_until` integer
);
