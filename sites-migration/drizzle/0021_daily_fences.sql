CREATE TABLE `sites_daily_fences` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "sites_daily_fence_valid" CHECK(valid=1)
);
