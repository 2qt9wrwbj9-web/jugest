-- Frozen schema 1 fixture for upgrade compatibility; never apply to production.
BEGIN IMMEDIATE;
    CREATE TABLE access_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE admin_credentials (
      id TEXT PRIMARY KEY,name TEXT NOT NULL,webauthn_id TEXT NOT NULL UNIQUE,
      public_key BLOB NOT NULL,counter INTEGER NOT NULL DEFAULT 0,
      transports_json TEXT NOT NULL DEFAULT '[]',device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,
      last_used_at INTEGER,revoked_at INTEGER
    );
    CREATE TABLE admin_sessions (
      id TEXT PRIMARY KEY,credential_id TEXT NOT NULL REFERENCES admin_credentials(id),
      session_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
      authenticated_at INTEGER NOT NULL,last_used_at INTEGER NOT NULL,revoked_at INTEGER
    );
    CREATE TABLE admin_enrollment_tokens (
      id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('bootstrap','additional','recovery')),
      token_hash TEXT NOT NULL UNIQUE,created_by TEXT REFERENCES admin_credentials(id),
      created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,revoked_at INTEGER
    );
    CREATE TABLE access_challenges (
      id TEXT PRIMARY KEY,flow TEXT NOT NULL CHECK(flow IN ('register','login','reauth')),
      challenge TEXT NOT NULL,ceremony_hash TEXT NOT NULL,
      enrollment_id TEXT REFERENCES admin_enrollment_tokens(id),
      session_id TEXT REFERENCES admin_sessions(id),name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER
    );
    CREATE TABLE pia_access_invites (
      id TEXT PRIMARY KEY,label TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES admin_credentials(id),created_at INTEGER NOT NULL,
      redeem_expires_at INTEGER NOT NULL,used_at INTEGER,revoked_at INTEGER,
      viewer_session_duration INTEGER NOT NULL CHECK(viewer_session_duration>0)
    );
    CREATE TABLE pia_viewer_sessions (
      id TEXT PRIMARY KEY,invite_id TEXT NOT NULL UNIQUE REFERENCES pia_access_invites(id),
      session_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL,revoked_at INTEGER
    );
    CREATE TABLE access_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL,actor TEXT,
      target TEXT,created_at INTEGER NOT NULL
    );
    CREATE INDEX access_audit_created ON access_audit_events(created_at);
    CREATE TABLE access_rate_limits (bucket TEXT PRIMARY KEY,started_at INTEGER NOT NULL,count INTEGER NOT NULL);
    PRAGMA user_version=1;
    COMMIT;
