// Opt-in, read-only API evaluation. Does not modify courses, notes or conversations.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { moduleUrl } from '../tests/load-ts.mjs';
const { demoMaterial, RETRIEVAL_FIXTURES } = await import(
  await moduleUrl('../lib/demo-course.ts')
);
const { retrieve } = await import(await moduleUrl('../lib/knowledge.ts'));
const { rankEvidence } = await import(await moduleUrl('../lib/retrieval.ts'));
const { readEventStream } = await import(
  await moduleUrl('../lib/event-stream.ts')
);
const material = demoMaterial();
const cases = [
  {
    id: 'order',
    query: '列向量先经过 B，再经过 A，对应的总矩阵应怎样写？',
    expected: ['矩阵乘法'],
    answer: 'AB；先求 Bx，再算 A(Bx)，顺序不可任意交换。',
  },
  {
    id: 'rank',
    query: '一个矩阵的所有列里面，最多能挑出多少个线性无关的列，这个数叫什么？',
    expected: ['矩阵的秩'],
    answer: '矩阵的秩，等于列空间维数或最大线性无关列组的列数。',
  },
  {
    id: 'zero',
    query: '若非零向量 v 满足 Av=0，它能叫特征向量吗？对应的特征值是多少？',
    expected: ['特征值'],
    answer: '可以，v 是对应特征值 0 的特征向量；v 本身必须非零。',
  },
  {
    id: 'solution',
    query: '当系数矩阵与增广矩阵的秩不同，方程组还有解吗？',
    expected: ['线性方程组'],
    answer: '无解；Ax=b 有解当且仅当两个秩相等。',
  },
];
const live = process.argv.includes('--live');
const baseFlag = process.argv.indexOf('--base-url');
const base = new URL(
  baseFlag >= 0 ? process.argv[baseFlag + 1] : 'http://127.0.0.1:3002',
);
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  throw new Error('Evaluation requires a local server URL.');
const report = {
  evaluatedAt: new Date().toISOString(),
  scope:
    '原创短讲义，公开回归 6 题 + 另外 4 题；非独立盲测。引用编号/金标准小节命中为自动指标，答案准确性和引用是否支持对应断言需人工复核。',
  live,
  regression: RETRIEVAL_FIXTURES.map((q) => ({
    ...q,
    baseline: retrieve(q.query, [material])[0]?.section ?? null,
    enhanced: rankEvidence(q.query, [material])[0]?.section ?? null,
  })),
  results: [],
};
if (live) {
  const settingsResponse = await fetch(new URL('/api/ai-settings', base));
  const settings = await settingsResponse.json();
  if (!settings.configured)
    throw new Error(
      'AI is not configured. Omit --live to run the free retrieval evaluation.',
    );
  report.model = settings.defaultModel;
  console.log(
    'Running 4 paired questions: 8 answer requests, plus up to 4 short semantic rewrites. No workspace writes.',
  );
}
for (const fixture of cases) {
  const row = { ...fixture, variants: [] };
  for (const variant of ['baseline', 'enhanced']) {
    let data;
    if (live) {
      const response = await fetch(new URL('/api/chat', base), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept:
            variant === 'enhanced' ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify({
          question: fixture.query + ' 请在100字以内简洁回答并给出原文编号。',
          contexts: [material],
          course: '线性代数',
          semantic: variant === 'enhanced',
        }),
        signal: AbortSignal.timeout(105000),
      });
      if (
        variant === 'enhanced' &&
        response.headers.get('content-type')?.includes('text/event-stream')
      ) {
        for await (const raw of readEventStream(response.body)) {
          const event = JSON.parse(raw);
          if (event.type === 'error') throw new Error(event.error);
          if (event.type === 'done') data = event;
        }
      } else data = await response.json();
      if (!response.ok || !data?.answer)
        throw new Error(data?.error ?? 'No completed answer');
    } else
      data = {
        retrieved:
          variant === 'baseline'
            ? retrieve(fixture.query, [material])
            : rankEvidence(fixture.query, [material]),
      };
    const retrieved = data.retrieved ?? [],
      cited = data.evidence ?? [];
    const ids = [
      ...new Set(
        [...String(data.answer ?? '').matchAll(/\[(S\d+)\]/g)].map((m) => m[1]),
      ),
    ];
    row.variants.push({
      variant,
      top1Hit: fixture.expected.includes(retrieved[0]?.section),
      recall: retrieved.some((e) => fixture.expected.includes(e.section)),
      answer: data.answer ?? null,
      answerCorrect: null,
      citationSupportCorrect: null,
      citationIdsValid: live
        ? ids.length > 0 &&
          ids.every((id) => retrieved.some((e) => e.id === id)) &&
          !data.answer.includes('[无对应原文]')
        : null,
      expectedSectionCited: live
        ? cited.some((e) => fixture.expected.includes(e.section))
        : null,
      retrieval: data.scope?.retrieval,
      retrieved,
      cited,
    });
    console.log(`${fixture.id} / ${variant}: completed`);
  }
  report.results.push(row);
}
await mkdir(resolve('docs/evaluation'), { recursive: true });
const output = resolve(
  'docs/evaluation',
  live ? 'live-comparison.json' : 'retrieval-comparison.json',
);
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Saved: ${output}`);
