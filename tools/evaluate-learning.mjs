// Public self-authored benchmark. Never tune labels after observing results.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { moduleUrl } from '../tests/load-ts.mjs';
const corpus = await readFile(
  new URL('../docs/evaluation/learning-benchmark-v1.json', import.meta.url),
);
const data = JSON.parse(corpus);
const { retrieve } = await import(await moduleUrl('../lib/knowledge.ts'));
const { rankEvidence } = await import(await moduleUrl('../lib/retrieval.ts'));
const args = process.argv.slice(2);
const ai = args.includes('--ai');
const base = process.env.COURSE_KB_EVAL_URL;
if (ai && (!base || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)))
  throw new Error('真实 AI 评测需要 COURSE_KB_EVAL_URL 指向本机实例。');
if (ai) {
  const settings = await (await fetch(`${base}/api/ai-settings`)).json();
  if (!settings.configured)
    throw new Error('AI 尚未配置，本次不会调用模型或产生准确率报告。');
}
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice(8)) : ai ? 5 : data.cases.length;
if (!Number.isInteger(limit) || limit < 1 || limit > data.cases.length)
  throw new Error('limit 必须为有效题数。');
const results = [];
for (const c of data.cases.slice(0, limit)) {
  const row = { ...c };
  for (const [name, run] of Object.entries({
    baseline: () => retrieve(c.query, data.materials).slice(0, 5),
    enhanced: () => rankEvidence(c.query, data.materials, [], 5),
  })) {
    const start = performance.now(),
      found = run();
    row[name] = {
      sections: found.map((e) => e.section),
      ms: performance.now() - start,
    };
  }
  if (ai) {
    const start = performance.now();
    try {
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: c.query,
          contexts: data.materials,
          semantic: false,
          history: [],
          course: '原创评测',
        }),
        signal: AbortSignal.timeout(120000),
      });
      const answer = await response.json();
      row.ai = {
        status: response.status,
        ms: performance.now() - start,
        answer: answer.answer ?? '',
        evidence: answer.evidence ?? [],
        error: answer.error ?? null,
        manualReview: {
          answerCorrect: null,
          evidenceSupportsAnswer: null,
          appropriateAbstention: null,
        },
        cost: null,
        costNote: '应用响应未提供计费金额；按服务商账单另行记录。',
      };
    } catch (error) {
      row.ai = { error: error.message, ms: performance.now() - start };
    }
  }
  results.push(row);
}
function summarize(rows, name) {
  const answerable = rows.filter((r) => r.expected.length),
    negative = rows.filter((r) => !r.expected.length);
  const times = rows.map((r) => r[name].ms).sort((a, b) => a - b);
  return {
    cases: rows.length,
    answerable: answerable.length,
    anyExpectedInTop3: answerable.filter((r) =>
      r.expected.some((e) => r[name].sections.slice(0, 3).includes(e)),
    ).length,
    allExpectedInTop5: answerable.filter((r) =>
      r.expected.every((e) => r[name].sections.includes(e)),
    ).length,
    unanswerable: negative.length,
    emptyForUnanswerable: negative.filter((r) => !r[name].sections.length)
      .length,
    p50Ms: times[Math.floor(times.length * 0.5)] ?? null,
    p95Ms:
      times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] ??
      null,
  };
}
const report = {
  evaluatedAt: new Date().toISOString(),
  corpusSha256: createHash('sha256').update(corpus).digest('hex'),
  scope:
    '自编短文本检索验证；新题在运行前冻结，非第三方盲测。公式与表格为文本，不验证扫描识别。AI 答案须人工审核，未审核不得报告准确率。',
  mode: ai ? 'real-model-pending-manual-review' : 'retrieval-only',
  metrics: Object.fromEntries(
    ['development', 'validation'].map((split) => [
      split,
      Object.fromEntries(
        ['baseline', 'enhanced'].map((name) => [
          name,
          summarize(
            results.filter((r) => r.split === split),
            name,
          ),
        ]),
      ),
    ]),
  ),
  results,
};
// Real responses stay ignored until reviewed for correctness and sensitive data.
const output = ai
  ? 'work/learning-ai-review.json'
  : 'docs/evaluation/learning-retrieval-v1.json';
await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    { mode: report.mode, output, metrics: report.metrics },
    null,
    2,
  ),
);
