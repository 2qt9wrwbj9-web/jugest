CREATE TABLE `sites_analysis_stages` (
	`job_id` integer NOT NULL,
	`stage` text NOT NULL,
	`input_hash` text NOT NULL,
	`implementation_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`body_hash` text NOT NULL,
	`body_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`job_id`, `stage`)
);
