import {
  buildGuidePrompt,
  parseGuideDraft,
  readGuideRequest,
} from '@/lib/course-guide';
import { resolveModel, providerOptions } from '@/lib/ai-provider';

export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response('Forbidden', { status: 403 });
  const raw = await request.text();
  if (raw.length > 6000)
    return Response.json(
      { error: '输入过长，请精简课程信息。' },
      { status: 413 },
    );
  let settings;
  try {
    settings = readGuideRequest(JSON.parse(raw));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? '课程信息格式无效。'
            : error instanceof Error
              ? error.message
              : '课程信息无效。',
      },
      { status: 400 },
    );
  }
  if (!process.env.OPENAI_API_KEY)
    return Response.json(
      {
        error:
          '尚未配置 AI 服务。请按便携版说明配置服务并重启，也可以手动编写导览。',
      },
      { status: 503 },
    );
  const prompt = buildGuidePrompt(settings);
  try {
    const response = await fetch(
      `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'User-Agent': 'course-knowledge-base/0.4',
        },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
        body: JSON.stringify({
          model: resolveModel(settings.model),
          ...providerOptions(),
          temperature: 0.3,
          max_tokens: 6000,
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: prompt.userMessage },
          ],
        }),
      },
    );
    if (!response.ok)
      return Response.json(
        {
          error:
            'AI 服务暂时不可用，请检查服务配置或稍后重试。已保存的导览不受影响。',
        },
        { status: 502 },
      );
    const data = (await response.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    };
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length')
      throw new Error('生成内容超出长度限制，请减少章节数后重试。');
    if (
      typeof choice?.message?.content !== 'string' ||
      !choice.message.content.trim()
    )
      throw new Error('AI 没有返回导览，请重试。');
    return Response.json({
      draft: parseGuideDraft(choice.message.content, settings.chapterCount),
    });
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    return Response.json(
      {
        error: timeout
          ? '生成已取消或超时，可稍后重试。'
          : error instanceof SyntaxError
            ? 'AI 返回的导览格式不完整，请重试。'
            : error instanceof Error
              ? error.message
              : '导览生成失败，请重试。',
      },
      { status: 502 },
    );
  }
}
