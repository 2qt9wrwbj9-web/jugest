CREATE TABLE `sites_backtest_stage_parts` (
	`job_id` integer NOT NULL,
	`part` integer NOT NULL,
	`output_hash` text NOT NULL,
	`rows_hash` text NOT NULL,
	`row_count` integer NOT NULL,
	PRIMARY KEY(`job_id`, `part`)
);
--> statement-breakpoint
CREATE TABLE `sites_backtest_stage_rows` (
	`job_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`split_kind` text NOT NULL,
	`target_date` text NOT NULL,
	`machine_key` text NOT NULL,
	`rank` integer NOT NULL,
	`score` real NOT NULL,
	`outcome_score` real,
	`details_json` text NOT NULL,
	PRIMARY KEY(`job_id`, `ordinal`)
);
