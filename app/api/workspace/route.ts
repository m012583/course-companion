import { workspaceDb } from '@/lib/workspace-server';
import { parseWorkspace } from '@/lib/workspace-schema';

export async function GET() {
  try {
    const db = await workspaceDb();
    const row = await db
      .prepare('SELECT payload, revision FROM workspace WHERE id = ?')
      .bind('local')
      .first<{ payload: string; revision: number }>();
    return Response.json(
      row
        ? { state: JSON.parse(row.payload), revision: row.revision }
        : { state: null, revision: 0 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '数据库读取失败' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response('Forbidden', { status: 403 });
  let state;
  let revision: number;
  try {
    const body = (await request.json()) as { state: unknown; revision: number };
    state = parseWorkspace(body.state);
    revision = body.revision;
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new Error('版本号无效');
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '无效数据' },
      { status: 400 },
    );
  }
  const payload = JSON.stringify(state);
  if (payload.length > 8000000)
    return Response.json({ error: '知识库过大，请分开保存' }, { status: 413 });
  try {
    const db = await workspaceDb();
    await db
      .prepare(
        'INSERT OR IGNORE INTO workspace (id,payload,revision) VALUES (?, ?, 0)',
      )
      .bind('local', '{"courses":[]}')
      .run();
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    // Save prior state transactionally; conflicting writes create no snapshot.
    const results = await db.batch([
      db
        .prepare(
          "INSERT INTO workspace_recovery (id,created_at,payload) SELECT ?,?,payload FROM workspace WHERE id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM workspace_recovery WHERE id LIKE 'auto-%' AND created_at>?)",
        )
        .bind('auto-' + crypto.randomUUID(), now, 'local', revision, cutoff),
      db
        .prepare(
          'UPDATE workspace SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
        )
        .bind(payload, 'local', revision),
      db
        .prepare(
          "DELETE FROM workspace_recovery WHERE id LIKE 'auto-%' AND id NOT IN (SELECT id FROM workspace_recovery WHERE id LIKE 'auto-%' ORDER BY created_at DESC, id DESC LIMIT 20) AND EXISTS (SELECT 1 FROM workspace WHERE id=? AND revision=?)",
        )
        .bind('local', revision + 1),
    ]);
    const result = results[1];
    if (!result.meta.changes)
      return Response.json(
        { error: '另一个窗口已修改知识库，请刷新后重试' },
        { status: 409 },
      );
    return Response.json({ revision: revision + 1 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '数据库写入失败' },
      { status: 500 },
    );
  }
}
