CREATE TABLE `sites_analysis_partitions` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`batch_size` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_research_searches` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`champion_fingerprint` text NOT NULL,
	`candidate_fingerprint` text,
	`round` integer NOT NULL,
	`calculation_hash` text NOT NULL,
	`status` text NOT NULL,
	`payload_key` text NOT NULL,
	`created_at` text NOT NULL
);
