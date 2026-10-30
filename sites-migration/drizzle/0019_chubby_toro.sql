CREATE TABLE `sites_feature_publications` (
	`store_id` text NOT NULL,
	`feature_version` text NOT NULL,
	`as_of_date` text NOT NULL,
	`job_id` integer NOT NULL,
	PRIMARY KEY(`store_id`, `feature_version`, `as_of_date`)
);
