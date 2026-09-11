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
}
