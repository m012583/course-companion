import { ensureSnapshots } from '@/lib/snapshots';
import { storage } from '@/lib/storage';

export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size > 20 * 1024 * 1024)
    return Response.json({ error: '文件必须小于20MB' }, { status: 400 });
  const id = crypto.randomUUID();
  await storage().FILES.put(id, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { name: file.name },
  });
  return Response.json({ id });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  const file = await storage().FILES.get(id);
  if (!file) return new Response('文件不存在', { status: 404 });
  return new Response(file.body, {
    headers: {
      'Content-Type':
        file.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.customMetadata?.name || 'document')}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  });
}

export async function DELETE(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response('Forbidden', { status: 403 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return Response.json({ error: '缺少文件标识' }, { status: 400 });
  const db = storage().DB;
  await ensureSnapshots(db);
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)',
    )
    .run();
  const retained = await db
    .prepare(
      'SELECT 1 AS found FROM workspace WHERE instr(payload, ?) > 0 UNION ALL SELECT 1 AS found FROM workspace_snapshots WHERE instr(payload, ?) > 0 LIMIT 1',
    )
    .bind(id, id)
    .first();
  if (retained)
    return Response.json(
      { error: '附件仍被工作区或恢复点引用，不能永久删除。' },
      { status: 409 },
    );
  await storage().FILES.delete(id);
  return Response.json({ ok: true });
}
