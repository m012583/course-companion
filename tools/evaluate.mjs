import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const fixture = JSON.parse(
  await readFile('evaluation/course-fixture.json', 'utf8'),
);
const dir = await mkdtemp(join(tmpdir(), 'course-evaluation-'));
try {
  await build({
    entryPoints: ['lib/knowledge.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: join(dir, 'knowledge.mjs'),
  });
  const { retrieve } = await import(
    pathToFileURL(join(dir, 'knowledge.mjs')).href
  );
  const results = [];
  const live = process.argv.includes('--live');
  const base = process.env.COURSE_KB_EVAL_URL || 'http://localhost:3012';
  let liveUnavailable = '';
  for (const item of fixture.cases) {
    const evidence = retrieve(item.question, fixture.materials);
    const sections = evidence.slice(0, 5).map((e) => e.section);
    const result = {
      id: item.id,
      category: item.category,
      question: item.question,
      expectedSections: item.expectedSections,
      top5: sections,
      allExpectedInTop5: item.expectedSections.every((s) =>
        sections.includes(s),
      ),
      noEvidence: evidence.length === 0,
      modelStatus: live ? 'pending' : 'not-run',
      semanticReview: '待人工核对；引用编号正确不等于语义正确',
    };
    if (live && !liveUnavailable) {
      const start = performance.now();
      try {
        const res = await fetch(base + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: item.question,
            contexts: fixture.materials,
            model: process.env.COURSE_KB_EVAL_MODEL || '',
            history: [],
            course: 'self-authored-evaluation',
          }),
          signal: AbortSignal.timeout(100000),
        });
        const data = await res.json();
        result.elapsedMs = Math.round(performance.now() - start);
        if (!res.ok) {
          result.modelStatus = 'failed';
          result.error = data.error || 'HTTP ' + res.status;
          if (res.status === 503 || res.status === 401)
            liveUnavailable = result.error;
        } else {
          result.modelStatus = 'completed';
          result.answer = data.answer;
          result.evidence = data.evidence;
        }
      } catch (e) {
        result.modelStatus = 'failed';
        result.error = e.message;
        liveUnavailable = e.message;
      }
    } else if (liveUnavailable) {
      result.modelStatus = 'blocked';
      result.error = liveUnavailable;
    }
    results.push(result);
  }
  const answerable = results.filter((r) => r.expectedSections.length);
  const absent = results.filter((r) => !r.expectedSections.length);
  const report = {
    at: new Date().toISOString(),
    fixtureOrigin: fixture.origin,
    metrics: {
      answerable: answerable.length,
      allExpectedTop5: answerable.filter((r) => r.allExpectedInTop5).length,
      unanswerable: absent.length,
      noEvidenceOnUnanswerable: absent.filter((r) => r.noEvidence).length,
    },
    liveRequested: live,
    liveUnavailable: liveUnavailable || null,
    results,
  };
  await mkdir('evaluation', { recursive: true });
  const output =
    process.env.COURSE_KB_EVAL_REPORT || 'evaluation/retrieval-report.json';
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      output,
      metrics: report.metrics,
      liveUnavailable: report.liveUnavailable,
    }),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
