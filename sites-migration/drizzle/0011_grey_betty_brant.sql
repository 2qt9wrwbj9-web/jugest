CREATE TABLE `research_loops` (
	`store_id` text PRIMARY KEY NOT NULL,
	`feature_version` text NOT NULL,
	`current_fingerprint` text,
	`best_fingerprint` text,
	`generation` integer DEFAULT 0 NOT NULL,
	`no_improve_count` integer DEFAULT 0 NOT NULL,
	`repeated_fingerprint` text,
	`state` text NOT NULL,
	`last_error` text,
	`frontier_date` text,
	`search_round` integer DEFAULT 0 NOT NULL,
	`holdout_finalized_at` text,
	`holdout_winner_fingerprint` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_loops_state" CHECK("research_loops"."state" IN ('idle','running','converged','failed'))
);
--> statement-breakpoint
CREATE TABLE `sites_research_context` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`parent_job_id` integer,
	`feature_job_id` integer NOT NULL,
	`input_hash` text NOT NULL,
	`model_fingerprint` text NOT NULL,
	`frontier_date` text NOT NULL,
	`generation` integer NOT NULL,
	`round` integer NOT NULL,
	`logical_key` text NOT NULL,
	`child_job_id` integer,
	`state` text NOT NULL,
	`created_at` text NOT NULL
);
