CREATE TABLE IF NOT EXISTS workspace_snapshots (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL);
