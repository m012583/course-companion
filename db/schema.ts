import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull().default(0),
});

export const workspaceSnapshots = sqliteTable('workspace_snapshots', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull(),
  createdAt: text('created_at').notNull(),
  reason: text('reason').notNull(),
});
