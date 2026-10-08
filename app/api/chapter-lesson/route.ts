import {
  buildLessonPrompt,
  parseLesson,
  readLessonRequest,
} from '@/lib/chapter-lesson';
import { providerOptions, resolveModel } from '@/lib/ai-provider';
import { readMaterials, cleanCitations } from '@/lib/retrieval';
import {
  sourcePassagesForChapter,
  contentFingerprint,
} from '@/lib/textbook-calibration';

export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response('Forbidden', { status: 403 });
  const raw = await request.text();
  if (raw.length > 6500000)
    return Response.json(
      { error: '章节信息过长，请精简后重试。' },
      { status: 413 },
    );
  let input;
  let materials;
  try {
    const body = JSON.parse(raw);
    if (body && JSON.stringify({ ...body, contexts: undefined }).length > 16000)
      return Response.json(
        { error: '章节信息过长，请精简后重试。' },
        { status: 413 },
      );
    input = readLessonRequest(body);
    materials = readMaterials(body.contexts);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? '章节信息格式无效。'
            : error instanceof Error
              ? error.message
              : '章节信息无效。',
      },
      { status: 400 },
    );
  }
  if (!process.env.OPENAI_API_KEY)
    return Response.json(
      { error: '尚未配置 AI 服务，已保存的导览仍可阅读。' },
      { status: 503 },
    );
  try {
    const prompt = buildLessonPrompt(input);
    const evidence = sourcePassagesForChapter(
      input.chapter.title,
      input.chapter.keyConcepts,
      materials,
    );
    if (evidence.length) {
      prompt.systemPrompt = prompt.systemPrompt.replace(
        '这是通用学习材料，没有教材原文。不得声称已读教材，不得编造引文、页码、课程要求或参考链接。',
        '当前只提供部分教材片段，不代表读过完整教材。优先依据原文解释，有依据的句子末标注 [S1] 等已有编号。不能伪造编号、页码或原文。未被片段覆盖的知识点须写明“资料未覆盖，以下为通用说明”，示例若是自行构造必须注明。',
      );
      prompt.userMessage = JSON.stringify({
        ...JSON.parse(prompt.userMessage),
        evidence,
      });
    }
    const response = await fetch(
      `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
        body: JSON.stringify({
          model: resolveModel(input.model),
          ...providerOptions(),
          temperature: 0.25,
          max_tokens: 5000,
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
            '章节讲解生成失败，请检查服务余额或稍后重试。已保存的内容保留。',
        },
        { status: 502 },
      );
    const data = (await response.json()) as {
      choices?: { finish_reason?: string; message?: { content?: string } }[];
    };
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length')
      throw new Error('本章讲解未生成完整，请重试。');
    if (
      typeof choice?.message?.content !== 'string' ||
      !choice.message.content.trim()
    )
      throw new Error('AI 未返回章节讲解，请重试。');
    const lesson = parseLesson(choice.message.content, input);
    for (const concept of lesson.concepts) {
      concept.explanation = cleanCitations(concept.explanation, evidence);
      concept.example = cleanCitations(concept.example, evidence);
      concept.pitfall = cleanCitations(concept.pitfall, evidence);
    }
    lesson.overview = cleanCitations(lesson.overview, evidence);
    lesson.recap = lesson.recap.map((text) => cleanCitations(text, evidence));
    if (evidence.length) {
      lesson.evidence = evidence;
      lesson.materialFingerprint = contentFingerprint(materials);
    }
    return Response.json({ lesson });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? 'AI 返回的讲解格式不完整，请重试。'
            : error instanceof Error &&
                ['TimeoutError', 'AbortError'].includes(error.name)
              ? '生成已停止或超时，之前完成的章节已保留。'
              : error instanceof Error
                ? error.message
                : '章节讲解生成失败。',
      },
      { status: 502 },
    );
  }
}
