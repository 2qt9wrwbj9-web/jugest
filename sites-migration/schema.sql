CREATE TABLE sites_relay_refs (namespace TEXT NOT NULL, key TEXT NOT NULL, object_key TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, PRIMARY KEY(namespace,key));
