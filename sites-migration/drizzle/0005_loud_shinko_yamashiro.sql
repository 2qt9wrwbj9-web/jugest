PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_store_feature_snapshots` (
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
	PRIMARY KEY(`store_id`, `feature_version`, `as_of_date`, `dimension_key`, `dimension_value`, `window_days`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_store_feature_snapshots`("store_id", "feature_version", "as_of_date", "dimension_key", "dimension_value", "window_days", "day_count", "machine_count", "row_count", "metrics_json", "input_hash", "updated_at") SELECT "store_id", "feature_version", "as_of_date", "dimension_key", "dimension_value", "window_days", "day_count", "machine_count", "row_count", "metrics_json", "input_hash", "updated_at" FROM `store_feature_snapshots`;--> statement-breakpoint
DROP TABLE `store_feature_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_store_feature_snapshots` RENAME TO `store_feature_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `store_feature_snapshots_store_asof_idx` ON `store_feature_snapshots` (`store_id`,`feature_version`,`as_of_date`);