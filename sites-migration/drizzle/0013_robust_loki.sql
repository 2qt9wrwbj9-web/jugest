CREATE TABLE `sites_research_cycle_jobs` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`root_job_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites_research_decisions` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`attempt` integer NOT NULL,
	`result_key` text NOT NULL,
	`input_hash` text NOT NULL,
	`implementation_hash` text NOT NULL,
	`decision_hash` text NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`plan_json` text NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text
);
