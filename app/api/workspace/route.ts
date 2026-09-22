import { storage } from '@/lib/storage';

async function workspaceDb() {
  const db = storage().DB;
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)',
    )
    .run();
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS idx_workspace_revision ON workspace(revision)',
    )
    .run();
  return db;
}

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
  const { state, revision } = (await request.json()) as {
    state: { courses?: unknown[] };
    revision: number;
  };
  if (!state || !Array.isArray(state.courses) || !Number.isInteger(revision))
    return Response.json({ error: '无效备份数据' }, { status: 400 });
  const MAX_COURSE_NAME = 60;
  for (const course of state.courses as { name?: unknown }[]) {
    if (
      !course ||
      typeof course !== 'object' ||
      typeof course.name !== 'string' ||
      !course.name.trim()
    )
      return Response.json(
        { error: '课程数据无效：课程名称不能为空' },
        { status: 400 },
      );
    if (course.name.length > MAX_COURSE_NAME)
      course.name = course.name.trim().slice(0, MAX_COURSE_NAME);
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
    const result = await db
      .prepare(
        'UPDATE workspace SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
      )
      .bind(payload, 'local', revision)
      .run();
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
