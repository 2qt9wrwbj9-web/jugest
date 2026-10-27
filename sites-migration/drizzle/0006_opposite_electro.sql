CREATE TABLE `sites_analysis_dispatch` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_dispatch_at` integer DEFAULT 0 NOT NULL,
	`last_sent_at` integer,
	`last_error` text
);
