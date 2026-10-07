// Dedicated access-control database. Never run this against the collection DB.
export function migrateAccess(db){
  const version=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(version===2)return;
  if(version===1){upgradeAccess(db);return}
  if(version!==0)throw new Error('unsupported_access_schema');
  const existing=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  if(existing.length)throw new Error('access_database_not_empty');
  db.exec(`BEGIN IMMEDIATE;
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
    COMMIT;`);
  upgradeAccess(db);
}

// Schema 1 remains a supported input. Only the two PIA sharing tables change.
function upgradeAccess(db){
  db.exec('PRAGMA foreign_keys=OFF;');
  try{
    db.exec('BEGIN IMMEDIATE;');
    const version=Number(db.prepare('PRAGMA user_version').get().user_version);
    if(version===2){db.exec('COMMIT;');return}
    if(version!==1)throw new Error('unsupported_access_schema');
    db.exec(`
      CREATE TABLE pia_access_invites_v2 (
        id TEXT PRIMARY KEY,label TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL REFERENCES admin_credentials(id),created_at INTEGER NOT NULL,
        redeem_expires_at INTEGER NOT NULL,used_at INTEGER,revoked_at INTEGER,
        viewer_session_duration INTEGER CHECK(viewer_session_duration IS NULL OR viewer_session_duration>0)
      );
      INSERT INTO pia_access_invites_v2 SELECT * FROM pia_access_invites;
      CREATE TABLE pia_viewer_sessions_v2 (
        id TEXT PRIMARY KEY,invite_id TEXT NOT NULL UNIQUE REFERENCES pia_access_invites(id),
        session_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,expires_at INTEGER,
        last_used_at INTEGER NOT NULL,revoked_at INTEGER
      );
      INSERT INTO pia_viewer_sessions_v2 SELECT * FROM pia_viewer_sessions;
      DROP TABLE pia_viewer_sessions;
      DROP TABLE pia_access_invites;
      ALTER TABLE pia_access_invites_v2 RENAME TO pia_access_invites;
      ALTER TABLE pia_viewer_sessions_v2 RENAME TO pia_viewer_sessions;
    `);
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('access_foreign_key_check_failed');
    db.exec('PRAGMA user_version=2; COMMIT;');
  }catch(error){try{db.exec('ROLLBACK;')}catch{}throw error}
  finally{db.exec('PRAGMA foreign_keys=ON;')}
}
