import { storage } from './storage';
export async function workspaceDb() {
  const db = storage().DB;
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)',
    )
    .run();
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS workspace_recovery (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)',
    )
    .run();
  return db;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
