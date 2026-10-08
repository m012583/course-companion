import test from 'node:test';
import assert from 'node:assert/strict';

import { moduleUrl as loadTs } from './load-ts.mjs';
const knowledgeUrl = await loadTs('../lib/knowledge.ts');
const {
  retrieve,
  normalizeMath,
  splitPassages,
  passageText,
  coverageLabel,
  scheduleReview,
  isDue,
  localDate,
  selectNotes,
} = await import(knowledgeUrl);
const material = (name, text, page = 1) => ({
  name,
  fileId: name,
  type: 'PDF',
  size: '1 KB',
  status: '可检索',
  passages: splitPassages(text, page),
});

test('retrieval reaches a relevant passage after the old 24,000-character and eight-file limits', () => {
  const documents = Array.from({ length: 12 }, (_, i) =>
    material(
      `course-${i}`,
      i === 11
        ? '无关资料。'.repeat(7000) + '谱分解定理说明矩阵的特征向量结构。'
        : '其他课程内容。',
    ),
  );
  const evidence = retrieve('谱分解定理', documents);
  assert.ok(
    evidence.some(
      (item) => item.name === 'course-11' && item.quote.includes('谱分解定理'),
    ),
  );
  assert.equal(evidence[0].page, 1);
  assert.equal(evidence[0].fileId, 'course-11');
});
test('unmatched documents never produce invented evidence', () =>
  assert.deepEqual(
    retrieve('spectral', [material('notes', '二叉树结构')]),
    [],
  ));
test('retrieval retains page provenance and respects context budget', () => {
  const document = { ...material('textbook', '特征向量 '.repeat(5000), 47) };
  const sources = retrieve('特征向量', [document], 3600);
  assert.ok(sources.length > 0);
  assert.ok(sources.reduce((sum, s) => sum + s.quote.length, 0) <= 3600);
  assert.ok(sources.every((s) => s.page === 47 && s.section === '第 47 页'));
});
test('reading text does not repeat overlapping retrieval passages', () => {
  const text = 'This is a long paragraph. '.repeat(300);
  assert.equal(passageText(splitPassages(text)), text);
});
test('legacy coverage is explicitly unknown and partial extraction is disclosed', () => {
  assert.match(coverageLabel({ content: 'old text' }), /覆盖范围未知/);
  assert.match(
    coverageLabel({
      passages: splitPassages('test'),
      coverage: {
        characters: 4,
        totalPages: 30,
        readPages: 2,
        emptyPages: 1,
        truncated: true,
      },
    }),
    /读取 2\/30 页.*仅提取部分.*1 页/,
  );
});
test('review rolls over month boundaries and incorrect recalls reset the interval', () => {
  const first = scheduleReview(
    { reviewCount: 0 },
    true,
    new Date(2026, 0, 31, 12),
  );
  assert.equal(first.reviewAt, '2026-02-01');
  const second = scheduleReview(first, true, new Date(2026, 1, 1, 12));
  assert.equal(second.reviewAt, '2026-02-04');
  const wrong = scheduleReview(
    { reviewCount: 4 },
    false,
    new Date(2026, 11, 31, 12),
  );
  assert.equal(wrong.reviewAt, '2027-01-01');
  assert.equal(wrong.reviewCount, 0);
});
test('mastered notes still return for scheduled review', () => {
  assert.equal(
    isDue({ mastery: '已掌握', reviewAt: '2026-09-01' }, '2026-09-11'),
    true,
  );
  assert.equal(isDue({ reviewAt: '2026-09-12' }, '2026-09-11'), false);
  assert.equal(localDate(new Date(2026, 8, 11, 0, 5)), '2026-09-11');
});
test('note filters combine correctly without changing full-library counts or leaking hidden details', () => {
  const notes = [
    {
      id: '1',
      title: '特征向量',
      text: '矩阵',
      courseId: 'a',
      course: '数学',
      createdAt: '2026-01-01',
      updatedAt: '2026-09-11',
      reviewAt: '2000-01-01',
      tags: ['易错'],
      chapter: '第一章',
    },
    {
      id: '2',
      title: '二叉树',
      text: '结构',
      courseId: 'b',
      course: '计算机',
      createdAt: '2026-09-01',
    },
    {
      id: '3',
      title: '矩阵求逆',
      text: '运算',
      courseId: 'a',
      course: '数学',
      createdAt: '2026-09-02',
      reviewAt: '2999-01-01',
    },
  ];
  assert.equal(selectNotes(notes, {})[0].id, '1');
  assert.deepEqual(
    selectNotes(notes, {
      courseId: 'a',
      tag: '易错',
      dueOnly: true,
      query: '矩阵',
    }).map((n) => n.id),
    ['1'],
  );
  assert.deepEqual(selectNotes(notes, { courseId: 'b', dueOnly: true }), []);
  assert.equal(notes.length, 3);
});

const { POST } = await import(
  await loadTs('../app/api/chat/route.ts', [
    ["'@/lib/knowledge'", JSON.stringify(knowledgeUrl)],
  ])
);
test('overview requests can use actual representative passages without a search term', () => {
  const sources = retrieve('总结', [
    material('lecture-a', '二叉树定义'),
    material('lecture-b', '矩阵运算'),
  ]);
  assert.equal(sources.length, 2);
  assert.deepEqual(
    sources.map((s) => s.quote),
    ['二叉树定义', '矩阵运算'],
  );
});
test('malformed chat payload returns a recoverable validation error', async () => {
  const response = await POST(
    new Request('http://localhost/api/chat', { method: 'POST', body: 'null' }),
  );
  assert.equal(response.status, 400);
});
test('chat source links contain only actual excerpts; unknown citation IDs are removed', async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'unit-test-only';
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return Response.json({
      choices: [
        {
          message: { content: '矩阵特征向量的定义 [S1]。不存在的来源 [S99]。' },
        },
      ],
    });
  };
  try {
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: '矩阵特征向量',
          contexts: [material('algebra', '矩阵特征向量满足 Av = λv。', 18)],
        }),
      }),
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.evidence.length, 1);
    assert.equal(data.evidence[0].page, 18);
    assert.equal(data.evidence[0].quote, '矩阵特征向量满足 Av = λv。');
    assert.ok(!data.answer.includes('[S99]'));
    assert.match(sent.messages[0].content, /第 18 页/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
test('missing AI configuration is an error, never a fabricated successful answer', async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ question: 'test' }),
      }),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).answer, undefined);
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});

test('malformed historical image references are rejected before a provider call', async () => {
  const response = await POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: '继续解释',
        history: [
          {
            role: 'user',
            content: '看图',
            images: [
              { fileId: 'https://external.example/image', name: 'fake.png' },
            ],
          },
        ],
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /图片信息无效/);
});

test('provider LaTeX delimiters render as math without changing code examples', () => {
  assert.equal(normalizeMath(String.raw`inline \(x^2\)`), 'inline $x^2$');
  assert.match(normalizeMath(String.raw`\[x=2\]`), /\$\$\nx=2\n\$\$/);
  const literal =
    'literal ' +
    String.fromCharCode(96) +
    String.raw`\(x\)` +
    String.fromCharCode(96);
  assert.equal(normalizeMath(literal), literal);
});
