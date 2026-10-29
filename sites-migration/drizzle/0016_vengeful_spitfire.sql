CREATE TABLE `sites_holdout_commits` (
	`job_id` integer PRIMARY KEY NOT NULL,
	`validated` integer NOT NULL,
	CONSTRAINT "sites_holdout_commit_valid" CHECK("sites_holdout_commits"."validated"=1)
);
