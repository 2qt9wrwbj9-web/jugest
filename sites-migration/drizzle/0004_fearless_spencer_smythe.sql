CREATE TABLE `sites_analysis_payloads` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`implementation_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`payload_bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_feature_snapshots` (
	`store_id` text NOT NULL,
	`feature_version` text NOT NULL,
	`as_of_date` text NOT NULL,
	`dimension_key` text NOT NULL,
	`dimension_value` text NOT NULL,
	`window_days` integer NOT NULL,
	`day_count` integer NOT NULL,
	`machine_count` integer NOT NULL,
	`row_count` integer NOT NULL,
	`metrics_json` text NOT NULL,
	`input_hash` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `feature_version`, `as_of_date`, `dimension_key`, `dimension_value`, `window_days`)
);
