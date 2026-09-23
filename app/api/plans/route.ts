import { readAIConfig } from '@/lib/ai-settings';
type PlanCourse = { name: string; materialCount: number; noteCount: number };
type PlanTask = { title: string; kind: string; date: string | null };

export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response('Forbidden', { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    courses?: unknown;
    dueCount?: unknown;
    upcomingCount?: unknown;
    tasks?: unknown;
    model?: unknown;
  } | null;
  if (
    !body ||
    !Array.isArray(body.courses) ||
    typeof body.dueCount !== 'number' ||
    typeof body.upcomingCount !== 'number'
  )
    return Response.json({ error: '无效的规划数据' }, { status: 400 });
  const config = await readAIConfig();
  const apiKey = config.apiKey;
  if (apiKey && !/^[\x21-\x7E]+$/.test(apiKey))
    return Response.json(
      {
        error:
          'AI 密钥格式不正确，请仅填写服务平台生成的密钥，不要包含说明文字或空格。',
      },
      { status: 503 },
    );
  if (!apiKey)
    return Response.json(
      { error: '尚未连接 AI 服务。数据建议仍可使用。' },
      { status: 503 },
    );
  const courses = (body.courses as PlanCourse[])
    .map((c) => ({
      name: String(c.name ?? '').slice(0, 60),
      materialCount: Number(c.materialCount) || 0,
      noteCount: Number(c.noteCount) || 0,
    }))
    .filter((c) => c.name);
  const tasks = (Array.isArray(body.tasks) ? body.tasks : []) as PlanTask[];
  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'course-knowledge-base/0.2',
        },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
        redirect: 'manual',
        body: JSON.stringify({
          model:
            typeof body.model === 'string' && body.model
              ? body.model
              : config.model,
          temperature: 0.3,
          max_tokens: 1600,
          messages: [
            {
              role: 'system',
              content:
                '你是大学生的自主学习规划助手。根据用户的学习数据，给出3至4条可执行的学习规划建议。只返回严格JSON，不要Markdown。结构：{"suggestions":[{"title":"建议标题(不超过12字)","reason":"为什么以及怎么做(不超过120字)"}]}。结合间隔复习(1、3、7、14、30天)、番茄工作法、先复习后学新内容等方法，建议要具体、可执行，不用空话。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                已到期待复习笔记数: body.dueCount,
                未来3天将到期笔记数: body.upcomingCount,
                课程与资料统计: courses,
                待办任务: tasks.slice(0, 30),
              }),
            },
          ],
        }),
      },
    );
    const data = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
      error?: { type?: string };
    } | null;
    if (!response.ok)
      return Response.json(
        {
          error:
            data?.error?.type === 'MissingSessionID'
              ? '当前 AI 服务不兼容这个网页的请求。数据建议仍可使用。'
              : 'AI 服务暂时未能生成建议，请稍后重试。',
        },
        { status: 502 },
      );
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw)
      return Response.json({ error: '模型没有返回建议。' }, { status: 502 });
    const parsed = JSON.parse(raw) as { suggestions?: unknown };
    const suggestions = (
      Array.isArray(parsed?.suggestions) ? parsed.suggestions : []
    )
      .map((s) => {
        const item = s as { title?: unknown; reason?: unknown };
        return {
          title: typeof item.title === 'string' ? item.title.slice(0, 40) : '',
          reason:
            typeof item.reason === 'string' ? item.reason.slice(0, 300) : '',
        };
      })
      .filter((s) => s.title);
    if (!suggestions.length)
      return Response.json(
        { error: '模型返回的建议格式不正确，请重试。' },
        { status: 502 },
      );
    return Response.json({ suggestions });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name === 'TimeoutError'
            ? '生成超时，请稍后重试。'
            : error instanceof SyntaxError
              ? '模型返回的内容无法解析，请重试。'
              : error instanceof Error
                ? '服务请求失败，请检查连接后重试。'
                : '生成失败。',
      },
      { status: 502 },
    );
  }
}
