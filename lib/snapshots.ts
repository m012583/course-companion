// Snapshots retain workspace JSON; immutable attachment IDs continue to reference
// the same R2 bytes. Export a full bundle for protection against disk loss.
export async function ensureSnapshots(db: D1Database) {
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS workspace_snapshots (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL)',
    )
    .run();
}
export async function commitWorkspace(
  db: D1Database,
  payload: string,
  revision: number,
  reason: 'automatic' | 'before-restore',
) {
  await ensureSnapshots(db);
  const now = new Date().toISOString(),
    before = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  // D1 batch is a transaction: the guarded snapshot and workspace update see
  // the same revision. A conflicting writer cannot create a misleading copy.
  const results = await db.batch([
    db
      .prepare(`INSERT INTO workspace_snapshots (id,payload,revision,created_at,reason)
      SELECT ?,payload,revision,?,? FROM workspace WHERE id='local' AND revision=?
      AND (?='before-restore' OR NOT EXISTS (SELECT 1 FROM workspace_snapshots WHERE reason='automatic' AND created_at>?))`)
      .bind(crypto.randomUUID(), now, reason, revision, reason, before),
    db
      .prepare(
        'UPDATE workspace SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
      )
      .bind(payload, 'local', revision),
    db.prepare(
      "DELETE FROM workspace_snapshots WHERE reason='automatic' AND id NOT IN (SELECT id FROM workspace_snapshots WHERE reason='automatic' ORDER BY created_at DESC, rowid DESC LIMIT 20)",
    ),
    db.prepare(
      "DELETE FROM workspace_snapshots WHERE reason='before-restore' AND id NOT IN (SELECT id FROM workspace_snapshots WHERE reason='before-restore' ORDER BY created_at DESC, rowid DESC LIMIT 10)",
    ),
  ]);
  return results[1];
}
