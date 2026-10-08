import { commitWorkspace, ensureSnapshots } from '@/lib/snapshots';
import { storage } from '@/lib/storage';
import {
  bytesToBase64,
  collectFileIds,
  digest,
  parseBackup,
  remapFileIds,
  validateWorkspace,
  type BackupFile,
} from '@/lib/backup';
async function db() {
  const database = storage().DB;
  await database
    .prepare(
      'CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)',
    )
    .run();
  return database;
}
export async function GET(request?: Request) {
  try {
    const database = await db();
    const snapshot = request
      ? new URL(request.url).searchParams.get('snapshot')
      : null;
    if (snapshot) await ensureSnapshots(database);
    const row = await database
      .prepare(
        snapshot
          ? 'SELECT payload, revision FROM workspace_snapshots WHERE id = ?'
          : 'SELECT payload, revision FROM workspace WHERE id = ?',
      )
      .bind(snapshot || 'local')
      .first<{ payload: string; revision: number }>();
    if (!row) throw new Error('请先等待工作区保存，再导出。');
    const state = validateWorkspace(JSON.parse(row.payload));
    const files: BackupFile[] = [];
    let total = 0;
    const ids = collectFileIds(state);
    if (ids.length > 300) throw new Error('当前备份最多包含 300 个附件。');
    for (const id of ids) {
      const object = await storage().FILES.get(id);
      if (!object)
        throw new Error(
          '有原始附件已不可用，无法生成完整迁移包。可先下载正文备份留档。',
        );
      total += object.size;
      if (total > 50 * 1024 * 1024)
        throw new Error('附件超过 50 MB，请使用正文备份并另存附件。');
      const bytes = new Uint8Array(await object.arrayBuffer());
      files.push({
        id,
        name: object.customMetadata?.name || 'document',
        type: object.httpMetadata?.contentType || 'application/octet-stream',
        data: bytesToBase64(bytes),
        sha256: await digest(bytes),
      });
    }
    return Response.json(
      {
        format: 'course-kb-bundle',
        version: 2,
        exportedAt: new Date().toISOString(),
        state,
        files,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition':
            'attachment; filename="course-kb-backup.kb.json"',
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '备份失败。' },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response('Forbidden', { status: 403 });
  const staged: string[] = [];
  try {
    if (Number(request.headers.get('content-length')) > 80_000_000)
      return Response.json({ error: '备份文件过大。' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 80_000_000) throw new Error('备份文件过大。');
    const body = JSON.parse(raw);
    if (!Number.isInteger(body.revision) || body.revision < 0)
      throw new Error('缺少当前数据版本，请刷新。');
    const { state, files, missing } = parseBackup(body.backup);
    if (missing.length && body.allowMissing !== true)
      throw new Error(
        `旧 JSON 不包含 ${missing.length} 个附件，请确认仅恢复文字。`,
      );
    const database = await db();
    const row = await database
      .prepare('SELECT revision FROM workspace WHERE id = ?')
      .bind('local')
      .first<{ revision: number }>();
    if ((row?.revision ?? 0) !== body.revision)
      return Response.json(
        { error: '其他窗口更新了数据，请刷新后重新选择备份。' },
        { status: 409 },
      );
    const mapping = new Map<string, string>();
    // Validate every checksum before staging; new object IDs never overwrite old files.
    for (const f of files) {
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      if ((await digest(bytes)) !== f.sha256)
        throw new Error(`附件校验失败：${f.name}`);
    }
    for (const f of files) {
      const id = crypto.randomUUID();
      staged.push(id);
      await storage().FILES.put(
        id,
        Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)),
        {
          httpMetadata: { contentType: f.type },
          customMetadata: { name: f.name },
        },
      );
      mapping.set(f.id, id);
    }
    const restored = remapFileIds(state, mapping);
    await database
      .prepare(
        'INSERT OR IGNORE INTO workspace (id,payload,revision) VALUES (?, ?, 0)',
      )
      .bind('local', '{"courses":[],"notes":[]}')
      .run();
    const result = await commitWorkspace(
      database,
      JSON.stringify(restored),
      body.revision,
      'before-restore',
    );
    if (!result.meta.changes)
      throw new Error('恢复期间数据发生变化，已取消恢复，请刷新。');
    staged.length = 0;
    return Response.json({
      state: restored,
      revision: body.revision + 1,
      files: files.length,
      missing: missing.length,
    });
  } catch (error) {
    await Promise.allSettled(staged.map((id) => storage().FILES.delete(id)));
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : '恢复失败，原数据保留。',
      },
      { status: 400 },
    );
  }
}
