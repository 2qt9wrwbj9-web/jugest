-- Dedicated pachinko.sqlite only. Application validates ownership and version before this migration.
BEGIN IMMEDIATE;
CREATE TABLE p_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
INSERT INTO p_meta(key,value) VALUES('domain','pia-ofuna-pachinko');
CREATE TABLE p_snapshots(
  id INTEGER PRIMARY KEY AUTOINCREMENT,store_id TEXT NOT NULL CHECK(store_id='pia:35-p'),
  observed_at TEXT,imported_at TEXT NOT NULL,server_date TEXT NOT NULL,server_time TEXT NOT NULL,
  raw_payload_gzip BLOB NOT NULL,raw_sha256 TEXT NOT NULL,content_hash TEXT NOT NULL,
  collector_version TEXT NOT NULL,provenance_json TEXT NOT NULL,scope_model_keys_json TEXT NOT NULL,
  row_count INTEGER NOT NULL CHECK(row_count>0),machine_count INTEGER NOT NULL CHECK(machine_count>0),
  status TEXT NOT NULL,collection_ready INTEGER NOT NULL DEFAULT 0 CHECK(collection_ready IN (0,1)),
  business_date TEXT,assigned_count INTEGER NOT NULL DEFAULT 0 CHECK(assigned_count>=0),diagnostics_json TEXT NOT NULL,
  UNIQUE(raw_sha256,scope_model_keys_json)
) STRICT;
CREATE TABLE p_records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,fingerprint TEXT NOT NULL UNIQUE,store_id TEXT NOT NULL CHECK(store_id='pia:35-p'),
  identity TEXT NOT NULL,machine_model_key TEXT NOT NULL CHECK(machine_model_key IN ('OUMI5_SPECIAL_ALTA','TOKYO_GHOUL_399','TOKYO_GHOUL_999')),
  machine_no TEXT NOT NULL,store_machine_id TEXT NOT NULL,sis_machine_code TEXT NOT NULL,raw_machine_name TEXT NOT NULL,raw_json TEXT NOT NULL,
  special INTEGER,start INTEGER,final_start INTEGER,special_1 INTEGER,special_2 INTEGER,special_2d INTEGER,
  special_out INTEGER,special_safe INTEGER,out INTEGER,safe INTEGER,difference INTEGER,
  normal_out INTEGER,normal_safe INTEGER,net_consumption INTEGER,estimated_k REAL,
  estimator_id TEXT NOT NULL,estimator_version TEXT NOT NULL,estimator_status TEXT NOT NULL CHECK(estimator_status IN ('verified','provisional','unverified','unusable')),
  sample_size INTEGER,confidence TEXT CHECK(confidence IS NULL OR confidence IN ('A','B','C','D')),diagnostics_json TEXT NOT NULL,
  CHECK(estimated_k IS NULL OR (estimator_status='verified' AND estimated_k>0)),
  UNIQUE(id,identity,machine_no,store_machine_id,machine_model_key)
) STRICT;
CREATE TABLE p_snapshot_members(
  snapshot_id INTEGER NOT NULL REFERENCES p_snapshots(id),record_id INTEGER NOT NULL REFERENCES p_records(id),
  occurrence_count INTEGER NOT NULL CHECK(occurrence_count>0),PRIMARY KEY(snapshot_id,record_id)
) STRICT;
CREATE TABLE p_machine_days(
  store_id TEXT NOT NULL CHECK(store_id='pia:35-p'),business_date TEXT NOT NULL,identity TEXT NOT NULL,
  machine_no TEXT NOT NULL,store_machine_id TEXT NOT NULL,machine_model_key TEXT NOT NULL,record_id INTEGER NOT NULL,
  previous_snapshot_id INTEGER NOT NULL REFERENCES p_snapshots(id),current_snapshot_id INTEGER NOT NULL REFERENCES p_snapshots(id),
  date_status TEXT NOT NULL CHECK(date_status='derived'),date_assignment_method TEXT NOT NULL CHECK(date_assignment_method='consecutive_snapshot_multiset_previous_day'),
  PRIMARY KEY(store_id,business_date,identity),UNIQUE(store_id,business_date,machine_no),UNIQUE(store_id,business_date,machine_no,store_machine_id),
  FOREIGN KEY(record_id,identity,machine_no,store_machine_id,machine_model_key) REFERENCES p_records(id,identity,machine_no,store_machine_id,machine_model_key)
) STRICT;
CREATE TABLE p_transitions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,current_snapshot_id INTEGER NOT NULL REFERENCES p_snapshots(id),
  previous_snapshot_id INTEGER REFERENCES p_snapshots(id),identity TEXT NOT NULL,machine_model_key TEXT NOT NULL,
  machine_no TEXT NOT NULL,store_machine_id TEXT NOT NULL,reason TEXT NOT NULL,diagnostics_json TEXT NOT NULL
) STRICT;
CREATE TABLE p_model_anchors(
  model_key TEXT PRIMARY KEY CHECK(model_key IN ('OUMI5_SPECIAL_ALTA','TOKYO_GHOUL_399','TOKYO_GHOUL_999')),
  snapshot_id INTEGER NOT NULL REFERENCES p_snapshots(id),server_date TEXT NOT NULL
) STRICT;
CREATE TABLE p_collector_state(
  collector_id TEXT PRIMARY KEY CHECK(collector_id='pia:35-p'),last_attempt_at TEXT,last_success_at TEXT,
  last_error TEXT,last_collected_server_date TEXT,updated_at TEXT
) STRICT;
CREATE INDEX p_snapshots_date ON p_snapshots(server_date DESC,server_time DESC,id DESC);
CREATE INDEX p_records_model_machine ON p_records(machine_model_key,machine_no,store_machine_id);
CREATE INDEX p_records_identity ON p_records(identity);
CREATE INDEX p_machine_days_date ON p_machine_days(store_id,business_date DESC,machine_model_key,machine_no,store_machine_id);
CREATE INDEX p_machine_days_record ON p_machine_days(record_id);
CREATE INDEX p_members_record ON p_snapshot_members(record_id,snapshot_id);
CREATE INDEX p_transitions_snapshot ON p_transitions(current_snapshot_id,reason);
PRAGMA user_version=1;
COMMIT;
