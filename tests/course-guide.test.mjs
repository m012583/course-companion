import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleUrl(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  if (source.includes('@/lib/chapter-lesson'))
    source = source.replace(
      '@/lib/chapter-lesson',
      await moduleUrl('../lib/chapter-lesson.ts'),
    );
  if (source.includes('@/lib/ai-provider'))
    source = source.replace(
      '@/lib/ai-provider',
      await moduleUrl('../lib/ai-provider.ts'),
    );
  for (const [from, to] of replacements) source = source.replace(from, to);
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
}
const guideUrl = await moduleUrl('../lib/course-guide.ts');
const {
  readGuideRequest,
  readGuideContent,
  parseGuideDraft,
  buildGuidePrompt,
  chapterToMarkdown,
} = await import(guideUrl);
const { POST } = await import(
  await moduleUrl('../app/api/course-guide/route.ts', [
    ['@/lib/course-guide', guideUrl],
  ])
);
const modelDraft = {
  courseOverview: '学习矩阵与线性空间，建立代数和几何之间的联系。',
  chapters: ['矩阵', '线性方程组', '向量空间', '特征值'].map((title) => ({
    title,
    narrative: `了解${title}的核心概念与用途。`,
    keyConcepts: ['定义', '基本运算', '几何解释'],
    prerequisites: [],
    learningGoals: ['解释一个简单的例子'],
  })),
};
const settings = {
  courseName: '线性代数',
  chapterCount: 4,
  major: '计算机',
  textbook: '指定教材',
};
const request = (body, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/course-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });

test('course name alone works with bounded defaults; unrelated workspace data is excluded', () => {
  const input = readGuideRequest({
    courseName: '  线性代数  ',
    notes: ['private'],
    apiKey: 'never forward',
  });
  assert.equal(input.courseName, '线性代数');
  assert.equal(input.chapterCount, 8);
  assert.equal(input.major, '');
  const prompt = buildGuidePrompt(input);
  assert.equal(JSON.parse(prompt.userMessage).notes, undefined);
  assert.equal(JSON.parse(prompt.userMessage).apiKey, undefined);
  for (const invalid of [
    null,
    [],
    {},
    { courseName: ' ' },
    { courseName: 'x'.repeat(61) },
    { ...settings, chapterCount: 13 },
    { ...settings, chapterCount: 4.1 },
    { ...settings, textbook: {} },
  ])
    assert.throws(() => readGuideRequest(invalid));
});

test('model drafts tolerate JSON fences but reject incomplete or fabricated structures', () => {
  const content = parseGuideDraft(
    `草稿：\n\x60\x60\x60json\n${JSON.stringify(modelDraft)}\n\x60\x60\x60`,
    4,
  );
  assert.equal(content.chapters.length, 4);
  assert.equal(new Set(content.chapters.map((chapter) => chapter.id)).size, 4);
  assert.throws(() => parseGuideDraft(JSON.stringify(modelDraft), 8), /不完整/);
  assert.throws(() => parseGuideDraft('not json', 4));
  for (const patch of [
    { title: '' },
    { narrative: 'x'.repeat(361) },
    { keyConcepts: [] },
    { keyConcepts: 'bad' },
    { keyConcepts: ['重复', '重复'] },
    { prerequisites: [42] },
    { learningGoals: [] },
  ]) {
    assert.throws(() =>
      parseGuideDraft(
        JSON.stringify({
          ...modelDraft,
          chapters: [
            { ...modelDraft.chapters[0], ...patch },
            ...modelDraft.chapters.slice(1),
          ],
        }),
        4,
      ),
    );
  }
  assert.throws(
    () =>
      parseGuideDraft(
        JSON.stringify({
          ...modelDraft,
          chapters: Array(4).fill(modelDraft.chapters[0]),
        }),
        4,
      ),
    /重复/,
  );
});

test('manual editing and reordering preserve chapter identity through serialization; note text carries provenance', () => {
  const draft = parseGuideDraft(JSON.stringify(modelDraft), 4);
  const originalId = draft.chapters[3].id;
  const edited = readGuideContent(
    JSON.parse(
      JSON.stringify({ ...draft, chapters: [...draft.chapters].reverse() }),
    ),
    true,
  );
  assert.equal(edited.chapters[0].id, originalId);
  const markdown = chapterToMarkdown('线性代数', edited.chapters[0], 'ai');
  assert.match(markdown, /AI 课程导览初稿/);
  assert.match(markdown, /尚未按授课教材校准/);
  assert.match(markdown, /## 主要知识点/);
  assert.throws(
    () =>
      readGuideContent(
        {
          ...draft,
          chapters: draft.chapters.map((chapter) => ({
            ...chapter,
            id: 'same',
          })),
        },
        true,
      ),
    /标识重复/,
  );
  const minimal = readGuideContent(
    { courseOverview: '手动编写', chapters: [draft.chapters[0]] },
    true,
  );
  assert.equal(minimal.chapters.length, 1);
});

test('invalid origins, input and missing AI configuration never consume a model call', async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.OPENAI_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('unexpected');
  };
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal(
      (await POST(request(settings, 'https://foreign.example'))).status,
      403,
    );
    assert.equal((await POST(request(null))).status, 400);
    assert.equal(
      (await POST(request({ ...settings, chapterCount: 99 }))).status,
      400,
    );
    assert.equal(
      (await POST(request({ courseName: 'x'.repeat(7000) }))).status,
      413,
    );
    assert.equal((await POST(request(settings))).status, 503);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});

test('generation makes one bounded server request and only returns a validated draft, with no retries', async () => {
  const originalFetch = globalThis.fetch;
  const key = process.env.OPENAI_API_KEY;
  const base = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = 'test-only-key';
  process.env.OPENAI_BASE_URL = 'https://provider.example/v1/';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://provider.example/v1/chat/completions');
    const payload = JSON.parse(options.body);
    assert.equal(payload.max_tokens, 6000);
    assert.equal(payload.model, 'test-model');
    assert.equal(
      JSON.parse(payload.messages[1].content).courseName,
      settings.courseName,
    );
    assert.equal(
      JSON.parse(payload.messages[1].content).textbook,
      settings.textbook,
    );
    return Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify(modelDraft) },
        },
      ],
    });
  };
  try {
    const result = await POST(request({ ...settings, model: 'test-model' }));
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(await result.json()), ['draft']);
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      return new Response('failure', { status: 429 });
    };
    const failure = await POST(request(settings));
    assert.equal(failure.status, 502);
    assert.equal((await failure.json()).draft, undefined);
    assert.equal(calls, 2);
    globalThis.fetch = async () =>
      Response.json({ choices: [{ message: { content: '{"chapters":[]}' } }] });
    assert.equal((await POST(request(settings))).status, 502);
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'length',
            message: { content: JSON.stringify(modelDraft) },
          },
        ],
      });
    assert.equal((await POST(request(settings))).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
    if (base === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = base;
  }
});
