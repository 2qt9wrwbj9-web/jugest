CREATE TABLE `sites_holdout_inputs` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`identity_hash` text NOT NULL,
	`input_hash` text NOT NULL,
	`implementation_hash` text NOT NULL,
	`loop_json` text NOT NULL,
	`registry_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_holdout_models` (
	`job_id` integer NOT NULL,
	`model_index` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`identity_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`body_bytes` integer NOT NULL,
	`row_count` integer NOT NULL,
	PRIMARY KEY(`job_id`, `model_index`)
);
--> statement-breakpoint
CREATE TABLE `sites_holdout_parts` (
	`job_id` integer NOT NULL,
	`model_index` integer NOT NULL,
	`part` integer NOT NULL,
	`rows_hash` text NOT NULL,
	`row_count` integer NOT NULL,
	PRIMARY KEY(`job_id`, `model_index`, `part`)
);
--> statement-breakpoint
CREATE TABLE `sites_holdout_rows` (
	`job_id` integer NOT NULL,
	`model_index` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`target_date` text NOT NULL,
	`machine_key` text NOT NULL,
	`rank` integer NOT NULL,
	`score` real NOT NULL,
	`outcome_score` real,
	`details_json` text NOT NULL,
	PRIMARY KEY(`job_id`, `model_index`, `ordinal`)
);
