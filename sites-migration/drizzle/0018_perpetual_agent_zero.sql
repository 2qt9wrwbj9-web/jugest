CREATE TABLE `feature_refresh_state` (
	`store_id` text NOT NULL,
	`feature_version` text NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`completed_generation` integer DEFAULT 0 NOT NULL,
	`active_job_id` integer,
	`frontier_date` text,
	`requested_frontier_date` text,
	`completed_frontier_date` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`store_id`, `feature_version`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_job_id`) REFERENCES `sites_analysis_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sites_feature_requests` (
	`job_id` integer PRIMARY KEY NOT NULL
);
