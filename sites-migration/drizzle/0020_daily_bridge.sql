CREATE TABLE sites_daily_runs (
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 parent_id INTEGER NOT NULL UNIQUE REFERENCES sites_analysis_jobs(id),
 feature_id INTEGER REFERENCES sites_analysis_jobs(id),
 pre_id INTEGER REFERENCES sites_analysis_jobs(id),
 state TEXT NOT NULL,
 PRIMARY KEY(store_id,business_date,channel_id)
);
