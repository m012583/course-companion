CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_workspace_revision ON workspace(revision);
