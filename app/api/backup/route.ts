import { storage } from '@/lib/storage';
import { workspaceDb, sameOrigin } from '@/lib/workspace-server';
import { parseWorkspace } from '@/lib/workspace-schema';
import {
  checksum,
  encodeBytes,
  decodeBytes,
  fileIds,
  remapFiles,
  validateBackup,
  MAX_BACKUP_BYTES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  type BackupFile,
} from '@/lib/backup';

export async function GET(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const db = await workspaceDb();
    const params = new URL(request.url).searchParams;
    if (params.has('history')) {
      const rows = await db
        .prepare(
          'SELECT id, created_at AS createdAt FROM workspace_recovery ORDER BY created_at DESC',
        )
        .all();
      return Response.json(
        { history: rows.results },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const recoveryId = params.get('recovery');
    const row = recoveryId
      ? await db
          .prepare('SELECT payload FROM workspace_recovery WHERE id = ?')
          .bind(recoveryId)
          .first<{ payload: string }>()
      : await db
          .prepare('SELECT payload FROM workspace WHERE id = ?')
          .bind('local')
          .first<{ payload: string }>();
    if (!row)
      return Response.json(
        { error: '备份数据不存在，请先保存工作区' },
        { status: 404 },
      );
    const state = parseWorkspace(JSON.parse(row.payload));
    const files: BackupFile[] = [];
    let total = 0;
    for (const id of fileIds(state)) {
      const file = await storage().FILES.get(id);
      if (!file) throw new Error(`原文件缺失，无法生成完整备份：${id}`);
      total += file.size;
      if (file.size > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES)
        throw new Error('单文件限制 20 MB，附件总量限制 100 MB');
      const bytes = new Uint8Array(await file.arrayBuffer());
      files.push({
        id,
        name: file.customMetadata?.name ?? 'document',
        type: file.httpMetadata?.contentType ?? 'application/octet-stream',
        size: bytes.length,
        sha256: await checksum(bytes),
        data: encodeBytes(bytes),
      });
    }
    return Response.json(
      {
        format: 'course-companion',
        version: 1,
        createdAt: new Date().toISOString(),
        state,
        files,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition':
            'attachment; filename="course-companion.kbbackup.json"',
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '导出失败' },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const staged: string[] = [];
  let commitAttempted = false;
  try {
    // Bound actual streamed bytes, not only the untrusted Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new Error('缺少备份');
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BACKUP_BYTES) {
        await reader.cancel();
        throw new Error('备份文件超过 150 MB');
      }
      chunks.push(value);
    }
    const body = JSON.parse(
      await new Blob(
        chunks.map((chunk) => new Uint8Array(chunk).buffer),
      ).text(),
    ) as { backup: unknown; revision: number };
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      throw new Error('版本号无效');
    const backup = await validateBackup(body.backup);
    const db = await workspaceDb();
    await db
      .prepare(
        'INSERT OR IGNORE INTO workspace (id,payload,revision) VALUES (?, ?, 0)',
      )
      .bind('local', '{"courses":[],"notes":[]}')
      .run();
    const row = await db
      .prepare('SELECT revision FROM workspace WHERE id = ?')
      .bind('local')
      .first<{ revision: number }>();
    if (row?.revision !== body.revision)
      return Response.json(
        { error: '另一个窗口已修改知识库，请刷新后核对再恢复' },
        { status: 409 },
      );
    const mapping = new Map<string, string>();
    for (const file of backup.files) {
      const id = crypto.randomUUID();
      staged.push(id);
      await storage().FILES.put(id, decodeBytes(file.data), {
        httpMetadata: { contentType: file.type },
        customMetadata: { name: file.name },
      });
      mapping.set(file.id, id);
    }
    const state = remapFiles(backup.state, mapping);
    const recoveryId = crypto.randomUUID();
    // D1 batch is transactional: record the prior state and swap only at the expected revision.
    commitAttempted = true;
    const results = await db.batch([
      db
        .prepare(
          'INSERT INTO workspace_recovery (id,created_at,payload) SELECT ?,?,payload FROM workspace WHERE id = ? AND revision = ?',
        )
        .bind(recoveryId, new Date().toISOString(), 'local', body.revision),
      db
        .prepare(
          'UPDATE workspace SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
        )
        .bind(JSON.stringify(state), 'local', body.revision),
    ]);
    if (!results[1].meta.changes) {
      await Promise.all(staged.map((id) => storage().FILES.delete(id)));
      return Response.json(
        { error: '恢复期间数据发生变化，原数据保持不变，请刷新重试' },
        { status: 409 },
      );
    }
    return Response.json({ state, revision: body.revision + 1, recoveryId });
  } catch (error) {
    // After a transport error during commit, outcome can be uncertain. Retain staged files so a committed state cannot lose attachments.
    if (!commitAttempted)
      await Promise.allSettled(staged.map((id) => storage().FILES.delete(id)));
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '恢复失败，请刷新核对当前数据',
      },
      { status: 400 },
    );
  }
}
