import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const {
  readLessonRequest,
  lessonRequest,
  lessonSourceKey,
  parseLesson,
  readSavedLesson,
  buildLessonPrompt,
  saveLessonToGuide,
  makeLearningContext,
  readLearningContext,
  learningContextPrompt,
} = await import(await moduleUrl('../lib/chapter-lesson.ts'));
const { readGuideContent, chapterToMarkdown } = await import(
  await moduleUrl('../lib/course-guide.ts')
);
const { POST: generate } = await import(
  await moduleUrl('../app/api/chapter-lesson/route.ts')
);
const { POST: chat } = await import(
  await moduleUrl('../app/api/chat/route.ts')
);
const chapter = {
  id: 'chapter-1',
  title: '矩阵',
  narrative: '用矩阵表示线性变换。',
  keyConcepts: ['矩阵乘法', '单位矩阵'],
  prerequisites: [],
  learningGoals: ['说明矩阵乘法的意义'],
};
const guide = {
  version: 1,
  source: 'ai',
  generatedFor: '线性代数',
  courseOverview: '连接代数与几何。',
  settings: { level: '本科', major: '', textbook: '', chapterCount: 4 },
  chapters: [chapter],
  createdAt: '2026-09-26',
  updatedAt: '2026-09-26',
};
const input = lessonRequest('线性代数', guide, chapter, 'fixture-model');
const content = {
  overview: '学习用矩阵表示变换及组合。',
  concepts: chapter.keyConcepts.map((term) => ({
    term,
    explanation: `${term}的含义与应用。`,
    example: '单位矩阵乘一个向量，结果仍是原向量。',
    pitfall: '必须检查矩阵的维数。',
    questions: [`为什么需要${term}？`],
  })),
  recap: ['先检查维数，再计算。'],
};
const lesson = parseLesson(JSON.stringify(content), input);
const request = (
  body,
  route = 'chapter-lesson',
  origin = 'http://localhost:3000',
  signal,
) =>
  new Request(`http://localhost:3000/api/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
    signal,
  });

test('a lesson request contains only the selected chapter and bounded course metadata', () => {
  const value = readLessonRequest({
    ...input,
    notes: ['private'],
    apiKey: 'secret',
    chapters: [{ secret: 1 }],
    chapter: { ...chapter, lesson, private: 'hidden' },
  });
  const prompt = buildLessonPrompt(value);
  assert.equal(JSON.parse(prompt.userMessage).chapter.id, chapter.id);
  assert.doesNotMatch(
    prompt.userMessage,
    /private|secret|hidden|fixture-model/,
  );
  assert.match(prompt.systemPrompt, /数量、顺序、term/);
  for (const patch of [
    { chapter: { ...chapter, keyConcepts: [] } },
    { chapter: { ...chapter, keyConcepts: ['重复', '重复'] } },
    { courseOverview: 'x'.repeat(601) },
  ])
    assert.throws(() => readLessonRequest({ ...input, ...patch }));
});

test('AI output must explain every original concept in order, including examples, pitfalls, and questions', () => {
  assert.deepEqual(readSavedLesson(lesson), lesson);
  assert.deepEqual(
    parseLesson('```json\n' + JSON.stringify(content) + '\n```', input)
      .concepts,
    content.concepts,
  );
  for (const concepts of [
    content.concepts.slice(1),
    [...content.concepts].reverse(),
    [{ ...content.concepts[0], example: '' }, content.concepts[1]],
  ])
    assert.throws(() =>
      parseLesson(JSON.stringify({ ...content, concepts }), input),
    );
  assert.throws(() => parseLesson('unfinished {', input));
});

test('outline edits retain saved lessons, mark content changes stale, and note conversion includes explanations', () => {
  const saved = saveLessonToGuide(
    guide,
    '线性代数',
    chapter.id,
    lesson,
    lesson.sourceKey,
  );
  const edited = readGuideContent(JSON.parse(JSON.stringify(saved)), true);
  assert.deepEqual(edited.chapters[0].lesson, lesson);
  assert.match(
    chapterToMarkdown('线性代数', edited.chapters[0], 'ai'),
    /矩阵乘法的含义与应用/,
  );
  assert.equal(
    lessonSourceKey({ ...input, model: 'different' }),
    lesson.sourceKey,
  );
  assert.notEqual(
    lessonSourceKey({ ...input, chapter: { ...chapter, title: '新标题' } }),
    lesson.sourceKey,
  );
  const deleted = {
    ...chapter,
    lesson: { ...lesson, deletedAt: '2026-09-26' },
  };
  assert.doesNotMatch(
    chapterToMarkdown('线性代数', deleted, 'ai'),
    /矩阵乘法的含义与应用/,
  );
});

test('late generation cannot resurrect removed chapters or replace content after an outline edit', () => {
  const changed = {
    ...guide,
    chapters: [{ ...chapter, narrative: '新的范围' }],
  };
  const removed = { ...guide, chapters: [] };
  const deleted = { ...guide, deletedAt: '2026-09-26' };
  for (const current of [changed, removed, deleted, undefined])
    assert.equal(
      saveLessonToGuide(
        current,
        '线性代数',
        chapter.id,
        lesson,
        lesson.sourceKey,
      ),
      current,
    );
  assert.equal(
    saveLessonToGuide(
      guide,
      '线性代数',
      chapter.id,
      { ...lesson, sourceKey: 'bad' },
      lesson.sourceKey,
    ),
    guide,
  );
  assert.equal(
    saveLessonToGuide(changed, '线性代数', chapter.id, {
      ...lesson,
      source: 'manual',
    }).chapters[0].lesson.source,
    'manual',
  );
});

test('questions retain an independent snapshot and include only the selected concept when linked', () => {
  const withLesson = { ...chapter, lesson: structuredClone(lesson) };
  const context = makeLearningContext(
    'course-1',
    '线性代数',
    guide,
    withLesson,
    '矩阵乘法',
  );
  assert.match(context.text, /矩阵乘法的含义与应用/);
  assert.doesNotMatch(context.text, /单位矩阵的含义与应用/);
  withLesson.lesson.concepts[0].explanation = 'changed';
  withLesson.lesson.deletedAt = '2026-09-26';
  assert.doesNotMatch(context.text, /changed/);
  assert.deepEqual(
    readLearningContext(JSON.parse(JSON.stringify(context))),
    context,
  );
  assert.match(learningContextPrompt(context), /不得给它分配/);
  const stale = makeLearningContext(
    'course-1',
    '线性代数',
    guide,
    withLesson,
    '新知识点',
  );
  assert.match(stale.text, /新知识点/);
  const missing = makeLearningContext(
    'course-1',
    '线性代数',
    guide,
    { ...chapter, lesson },
    '新知识点',
  );
  assert.ok(readLearningContext(missing)?.text);
  assert.throws(() =>
    readLearningContext({ ...context, text: 'x'.repeat(14001) }),
  );
});

test('invalid generation input, foreign origin and missing configuration make no paid call', async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error('unexpected');
  };
  try {
    assert.equal(
      (await generate(request(input, 'chapter-lesson', 'https://foreign.test')))
        .status,
      403,
    );
    assert.equal((await generate(request(null))).status, 400);
    assert.equal(
      (await generate(request({ ...input, courseName: 'x'.repeat(16000) })))
        .status,
      413,
    );
    assert.equal((await generate(request(input))).status, 503);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('one chapter uses one model request and failures are surfaced without retries or fake content', async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.OPENAI_API_KEY,
    originalBase = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = 'https://provider.test/v1';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://provider.test/v1/chat/completions');
    const payload = JSON.parse(options.body);
    assert.equal(payload.max_tokens, 5000);
    assert.equal(payload.model, 'fixture-model');
    return Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify(content) },
        },
      ],
    });
  };
  try {
    const success = await generate(request(input));
    assert.equal(success.status, 200);
    assert.equal((await success.json()).lesson.sourceKey, lesson.sourceKey);
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      return new Response('no balance', { status: 402 });
    };
    const failed = await generate(request(input));
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).lesson, undefined);
    assert.equal(calls, 2);
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'length',
            message: { content: JSON.stringify(content) },
          },
        ],
      });
    assert.equal((await generate(request(input))).status, 502);
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            message: { content: JSON.stringify({ ...content, concepts: [] }) },
          },
        ],
      });
    assert.equal((await generate(request(input))).status, 502);
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.signal.aborted, true);
      throw new DOMException('aborted', 'AbortError');
    };
    const abort = new AbortController();
    abort.abort();
    assert.equal(
      (
        await generate(
          request(
            input,
            'chapter-lesson',
            'http://localhost:3000',
            abort.signal,
          ),
        )
      ).status,
      502,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [
      ['OPENAI_API_KEY', originalKey],
      ['OPENAI_BASE_URL', originalBase],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('context-aware chat forwards the saved lesson separately from evidence and does not leak it into ordinary chat', async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return Response.json({
      choices: [{ message: { content: '矩阵表示变换。[S1]' } }],
    });
  };
  const context = makeLearningContext(
    'course-1',
    '线性代数',
    guide,
    { ...chapter, lesson },
    '矩阵乘法',
  );
  try {
    const result = await chat(
      request(
        { question: '为什么？', learningContext: context, contexts: [] },
        'chat',
      ),
    );
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.scope.lessonTitle, '矩阵 · 矩阵乘法');
    assert.deepEqual(data.evidence, []);
    assert.match(data.answer, /无对应原文/);
    assert.equal(payload.messages[1].role, 'system');
    assert.match(payload.messages[1].content, /矩阵乘法的含义与应用/);
    await chat(request({ question: '普通提问', contexts: [] }, 'chat'));
    assert.equal(payload.messages.length, 2);
    assert.doesNotMatch(
      JSON.stringify(payload.messages),
      /矩阵乘法的含义与应用/,
    );
    assert.equal(
      (
        await chat(
          request(
            { question: 'x', learningContext: { ...context, text: '' } },
            'chat',
          ),
        )
      ).status,
      400,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('overlong or malformed optional follow-ups do not discard a complete paid lesson', () => {
  const parsed = parseLesson(
    JSON.stringify({
      ...content,
      concepts: content.concepts.map((concept) => ({
        ...concept,
        questions: ['x'.repeat(241), { bad: true }, '短问题'],
      })),
    }),
    input,
  );
  assert.deepEqual(parsed.concepts[0].questions, ['短问题']);
  const fallback = parseLesson(
    JSON.stringify({
      ...content,
      concepts: content.concepts.map((concept) => ({
        ...concept,
        questions: [],
      })),
    }),
    input,
  );
  assert.match(fallback.concepts[0].questions[0], /矩阵乘法/);
  assert.equal(
    fallback.concepts[0].explanation,
    content.concepts[0].explanation,
  );
});
