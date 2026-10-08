import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const load = async (path) => import(await moduleUrl(path));
const { rankEvidence, readMaterials } = await load('../lib/retrieval.ts');
const { demoMaterial, demoWorkspace, demoCheck, RETRIEVAL_FIXTURES } =
  await load('../lib/demo-course.ts');
const { calibrate, extractHeadings } = await load(
  '../lib/textbook-calibration.ts',
);
const { contentFingerprint } = await load('../lib/textbook-calibration.ts');
const { parseCheck, checkResult, planFromCheck } = await load(
  '../lib/learning-check.ts',
);
const { validatePlan } = await load('../lib/review-plans.ts');
const { parseBackup, collectFileIds, remapFileIds, bytesToBase64, digest } =
  await load('../lib/backup.ts');
const { readEventStream } = await load('../lib/event-stream.ts');
const { readSavedLesson } = await load('../lib/chapter-lesson.ts');
test('paraphrases retrieve actual authored passages; deleted and unrelated documents never count as evidence', () => {
  const material = demoMaterial();
  for (const item of RETRIEVAL_FIXTURES) {
    const evidence = rankEvidence(item.query, [material]);
    assert.equal(evidence[0]?.section, item.expected, item.query);
    assert.ok(material.passages.some((p) => p.text === evidence[0].quote));
  }
  assert.deepEqual(rankEvidence('星系红移', [material]), []);
  assert.deepEqual(
    rankEvidence('矩阵乘法', [{ ...material, deletedAt: 'today' }]),
    [],
  );
  assert.throws(() =>
    readMaterials([{ name: 'bad', passages: [{ text: null }] }]),
  );
});
test('calibration distinguishes direct matches, missing terms, unmatched headings and partial extraction', () => {
  const course = demoWorkspace().courses[0];
  const headings = extractHeadings(course.materials);
  assert.ok(headings.includes('第一章 矩阵与线性变换'));
  const guide = structuredClone(course.guide);
  guide.chapters[0].keyConcepts.push('傅里叶级数');
  const report = calibrate(
    guide,
    course.materials,
    [...headings, '第四章 二次型'].join('\n'),
  );
  assert.equal(report.found, 6);
  assert.equal(
    report.rows.find((r) => r.term === '傅里叶级数').status,
    'missing',
  );
  assert.deepEqual(report.unmatchedHeadings, ['第四章 二次型']);
  assert.equal(report.partial, false);
  assert.equal(
    calibrate(guide, [{ ...course.materials[0], coverage: undefined }], '')
      .partial,
    true,
  );
});
test('demo lessons survive the production lesson validator and do not require an API', () => {
  const workspace = demoWorkspace();
  for (const chapter of workspace.courses[0].guide.chapters)
    assert.ok(readSavedLesson(chapter.lesson));
  assert.equal(parseBackup(workspace).state.courses.length, 1);
});
test('diagnostics identify only wrong concepts; a review draft is valid and deterministic per run', () => {
  const check = demoCheck();
  assert.equal(check.questions.length, 2);
  const result = checkResult(check, [0, 2]);
  assert.deepEqual(result.terms, ['矩阵乘法']);
  assert.throws(() => checkResult(check, [-1, 2]));
  const plan = planFromCheck(
    { ...check, answers: [0, 2] },
    { id: 'c1', name: '代数' },
    '2026-12-31',
  );
  assert.equal(plan.endDate, '2027-01-02');
  assert.equal(validatePlan(plan), '');
  assert.ok(plan.tasks.every((t) => t.title.includes('矩阵乘法')));
  assert.equal(check.planId, undefined);
  const source = JSON.stringify({ questions: check.questions });
  assert.equal(
    parseCheck(
      source,
      check.questions.map((q) => q.term),
      check.evidence,
    ).length,
    2,
  );
  assert.throws(() =>
    parseCheck(
      source.replaceAll('S1', 'S99'),
      check.questions.map((q) => q.term),
      check.evidence,
    ),
  );
});
test('backup validation tracks attachment references and remaps nested evidence without modifying originals', async () => {
  const state = demoWorkspace();
  state.notes[0].sources[0].fileId = 'old-file';
  const bytes = new TextEncoder().encode('original bytes 中文');
  const bundle = {
    format: 'course-kb-bundle',
    version: 2,
    exportedAt: 'today',
    state,
    files: [
      {
        id: 'old-file',
        name: '教材.txt',
        type: 'text/plain',
        data: bytesToBase64(bytes),
        sha256: await digest(bytes),
      },
    ],
  };
  assert.equal(parseBackup(bundle).files.length, 1);
  assert.deepEqual(parseBackup(state).missing, ['old-file']);
  assert.throws(() => parseBackup({ ...bundle, files: [] }));
  assert.throws(() =>
    parseBackup({ ...bundle, files: [...bundle.files, ...bundle.files] }),
  );
  const copy = remapFileIds(state, new Map([['old-file', 'new-file']]));
  assert.deepEqual(collectFileIds(copy), ['new-file']);
  assert.deepEqual(collectFileIds(state), ['old-file']);
  assert.throws(() => parseBackup({ courses: [{ id: 'x' }], notes: [] }));
  const checked = demoWorkspace();
  checked.courses[0].studyLab = { checks: [{ ...demoCheck(), answers: [0] }] };
  assert.throws(() => parseBackup(checked), /自测/);
  checked.courses[0].studyLab.checks[0].answers = [0, 2];
  assert.equal(parseBackup(checked).state.courses.length, 1);
  checked.courses[0].studyLab.checks[0].questions[0].sourceIds = ['S404'];
  assert.throws(() => parseBackup(checked), /自测/);
  const before = [{ ...demoMaterial(), fileId: 'old' }];
  assert.equal(
    contentFingerprint(before),
    contentFingerprint(remapFileIds(before, new Map([['old', 'new']]))),
  );
  assert.notEqual(
    contentFingerprint(before),
    contentFingerprint([
      { ...before[0], passages: [{ section: 'changed', text: '教材已改变' }] },
    ]),
  );
});
test('SSE parser handles multibyte text, fragmented CRLF, multiline data and stream cancellation', async () => {
  const bytes = new TextEncoder().encode(
    'data: {"text":"中文"}\r\n\r\ndata: one\ndata: two\n\ndata: [DONE]\n\n',
  );
  const stream = new ReadableStream({
    start(c) {
      for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
      c.close();
    },
  });
  const frames = [];
  for await (const event of readEventStream(stream)) frames.push(event);
  assert.deepEqual(frames, ['{"text":"中文"}', 'one\ntwo', '[DONE]']);
  let cancelled = false;
  const endless = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('data: ready\n\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const _ of readEventStream(endless)) break;
  assert.equal(cancelled, true);
});
