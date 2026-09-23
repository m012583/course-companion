import {
  readAIConfig,
  validateAIConfig,
  providerError,
} from '@/lib/ai-settings';
import { workspaceDb, sameOrigin } from '@/lib/workspace-server';
function permitted(request: Request) {
  return (
    sameOrigin(request) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(request.url).hostname,
    ) &&
    request.headers.get('sec-fetch-site') !== 'cross-site'
  );
}
export async function GET(request: Request) {
  if (!permitted(request)) return new Response('Forbidden', { status: 403 });
  try {
    const c = await readAIConfig();
    return Response.json(
      { baseUrl: c.baseUrl, model: c.model, configured: !!c.apiKey },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: '无法读取 AI 设置。' }, { status: 500 });
  }
}
export async function POST(request: Request) {
  if (
    !permitted(request) ||
    !request.headers.get('content-type')?.includes('application/json')
  )
    return new Response('Forbidden', { status: 403 });
  try {
    const body = (await request.json()) as {
      baseUrl?: unknown;
      apiKey?: unknown;
      model?: unknown;
      action?: unknown;
    };
    if (!body || typeof body !== 'object')
      return Response.json({ error: '无效配置' }, { status: 400 });
    const old = await readAIConfig();
    const baseUrl =
      typeof body.baseUrl === 'string'
        ? body.baseUrl.trim().replace(/\/$/, '')
        : old.baseUrl;
    // Never forward a stored credential to a newly entered endpoint.
    const apiKey =
      typeof body.apiKey === 'string' && body.apiKey.trim()
        ? body.apiKey.trim()
        : baseUrl === old.baseUrl
          ? old.apiKey
          : '';
    const c = {
      baseUrl,
      apiKey,
      model: typeof body.model === 'string' ? body.model.trim() : old.model,
    };
    validateAIConfig(c);
    if (body.action === 'test') {
      const result = await fetch(c.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + c.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: c.model,
          messages: [{ role: 'user', content: '只回复 OK' }],
          max_tokens: 32,
        }),
        signal: AbortSignal.timeout(30000),
        redirect: 'manual',
      });
      if (!result.ok)
        return Response.json(
          { error: providerError(result.status) },
          { status: 502 },
        );
      const data = (await result.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      if (!data.choices?.[0]?.message?.content)
        return Response.json(
          { error: '服务未返回有效回答，请核对模型。' },
          { status: 502 },
        );
      return Response.json({ ok: true, message: '连接成功，模型已返回回答。' });
    }
    if (body.action !== 'save')
      return Response.json({ error: '无效操作。' }, { status: 400 });
    const db = await workspaceDb();
    await db
      .prepare('INSERT OR REPLACE INTO ai_settings (id,payload) VALUES (?,?)')
      .bind('local', JSON.stringify(c))
      .run();
    return Response.json({ ok: true, message: '设置已保存到本机服务端。' });
  } catch (e) {
    const message =
      e instanceof Error &&
      ['密钥格式', '请填写', '服务地址'].some((t) => e.message.startsWith(t))
        ? e.message
        : '连接或保存失败，请检查设置后重试。';
    return Response.json({ error: message }, { status: 400 });
  }
}
