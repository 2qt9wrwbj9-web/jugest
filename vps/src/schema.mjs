export function migrate(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_days (
      store_id TEXT NOT NULL,
      business_date TEXT NOT NULL,
      parser_version TEXT,
      source_hash TEXT,
      normalized_payload_hash TEXT,
      quality_status TEXT NOT NULL DEFAULT 'pending',
      raw_artifact_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id,business_date),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS machine_day_data (
      store_id TEXT NOT NULL,
      business_date TEXT NOT NULL,
      machine_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (store_id,business_date,machine_key),
      FOREIGN KEY (store_id,business_date) REFERENCES store_days(store_id,business_date) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS machine_day_data_store_date_idx ON machine_day_data(store_id,business_date);

    CREATE TABLE IF NOT EXISTS analysis_state (
      store_id TEXT NOT NULL,
      component TEXT NOT NULL,
      version TEXT NOT NULL,
      frontier_date TEXT,
      state_json TEXT NOT NULL,
      input_hash TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id,component,version)
    );

    CREATE TABLE IF NOT EXISTS analysis_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      target_date TEXT NOT NULL,
      component TEXT NOT NULL,
      version TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      output_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS analysis_receipts_store_date_idx ON analysis_receipts(store_id,target_date);

    CREATE TABLE IF NOT EXISTS client_snapshots (
      store_id TEXT NOT NULL,
      snapshot_type TEXT NOT NULL,
      version TEXT NOT NULL,
      business_date TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id,snapshot_type,version)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      priority INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      size_class TEXT NOT NULL,
      estimated_lease_mib REAL NOT NULL,
      max_attempts INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','running','succeeded','retry_wait','failed','cancelled')),
      lease_owner TEXT,
      heartbeat_at TEXT,
      available_at TEXT,
      last_error_class TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_sched_idx ON jobs(state,priority,available_at,id);

    CREATE TABLE IF NOT EXISTS analysis_refresh_state (
      store_id TEXT NOT NULL,
      analysis_version TEXT NOT NULL,
      generation INTEGER NOT NULL DEFAULT 0,
      completed_generation INTEGER NOT NULL DEFAULT 0,
      active_job_id INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id,analysis_version),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY (active_job_id) REFERENCES jobs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS feature_refresh_state (
      store_id TEXT NOT NULL,
      feature_version TEXT NOT NULL,
      generation INTEGER NOT NULL DEFAULT 0,
      completed_generation INTEGER NOT NULL DEFAULT 0,
      active_job_id INTEGER,
      frontier_date TEXT,
      requested_frontier_date TEXT,
      completed_frontier_date TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id,feature_version),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY (active_job_id) REFERENCES jobs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS store_feature_snapshots (
      store_id TEXT NOT NULL,
      feature_version TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      dimension_key TEXT NOT NULL,
      dimension_value TEXT NOT NULL,
      window_days INTEGER NOT NULL,
      day_count INTEGER NOT NULL,
      machine_count INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      metrics_json TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id,feature_version,as_of_date,dimension_key,dimension_value,window_days),
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS store_feature_snapshots_store_asof_idx ON store_feature_snapshots(store_id,feature_version,as_of_date DESC);

    CREATE TABLE IF NOT EXISTS backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      model_fingerprint TEXT NOT NULL,
      model_json TEXT NOT NULL,
      feature_version TEXT NOT NULL,
      split_kind TEXT NOT NULL CHECK(split_kind IN ('train','validation','holdout')),
      from_date TEXT,
      to_date TEXT,
      prediction_count INTEGER NOT NULL DEFAULT 0,
      score_json TEXT NOT NULL DEFAULT '{}',
      input_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS backtest_runs_store_model_idx ON backtest_runs(store_id,model_fingerprint,created_at DESC);

    CREATE TABLE IF NOT EXISTS backtest_predictions (
      run_id INTEGER NOT NULL,
      target_date TEXT NOT NULL,
      machine_key TEXT NOT NULL,
      rank INTEGER NOT NULL,
      score REAL NOT NULL,
      outcome_score REAL,
      details_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY(run_id,target_date,machine_key),
      FOREIGN KEY(run_id) REFERENCES backtest_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS backtest_predictions_run_date_idx ON backtest_predictions(run_id,target_date,rank);

    CREATE TABLE IF NOT EXISTS research_model_registry (
      store_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      model_json TEXT NOT NULL,
      parent_fingerprint TEXT,
      generation INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('candidate','research_champion','historical','rejected')),
      validation_score REAL,
      holdout_score REAL,
      score_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(store_id,fingerprint),
      FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS research_model_registry_store_status_idx ON research_model_registry(store_id,status,validation_score DESC);

    CREATE TABLE IF NOT EXISTS research_loops (
      store_id TEXT PRIMARY KEY,
      feature_version TEXT NOT NULL,
      current_fingerprint TEXT,
      best_fingerprint TEXT,
      generation INTEGER NOT NULL DEFAULT 0,
      no_improve_count INTEGER NOT NULL DEFAULT 0,
      repeated_fingerprint TEXT,
      state TEXT NOT NULL CHECK(state IN ('idle','running','converged','failed')),
      last_error TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      attempt INTEGER NOT NULL,
      owner TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      exit_code INTEGER,
      peak_rss_mib REAL,
      cpu_ms REAL,
      input_hash TEXT,
      output_hash TEXT,
      error_class TEXT,
      UNIQUE(job_id,attempt),
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analysis_task_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      store_id TEXT NOT NULL,
      phase INTEGER NOT NULL CHECK (phase IN (1,2,3)),
      task_kind TEXT NOT NULL,
      task_version TEXT NOT NULL,
      model_fingerprint TEXT,
      store_machine_count INTEGER NOT NULL,
      store_size_bucket TEXT NOT NULL,
      day_count INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      workload_units INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      start_rss_mib REAL,
      end_rss_mib REAL,
      peak_rss_mib REAL,
      cpu_ms REAL,
      status TEXT NOT NULL CHECK (status IN ('succeeded','failed','cancelled')),
      error_class TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL,
      FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS analysis_task_metrics_store_time_idx ON analysis_task_metrics(store_id,started_at DESC);
    CREATE INDEX IF NOT EXISTS analysis_task_metrics_kind_time_idx ON analysis_task_metrics(task_kind,started_at DESC);

    CREATE TABLE IF NOT EXISTS memory_profiles (
      job_type TEXT NOT NULL,
      size_class TEXT NOT NULL,
      ewma_peak_mib REAL NOT NULL,
      samples INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(job_type,size_class)
    );

    CREATE TABLE IF NOT EXISTS resource_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      effective_available_mib REAL NOT NULL,
      used_ratio REAL NOT NULL,
      swap_used_mib REAL NOT NULL,
      running_children INTEGER NOT NULL,
      queue_depth INTEGER NOT NULL,
      decision_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS resource_samples_time_idx ON resource_samples(captured_at);
  `);
  const jobColumns=db.prepare('PRAGMA table_info(jobs)').all().map(row=>row.name);
  if(!jobColumns.includes('failure_count'))db.exec('ALTER TABLE jobs ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;');
  const featureColumns=db.prepare('PRAGMA table_info(feature_refresh_state)').all().map(row=>row.name);
  if(!featureColumns.includes('requested_frontier_date'))db.exec('ALTER TABLE feature_refresh_state ADD COLUMN requested_frontier_date TEXT;');
  if(!featureColumns.includes('completed_frontier_date'))db.exec('ALTER TABLE feature_refresh_state ADD COLUMN completed_frontier_date TEXT;');
}
