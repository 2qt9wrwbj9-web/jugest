CREATE TABLE `sites_analysis_capture_machines` (
	`capture_id` text NOT NULL,
	`business_date` text NOT NULL,
	`machine_key` text NOT NULL,
	`payload_json` text NOT NULL,
	PRIMARY KEY(`capture_id`, `business_date`, `machine_key`)
);
--> statement-breakpoint
ALTER TABLE `sites_analysis_captures` ADD `format_version` integer DEFAULT 1 NOT NULL;