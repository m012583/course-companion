import { aiRuntime } from '@/lib/ai-runtime';
import {
  localSettingsRequest,
  readAiConfig,
  saveAiConfig,
  clearAiConfig,
} from '@/lib/ai-config';
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  try {
    return Response.json((await aiRuntime()).publicSettings(), { headers });
  } catch {
    return Response.json(
      { error: '本机 AI 配置不可用，请重新配置。' },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!localSettingsRequest(request))
    return new Response('Forbidden', { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 5000) throw new Error('配置内容过长。');
    const body = JSON.parse(raw);
    if (body.action === 'save') {
      await saveAiConfig(readAiConfig(body.config));
      return Response.json(
        { message: '配置已加密保存。请测试连接。' },
        { headers },
      );
    }
    if (body.action === 'clear') {
      await clearAiConfig();
      return Response.json(
        { message: '界面配置已清除，已恢复环境文件配置。' },
        { headers },
      );
    }
    if (body.action !== 'test') throw new Error('无效操作。');
    const ai = await aiRuntime();
    if (!ai.apiKey)
      throw new Error('尚未配置 AI。请先保存服务地址、模型和密钥。');
    const start = Date.now();
    const r = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.resolveModel(),
        ...ai.providerOptions(),
        max_tokens: 16,
        messages: [{ role: 'user', content: '请只回复：连接成功' }],
      }),
    });
    if (!r.ok)
      throw new Error(
        r.status === 401 || r.status === 403
          ? '服务拒绝认证，请核对密钥及权限。'
          : r.status === 429
            ? '服务额度不足或请求过于频繁，请检查服务商控制台。'
            : `服务返回 ${r.status}，请核对地址和模型名称。`,
      );
    const data = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    if (!data.choices?.[0]?.message?.content?.trim())
      throw new Error(
        '服务返回了响应，但没有有效文本；请核对模型和接口兼容性。',
      );
    return Response.json(
      { message: `连接成功 · ${Date.now() - start} 毫秒。可以开始教材问答。` },
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name)
            ? '连接超时或已取消，请检查网络后重试。'
            : e instanceof Error
              ? e.message
              : '配置失败。',
      },
      { status: 400, headers },
    );
  }
}
