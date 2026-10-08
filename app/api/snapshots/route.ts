import { storage } from '@/lib/storage';
import { ensureSnapshots } from '@/lib/snapshots';
export async function GET() {
  try {
    const db = storage().DB;
    await ensureSnapshots(db);
    const rows = await db
      .prepare(
        'SELECT id,revision,created_at,reason FROM workspace_snapshots ORDER BY created_at DESC, rowid DESC LIMIT 30',
      )
      .all();
    return Response.json(
      { snapshots: rows.results },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: '无法读取恢复点。' }, { status: 500 });
  }
}
